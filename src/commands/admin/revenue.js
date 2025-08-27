const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { brandEmbed, errorEmbed } = require("../../lib/embeds");
const { getDatabase } = require("../../services/database");
const config = require("../../../config.json");

function hasAdminRole(member) {
  const adminRoleId = config.roles?.adminRoleId;
  return adminRoleId ? member.roles.cache.has(adminRoleId) : false;
}

function getDateRange(period) {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  switch (period) {
    case "today":
      return {
        start: startOfToday,
        end: new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000),
        label: "Aujourd'hui"
      };
    case "week":
      const startOfWeek = new Date(startOfToday);
      startOfWeek.setDate(startOfToday.getDate() - startOfToday.getDay());
      return {
        start: startOfWeek,
        end: new Date(startOfWeek.getTime() + 7 * 24 * 60 * 60 * 1000),
        label: "Cette semaine"
      };
    case "month":
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      return {
        start: startOfMonth,
        end: endOfMonth,
        label: "Ce mois"
      };
    case "year":
      const startOfYear = new Date(now.getFullYear(), 0, 1);
      const endOfYear = new Date(now.getFullYear() + 1, 0, 1);
      return {
        start: startOfYear,
        end: endOfYear,
        label: "Cette année"
      };
    default:
      return {
        start: new Date(0),
        end: now,
        label: "Tout temps"
      };
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("revenue")
    .setDescription("Rapport détaillé des revenus")
    .addStringOption(opt => opt.setName("period").setDescription("Période d'analyse").addChoices(
      { name: "Aujourd'hui", value: "today" },
      { name: "Cette semaine", value: "week" },
      { name: "Ce mois", value: "month" },
      { name: "Cette année", value: "year" },
      { name: "Tout temps", value: "all" }
    ).setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  cooldown: 10,
  async execute(interaction) {
    const db = getDatabase();
    const member = interaction.member;
    const period = interaction.options.getString("period") || "month";
    
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
      const dateRange = getDateRange(period);
      
      // Requête pour les paiements réussis dans la période
      let paymentsQuery = db.supabase
        .from("payments")
        .select("amount_cents, currency, sku, created_at, paid_at")
        .eq("status", "paid");

      if (period !== "all") {
        paymentsQuery = paymentsQuery
          .gte("paid_at", dateRange.start.toISOString())
          .lt("paid_at", dateRange.end.toISOString());
      }

      const { data: payments, error: paymentsError } = await paymentsQuery;
      if (paymentsError) throw paymentsError;

      // Requête pour les remboursements dans la période
      let refundsQuery = db.supabase
        .from("refunds")
        .select("amount_cents, currency, created_at, processed_at")
        .eq("status", "processed");

      if (period !== "all") {
        refundsQuery = refundsQuery
          .gte("processed_at", dateRange.start.toISOString())
          .lt("processed_at", dateRange.end.toISOString());
      }

      const { data: refunds, error: refundsError } = await refundsQuery;
      if (refundsError) throw refundsError;

      // Calculs des revenus
      const totalRevenue = (payments || []).reduce((sum, p) => sum + (p.amount_cents || 0), 0);
      const totalRefunds = (refunds || []).reduce((sum, r) => sum + (r.amount_cents || 0), 0);
      const netRevenue = totalRevenue - totalRefunds;
      
      const totalTransactions = (payments || []).length;
      const totalRefundCount = (refunds || []).length;
      const averageOrderValue = totalTransactions > 0 ? totalRevenue / totalTransactions : 0;

      // Analyse par produit
      const productStats = {};
      (payments || []).forEach(payment => {
        if (payment.sku) {
          if (!productStats[payment.sku]) {
            productStats[payment.sku] = { count: 0, revenue: 0 };
          }
          productStats[payment.sku].count++;
          productStats[payment.sku].revenue += payment.amount_cents;
        }
      });

      const topProducts = Object.entries(productStats)
        .sort(([,a], [,b]) => b.revenue - a.revenue)
        .slice(0, 5)
        .map(([sku, stats]) => {
          const product = config.products?.find(p => p.sku === sku);
          const name = product?.name || sku;
          return `• **${name}**: ${stats.count} vente(s) - €${(stats.revenue / 100).toFixed(2)}`;
        })
        .join("\n") || "Aucune vente";

      // Analyse temporelle (pour les périodes longues)
      let timeAnalysis = "";
      if (period === "month" || period === "year") {
        const dailyStats = {};
        (payments || []).forEach(payment => {
          const date = new Date(payment.paid_at).toISOString().split('T')[0];
          if (!dailyStats[date]) dailyStats[date] = 0;
          dailyStats[date] += payment.amount_cents;
        });
        
        const days = Object.keys(dailyStats).length;
        const avgDailyRevenue = days > 0 ? totalRevenue / days : 0;
        timeAnalysis = `**Moyenne quotidienne:** €${(avgDailyRevenue / 100).toFixed(2)}\n**Jours avec ventes:** ${days}`;
      }

      const embed = brandEmbed({
        title: `💰 Rapport de revenus - ${dateRange.label}`,
        fields: [
          { 
            name: "📊 **Revenus globaux**", 
            value: `**Revenus bruts:** €${(totalRevenue / 100).toFixed(2)}\n**Remboursements:** €${(totalRefunds / 100).toFixed(2)}\n**Revenus nets:** €${(netRevenue / 100).toFixed(2)}`, 
            inline: true 
          },
          { 
            name: "📈 **Statistiques**", 
            value: `**Transactions:** ${totalTransactions}\n**Remboursements:** ${totalRefundCount}\n**Panier moyen:** €${(averageOrderValue / 100).toFixed(2)}`, 
            inline: true 
          },
          { 
            name: "🎯 **Performance**", 
            value: `**Taux de remboursement:** ${totalTransactions > 0 ? ((totalRefundCount / totalTransactions) * 100).toFixed(1) : 0}%\n**Conversion:** ${totalTransactions > 0 ? "Positive" : "Aucune vente"}`, 
            inline: true 
          }
        ]
      });

      if (topProducts !== "Aucune vente") {
        embed.addFields({ name: "🏆 **Top produits**", value: topProducts, inline: false });
      }

      if (timeAnalysis) {
        embed.addFields({ name: "📅 **Analyse temporelle**", value: timeAnalysis, inline: false });
      }

      // Comparaison avec la période précédente
      if (period !== "all") {
        const prevStart = new Date(dateRange.start.getTime() - (dateRange.end.getTime() - dateRange.start.getTime()));
        const prevEnd = dateRange.start;
        
        const { data: prevPayments } = await db.supabase
          .from("payments")
          .select("amount_cents")
          .eq("status", "paid")
          .gte("paid_at", prevStart.toISOString())
          .lt("paid_at", prevEnd.toISOString());

        const prevRevenue = (prevPayments || []).reduce((sum, p) => sum + (p.amount_cents || 0), 0);
        const growth = prevRevenue > 0 ? ((totalRevenue - prevRevenue) / prevRevenue * 100) : 0;
        const growthIcon = growth > 0 ? "📈" : growth < 0 ? "📉" : "➡️";
        
        embed.addFields({ 
          name: `${growthIcon} **Évolution**`, 
          value: `**Période précédente:** €${(prevRevenue / 100).toFixed(2)}\n**Croissance:** ${growth > 0 ? "+" : ""}${growth.toFixed(1)}%`, 
          inline: false 
        });
      }

      embed.setFooter({ text: `Généré le ${new Date().toLocaleString("fr-FR")}` });

      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      console.error("Erreur lors de la génération du rapport de revenus:", error);
      await interaction.editReply({
        embeds: [errorEmbed("❌ Erreur lors de la génération du rapport de revenus.")]
      });
    }
  }
};