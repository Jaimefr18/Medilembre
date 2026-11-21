import { createServer } from "node:http";
import pg from "pg";
import webpush from "web-push";
import { enqueueDue, sendPending } from "./reminders.js";

const connectionString = process.env.DATABASE_URL_ADMIN ?? process.env.DATABASE_URL_UNPOOLED;
if (!connectionString) {
  console.error("ERRO: DATABASE_URL_ADMIN ou DATABASE_URL_UNPOOLED não está configurada.");
}
const pool = new pg.Pool({ connectionString, max: 3 });

const vapidSubject = process.env.VAPID_SUBJECT ?? "mailto:admin@example.com";
const vapidPublicKey = process.env.VAPID_PUBLIC_KEY ?? "";
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY ?? "";

if (!vapidPublicKey || !vapidPrivateKey) {
  console.warn("AVISO: VAPID_PUBLIC_KEY ou VAPID_PRIVATE_KEY em falta. Notificações web-push desativadas temporariamente.");
} else {
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
}

let lastTick = Date.now();
let running = false;
let lastCleanup = 0;

createServer((req, res) => {
  res.statusCode = req.url === "/health" && Date.now() - lastTick < 120_000 ? 200 : 503;
  res.end();
}).listen(Number(process.env.PORT ?? 3001), "0.0.0.0");

async function tick() {
  if (running) return;
  running = true;
  try {
    const queued = await enqueueDue(pool);
    const sent = await sendPending(pool);
    if (queued || Object.values(sent).some(Boolean)) console.log("tick", { queued, ...sent });
    if (Date.now() - lastCleanup > 3_600_000) {
      lastCleanup = Date.now();
      await pool.query(
        "delete from client_reminder_sends where due_at < now() - interval '14 days'",
      );
      await pool.query("delete from client_sessions where expires_at < now()");
    }
  } catch (e) {
    console.error("tick falhou:", e);
  } finally {
    lastTick = Date.now();
    running = false;
  }
}

console.log("worker ativo: tick de 30 s");
setInterval(tick, 30_000);
void tick();

const stop = async () => {
  await pool.end().catch(() => {});
  process.exit(0);
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
