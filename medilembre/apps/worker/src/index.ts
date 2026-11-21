import { createServer } from "node:http";
import pg from "pg";
import webpush from "web-push";
import { enqueueDue, sendPending } from "./reminders.js";

function ensureVerifyFull(urlStr: string | undefined): string | undefined {
  if (!urlStr) return urlStr;
  try {
    const parsed = new URL(urlStr);
    if (!parsed.searchParams.has("sslmode") && parsed.protocol.startsWith("postgres")) {
      parsed.searchParams.set("sslmode", "verify-full");
      return parsed.toString();
    }
  } catch {}
  return urlStr;
}

const rawConn = process.env.DATABASE_URL_ADMIN ?? process.env.DATABASE_URL_UNPOOLED;
const connectionString = ensureVerifyFull(rawConn);
if (!connectionString) {
  console.error("ERRO: DATABASE_URL_ADMIN ou DATABASE_URL_UNPOOLED não está configurada.");
}
const pool = new pg.Pool({ connectionString, max: 3 });

const vapidSubject = process.env.VAPID_SUBJECT ?? "mailto:admin@example.com";
const vapidPublicKey = process.env.VAPID_PUBLIC_KEY ?? "";
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY ?? "";

let vapidReady = false;
if (!vapidPublicKey || !vapidPrivateKey) {
  console.warn(
    "AVISO: VAPID_PUBLIC_KEY ou VAPID_PRIVATE_KEY em falta. Notificações web-push desativadas temporariamente.",
  );
} else {
  try {
    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
    // Validação preventiva do par VAPID
    webpush.getVapidHeaders(
      "https://fcm.googleapis.com",
      vapidSubject,
      vapidPublicKey,
      vapidPrivateKey,
      "aes128gcm",
    );
    vapidReady = true;
  } catch (err: any) {
    console.error(
      "ERRO: Par de chaves VAPID inválido ou rejeitado pelo web-push:",
      err?.message ?? err,
    );
  }
}

let lastTick = Date.now();
let running = false;
let lastCleanup = 0;
let tickCount = 0;

createServer((req, res) => {
  res.statusCode = req.url === "/health" && Date.now() - lastTick < 120_000 ? 200 : 503;
  res.end();
}).listen(Number(process.env.PORT ?? 3001), "0.0.0.0");

async function selfCheck() {
  console.log("=== MediLembre Worker: Diagnóstico de Arranque ===");
  try {
    const res = await pool.query(
      "select current_user, current_database(), now() as server_time, version()",
    );
    const { current_user, current_database, server_time } = res.rows[0];
    console.log(
      `[DB OK] Conectado como '${current_user}' na BD '${current_database}' (hora servidor: ${server_time})`,
    );
  } catch (err: any) {
    console.error("[DB FALHOU] Erro na ligação à base de dados:", err?.message ?? err);
  }
  if (vapidReady) {
    console.log(`[VAPID OK] Par de chaves verificado com sucesso. Subject: ${vapidSubject}`);
  } else {
    console.warn(
      "[VAPID AVISO] Web-push inoperacional (verifique VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY).",
    );
  }
  console.log("=== Diagnóstico concluído. Worker ativo com tick de 30 s ===");
}

async function tick() {
  if (running) return;
  running = true;
  tickCount++;
  try {
    const queued = await enqueueDue(pool);
    const sent = await sendPending(pool);
    if (queued || Object.values(sent).some(Boolean)) {
      console.log("tick", { queued, ...sent });
    } else if (tickCount % 10 === 0) {
      // Batimento a cada ~5 minutos para visibilidade operacional
      console.log(
        `[batimento] worker ativo | ticks: ${tickCount} | uptime: ${Math.round(process.uptime())}s`,
      );
    }
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

void selfCheck().then(() => {
  setInterval(tick, 30_000);
  void tick();
});

const stop = async () => {
  await pool.end().catch(() => {});
  process.exit(0);
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
