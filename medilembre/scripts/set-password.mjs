// Uso: node --env-file=.env scripts/set-password.mjs [identificador|--all] [senha]
import pg from "pg";

let argon2;
try {
  argon2 = await import("@node-rs/argon2");
} catch {
  argon2 = await import("../apps/api/node_modules/@node-rs/argon2/index.js");
}

function normIdentifier(raw) {
  const s = raw.trim().toLowerCase();
  if (s.includes("@")) return s;
  const d = s.replace(/\D/g, "");
  return d.length === 9 ? `244${d}` : d;
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL_ADMIN });
await client.connect();

try {
  const [target, newPassword] = process.argv.slice(2);

  if (!target) {
    console.log("MediLembre · Gestor de Senhas de Utentes (Argon2id)");
    console.log("--------------------------------------------------");
    console.log("Uso:");
    console.log(
      "  node --env-file=.env scripts/set-password.mjs <identificador|telefone|nome> <nova-senha>",
    );
    console.log("  node --env-file=.env scripts/set-password.mjs --all <nova-senha>\n");
    console.log("Utilizadores atuais na base de dados:");

    const query = `
      select 
        c.id as customer_id,
        c.name,
        c.phone,
        p.name as pharmacy,
        cl.identifier,
        cl.password_hash is not null as has_password
      from customers c
      join pharmacies p on p.id = c.pharmacy_id
      left join customer_logins cl on cl.customer_id = c.id
      order by c.name
    `;
    const res = await client.query(query);
    console.table(res.rows);
    process.exit(0);
  }

  if (!newPassword || newPassword.length < 8) {
    console.error("Erro: A senha deve ter pelo menos 8 caracteres.");
    process.exit(1);
  }

  const hash = await argon2.hash(newPassword, {
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });

  if (target === "--all") {
    const customers = (
      await client.query("select id, pharmacy_id, phone, email, name from customers")
    ).rows;

    for (const c of customers) {
      const identifier = c.email ? normIdentifier(c.email) : normIdentifier(c.phone ?? "");
      if (!identifier) continue;

      await client.query(
        `insert into customer_logins (customer_id, pharmacy_id, identifier, password_hash)
         values ($1, $2, $3, $4)
         on conflict (customer_id) do update 
         set identifier = excluded.identifier, password_hash = excluded.password_hash`,
        [c.id, c.pharmacy_id, identifier, hash],
      );
      console.log(`✓ Senha atualizada para ${c.name} (identificador: ${identifier})`);
    }
    console.log("\nTodas as senhas foram redefinidas com sucesso!");
    console.log(`Nova senha para todos: ${newPassword}`);
    process.exit(0);
  }

  // Pesquisar por identificador normalizado, telefone ou nome aproximado
  const norm = normIdentifier(target);
  const found = await client.query(
    `select c.id, c.pharmacy_id, c.name, c.phone, c.email
     from customers c
     left join customer_logins cl on cl.customer_id = c.id
     where cl.identifier = $1 
        or c.phone = $2 
        or c.phone = $1
        or lower(c.name) like '%' || lower($3) || '%'
     limit 1`,
    [norm, target, target],
  );

  if (!found.rows[0]) {
    console.error(`Erro: Nenhum utente encontrado com o identificador/telefone/nome: "${target}"`);
    process.exit(1);
  }

  const customer = found.rows[0];
  const finalIdentifier = customer.email
    ? normIdentifier(customer.email)
    : normIdentifier(customer.phone ?? norm);

  await client.query(
    `insert into customer_logins (customer_id, pharmacy_id, identifier, password_hash)
     values ($1, $2, $3, $4)
     on conflict (customer_id) do update 
     set identifier = excluded.identifier, password_hash = excluded.password_hash`,
    [customer.id, customer.pharmacy_id, finalIdentifier, hash],
  );

  console.log(`✓ Senha redefinida com sucesso para ${customer.name}!`);
  console.log(`  Identificador para login: ${finalIdentifier}`);
  console.log(`  Nova senha: ${newPassword}`);
  console.log(`  Hash Argon2id: ${hash}`);
} finally {
  await client.end();
}
