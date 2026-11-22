import { randomBytes } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type pg from "pg";
import { z } from "zod";
import { checkPassword, csrfGuard, sha } from "./auth.js";
import { pool, withTenant } from "./db.js";
import { env } from "./env.js";

const PH_COOKIE = "ml_ph";
const SESSION_DAYS = 7;
const TZ = "Africa/Luanda";
const TODAY = `(now() at time zone '${TZ}')::date`;

// Sem 0/O/1/I para evitar confusões ao ditar o código. 256 é múltiplo de 32: sem enviesamento.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const newCode = () => Array.from(randomBytes(8), (b) => ALPHABET[b % 32]).join("");

const Id = z.object({ id: z.string().uuid() });
const Login = z.object({
  email: z.string().trim().toLowerCase().email().max(120),
  password: z.string().min(1).max(128),
});
const NewCustomer = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(30).optional(),
});
const NewProduct = z.object({
  name: z.string().trim().min(1).max(120),
  pack: z.string().trim().max(120).default(""),
});
const PatchProduct = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  pack: z.string().trim().max(120).optional(),
  active: z.boolean().optional(),
});
const Decide = z.object({ status: z.enum(["confirmada", "recusada"]) });

declare module "fastify" {
  interface FastifyRequest {
    staff?: { userId: string; pharmacyId: string; name: string };
  }
}

const strict = { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } };

/** O RLS é aplicado pela farmácia da sessão (sem customerId: o painel vê a farmácia toda). */
const tenant = <T>(req: FastifyRequest, fn: (c: pg.PoolClient) => Promise<T>) =>
  withTenant(req.staff!.pharmacyId, fn);

async function requireStaff(req: FastifyRequest, reply: FastifyReply) {
  const t = req.cookies[PH_COOKIE];
  if (!t) return reply.code(401).send({ error: "sessão em falta" });
  // `sessions` e `pharmacy_users` não têm RLS (são lidas antes de haver tenant).
  const r = await pool.query(
    `select u.id, u.pharmacy_id, u.name
       from sessions s join pharmacy_users u on u.id = s.user_id
      where s.id = $1 and s.expires_at > now()`,
    [sha(t).toString("hex")],
  );
  if (!r.rows[0]) {
    reply.clearCookie(PH_COOKIE, { path: "/api/farmacia" });
    return reply.code(401).send({ error: "sessão expirada" });
  }
  req.staff = { userId: r.rows[0].id, pharmacyId: r.rows[0].pharmacy_id, name: r.rows[0].name };
}

/** Invalida códigos pendentes do cliente e emite um novo (só o hash fica guardado). */
async function issueCode(
  c: pg.PoolClient,
  pharmacyId: string,
  customerId: string,
  kind: "activate" | "reset",
) {
  await c.query(
    "update activation_codes set used_at = now() where customer_id = $1 and used_at is null",
    [customerId],
  );
  const code = newCode();
  const r = await c.query(
    `insert into activation_codes (code_hash, customer_id, pharmacy_id, kind, expires_at)
     values ($1, $2, $3, $4, now() + interval '7 days') returning expires_at`,
    [sha(code), customerId, pharmacyId, kind],
  );
  return { code, kind, expiresAt: r.rows[0].expires_at as string };
}

export async function pharmacyRoutes(app: FastifyInstance) {
  app.addHook("onRequest", csrfGuard);

  app.post("/auth/login", strict, async (req, reply) => {
    const b = Login.parse(req.body);
    const r = await pool.query(
      "select id, pharmacy_id, password_hash from pharmacy_users where email = $1",
      [b.email],
    );
    const u = r.rows[0];
    if (!(await checkPassword(u?.password_hash, b.password))) {
      return reply.code(401).send({ error: "email ou senha incorretos" });
    }
    const token = randomBytes(32).toString("base64url");
    await pool.query(
      "insert into sessions (id, user_id, expires_at) values ($1, $2, now() + make_interval(days => $3))",
      [sha(token).toString("hex"), u.id, SESSION_DAYS],
    );
    reply.setCookie(PH_COOKIE, token, {
      httpOnly: true,
      sameSite: "strict",
      secure: env.production,
      path: "/api/farmacia", // o cookie do painel nunca viaja nas rotas do cliente
      maxAge: SESSION_DAYS * 86400,
    });
    return { ok: true };
  });

  app.post("/auth/logout", async (req, reply) => {
    const t = req.cookies[PH_COOKIE];
    if (t) await pool.query("delete from sessions where id = $1", [sha(t).toString("hex")]);
    reply.clearCookie(PH_COOKIE, { path: "/api/farmacia" });
    return { ok: true };
  });

  // ---------- Tudo abaixo exige sessão da farmácia ----------
  await app.register(async (s) => {
    s.addHook("preHandler", requireStaff);

    s.get("/auth/me", async (req) =>
      tenant(req, async (c) => {
        const p = await c.query("select name from pharmacies");
        return { user: req.staff!.name, pharmacy: p.rows[0]?.name ?? "" };
      }),
    );

    // Clientes + adesão dos últimos 7 dias (doses registadas / doses previstas).
    s.get("/clientes", async (req) =>
      tenant(
        req,
        async (c) =>
          (
            await c.query(
              `select c.id, c.name, c.phone,
                    exists (select 1 from customer_logins l where l.customer_id = c.id) as "hasAccount",
                    (select count(*) from client_reminders r where r.customer_id = c.id and r.active)::int as reminders,
                    coalesce((select sum(greatest(0, least(coalesce(r.end_date, ${TODAY}), ${TODAY})
                                                     - greatest(r.start_date, ${TODAY} - 6) + 1))
                                from client_reminders r where r.customer_id = c.id and r.active), 0)::int as expected,
                    (select count(*) from dose_logs d join client_reminders r on r.id = d.reminder_id
                      where d.customer_id = c.id and r.active and d.day > ${TODAY} - 7)::int as taken
               from customers c
              where c.status = 'active'
              order by c.name`,
            )
          ).rows,
      ),
    );

    s.post("/clientes", async (req) => {
      const b = NewCustomer.parse(req.body);
      return tenant(req, async (c) => {
        const customer = (
          await c.query(
            "insert into customers (pharmacy_id, name, phone) values ($1, $2, $3) returning id, name, phone",
            [req.staff!.pharmacyId, b.name, b.phone || null],
          )
        ).rows[0];
        return {
          customer,
          ...(await issueCode(c, req.staff!.pharmacyId, customer.id, "activate")),
        };
      });
    });

    // Novo código: `activate` se o cliente ainda não tem conta, `reset` (recuperação de senha) se já tem.
    s.post("/clientes/:id/codigo", async (req, reply) => {
      const { id } = Id.parse(req.params);
      const out = await tenant(req, async (c) => {
        const r = await c.query(
          `select exists (select 1 from customer_logins l where l.customer_id = c.id) as has
             from customers c where c.id = $1 and c.status = 'active'`,
          [id],
        );
        if (!r.rows[0]) return null; // outra farmácia ou inexistente: o RLS esconde-o
        return issueCode(c, req.staff!.pharmacyId, id, r.rows[0].has ? "reset" : "activate");
      });
      return out ?? reply.code(404).send({ error: "cliente não encontrado" });
    });

    s.get("/clientes/:id", async (req, reply) => {
      const { id } = Id.parse(req.params);
      const out = await tenant(req, async (c) => {
        if (!(await c.query("select 1 from customers where id = $1", [id])).rowCount) return null;
        const reminders = (
          await c.query(
            `select name, dose, to_char(at_time, 'HH24:MI') as time,
                    start_date::text as "startDate", end_date::text as "endDate"
               from client_reminders where customer_id = $1 and active order by name, at_time`,
            [id],
          )
        ).rows;
        const days = (
          await c.query(
            `select g.day::text as day,
                    (select count(*) from client_reminders r
                      where r.customer_id = $1 and r.active and r.start_date <= g.day
                        and (r.end_date is null or r.end_date >= g.day))::int as expected,
                    (select count(*) from dose_logs d join client_reminders r on r.id = d.reminder_id
                      where d.customer_id = $1 and r.active and d.day = g.day)::int as taken
               from (select (${TODAY} - 6 + i) as day from generate_series(0, 6) i) g
              order by g.day`,
            [id],
          )
        ).rows;
        return { reminders, days };
      });
      return out ?? reply.code(404).send({ error: "cliente não encontrado" });
    });

    // Reservas: pendentes primeiro.
    s.get("/reservas", async (req) =>
      tenant(
        req,
        async (c) =>
          (
            await c.query(
              `select r.id, r.status, r.created_at as "createdAt", c.name as customer, c.phone,
                    p.name as product, p.pack
               from client_reservations r
               join customers c on c.id = r.customer_id
               join pharmacy_products p on p.id = r.product_id
              order by (r.status = 'pendente') desc, r.created_at desc
              limit 200`,
            )
          ).rows,
      ),
    );

    s.patch("/reservas/:id", async (req, reply) => {
      const { id } = Id.parse(req.params);
      const { status } = Decide.parse(req.body);
      const n = await tenant(
        req,
        async (c) =>
          (
            await c.query(
              "update client_reservations set status = $2 where id = $1 and status = 'pendente'",
              [id, status],
            )
          ).rowCount,
      );
      return n
        ? { ok: true }
        : reply.code(409).send({ error: "reserva inexistente ou já decidida" });
    });

    // Produtos
    s.get("/produtos", async (req) =>
      tenant(
        req,
        async (c) =>
          (
            await c.query(
              "select id, name, pack, active from pharmacy_products order by active desc, name",
            )
          ).rows,
      ),
    );

    s.post("/produtos", async (req) => {
      const b = NewProduct.parse(req.body);
      return tenant(
        req,
        async (c) =>
          (
            await c.query(
              "insert into pharmacy_products (pharmacy_id, name, pack) values ($1, $2, $3) returning id, name, pack, active",
              [req.staff!.pharmacyId, b.name, b.pack],
            )
          ).rows[0],
      );
    });

    s.patch("/produtos/:id", async (req, reply) => {
      const { id } = Id.parse(req.params);
      const b = PatchProduct.parse(req.body);
      const r = await tenant(req, async (c) =>
        c.query(
          `update pharmacy_products
              set name = coalesce($2, name), pack = coalesce($3, pack), active = coalesce($4, active)
            where id = $1 returning id, name, pack, active`,
          [id, b.name ?? null, b.pack ?? null, b.active ?? null],
        ),
      );
      return r.rows[0] ?? reply.code(404).send({ error: "produto não encontrado" });
    });
  });
}
