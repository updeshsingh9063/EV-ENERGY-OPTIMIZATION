/** Creates (or deletes) a pre-confirmed throwaway user for automated browser tests. Uses the secret key. */
import { createClient } from "@supabase/supabase-js";
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const [cmd, email, password] = process.argv.slice(2);
if (cmd === "create") {
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: "E2E Tester" } });
  if (error) throw error;
  console.log("created", data.user.id);
} else if (cmd === "delete") {
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  for (const u of data.users.filter((u) => u.email === email)) {
    const { error: e } = await admin.auth.admin.deleteUser(u.id);
    if (e) throw e;
    console.log("deleted", u.id);
  }
}
