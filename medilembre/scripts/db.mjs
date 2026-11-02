// Uso: node --env-file=.env scripts/db.mjs migrate|seed
import { readFileSync, readdirSync } from "node:fs";
import pg from "pg";

const cmd = process.argv[2];
const client = new pg.Client({ connectionString: process.env.DATABASE_URL_ADMIN });
await client.connect();
try {
  if (cmd === "migrate") {
    await client.query(
      "create table if not exists _migrations (name text primary key, at timestamptz default now())",
    );
    const done = new Set(
      (await client.query("select name from _migrations")).rows.map((r) => r.name),
    );
    for (const f of readdirSync("db/migrations")
      .filter((f) => f.endsWith(".sql"))
      .sort()) {
      if (done.has(f)) continue;
      await client.query("begin");
      await client.query(readFileSync(`db/migrations/${f}`, "utf8"));
      await client.query("insert into _migrations (name) values ($1)", [f]);
      await client.query("commit");
      console.log("aplicada:", f);
    }
    const pw = (process.env.APP_DB_PASSWORD ?? "app").replaceAll("'", "''");
    await client.query(`alter role medilembre_app password '${pw}'`);
  } else if (cmd === "seed") {
    await client.query(readFileSync("db/seed/seed.sql", "utf8"));
    console.log("seed ok");
  } else {
    console.error("comando: migrate | seed");
    process.exit(1);
  }
} finally {
  await client.end();
}
