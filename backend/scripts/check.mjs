import pg from "pg";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const r = await c.query("select version(), current_user, (select count(*) from information_schema.tables where table_schema='public') as public_tables");
console.log(r.rows[0]);
const t = await c.query("select table_name from information_schema.tables where table_schema='public' order by 1");
console.log("public tables:", t.rows.map((x) => x.table_name));
await c.end();
