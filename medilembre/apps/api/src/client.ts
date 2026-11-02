import { PushSubscriptionInput } from "@medilembre/shared";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type pg from "pg";
import { z } from "zod";
import {
  checkPassword, csrfGuard, endSession, hashPassword, normCode, normIdentifier,
  requireCustomer, sha, startSession,
} from "./auth.js";
import { pool, withTenant, withTx } from "./db.js";
import { env } from "./env.js";

const TZ = "Africa/Luanda"; // TODO: passar para uma coluna `tz` em pharmacies (Maputo, Kinshasa)
const TODAY = `(now() at time zone '${TZ}')::date`;

const Id = z.object({ id: z.string().uuid() });
const Password = z.string().min(8, "mínimo 8 caracteres").max(128);
const Identifier = z.string().trim().min(5).max(120).transform(normIdentifier)
  .refine((s) => s.includes("@") ? /^\S+@\S+\.\S+$/.test(s) : /^\d{9,15}$/.test(s), "telemóvel ou email inválido");

const LoginInput = z.object({ identifier: Identifier, password: z.string().min(1).max(128) });
const ActivateInput = z.object({
  code: z.string().min(4).max(16).transform(normCode),
  identifier: Identifier,
  password: Password,
});
const ReminderInput = z.object({
  name: z.string().trim().min(1).max(80),
  dose: z.string().trim().max(80).default(""),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
});

/** Corre `fn` com o RLS preso à farmácia E ao cliente da sessão. */
const mine = <T>(req: FastifyRequest, fn: (c: pg.PoolClient, customerId: string) => Promise<T>) =>
  withTenant(req.me!.pharmacyId, (c) => fn(c, req.me!.customerId), req.me!.customerId);

const strict = { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } };

export async function clientRoutes(app: FastifyInstance) {
  app.addHook("onRequest", csrfGuard);

  // ---------- Autenticação ----------
  app.post("/auth/activate", strict, async (req, reply) => {
    const b = ActivateInput.parse(req.body);
    const out = await withTx(async (c) => {
      const code = await c.query(
        `select customer_id, pharmacy_id from activation_codes
         where code_hash = $1 and used_at is null and expires_at > now() for update`,
        [sha(b.code)],
      );
      if (!code.rows[0]) return null;
      const { customer_id, pharmacy_id } = code.rows[0];
      const taken = await c.query("select 1 from customer_logins where identifier = $1", [b.identifier]);
      if (taken.rowCount) return "taken" as const;
      await c.query(
        "insert into customer_logins (customer_id, pharmacy_id, identifier, password_hash) values ($1,$2,$3,$4)",
        [customer_id, pharmacy_id, b.identifier, await hashPassword(b.password)],
      );
      await c.query("update activation_codes set used_at = now() where code_hash = $1", [sha(b.code)]);
      await startSession(c, reply, customer_id, pharmacy_id, req.headers["user-agent"]);
      return { customer_id, pharmacy_id };
    });
    if (out === null) return reply.code(400).send({ error: "código inválido ou expirado" });
    if (out === "taken") return reply.code(409).send({ error: "esse contacto já tem conta; use Entrar" });
    return { ok: true };
  });

  app.post("/auth/login", strict, async (req, reply) => {
    const b = LoginInput.parse(req.body);
    const r = await pool.query(
      "select customer_id, pharmacy_id, password_hash from customer_logins where identifier = $1",
      [b.identifier],
    );
    const u = r.rows[0];
    if (!(await checkPassword(u?.password_hash, b.password))) {
      return reply.code(401).send({ error: "contacto ou senha incorretos" });
    }
    await startSession(pool, reply, u.customer_id, u.pharmacy_id, req.headers["user-agent"]);
    return { ok: true };
  });

  app.post("/auth/logout", async (req, reply) => {
    await endSession(req, reply);
    return { ok: true };
  });

  // ---------- Tudo abaixo exige sessão ----------
  await app.register(async (s) => {
    s.addHook("preHandler", requireCustomer);

    s.get("/auth/me", async (req) =>
      mine(req, async (c, id) => {
        const r = await c.query("select name from customers where id = $1", [id]);
        return { name: r.rows[0]?.name ?? "" };
      }),
    );

    // Lembretes
    s.get("/reminders", async (req) =>
      mine(req, async (c, id) =>
        (await c.query(
          `select r.id, to_char(r.at_time,'HH24:MI') as time, r.name, r.dose,
                  exists (select 1 from dose_logs d where d.reminder_id = r.id and d.day = ${TODAY}) as done
           from client_reminders r where r.customer_id = $1 and r.active order by r.at_time`,
          [id],
        )).rows,
      ),
    );

    s.post("/reminders", async (req) => {
      const b = ReminderInput.parse(req.body);
      return mine(req, async (c, id) =>
        (await c.query(
          `insert into client_reminders (pharmacy_id, customer_id, name, dose, at_time)
           values ($1,$2,$3,$4,$5)
           returning id, to_char(at_time,'HH24:MI') as time, name, dose, false as done`,
          [req.me!.pharmacyId, id, b.name, b.dose, b.time],
        )).rows[0],
      );
    });

    s.delete("/reminders/:id", async (req, reply) => {
      const { id } = Id.parse(req.params);
      const n = await mine(req, async (c, cid) =>
        (await c.query("delete from client_reminders where id = $1 and customer_id = $2", [id, cid])).rowCount,
      );
      return n ? { ok: true } : reply.code(404).send({ error: "lembrete não encontrado" });
    });

    // Idempotente: tomar duas vezes no mesmo dia não duplica.
    s.post("/reminders/:id/take", async (req, reply) => {
      const { id } = Id.parse(req.params);
      const found = await mine(req, async (c, cid) => {
        const r = await c.query("select 1 from client_reminders where id = $1 and customer_id = $2", [id, cid]);
        if (!r.rowCount) return false;
        await c.query(
          `insert into dose_logs (pharmacy_id, reminder_id, customer_id, day)
           values ($1,$2,$3, ${TODAY}) on conflict (reminder_id, day) do nothing`,
          [req.me!.pharmacyId, id, cid],
        );
        return true;
      });
      return found ? { ok: true } : reply.code(404).send({ error: "lembrete não encontrado" });
    });

    // Reservas
    s.get("/products", async (req) =>
      mine(req, async (c) =>
        (await c.query("select id, name, pack from pharmacy_products where active order by name")).rows,
      ),
    );

    s.get("/reservations", async (req) =>
      mine(req, async (c, id) =>
        (await c.query(
          `select product_id, status from client_reservations
           where customer_id = $1 and status in ('pendente','confirmada') order by created_at desc`,
          [id],
        )).rows,
      ),
    );

    s.post("/reservations", async (req, reply) => {
      const { productId } = z.object({ productId: z.string().uuid() }).parse(req.body);
      const r = await mine(req, async (c, id) =>
        c.query(
          `insert into client_reservations (pharmacy_id, customer_id, product_id)
           select pharmacy_id, $2, id from pharmacy_products where id = $1 and active
           on conflict do nothing returning id`,
          [productId, id],
        ),
      );
      return r.rowCount ? { ok: true } : reply.code(409).send({ error: "produto indisponível ou já pedido" });
    });

    // Push (ligado ao cliente autenticado)
    s.get("/push/vapid-key", async () => ({ key: env.vapidPublicKey }));

    s.post("/push/subscribe", async (req) => {
      const b = PushSubscriptionInput.parse(req.body);
      await mine(req, async (c, id) =>
        c.query(
          `insert into client_push_subscriptions (pharmacy_id, customer_id, endpoint, p256dh, auth, user_agent)
           values ($1,$2,$3,$4,$5,$6)
           on conflict (endpoint) do update
             set p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent`,
          [req.me!.pharmacyId, id, b.endpoint, b.keys.p256dh, b.keys.auth, req.headers["user-agent"] ?? null],
        ),
      );
      return { ok: true };
    });

    s.delete("/push/subscribe", async (req) => {
      const { endpoint } = z.object({ endpoint: z.string().url() }).parse(req.body);
      await mine(req, async (c, id) =>
        c.query("delete from client_push_subscriptions where endpoint = $1 and customer_id = $2", [endpoint, id]),
      );
      return { ok: true };
    });

    // Privacidade: exportar e apagar os próprios dados.
    s.get("/me/export", async (req) =>
      mine(req, async (c, id) => {
        const q = async (sql: string) => (await c.query(sql, [id])).rows;
        return {
          exportedAt: new Date().toISOString(),
          customer: (await q("select name from customers where id = $1"))[0],
          reminders: await q("select name, dose, at_time from client_reminders where customer_id = $1"),
          doseLogs: await q("select reminder_id, day, taken_at from dose_logs where customer_id = $1"),
          reservations: await q("select product_id, status, created_at from client_reservations where customer_id = $1"),
        };
      }),
    );

    s.delete("/me", async (req, reply) => {
      const { customerId } = req.me!;
      await mine(req, async (c, id) => {
        for (const t of ["client_push_subscriptions", "dose_logs", "client_reservations", "client_reminders"]) {
          await c.query(`delete from ${t} where customer_id = $1`, [id]);
        }
        await c.query("update customers set name = '(removido)' where id = $1", [id]);
      });
      await pool.query("delete from client_sessions where customer_id = $1", [customerId]);
      await pool.query("delete from customer_logins where customer_id = $1", [customerId]);
      reply.clearCookie("ml_sid", { path: "/" });
      return { ok: true };
    });
  });
}