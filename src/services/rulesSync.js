const config = require("../../config.json");
const logger = require("../utils/logger");
const { syncFixedEmbed, buildRulesPayload } = require("../utils/fixedEmbeds");

async function syncRules(client) {
  const channelId = config.channels?.rulesChannelId;
  if (!channelId) {
    logger.warn("[rules] channels.rulesChannelId is not configured; skipping rules sync");
    return;
  }
  const payload = buildRulesPayload();
  await syncFixedEmbed(client, { slug: "rules", channelId, payload });
}

module.exports = { syncRules };