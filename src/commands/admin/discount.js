const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { brandEmbed, errorEmbed, successEmbed } = require("../../lib/embeds");
const { getDatabase } = require("../../services/database");
const config = require("../../../config.json");
const crypto = require("crypto");

function hasAdminRole(member) {
  const adminRoleId = config.roles?.adminRoleId;
  return adminRoleId ? member.roles.cache.has(adminRoleId) : false;
}

function generateDiscountCode(username, percentage) {
  const random = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `${username.slice(0, 4).toUpperCase()}${percentage}${random}`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("discount")
    .setDescription("Créer un code promo personnalisé pour un utilisateur")
    .addUserOption(opt => opt.setName("user").setDescription("Utilisateur bénéficiaire").setRequired(true))
    .addIntegerOption(opt => opt.setName("percentage").setDescription("Pourcentage de réduction (1-99)").setRequired(true).setMinValue(1).setMaxValue(99))
    .addIntegerOption(opt => opt.setName("uses").setDescription("Nombre d'utilisations autorisées").setRequired(false).setMinValue(1).setMaxValue(100))
    .addIntegerOption(opt => opt.setName("expires_days").setDescription("Expire dans X jours (défaut: 30)").setRequired(false).setMinValue(1).setMaxValue(365))
    .addStringOption(opt => opt.setName("reason").setDescription("Raison du code promo").setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  cooldown: 5,
  async execute(interaction) {
    const db = getDatabase();
    const member = interaction.member;
    const targetUser = interaction.options.getUser("user");
    const percentage = interaction.options.getInteger("percentage");
    const maxUses = interaction.options.getInteger("uses") || 1;
    const expiresDays = interaction.options.getInteger("expires_days") || 30;
    const reason = interaction.options.getString("reason") || "Code promo personnalisé";
    
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

      // Générer le code promo
      const discountCode = generateDiscountCode(targetUser.username, percentage);
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expiresDays);

      // Créer une table discount_codes si elle n'existe pas (simulation)
      // En réalité, vous devriez créer cette table dans votre migration Supabase
      const discountData = {
        code: discountCode,
        user_id: user.id,
        percentage: percentage,
        max_uses: maxUses,
        current_uses: 0,
        expires_at: expiresAt.toISOString(),
        reason: reason,
        created_by_discord_id: interaction.user.id,
        status: 'active'
      };

      // Pour l'instant, on stocke dans les metadata du paiement ou dans audit_logs
      // Idéalement, créez une table discount_codes dans votre base
      await db.logAction('discount_code_created', interaction.user.id, 'discount', discountCode, {
        target_user_id: user.id,
        target_discord_id: targetUser.id,
        percentage: percentage,
        max_uses: maxUses,
        expires_at: expiresAt.toISOString(),
        reason: reason,
        discount_data: discountData
      });

      const embed = successEmbed("🎫 **Code promo créé avec succès !**", {
        fields: [
          { name: "👤 Bénéficiaire", value: `${targetUser.tag}\n<@${targetUser.id}>`, inline: true },
          { name: "🎫 Code", value: `\`${discountCode}\``, inline: true },
          { name: "💰 Réduction", value: `**${percentage}%**`, inline: true },
          { name: "🔢 Utilisations", value: `**${maxUses}** max`, inline: true },
          { name: "⏰ Expire le", value: `<t:${Math.floor(expiresAt.getTime() / 1000)}:F>`, inline: true },
          { name: "👨‍💼 Créé par", value: `<@${interaction.user.id}>`, inline: true },
          { name: "📝 Raison", value: reason, inline: false }
        ]
      });

      if (targetUser.displayAvatarURL()) {
        embed.setThumbnail(targetUser.displayAvatarURL({ size: 128 }));
      }

      await interaction.editReply({ embeds: [embed] });

      // Notifier l'utilisateur par DM
      try {
        const dmEmbed = brandEmbed({
          title: "🎉 **Vous avez reçu un code promo !**",
          description: `Notre équipe vous a accordé un code de réduction spécial !`,
          fields: [
            { name: "🎫 Votre code", value: `\`${discountCode}\``, inline: false },
            { name: "💰 Réduction", value: `**${percentage}%** sur vos achats`, inline: true },
            { name: "🔢 Utilisations", value: `**${maxUses}** fois maximum`, inline: true },
            { name: "⏰ Valide jusqu'au", value: `<t:${Math.floor(expiresAt.getTime() / 1000)}:F>`, inline: false },
            { name: "📝 Message", value: reason, inline: false },
            { name: "💡 Comment l'utiliser", value: "Utilisez ce code lors de votre prochain achat pour bénéficier de la réduction !", inline: false }
          ]
        });

        await targetUser.send({ embeds: [dmEmbed] });
      } catch (e) {
        // Ignore les erreurs de DM mais informe l'admin
        await interaction.followUp({
          ephemeral: true,
          embeds: [brandEmbed({
            title: "⚠️ Notification",
            description: "Le code promo a été créé mais l'utilisateur n'a pas pu être notifié par DM. Vous devrez lui communiquer manuellement."
          })]
        });
      }

    } catch (error) {
      console.error("Erreur lors de la création du code promo:", error);
      await interaction.editReply({
        embeds: [errorEmbed("❌ Erreur lors de la création du code promo.")]
      });
    }
  }
};