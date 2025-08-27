const { REST, Routes } = require("discord.js");
const logger = require("../utils/logger");

async function registerGuildCommands(commandsJson) {
  const token = process.env.TOKEN;
  const clientId = process.env.CLIENT_ID;
  const guildId = process.env.GUILD_ID;

  if (!token || !clientId || !guildId) {
    logger.warn("Cannot register guild commands: missing TOKEN/CLIENT_ID/GUILD_ID");
    logger.warn("Please check your .env file and ensure all Discord credentials are properly set");
    return;
  }

  // Validate token format
  if (!token.match(/^[A-Za-z0-9._-]{59,72}$/)) {
    logger.warn("TOKEN appears to be invalid format. Should be a 59-character string from Discord Developer Portal");
    return;
  }

  // Validate client ID format
  if (!clientId.match(/^\d{17,19}$/)) {
    logger.warn("CLIENT_ID appears to be invalid format. Should be a 17-19 digit number from Discord Developer Portal");
    return;
  }

  // Validate guild ID format
  if (!guildId.match(/^\d{17,19}$/)) {
    logger.warn("GUILD_ID appears to be invalid format. Should be a 17-19 digit server ID");
    return;
  }

  const rest = new REST({ version: "10" }).setToken(token);

  try {
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commandsJson });
    logger.success(`Registered ${commandsJson.length} guild command(s) for ${guildId}`);
  } catch (error) {
    logger.error("Failed to register guild commands:", error.message);
    if (error.status === 401) {
      logger.error("Authentication failed. Please verify your TOKEN and CLIENT_ID in .env file");
    }
  }
}

module.exports = { registerGuildCommands };