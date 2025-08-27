const { EmbedBuilder } = require("discord.js");
const config = require("../../config.json");

/**
 * Centralized embed helpers with brand styling
 */
function brandEmbed({ title, description, fields, thumbnailUrlOverride, footerText, url } = {}) {
  const brand = config.embeds?.brand || {};
  
  // Validation et correction de la couleur
  let color = brand.accentHex || config.color || "#5865F2";
  
  // Corriger les couleurs invalides
  if (color === "#FFFF") color = "#FFFFFF"; // Blanc complet
  if (color === "#000") color = "#000000";   // Noir complet
  if (color.length === 4) {
    // Convertir #RGB en #RRGGBB
    color = color.replace(/^#([a-f\d])([a-f\d])([a-f\d])$/i, '#$1$1$2$2$3$3');
  }
  
  const embed = new EmbedBuilder().setColor(color);
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