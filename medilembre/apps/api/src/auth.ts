import "@fastify/cookie"; // tipos de req.cookies / reply.setCookie
import { hash, verify } from "@node-rs/argon2";
import { createHash, randomBytes } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { pool } from "./db.js";
import { env } from "./env.js";

export const COOKIE = "ml_sid";
const SESSION_DAYS = 30;

export const sha = (s: string) => createHash("sha256").update(s, "utf8").digest();

// argon2id com os parâmetros mínimos recomendados pela OWASP (19 MiB, t=2, p=1).
export const hashPassword = (p: string) => hash(p, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
const DUMMY = await hashPassword("palavra-passe-falsa-para-igualar-tempos");

/** Tempo de resposta igual exista o utilizador ou não (evita enumeração de contas). */
export async function checkPassword(storedHash: string | undefined, password: string) {
  const ok = await verify(storedHash ?? DUMMY, password).catch(() => false);
  return Boolean(storedHash) && ok;
}

/** Telemóvel -> 244XXXXXXXXX; email -> minúsculas. */
export function normIdentifier(raw: string) {
  const s = raw.trim().toLowerCase();
  if (s.includes("@")) return s;
  const d = s.replace(/\D/g, "");
  return d.length === 9 ? `244${d}` : d;
}

export const normCode = (raw: string) => raw.toUpperCase().replace(/[\s-]/g, "");

type Q = { query: (sql: string, params?: unknown[]) => Promise<unknown> };

export async function startSession(
  q: Q,
  reply: FastifyReply,
  customerId: string,
  pharmacyId: string,
  userAgent?: string,
) {
  const token = randomBytes(32).toString("base64url");
  await q.query(
    `insert into client_sessions (id_hash, customer_id, pharmacy_id, user_agent, expires_at)
     values ($1,$2,$3,$4, now() + make_interval(days => $5))`,
    [sha(token), customerId, pharmacyId, userAgent ?? null, SESSION_DAYS],
  );
  reply.setCookie(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.production,
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  });
}

export async function endSession(req: FastifyRequest, reply: FastifyReply) {
  const t = req.cookies[COOKIE];
  if (t) await pool.query("delete from client_sessions where id_hash = $1", [sha(t)]);
  reply.clearCookie(COOKIE, { path: "/" });
}

declare module "fastify" {
  interface FastifyRequest {
    me?: { customerId: string; pharmacyId: string };
  }
}

export async function requireCustomer(req: FastifyRequest, reply: FastifyReply) {
  const t = req.cookies[COOKIE];
  if (!t) return reply.code(401).send({ error: "sessão em falta" });
  const r = await pool.query(
    "select customer_id, pharmacy_id from client_sessions where id_hash = $1 and expires_at > now()",
    [sha(t)],
  );
  if (!r.rows[0]) {
    reply.clearCookie(COOKIE, { path: "/" });
    return reply.code(401).send({ error: "sessão expirada" });
  }
  req.me = { customerId: r.rows[0].customer_id, pharmacyId: r.rows[0].pharmacy_id };
}

/**
 * Anti-CSRF: o cookie é SameSite=Lax; além disso, pedidos que alteram dados têm de trazer
 * o cabeçalho x-ml (um formulário de outro site não o consegue enviar) e não podem ser cross-site.
 */
export async function csrfGuard(req: FastifyRequest, reply: FastifyReply) {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return;
  if (req.headers["sec-fetch-site"] === "cross-site" || req.headers["x-ml"] !== "1") {
    return reply.code(403).send({ error: "pedido recusado" });
  }
}