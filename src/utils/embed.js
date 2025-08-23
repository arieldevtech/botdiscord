// Backward-compatible embed helper that proxies to brand helpers
const { brandEmbed, successEmbed, errorEmbed } = require("../lib/embeds");

function buildEmbed(opts) {
  return brandEmbed(opts);
}

module.exports = { buildEmbed, brandEmbed, successEmbed, errorEmbed };