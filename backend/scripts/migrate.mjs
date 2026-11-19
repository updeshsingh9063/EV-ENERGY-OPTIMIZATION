/** Applies supabase/migrations/*.sql in order, once each, each in its own transaction. */
import { readdirSync, readFileSync } from "node:fs";
import pg from "pg";

const dir = new URL("../supabase/migrations/", import.meta.url);
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
await c.query(`create schema if not exists ops;
  create table if not exists ops.applied_migrations (name text primary key, applied_at timestamptz not null default now());
  revoke all on schema ops from anon, authenticated;`);
const done = new Set((await c.query("select name from ops.applied_migrations")).rows.map((r) => r.name));
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
for (const f of files) {
  if (done.has(f)) { console.log("skip ", f); continue; }
  try {
    await c.query("begin");
    await c.query(readFileSync(new URL(f, dir), "utf8"));
    await c.query("insert into ops.applied_migrations (name) values ($1)", [f]);
    await c.query("commit");
    console.log("apply", f);
  } catch (e) {
    await c.query("rollback");
    console.error("FAILED", f, "\n", e.message);
    process.exitCode = 1;
    break;
  }
}
await c.end();
