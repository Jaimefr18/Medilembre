import { PushSubscriptionInput, SpikeScheduleInput } from "@medilembre/shared";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import { z } from "zod";
import { clientRoutes } from "./client.js";
import { pool, withTenant } from "./db.js";
import { env } from "./env.js";

// trustProxy em produção: o rate limit tem de ver o IP real atrás do proxy/Cloudflare.
const app = Fastify({ logger: true, trustProxy: env.production, bodyLimit: 64 * 1024 });

app.register(helmet);
app.register(cookie);
app.register(rateLimit, { max: 120, timeWindow: "1 minute" });

app.setErrorHandler((err, _req, reply) => {
  if (err instanceof z.ZodError) return reply.code(400).send({ error: err.flatten() });
  const status = (err as { statusCode?: number }).statusCode;
  if (status && status < 500) return reply.code(status).send({ error: err instanceof Error ? err.message : "erro desconhecido" });
  app.log.error(err);
  return reply.code(500).send({ error: "erro interno" });
});

// Registar as rotas do cliente com prefixo /api
await app.register(clientRoutes, { prefix: "/api" });

// Health check em /api/health (e fallback em /health)
const healthHandler = async () => {
  await pool.query("select 1");
  return { ok: true };
};
app.get("/api/health", healthHandler);
app.get("/health", healthHandler);

// ---------- Guard provisório do painel da farmácia (até haver login de farmácia) ----------
// Em desenvolvimento aceita o cabeçalho x-pharmacy-id. Em produção recusa tudo.
const Uuid = z.string().uuid();
const getCustomers = async (req: FastifyRequest, reply: FastifyReply) => {
  if (env.production) return reply.code(501).send({ error: "auth não implementada" });
  const id = Uuid.safeParse(req.headers["x-pharmacy-id"]);
  if (!id.success) return reply.code(401).send({ error: "farmácia em falta" });
  return withTenant(id.data, async (c) => (await c.query("select id, name from customers")).rows);
};
app.get("/api/customers", getCustomers);
app.get("/customers", getCustomers);

// ---------- Spike de Web Push (só desenvolvimento: rotas públicas que escrevem na BD) ----------
if (!env.production) {
  const spikeRoutes = async (sub: FastifyInstance) => {
    sub.get("/vapid-key", async () => ({ key: env.vapidPublicKey }));

    sub.post("/subscribe", async (req) => {
      const body = PushSubscriptionInput.parse(req.body);
      await pool.query(
        `insert into spike_subscriptions (endpoint, p256dh, auth, user_agent) values ($1,$2,$3,$4)
         on conflict (endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent`,
        [body.endpoint, body.keys.p256dh, body.keys.auth, req.headers["user-agent"] ?? null],
      );
      return { ok: true };
    });

    sub.post("/schedule", async (req, reply) => {
      const body = SpikeScheduleInput.parse(req.body);
      const r = await pool.query(
        `insert into spike_jobs (subscription_id, label, due_at)
         select id, $2, now() + make_interval(mins => $3) from spike_subscriptions where endpoint = $1
         returning id`,
        [body.endpoint, body.label ?? `${body.minutes} min`, body.minutes],
      );
      if (r.rowCount === 0) return reply.code(404).send({ error: "subscrição desconhecida" });
      return { ok: true };
    });

    sub.get("/jobs", async (req) => {
      const { endpoint } = z.object({ endpoint: z.string().url() }).parse(req.query);
      const r = await pool.query(
        `select j.label, j.due_at, j.sent_at, j.result from spike_jobs j
         join spike_subscriptions s on s.id = j.subscription_id
         where s.endpoint = $1 order by j.due_at desc limit 30`,
        [endpoint],
      );
      return r.rows;
    });
  };

  await app.register(spikeRoutes, { prefix: "/api/spike" });
  await app.register(spikeRoutes, { prefix: "/spike" });
}

await app.listen({ port: env.port, host: "0.0.0.0" });
