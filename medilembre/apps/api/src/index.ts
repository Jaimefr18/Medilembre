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
  if (status && status < 500)
    return reply
      .code(status)
      .send({ error: err instanceof Error ? err.message : "erro desconhecido" });
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

// Verificação de segurança: garantir que em produção a API corre com medilembre_app (RLS ativo)
if (env.databaseUrl) {
  void pool
    .query("select current_user")
    .then(({ rows }) => {
      const u = rows[0]?.current_user;
      if (env.production && u !== "medilembre_app") {
        app.log.error(
          `[SEGURANÇA CRÍTICA] DATABASE_URL ligada como '${u}' em produção! O utilizador DEVE ser 'medilembre_app' para garantir isolamento por RLS.`,
        );
      } else {
        app.log.info(
          `[DB] Ligação ativa como utilizador '${u}' (RLS isolado: ${u === "medilembre_app"})`,
        );
      }
    })
    .catch((err) => app.log.error(err, "[DB] Erro ao verificar utilizador da base de dados"));
}

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

await app.ready();

if (!process.env.VERCEL) {
  await app.listen({ port: env.port, host: "0.0.0.0" });
}

export default async function handler(req: any, res: any) {
  await app.ready();
  app.server.emit("request", req, res);
}
export { app };
