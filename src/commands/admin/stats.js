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
    .setName("stats")
    .setDescription("Statistiques du bot et des ventes")
    .addSubcommand(sub =>
      sub.setName("general")
        .setDescription("Statistiques générales")
    )
    .addSubcommand(sub =>
      sub.setName("sales")
        .setDescription("Statistiques de ventes")
    )
    .addSubcommand(sub =>
      sub.setName("tickets")
        .setDescription("Statistiques des tickets")
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  cooldown: 10,
  async execute(interaction) {
    const db = getDatabase();
    const member = interaction.member;
    const subcommand = interaction.options.getSubcommand();

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
      switch (subcommand) {
        case "general": {
          // Statistiques générales
          const { data: users } = await db.supabase.from("users").select("count").single();
          const { data: tickets } = await db.supabase.from("tickets").select("count").single();
          const { data: payments } = await db.supabase.from("payments").select("count").single();
          
          const { data: totalRevenue } = await db.supabase
            .from("payments")
            .select("amount_cents")
            .eq("status", "paid");
          
          const revenue = totalRevenue?.reduce((sum, p) => sum + (p.amount_cents || 0), 0) || 0;
          
          const embed = brandEmbed({
            title: "📊 Statistiques générales",
            fields: [
              { name: "👥 Utilisateurs", value: `**${users?.count || 0}**`, inline: true },
              { name: "🎫 Tickets", value: `**${tickets?.count || 0}**`, inline: true },
              { name: "💳 Paiements", value: `**${payments?.count || 0}**`, inline: true },
              { name: "💰 Revenus totaux", value: `**€${(revenue / 100).toFixed(2)}**`, inline: true },
              { name: "📦 Produits", value: `**${config.products?.length || 0}**`, inline: true },
              { name: "🏆 Uptime", value: `**${Math.floor(process.uptime() / 3600)}h**`, inline: true }
            ]
          });

          await interaction.editReply({ embeds: [embed] });
          break;
        }

        case "sales": {
          // Statistiques de ventes
          const { data: paidPayments } = await db.supabase
            .from("payments")
            .select("amount_cents, currency, sku, created_at")
            .eq("status", "paid")
            .order("created_at", { ascending: false })
            .limit(10);

          const totalRevenue = paidPayments?.reduce((sum, p) => sum + (p.amount_cents || 0), 0) || 0;
          const avgOrder = paidPayments?.length ? totalRevenue / paidPayments.length : 0;

          // Top produits
          const skuCounts = {};
          paidPayments?.forEach(p => {
            if (p.sku) {
              skuCounts[p.sku] = (skuCounts[p.sku] || 0) + 1;
            }
          });

          const topProducts = Object.entries(skuCounts)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 5)
            .map(([sku, count]) => {
              const product = config.products?.find(p => p.sku === sku);
              return `• **${product?.name || sku}**: ${count} vente(s)`;
            })
            .join("\n") || "Aucune vente";

          const embed = brandEmbed({
            title: "💰 Statistiques de ventes",
            fields: [
              { name: "💳 Ventes totales", value: `**${paidPayments?.length || 0}**`, inline: true },
              { name: "💰 Revenus totaux", value: `**€${(totalRevenue / 100).toFixed(2)}**`, inline: true },
              { name: "📊 Panier moyen", value: `**€${(avgOrder / 100).toFixed(2)}**`, inline: true },
              { name: "🏆 Top produits", value: topProducts, inline: false }
            ]
          });

          await interaction.editReply({ embeds: [embed] });
          break;
        }

        case "tickets": {
          // Statistiques des tickets
          const { data: allTickets } = await db.supabase
            .from("tickets")
            .select("status, ticket_type, created_at");

          const statusCounts = {};
          const typeCounts = {};
          
          allTickets?.forEach(t => {
            statusCounts[t.status] = (statusCounts[t.status] || 0) + 1;
            typeCounts[t.ticket_type] = (typeCounts[t.ticket_type] || 0) + 1;
          });

          const statusText = Object.entries(statusCounts)
            .map(([status, count]) => `• **${status}**: ${count}`)
            .join("\n") || "Aucun ticket";

          const typeText = Object.entries(typeCounts)
            .map(([type, count]) => {
              const category = config.ticketCategories?.[type];
              return `• **${category?.name || type}**: ${count}`;
            })
            .join("\n") || "Aucun ticket";

          const embed = brandEmbed({
            title: "🎫 Statistiques des tickets",
            fields: [
              { name: "📊 Par statut", value: statusText, inline: true },
              { name: "📋 Par type", value: typeText, inline: true },
              { name: "📈 Total", value: `**${allTickets?.length || 0}** tickets`, inline: false }
            ]
          });

          await interaction.editReply({ embeds: [embed] });
          break;
        }
      }
    } catch (error) {
      console.error("Erreur lors de la récupération des stats:", error);
      await interaction.editReply({
        embeds: [errorEmbed("❌ Erreur lors de la récupération des statistiques.")]
      });
    }
  }
};