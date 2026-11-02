import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { enqueueDue } from "./reminders.js";

const url = process.env.DATABASE_URL_ADMIN;
const ALFA = "11111111-1111-1111-1111-111111111111";

// Luanda = UTC+1: 08:00 local = 07:00Z. Precisa de `pnpm db:migrate && pnpm db:seed`.
describe.skipIf(!url)("enqueueDue (worker)", () => {
  const pool = new pg.Pool({ connectionString: url, max: 2 });
  let customerId = "";
  let reminderId = "";
  const sends = async () =>
    Number(
      (
        await pool.query("select count(*) from client_reminder_sends where reminder_id = $1", [
          reminderId,
        ])
      ).rows[0].count,
    );

  beforeAll(async () => {
    customerId = (
      await pool.query("select id from customers where pharmacy_id = $1 limit 1", [ALFA])
    ).rows[0].id;
    reminderId = (
      await pool.query(
        `insert into client_reminders (pharmacy_id, customer_id, name, at_time, created_at)
         values ($1, $2, 'Teste worker', '08:00', '2026-01-01') returning id`,
        [ALFA, customerId],
      )
    ).rows[0].id;
  });
  afterAll(async () => {
    await pool.query("delete from client_reminders where id = $1", [reminderId]); // cascata limpa sends e logs
    await pool.end();
  });

  it("cria o envio quando a hora local acabou de passar, uma só vez", async () => {
    await enqueueDue(pool, new Date("2026-10-05T07:02:00Z"));
    expect(await sends()).toBe(1);
    await enqueueDue(pool, new Date("2026-10-05T07:03:00Z")); // tick seguinte
    expect(await sends()).toBe(1);
  });

  it("não cria se ainda não é a hora", async () => {
    await enqueueDue(pool, new Date("2026-10-06T06:59:00Z"));
    expect(await sends()).toBe(1);
  });

  it("não envia lembretes com mais de 15 min de atraso", async () => {
    await enqueueDue(pool, new Date("2026-10-06T07:20:00Z"));
    expect(await sends()).toBe(1);
  });

  it("não cria se a dose do dia já foi tomada", async () => {
    await pool.query(
      "insert into dose_logs (pharmacy_id, reminder_id, customer_id, day) values ($1, $2, $3, '2026-10-07')",
      [ALFA, reminderId, customerId],
    );
    await enqueueDue(pool, new Date("2026-10-07T07:01:00Z"));
    expect(await sends()).toBe(1);
  });
});
