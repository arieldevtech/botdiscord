const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { brandEmbed, errorEmbed } = require("../../lib/embeds");
const { getDatabase } = require("../../services/database");
const config = require("../../../config.json");

function hasAdminRole(member) {
  const adminRoleId = config.roles?.adminRoleId;
  return adminRoleId ? member.roles.cache.has(adminRoleId) : false;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("user-info")
    .setDescription("Profil détaillé d'un utilisateur avec historique complet")
    .addUserOption(opt => opt.setName("user").setDescription("Utilisateur à analyser").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  cooldown: 5,
  async execute(interaction) {
    const db = getDatabase();
    const member = interaction.member;
    const targetUser = interaction.options.getUser("user");
    
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
      // Récupérer l'utilisateur en base
      let user = await db.getUserByDiscordId(targetUser.id);
      if (!user) {
        return interaction.editReply({
          embeds: [errorEmbed("❌ Utilisateur non trouvé dans la base de données.")]
        });
      }

      // Récupérer les statistiques complètes
      const [ticketsResult, ordersResult, paymentsResult, refundsResult] = await Promise.all([
        db.supabase.from("tickets").select("status, ticket_type, created_at").eq("user_id", user.id),
        db.supabase.from("orders").select("sku, product_name, price_cents, status, created_at").eq("user_id", user.id),
        db.supabase.from("payments").select("amount_cents, status, created_at").eq("user_id", user.id),
        db.supabase.from("refunds").select("amount_cents, status, reason, created_at").eq("user_id", user.id)
      ]);

      const tickets = ticketsResult.data || [];
      const orders = ordersResult.data || [];
      const payments = paymentsResult.data || [];
      const refunds = refundsResult.data || [];

      // Calculer les statistiques
      const totalTickets = tickets.length;
      const openTickets = tickets.filter(t => ['open', 'claimed', 'in_progress'].includes(t.status)).length;
      const closedTickets = tickets.filter(t => t.status === 'closed').length;
      
      const totalOrders = orders.length;
      const deliveredOrders = orders.filter(o => o.status === 'delivered').length;
      
      const totalPayments = payments.length;
      const successfulPayments = payments.filter(p => p.status === 'paid').length;
      const totalRevenue = payments.filter(p => p.status === 'paid').reduce((sum, p) => sum + (p.amount_cents || 0), 0);
      
      const totalRefunds = refunds.length;
      const processedRefunds = refunds.filter(r => r.status === 'processed').length;
      const refundedAmount = refunds.filter(r => r.status === 'processed').reduce((sum, r) => sum + (r.amount_cents || 0), 0);

      // Niveau VIP
      const vipLevels = {
        0: "🥉 Bronze",
        1: "🥈 Silver (€100+)",
        2: "🥇 Gold (€200+)",
        3: "💎 Diamond (€500+)"
      };

      // Récupérer les infos Discord
      const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
      const joinedAt = member ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:F>` : "Non membre";
      const accountCreated = `<t:${Math.floor(targetUser.createdTimestamp / 1000)}:F>`;

      // Dernières activités
      const recentTickets = tickets.slice(-3).map(t => 
        `• **${t.ticket_type}** (${t.status}) - <t:${Math.floor(new Date(t.created_at).getTime() / 1000)}:R>`
      ).join("\n") || "Aucun ticket";

      const recentOrders = orders.slice(-3).map(o => 
        `• **${o.product_name}** - €${(o.price_cents / 100).toFixed(2)} (${o.status})`
      ).join("\n") || "Aucune commande";

      const embed = brandEmbed({
        title: `👤 Profil détaillé - ${targetUser.username}`,
        fields: [
          { name: "📊 **Informations générales**", value: `**Discord ID:** \`${targetUser.id}\`\n**Compte créé:** ${accountCreated}\n**Rejoint le serveur:** ${joinedAt}\n**Statut VIP:** ${vipLevels[user.vip_level] || vipLevels[0]}`, inline: false },
          
          { name: "💰 **Statistiques financières**", value: `**Total dépensé:** €${(user.total_spent_cents / 100).toFixed(2)}\n**Paiements réussis:** ${successfulPayments}/${totalPayments}\n**Revenus générés:** €${(totalRevenue / 100).toFixed(2)}\n**Remboursements:** ${processedRefunds} (€${(refundedAmount / 100).toFixed(2)})`, inline: true },
          
          { name: "🎫 **Activité tickets**", value: `**Total:** ${totalTickets}\n**Ouverts:** ${openTickets}\n**Fermés:** ${closedTickets}\n**Taux de résolution:** ${totalTickets > 0 ? Math.round((closedTickets / totalTickets) * 100) : 0}%`, inline: true },
          
          { name: "📦 **Commandes**", value: `**Total:** ${totalOrders}\n**Livrées:** ${deliveredOrders}\n**Taux de livraison:** ${totalOrders > 0 ? Math.round((deliveredOrders / totalOrders) * 100) : 0}%`, inline: true },
          
          { name: "🎫 **Tickets récents**", value: recentTickets, inline: false },
          { name: "🛒 **Commandes récentes**", value: recentOrders, inline: false },
          
          { name: "📅 **Activité**", value: `**Première activité:** <t:${Math.floor(new Date(user.created_at).getTime() / 1000)}:F>\n**Dernière mise à jour:** <t:${Math.floor(new Date(user.updated_at).getTime() / 1000)}:R>`, inline: false }
        ]
      });

      if (targetUser.displayAvatarURL()) {
        embed.setThumbnail(targetUser.displayAvatarURL({ size: 256 }));
      }

      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      console.error("Erreur lors de la récupération du profil utilisateur:", error);
      await interaction.editReply({
        embeds: [errorEmbed("❌ Erreur lors de la récupération du profil utilisateur.")]
      });
    }
  }
};