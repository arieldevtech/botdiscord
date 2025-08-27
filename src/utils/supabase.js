const { createClient } = require("@supabase/supabase-js");
const logger = require("./logger");

function initSupabase() {
  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  if (!url || !anon) {
    logger.warn("Supabase not configured (SUPABASE_URL/SUPABASE_ANON_KEY missing). Skipping init.");
    return null;
  }
  const client = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

async function pingSupabase(client) {
  if (!client) return { ok: false, note: "no-client" };
  try {
    // Lightweight ping: attempt to read current session; in Node with no session this is safe
    const { data, error } = await client.auth.getSession();
    if (error) {
      logger.warn("Supabase auth.getSession returned error (expected if no session):", error.message);
    }
    logger.success("Supabase initialized (boot-only check)");
    return { ok: true };
  } catch (e) {
    logger.error("Supabase ping failed:", e);
    return { ok: false, error: e };
  }
}

module.exports = { initSupabase, pingSupabase };