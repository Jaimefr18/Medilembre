// Cria uma farmácia e o seu primeiro utilizador (admin).
// Uso: node --env-file=.env scripts/create-pharmacy.mjs "Farmácia Central" admin@farmacia.ao "senha-com-8+-caracteres" [NIF] [telefone]
import { randomBytes } from "node:crypto";
import { argon2id } from "hash-wasm";
import pg from "pg";

const [name, emailRaw, password, nif, phone] = process.argv.slice(2);
if (!name || !emailRaw || !password) {
  console.error('Uso: create-pharmacy.mjs "<nome>" <email> "<senha>" [NIF] [telefone]');
  process.exit(1);
}
if (password.length < 10) {
  console.error("Erro: a senha da farmácia deve ter pelo menos 10 caracteres.");
  process.exit(1);
}
const email = emailRaw.trim().toLowerCase();

const hash = await argon2id({
  password,
  salt: randomBytes(16),
  parallelism: 1,
  iterations: 2,
  memorySize: 19456,
  hashLength: 32,
  outputType: "encoded",
});

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL_ADMIN ?? process.env.DATABASE_URL_UNPOOLED,
});
await client.connect();
try {
  await client.query("begin");
  const p = await client.query(
    "insert into pharmacies (name, nif, phone) values ($1, $2, $3) returning id",
    [name, nif ?? null, phone ?? null],
  );
  await client.query(
    "insert into pharmacy_users (pharmacy_id, name, email, role, password_hash) values ($1, $2, $3, 'admin', $4)",
    [p.rows[0].id, name, email, hash],
  );
  await client.query("commit");
  console.log(`✓ Farmácia criada: ${name} (${p.rows[0].id})`);
  console.log(`  Entrar em /farmacia/entrar com ${email}`);
} catch (e) {
  await client.query("rollback").catch(() => {});
  console.error("Erro:", e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
