import { afterAll, describe, expect, it } from "vitest";
import { pool, withTenant } from "./db";

const ALFA = "11111111-1111-1111-1111-111111111111";
const BETA = "22222222-2222-2222-2222-222222222222";
const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("isolamento por farmácia (RLS)", () => {
  afterAll(() => pool.end());

  it("a farmácia A só vê os seus clientes", async () => {
    const rows = await withTenant(
      ALFA,
      async (c) => (await c.query("select name from customers")).rows,
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.name.includes("(Alfa)"))).toBe(true);
  });
  it("a farmácia B nunca lê dados da A", async () => {
    const rows = await withTenant(
      BETA,
      async (c) => (await c.query("select name from customers")).rows,
    );
    expect(rows.some((r) => r.name.includes("(Alfa)"))).toBe(false);
  });
  it("sem tenant definido não devolve nada", async () => {
    expect((await pool.query("select * from customers")).rowCount).toBe(0);
  });
  it("não deixa escrever noutra farmácia", async () => {
    await expect(
      withTenant(ALFA, (c) =>
        c.query("insert into customers (pharmacy_id, name) values ($1, 'intruso')", [BETA]),
      ),
    ).rejects.toThrow();
  });
});
