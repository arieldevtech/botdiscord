require("dotenv").config();
const { Client, GatewayIntentBits, Collection } = require("discord.js");
const logger = require("./utils/logger");
const config = require("../config.json");
const path = require("path");

const { loadCommands } = require("./handlers/commands");
const { loadEvents } = require("./handlers/events");
const { registerGuildCommands } = require("./handlers/registerCommands");
const { initSupabase, pingSupabase } = require("./utils/supabase");
const { syncRulesMessage } = require("./features/rules");
const { ensureTicketHub, validateTicketCategories } = require("./modules/support/seed");
const { ensureProductShowcase } = require("./modules/catalog/seed");
const { startServer } = require("./payments/stripeServer");

// Map DISCORD_* to legacy if needed
process.env.TOKEN = process.env.TOKEN || process.env.DISCORD_TOKEN;
process.env.CLIENT_ID = process.env.CLIENT_ID || process.env.DISCORD_APP_ID;
process.env.GUILD_ID = process.env.GUILD_ID || (config.guildId || "");

// 1) Validate environment
const REQUIRED_ENV = ["TOKEN", "CLIENT_ID", "GUILD_ID"]; 
const missing = REQUIRED_ENV.filter((k) => !process.env[k] || String(process.env[k]).includes("your_"));
if (missing.length) {
  logger.warn("Environment validation failed. Missing/placeholder:", missing.join(", "));
  logger.warn("Create a .env file based on .env.example and fill real values.");
}

// 2) Create client (add more intents for features)
const client = new Client({ intents: [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMembers,
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.GuildPresences,
] });
client.commands = new Collection();
client.cooldowns = new Collection();

// 3) Global process error handlers
process.on("unhandledRejection", (reason) => { logger.error("[unhandledRejection]", reason); });
process.on("uncaughtException", (err) => { logger.error("[uncaughtException]", err); });

(async () => {
  try {
    // Supabase boot-only init + ping
    const supa = initSupabase();
    await pingSupabase(supa);

    // Load Commands & Events
    const { commandsJson, totalLoaded: commandsLoaded } = await loadCommands(client, path.join(__dirname, "commands"));
    const eventsLoaded = await loadEvents(client, path.join(__dirname, "events"));

    // Register guild commands
    await registerGuildCommands(commandsJson);

    client.boot = { commandsLoaded, eventsLoaded, security: "PASSED" };

    // Login
    await client.login(process.env.TOKEN);

    // After login and cache ready, run rules sync and start Stripe server
    client.once("ready", async () => {
      await syncRulesMessage(client);
      await ensureTicketHub(client);
      await ensureProductShowcase(client);
      await validateTicketCategories(client);
      startServer(client); // Express: /stripe/checkout, /stripe/webhook, /stripe/dl
    });
  } catch (err) {
    logger.error("Fatal startup error:", err);
  }
})();