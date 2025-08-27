const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { brandEmbed, errorEmbed, successEmbed } = require("../../lib/embeds");
const { getDatabase } = require("../../services/database");
const config = require("../../../config.json");

function hasAdminRole(member) {
  const adminRoleId = config.roles?.adminRoleId;
  return adminRoleId ? member.roles.cache.has(adminRoleId) : false;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("vip-upgrade")
    .setDescription("Modifier le niveau VIP d'un utilisateur")
    .addUserOption(opt => opt.setName("user").setDescription("Utilisateur à modifier").setRequired(true))
    .addIntegerOption(opt => opt.setName("level").setDescription("Nouveau niveau VIP").addChoices(
      { name: "🥉 Bronze (0)", value: 0 },
      { name: "🥈 Silver (1)", value: 1 },
      { name: "🥇 Gold (2)", value: 2 },
      { name: "💎 Diamond (3)", value: 3 }
    ).setRequired(true))
    .addStringOption(opt => opt.setName("reason").setDescription("Raison du changement").setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  cooldown: 5,
  async execute(interaction) {
    const db = getDatabase();
    const member = interaction.member;
    const targetUser = interaction.options.getUser("user");
    const newLevel = interaction.options.getInteger("level");
    const reason = interaction.options.getString("reason") || "Modification manuelle par l'administration";
    
    // Vérification des permissions admin
    const hasAdmin = hasAdminRole(member) || member.permissions.has(PermissionFlagsBits.ManageGuild);
    if (!hasAdmin) {
      return interaction.reply({
        ephemeral: true,
        embeds: [errorEmbed("❌ Vous devez avoir le rôle administrateur pour utiliser cette commande.")]
      });
    }

    if (!db.isEnabled()) {
      return interaction.reply({
        ephemeral: true,
        embeds: [errorEmbed("❌ Base de données non disponible.")]
      });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      // Récupérer ou créer l'utilisateur
      let user = await db.getUserByDiscordId(targetUser.id);
      if (!user) {
        user = await db.createUser(targetUser.id, targetUser.tag);
      }

      const oldLevel = user.vip_level;
      
      if (oldLevel === newLevel) {
        return interaction.editReply({
          embeds: [errorEmbed(`❌ L'utilisateur a déjà le niveau VIP ${newLevel}.`)]
        });
      }

      // Mettre à jour le niveau VIP
      const { data: updatedUser, error } = await db.supabase
        .from("users")
        .update({ vip_level: newLevel })
        .eq("id", user.id)
        .select()
        .single();

      if (error) throw error;

      // Mettre à jour le rôle Discord
      await db.updateDiscordVipRole(targetUser.id, newLevel, oldLevel);

      // Log de l'action
      await db.logAction('vip_level_changed', interaction.user.id, 'user', user.id, {
        old_level: oldLevel,
        new_level: newLevel,
        reason: reason,
        target_discord_id: targetUser.id
      });

      // Niveaux VIP avec emojis
      const vipLevels = {
        0: "🥉 Bronze",
        1: "🥈 Silver (€100+)",
        2: "🥇 Gold (€200+)",
        3: "💎 Diamond (€500+)"
      };

      const embed = successEmbed("✅ **Niveau VIP mis à jour**", {
        fields: [
          { name: "👤 Utilisateur", value: `${targetUser.tag}\n<@${targetUser.id}>`, inline: true },
          { name: "📊 Changement", value: `${vipLevels[oldLevel]} → ${vipLevels[newLevel]}`, inline: true },
          { name: "👨‍💼 Modifié par", value: `<@${interaction.user.id}>`, inline: true },
          { name: "📝 Raison", value: reason, inline: false },
          { name: "💰 Total dépensé", value: `€${(updatedUser.total_spent_cents / 100).toFixed(2)}`, inline: true },
          { name: "📅 Modifié le", value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
        ]
      });

      if (targetUser.displayAvatarURL()) {
        embed.setThumbnail(targetUser.displayAvatarURL({ size: 128 }));
      }

      await interaction.editReply({ embeds: [embed] });

      // Notifier l'utilisateur par DM
      try {
        const dmEmbed = brandEmbed({
          title: "🎉 **Votre statut VIP a été mis à jour !**",
          description: `Félicitations ! Votre niveau VIP a été modifié par notre équipe.`,
          fields: [
            { name: "🆕 Nouveau niveau", value: vipLevels[newLevel], inline: true },
            { name: "📝 Raison", value: reason, inline: false }
          ]
        });

        await targetUser.send({ embeds: [dmEmbed] });
      } catch (e) {
        // Ignore les erreurs de DM
      }

    } catch (error) {
      console.error("Erreur lors de la mise à jour du niveau VIP:", error);
      await interaction.editReply({
        embeds: [errorEmbed("❌ Erreur lors de la mise à jour du niveau VIP.")]
      });
    }
  }
};