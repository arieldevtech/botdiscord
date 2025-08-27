const fs = require("fs");
const path = require("path");
const { Collection } = require("discord.js");
const logger = require("../utils/logger");

async function loadCommands(client, commandsDir) {
  let totalDiscovered = 0;

  if (!fs.existsSync(commandsDir)) {
    logger.warn(`Commands directory not found at ${commandsDir}. Creating one.`);
    fs.mkdirSync(commandsDir, { recursive: true });
  }

  // Load categories and enforce an order so new implementations override older ones
  const orderWeight = { general: 0, fun: 0, ticket: 0, info: 1, util: 2, system: 2, admin: 2 };
  const categories = fs
    .readdirSync(commandsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort((a, b) => (orderWeight[a] ?? 1) - (orderWeight[b] ?? 1));

  client.commands = new Collection();

  for (const category of categories) {
    const categoryPath = path.join(commandsDir, category);
    const files = fs.readdirSync(categoryPath).filter((f) => f.endsWith(".js"));

    for (const file of files) {
      const filePath = path.join(categoryPath, file);
      try {
        const command = require(filePath);
        if (!command?.data?.name || typeof command.execute !== "function") {
          logger.warn(`Skipping invalid command at ${filePath}`);
          continue;
        }
        totalDiscovered += 1;
        const name = command.data.name;
        if (client.commands.has(name)) {
          logger.warn(`Duplicate command name '${name}' found at ${filePath}. Overriding previous definition.`);
        }
        command.category = category;
        client.commands.set(name, command);
      } catch (err) {
        logger.error(`Failed to load command ${filePath}`, err);
      }
    }
  }

  // Build unique commands JSON from final map
  const commandsJson = Array.from(client.commands.values()).map((c) => (typeof c.data.toJSON === "function" ? c.data.toJSON() : c.data));

  logger.success(`Commands loaded: ${client.commands.size}`);
  return { commandsJson, totalLoaded: client.commands.size };
}

module.exports = { loadCommands };