/** Finds em/en dashes or minus signs in user-visible text columns. */
import pg from "pg";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const r = await c.query(`
  select 'vehicles' t, id, name || ' | ' || description v from public.vehicles where name || description ~ '[—–−]'
  union all select 'drive_cycles', id, name || ' | ' || description from public.drive_cycles where name || description ~ '[—–−]'
  union all select 'models', id::text, coalesce(notes,'') || ' | ' || metrics::text from public.models where coalesce(notes,'') || metrics::text ~ '[—–−]'`);
console.log(r.rows.length ? r.rows.map((x) => `${x.t} ${x.id}: ${x.v.match(/.{0,40}[—–−].{0,40}/)?.[0]}`) : "no dashes in database text");
await c.end();
