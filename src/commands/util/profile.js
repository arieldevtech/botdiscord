const { SlashCommandBuilder } = require("discord.js");
const { brandEmbed, errorEmbed } = require("../../lib/embeds");
const { getDatabase } = require("../../services/database");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("profile")
    .setDescription("Voir votre profil et vos statistiques")
    .addUserOption(opt => opt.setName("utilisateur").setDescription("Voir le profil d'un autre utilisateur").setRequired(false)),
  cooldown: 5,
  async execute(interaction) {
    const db = getDatabase();
    const targetUser = interaction.options.getUser("utilisateur") || interaction.user;
    const isOwnProfile = targetUser.id === interaction.user.id;

    if (!db.isEnabled()) {
      return interaction.reply({
        ephemeral: true,
        embeds: [errorEmbed("❌ Base de données non disponible.")]
      });
    }

    await interaction.deferReply({ ephemeral: isOwnProfile });

    try {
      // Récupérer l'utilisateur en base
      let user = await db.getUserByDiscordId(targetUser.id);
      if (!user) {
        if (isOwnProfile) {
          user = await db.createUser(targetUser.id, targetUser.tag);
        } else {
          return interaction.editReply({
            embeds: [errorEmbed("❌ Utilisateur non trouvé dans la base de données.")]
          });
        }
      }

      // Récupérer les statistiques
      const { data: tickets } = await db.supabase
        .from("tickets")
        .select("status, ticket_type")
        .eq("user_id", user.id);

      const { data: orders } = await db.supabase
        .from("orders")
        .select("sku, product_name, price_cents, created_at")
        .eq("user_id", user.id)
        .eq("status", "delivered")
        .order("created_at", { ascending: false })
        .limit(5);

      // Calculer les statistiques
      const totalTickets = tickets?.length || 0;
      const openTickets = tickets?.filter(t => ['open', 'claimed', 'in_progress'].includes(t.status)).length || 0;
      const totalOrders = orders?.length || 0;
      const totalSpent = user.total_spent_cents || 0;

      // Niveau VIP
      const vipLevels = {
        0: "🥉 Bronze",
        1: "🥈 Silver (100€+)",
        2: "🥇 Gold (200€+)",
        3: "💎 Diamond (500€+)"
      };

      const vipStatus = vipLevels[user.vip_level] || vipLevels[0];

      // Dernières commandes
      const recentOrders = orders?.slice(0, 3).map(o => 
        `• **${o.product_name}** - €${(o.price_cents / 100).toFixed(2)}`
      ).join("\n") || "Aucune commande";

      const embed = brandEmbed({
        title: `👤 Profil de ${targetUser.username}`,
        fields: [
          { name: "🏆 Statut VIP", value: vipStatus, inline: true },
          { name: "💰 Total dépensé", value: `**€${(totalSpent / 100).toFixed(2)}**`, inline: true },
          { name: "📦 Commandes", value: `**${totalOrders}**`, inline: true },
          { name: "🎫 Tickets", value: `**${totalTickets}** (${openTickets} ouverts)`, inline: true },
          { name: "📅 Membre depuis", value: `<t:${Math.floor(new Date(user.created_at).getTime() / 1000)}:R>`, inline: true },
          { name: "🔄 Dernière activité", value: `<t:${Math.floor(new Date(user.updated_at).getTime() / 1000)}:R>`, inline: true }
        ]
      });

      if (isOwnProfile && recentOrders !== "Aucune commande") {
        embed.addFields({ name: "🛒 Dernières commandes", value: recentOrders, inline: false });
      }

      if (targetUser.displayAvatarURL()) {
        embed.setThumbnail(targetUser.displayAvatarURL({ size: 256 }));
      }

      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      console.error("Erreur lors de la récupération du profil:", error);
      await interaction.editReply({
        embeds: [errorEmbed("❌ Erreur lors de la récupération du profil.")]
      });
    }
  }
};