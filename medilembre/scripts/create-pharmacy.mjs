// Cria uma farmácia e o seu primeiro utilizador (admin).
// Uso: pnpm pharmacy:create "Farmácia Central" admin@farmacia.ao "senha-com-10+-caracteres" [NIF] [telefone]
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { argon2id } from "hash-wasm";
import pg from "pg";

export async function createPharmacy({
  name,
  email: emailRaw,
  password,
  nif,
  phone,
  connectionString = process.env.DATABASE_URL_ADMIN ?? process.env.DATABASE_URL_UNPOOLED,
}) {
  if (!name || !emailRaw || !password) {
    throw new Error('Uso: pnpm pharmacy:create "<nome>" <email> "<senha>" [NIF] [telefone]');
  }
  const email = emailRaw.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 120) {
    throw new Error("Erro: formato de email inválido ou excede 120 caracteres.");
  }
  if (password.length < 10) {
    throw new Error("Erro: a senha da farmácia deve ter pelo menos 10 caracteres.");
  }
  if (password.length > 128) {
    throw new Error("Erro: a senha da farmácia não pode exceder 128 caracteres.");
  }

  const hash = await argon2id({
    password,
    salt: randomBytes(16),
    parallelism: 1,
    iterations: 2,
    memorySize: 19456,
    hashLength: 32,
    outputType: "encoded",
  });

  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    await client.query("begin");
    const p = await client.query(
      "insert into pharmacies (name, nif, phone) values ($1, $2, $3) returning id",
      [name.trim(), nif?.trim() ?? null, phone?.trim() ?? null],
    );
    const pharmacyId = p.rows[0].id;
    await client.query(
      "insert into pharmacy_users (pharmacy_id, name, email, role, password_hash) values ($1, $2, $3, 'admin', $4)",
      [pharmacyId, name.trim(), email, hash],
    );
    await client.query("commit");
    return { pharmacyId, name: name.trim(), email, hash };
  } catch (e) {
    await client.query("rollback").catch(() => {});
    if (e.code === "23505") {
      throw new Error(`Erro: já existe um utilizador registado com o email "${email}".`);
    }
    throw e;
  } finally {
    await client.end();
  }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const [name, emailRaw, password, nif, phone] = process.argv.slice(2);
  try {
    const res = await createPharmacy({ name, email: emailRaw, password, nif, phone });
    console.log(`✓ Farmácia criada: ${res.name} (${res.pharmacyId})`);
    console.log(`  Entrar em /farmacia/entrar com ${res.email}`);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
