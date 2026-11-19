/** RLS / trigger test suite. Runs inside one transaction and ROLLS BACK, leaving no data behind. */
import pg from "pg";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const U1 = "00000000-0000-4000-8000-000000000001", U2 = "00000000-0000-4000-8000-000000000002";
let pass = 0, fail = 0;
const as = async (uid) => {
  await c.query("reset role");
  if (uid === "anon") { await c.query("set local role anon"); await c.query(`select set_config('request.jwt.claims', '{"role":"anon"}', true)`); return; }
  await c.query("set local role authenticated");
  await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid, role: "authenticated" })]);
};
async function check(name, fn, expect) {
  await c.query("savepoint t");
  let got;
  try { got = await fn(); } catch (e) { got = "ERROR"; }
  await c.query("rollback to savepoint t");
  const ok = typeof expect === "function" ? expect(got) : got === expect;
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  → ${JSON.stringify(got)}`);
}
const one = async (sql, p) => (await c.query(sql, p)).rows;
const count = async (sql, p) => (await c.query(sql, p)).rowCount;
const run = (owner) => `insert into public.runs (owner_id, vehicle_id, vehicle_name, config, cycle_id, cycle_name, controller, init, kpis, baseline)
  values ('${owner}', 'veh-compact', 'Compact EV', '{}', 'syn-urban', 'Urban', 'ml', '{}', '{}', '{}') returning seq`;

try {
  await c.query("begin");
  for (const [id, e] of [[U1, "rls-test-1@example.invalid"], [U2, "rls-test-2@example.invalid"]])
    await c.query("insert into auth.users (id, email, aud, role) values ($1, $2, 'authenticated', 'authenticated')", [id, e]);

  const sharedCycles = (await one("select count(*)::int n from public.drive_cycles where owner_id is null"))[0].n;
  const modelCount = (await one("select count(*)::int n from public.models"))[0].n;
  await check("profile auto-created for new users", () => one("select count(*)::int n from public.profiles where id in ($1,$2)", [U1, U2]).then((r) => r[0].n), 2);

  await as(U1);
  await check("u1 sees 2 built-in vehicles", () => one("select count(*)::int n from public.vehicles").then((r) => r[0].n), 2);
  await check(`u1 sees all ${sharedCycles} shared cycles (synthetic + dataset)`, () => one("select count(*)::int n from public.drive_cycles").then((r) => r[0].n), sharedCycles);
  await check("u1 can insert own vehicle", () => count(`insert into public.vehicles (owner_id, name, config) values ('${U1}', 'Mine', '{"vehicle":{},"battery":{},"supercap":{}}')`), 1);
  await check("u1 cannot insert vehicle owned by u2", () => count(`insert into public.vehicles (owner_id, name, config) values ('${U2}', 'X', '{"vehicle":{},"battery":{},"supercap":{}}')`), "ERROR");
  await check("u1 cannot create a built-in", () => count(`insert into public.vehicles (owner_id, name, config, is_builtin) values (null, 'X', '{"vehicle":{},"battery":{},"supercap":{}}', true)`), "ERROR");
  await check("u1 cannot modify built-in vehicle", () => count("update public.vehicles set name='hack' where id='veh-compact'"), 0);
  await check("u1 cannot delete built-in vehicle", () => count("delete from public.vehicles where id='veh-compact'"), 0);
  await check("invalid vehicle config rejected", () => count(`insert into public.vehicles (owner_id, name, config) values ('${U1}', 'Bad', '{"vehicle":{}}')`), "ERROR");
  await check("u1 cannot insert synthetic cycle", () => count(`insert into public.drive_cycles (owner_id, name, source, speed_ms) values ('${U1}', 'x', 'synthetic', array_fill(1::real, array[20]))`), "ERROR");
  await check("u1 can upload a cycle", () => count(`insert into public.drive_cycles (id, owner_id, name, source, speed_ms) values ('u1-cyc', '${U1}', 'mine', 'upload', array_fill(1::real, array[20]))`), 1);
  await c.query(`insert into public.drive_cycles (id, owner_id, name, source, speed_ms) values ('u1-cyc', '${U1}', 'mine', 'upload', array_fill(1::real, array[20]))`);
  await check("too-short cycle rejected", () => count(`insert into public.drive_cycles (owner_id, name, source, speed_ms) values ('${U1}', 'x', 'upload', array_fill(1::real, array[5]))`), "ERROR");
  await check("u1 first run gets #1", () => one(run(U1)).then((r) => r[0].seq), 1);
  await c.query(run(U1)); await c.query(run(U1));
  await check("u1 runs numbered sequentially (max #2)", () => one("select max(seq)::int m from public.runs").then((r) => r[0].m), 2);
  await check("u1 cannot insert run as u2", () => count(run(U2)), "ERROR");
  await check("u1 cannot tamper run_seq", () => c.query("update public.profiles set run_seq = 999 where id = $1", [U1]).then(() => one("select run_seq from public.profiles where id=$1", [U1])).then((r) => r[0].run_seq), 2);
  await check("u1 cannot update runs (immutable)", () => count("update public.runs set cycle_name='x'"), 0);
  await check("u1 cannot write models", () => count("insert into public.models (kind, version) values ('policy', 'v1')"), "ERROR");
  await check(`u1 can read all ${modelCount} models`, () => one("select count(*)::int n from public.models").then((r) => r[0].n), modelCount);
  await check("u1 cannot modify models", () => count("update public.models set status = 'archived'"), 0);
  await check("u1 cannot delete shared dataset cycles", () => count("delete from public.drive_cycles where owner_id is null"), 0);

  await as(U2);
  await check("u2 sees none of u1's runs", () => one("select count(*)::int n from public.runs").then((r) => r[0].n), 0);
  await check("u2 cannot delete u1's runs", () => count("delete from public.runs"), 0);
  await check("u2 cannot see u1's uploaded cycle", () => one("select count(*)::int n from public.drive_cycles where id='u1-cyc'").then((r) => r[0].n), 0);
  await check("u2 cannot see u1's vehicles", () => one("select count(*)::int n from public.vehicles where not is_builtin").then((r) => r[0].n), 0);
  await check("u2 sees only own profile", () => one("select count(*)::int n from public.profiles").then((r) => r[0].n), 1);
  await check("u2 first run is #1 (per-user numbering)", () => one(run(U2)).then((r) => r[0].seq), 1);

  await as("anon");
  await check("anon cannot read vehicles", () => one("select count(*) from public.vehicles"), "ERROR");
  await check("anon cannot read runs", () => one("select count(*) from public.runs"), "ERROR");
  await check("anon cannot read profiles", () => one("select count(*) from public.profiles"), "ERROR");
} finally {
  await c.query("rollback");
  await c.end();
}
console.log(`\n${pass} passed, ${fail} failed (transaction rolled back)`);
process.exitCode = fail ? 1 : 0;
