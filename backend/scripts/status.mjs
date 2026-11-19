/** Prints a summary of the database contents (no secrets). */
import pg from "pg";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const r = await c.query(`select
  (select count(*) from auth.users)::int users,
  (select count(*) from public.runs)::int runs,
  (select count(*) from public.vehicles where not is_builtin)::int user_vehicles,
  (select count(*) from public.drive_cycles where source = 'upload')::int uploads,
  (select count(*) from public.drive_cycles where source = 'dataset')::int dataset_cycles,
  (select string_agg(concat_ws(':', kind, version, status), ', ' order by kind) from public.models) models`);
console.log(r.rows[0]);
await c.end();
