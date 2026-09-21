/**
 * One-time import of the original tenant list into Supabase.
 * Run this AFTER you've created the owner account and pasted supabase/schema.sql
 * into the SQL editor (see README.md).
 *
 *   node scripts/seed.mjs
 *
 * It signs in as the owner (RLS requires a signed-in user to insert), so
 * it will ask for the owner email/password if they aren't in your .env.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import readline from "node:readline/promises";
import "dotenv/config";

const __dirname = dirname(fileURLToPath(import.meta.url));

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Copy .env.example to .env first.");
  process.exit(1);
}

// --- Ethiopian calendar parsing (same rules as src/ethiopianCalendar.js) ---
const ALIASES = {
  "መስከረም": 1, "ጥቅምት": 2, "ህዳር": 3, "ሕዳር": 3, "ታህሳስ": 4, "ታኅሳስ": 4, "ጥር": 5,
  "የካቲት": 6, "መጋቢት": 7, "ሚያዚያ": 8, "ሚያዝያ": 8, "ግንቦት": 9, "ሰኔ": 10,
  "ሀምሌ": 11, "ሐምሌ": 11, "ነሀሴ": 12, "ነሐሴ": 12, "ጳጉሜ": 13, "ጳጉሜን": 13,
};
function parseEth(text) {
  if (!text) return null;
  const s = String(text).replace(/\s+/g, " ").trim();
  let monthName = null;
  for (const k of Object.keys(ALIASES)) {
    if (s.includes(k) && (!monthName || k.length > monthName.length)) monthName = k;
  }
  if (!monthName) return null;
  const nums = s.replace(monthName, "").match(/\d+/g);
  if (!nums || nums.length < 2) return null;
  const d = parseInt(nums[0], 10), y = parseInt(nums[nums.length - 1], 10);
  const m = ALIASES[monthName];
  if (!(d >= 1 && d <= 30) || !(y > 1900 && y < 2200)) return null;
  return { y, m, d };
}
function normalizeEth(dt) {
  if (!dt) return dt;
  if (dt.m === 13) return { y: dt.y + 1, m: 1, d: 1 };
  return dt;
}

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  let email = process.env.SEED_OWNER_EMAIL;
  let password = process.env.SEED_OWNER_PASSWORD;
  if (!email || !password) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    email = email || await rl.question("Owner email: ");
    password = password || await rl.question("Owner password: ");
    rl.close();
  }

  const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
  if (authError) {
    console.error("Login failed:", authError.message);
    process.exit(1);
  }

  const { count, error: countError } = await supabase.from("tenants").select("*", { count: "exact", head: true });
  if (countError) {
    console.error("Could not check existing tenants:", countError.message);
    process.exit(1);
  }
  if (count > 0) {
    console.log(`${count} tenants already exist — skipping seed (nothing was changed).`);
    process.exit(0);
  }

  const raw = readFileSync(join(__dirname, "..", "data", "seed_tenants.json"), "utf-8");
  const rows = JSON.parse(raw);

  const payload = [];
  for (const r of rows) {
    const name = (r.name || "").trim();
    if (name.length < 2 || /^\d+$/.test(name)) continue; // skips the one junk row from the original spreadsheet
    const payEnd = normalizeEth(parseEth(r.pEnd));
    payload.push({
      name,
      room: r.room || "",
      floor: r.floor,
      phone: r.phone || "",
      contract_start: r.cStart || "",
      contract_end: r.cEnd || "",
      pay_start_raw: r.pStart || "",
      amt3: r.amt3 ?? null,
      amt6: r.amt6 ?? null,
      pay_end_y: payEnd ? payEnd.y : null,
      pay_end_m: payEnd ? payEnd.m : null,
      pay_end_d: payEnd ? payEnd.d : null,
    });
  }

  const { error: insertError } = await supabase.from("tenants").insert(payload);
  if (insertError) {
    console.error("Seed insert failed:", insertError.message);
    process.exit(1);
  }
  console.log(`Seeded ${payload.length} tenants.`);
  await supabase.auth.signOut();
}

main();
