const { EmbedBuilder } = require("discord.js");
const config = require("../../config.json");

/**
 * Centralized embed helpers with brand styling
 */
function brandEmbed({ title, description, fields, thumbnailUrlOverride, footerText, url } = {}) {
  const brand = config.embeds?.brand || {};
  const embed = new EmbedBuilder().setColor(brand.accentHex || config.color || "#5865F2");
  if (title) embed.setTitle(title);
  if (description) embed.setDescription(description);
  if (fields && Array.isArray(fields)) embed.addFields(fields);
  const thumb = thumbnailUrlOverride || brand.thumbnailUrl;
  if (thumb) embed.setThumbnail(thumb);
  if (url) embed.setURL(url);
  embed.setTimestamp();
  embed.setFooter({ text: footerText || brand.footerText || "" });
  return embed;
}

function successEmbed(message, opts = {}) {
  return brandEmbed({ title: "Success", description: message, ...opts });
}

function errorEmbed(message, opts = {}) {
  return brandEmbed({ title: "Error", description: message, ...opts });
}

module.exports = { brandEmbed, successEmbed, errorEmbed };