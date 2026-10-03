// Sets (or resets) the password of an existing account, e.g. one created
// before passwords were added. Uses the service_role key from .env.
//
//   NEW_PASSWORD='your-password' node server/set-password.js <username>
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const { createClient } = require("@supabase/supabase-js");
const { hashPassword } = require("./password.js");

(async () => {
  const username = (process.argv[2] || "").trim();
  const password = process.env.NEW_PASSWORD || "";
  if (!username || password.length < 6) {
    console.error("usage: NEW_PASSWORD='<at least 6 chars>' node server/set-password.js <username>");
    process.exit(1);
  }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing in .env");
    process.exit(1);
  }
  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const pattern = username.replace(/[\\%_]/g, "\\$&");
  const { data, error } = await db.from("profiles").select("id").ilike("username", pattern);
  if (error) throw error;
  if (!data || data.length !== 1) {
    console.error(data && data.length > 1 ? "more than one account matches" : "no such account");
    process.exit(1);
  }
  const { error: e2 } = await db
    .from("profiles")
    .update({ password_hash: await hashPassword(password) })
    .eq("id", data[0].id);
  if (e2) throw e2;
  console.log("password set for " + username);
})().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
