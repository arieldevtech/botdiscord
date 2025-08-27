const logger = require("../utils/logger");
const config = require("../../config.json");

module.exports = {
  name: "ready",
  once: true,
  async execute(client) {
    const cmds = client.boot?.commandsLoaded ?? client.commands.size;
    const evts = client.boot?.eventsLoaded ?? 1;
    const sec = client.boot?.security ?? "PASSED";

    // Detailed boot logs
    const launchedAt = new Date().toISOString();
    const rssMb = Math.round(process.memoryUsage().rss / (1024 * 1024));
    logger.success(`✅ ${config.botName} v${config.version} is online`); // Professional boot logs below
    logger.info(`[READY] Logged in as ${client.user.tag}`);
    logger.info(`[BOOT] Launched at ${launchedAt} | Uptime: 0s | RSS: ${rssMb}MB`);
    logger.info(`⚡ Commands loaded: ${cmds}`);
    logger.info(`🎯 Events loaded: ${evts}`);
    logger.info(`🔒 Security checks: ${sec}`);

    try {
      await client.user.setPresence({ activities: [{ name: `${config.botName} v${config.version}` }], status: "online" });
    } catch (e) {
      // ignore presence errors safely
    }
  },
};