const { getDatabase } = require("../../services/database");
const config = require("../../../config.json");

function hasAdminRole(member) {
  const adminRoleId = config.roles?.adminRoleId;
  return adminRoleId ? member.roles.cache.has(adminRoleId) : false;
}

module.exports = {
    const supportRoleIds = config.supportRoleIds || [];
    
    // Vérifier si l'utilisateur a un rôle de support ou admin
    const hasSupport = supportRoleIds.some(roleId => member.roles.cache.has(roleId));
    const hasAdmin = hasAdminRole(member);
    if (!hasSupport && !hasAdmin) {
      return interaction.reply({
        ephemeral: true,
        embeds: [errorEmbed("❌ Vous devez avoir un rôle de support ou administrateur pour utiliser cette commande.")]
      });
    }