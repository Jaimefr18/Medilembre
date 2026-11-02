import { createServer } from "node:http";
import { NOTIFICATION_TEXT } from "@medilembre/shared";
import pg from "pg";
import PgBoss from "pg-boss";
import webpush from "web-push";
import { enqueueDue, sendPending } from "./reminders.js";

// Health check simples para o livenessProbe da Daemon
let alive = true;

createServer((req, res) => {
  if (req.url === "/health") {
    res.statusCode = alive ? 200 : 500;
    res.end();
  } else {
    res.statusCode = 404;
    res.end();
  }
}).listen(3001, "0.0.0.0");

// O worker usa o utilizador admin: precisa de ver todas as farmácias (superuser/BYPASSRLS, ignora RLS).
const url = process.env.DATABASE_URL_ADMIN ?? "";
const pool = new pg.Pool({ connectionString: url, max: 4 });

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT ?? "mailto:admin@example.com",
  process.env.VAPID_PUBLIC_KEY ?? "",
  process.env.VAPID_PRIVATE_KEY ?? "",
);

/** Spike: envia os jobs vencidos e regista o resultado (aceite pelo Push Service ou erro). */
async function sendDueSpikeJobs() {
  const { rows } = await pool.query(
    `select j.id, s.id as sub_id, s.endpoint, s.p256dh, s.auth from spike_jobs j
     join spike_subscriptions s on s.id = j.subscription_id
     where j.sent_at is null and j.due_at <= now() limit 50`,
  );
  for (const r of rows) {
    let result = "accepted";
    try {
      await webpush.sendNotification(
        { endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } },
        JSON.stringify(NOTIFICATION_TEXT),
        { TTL: 3600, urgency: "high" },
      );
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      result = `error:${status ?? "?"}`;
      if (status === 404 || status === 410) {
        await pool.query("delete from spike_subscriptions where id = $1", [r.sub_id]);
      }
    }
    await pool.query("update spike_jobs set sent_at = now(), result = $2 where id = $1", [
      r.id,
      result,
    ]);
  }
  return rows.length;
}

/** Cada passo isolado: se um falhar, os outros continuam no mesmo tick. */
async function step<T>(name: string, fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch (e) {
    console.error(`tick/${name}:`, e);
    return undefined;
  }
}

const boss = new PgBoss(url);
boss.on("error", (e) => console.error("pg-boss", e));
await boss.start();
await boss.createQueue("tick");
await boss.schedule("tick", "* * * * *");
await boss.work("tick", async () => {
  const queued = await step("enqueue", () => enqueueDue(pool));
  const sent = await step("send", () => sendPending(pool));
  const spike = await step("spike", sendDueSpikeJobs);
  if (queued || spike || (sent && Object.values(sent).some(Boolean))) {
    console.log(`tick: novos=${queued ?? "?"} envio=${JSON.stringify(sent)} spike=${spike ?? "?"}`);
  }
});
console.log("worker ativo: tick de 1 em 1 minuto");

let shuttingDown = false;

const shutdown = async (signal: string) => {
  if (shuttingDown) return;
  shuttingDown = true;
  alive = false; // faz o health check falhar para não receber novos pedidos
  console.log(`${signal} recebido, a encerrar...`);
  try {
    await boss.stop({ graceful: true, timeout: 5000 });
  } catch (e) {
    console.error("pg-boss stop error", e);
  }
  try {
    await pool.end();
  } catch (e) {
    console.error("pool end error", e);
  }
  process.exit(0);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
