const { REST, Routes } = require("discord.js");
const logger = require("../utils/logger");

async function registerGuildCommands(commandsJson) {
  const token = process.env.TOKEN;
  const clientId = process.env.CLIENT_ID;
  const guildId = process.env.GUILD_ID;

  if (!token || !clientId || !guildId) {
    logger.warn("Cannot register guild commands: missing TOKEN/CLIENT_ID/GUILD_ID");
    logger.error("Discord credentials are required for command registration");
    return;
  }

  // Additional validation for placeholder values
  if (token.includes("your_") || clientId.includes("your_") || guildId.includes("your_")) {
    logger.error("Cannot register guild commands: environment variables contain placeholder values");
    logger.error("Please update your .env file with real Discord credentials");
    return;
  }
  const rest = new REST({ version: "10" }).setToken(token);

  try {
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commandsJson });
    logger.success(`Registered ${commandsJson.length} guild command(s) for ${guildId}`);
  } catch (error) {
    logger.error("Failed to register guild commands:", error);
  }
}

module.exports = { registerGuildCommands };