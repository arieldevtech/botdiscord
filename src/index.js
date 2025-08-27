require("dotenv").config();
const { Client, GatewayIntentBits, Collection } = require("discord.js");
const logger = require("./utils/logger");
const config = require("../config.json");
const path = require("path");

const { loadCommands } = require("./handlers/commands");
const { loadEvents } = require("./handlers/events");
const { registerGuildCommands } = require("./handlers/registerCommands");
const { getDatabase } = require("./services/database");
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
  logger.warn("Get your Discord credentials from: https://discord.com/developers/applications");
  process.exit(1);
}

// Additional validation for Discord credentials
const token = process.env.TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;

if (!token.match(/^[A-Za-z0-9._-]{59}$/)) {
  logger.error("Invalid TOKEN format. Should be a 59-character string from Discord Developer Portal.");
  logger.error("Make sure your .env file contains: DISCORD_TOKEN=your_actual_token_here");
  logger.error("Get your token from: https://discord.com/developers/applications");
  process.exit(1);
}

if (!clientId.match(/^\d{17,19}$/)) {
  logger.error("Invalid CLIENT_ID format. Should be a 17-19 digit application ID");
  process.exit(1);
}

if (!guildId.match(/^\d{17,19}$/)) {
  logger.error("Invalid GUILD_ID format. Should be a 17-19 digit server ID");
  process.exit(1);
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
    // Initialize database service
    const db = getDatabase();
    if (db.isEnabled()) {
      const health = await db.healthCheck();
      if (health.healthy) {
        logger.success("[DB] Database connection established");
      } else {
        logger.error("[DB] Database health check failed:", health.error);
      }
    } else {
      logger.warn("[DB] Running in limited mode without database");
    }

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