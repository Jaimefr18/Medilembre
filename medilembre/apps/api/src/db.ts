import pg from "pg";
import { env } from "./env.js";

export const pool = new pg.Pool({ connectionString: env.databaseUrl, max: 10 });

/**
 * Corre `fn` numa transação com app.pharmacy_id definido: o RLS filtra tudo por farmácia.
 * Com `customerId`, o RLS restringe também ao próprio cliente (app do cliente).
 */
export async function withTenant<T>(
  pharmacyId: string,
  fn: (c: pg.PoolClient) => Promise<T>,
  customerId?: string,
): Promise<T> {
  return withTx(async (c) => {
    // app.customer_id = "" (customerId undefined) significa "painel da farmácia": a política restritiva
    // own_customer usa nullif(current_setting('app.customer_id', true), '') is null para deixar passar
    // a farmácia inteira. Com customerId definido, o cliente só vê as suas próprias linhas.
    await c.query("select set_config('app.pharmacy_id', $1, true), set_config('app.customer_id', $2, true)", [
      pharmacyId,
      customerId ?? "",
    ]);
    return fn(c);
  });
}

/** Transação simples, sem tenant (tabelas de autenticação, que não têm RLS). */
export async function withTx<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("begin");
    const result = await fn(c);
    await c.query("commit");
    return result;
  } catch (e) {
    await c.query("rollback");
    throw e;
  } finally {
    c.release();
  }
}