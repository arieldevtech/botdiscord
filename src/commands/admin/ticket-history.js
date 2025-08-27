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
    .setName("ticket-history")
    .setDescription("Historique complet des tickets d'un utilisateur")
    .addUserOption(opt => opt.setName("user").setDescription("Utilisateur à analyser").setRequired(true))
    .addStringOption(opt => opt.setName("status").setDescription("Filtrer par statut").addChoices(
      { name: "Tous", value: "all" },
      { name: "Ouverts", value: "open" },
      { name: "Pris en charge", value: "claimed" },
      { name: "En cours", value: "in_progress" },
      { name: "En attente paiement", value: "waiting_payment" },
      { name: "Terminés", value: "completed" },
      { name: "Fermés", value: "closed" }
    ).setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  cooldown: 5,
  async execute(interaction) {
    const db = getDatabase();
    const member = interaction.member;
    const targetUser = interaction.options.getUser("user");
    const statusFilter = interaction.options.getString("status") || "all";
    
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

      // Construire la requête
      let query = db.supabase
        .from("tickets")
        .select(`
          *,
          assignments(assignee_discord_id, role_type, created_at),
          quotes(amount_cents, status, description, created_at),
          payments(amount_cents, status, stripe_session_id)
        `)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      const { data: tickets, error } = await query;
      if (error) throw error;

      if (!tickets || tickets.length === 0) {
        return interaction.editReply({
          embeds: [errorEmbed(`❌ Aucun ticket trouvé${statusFilter !== "all" ? ` avec le statut "${statusFilter}"` : ""}.`)]
        });
      }

      // Statistiques rapides
      const totalTickets = tickets.length;
      const statusCounts = {};
      tickets.forEach(t => {
        statusCounts[t.status] = (statusCounts[t.status] || 0) + 1;
      });

      const statusSummary = Object.entries(statusCounts)
        .map(([status, count]) => `**${status}**: ${count}`)
        .join(" • ");

      // Créer les champs pour chaque ticket
      const fields = tickets.slice(0, 10).map(ticket => {
        const category = config.ticketCategories[ticket.ticket_type];
        const categoryName = category?.name || ticket.ticket_type;
        
        const assignment = ticket.assignments?.[0];
        const quote = ticket.quotes?.[0];
        const payment = ticket.payments?.[0];
        
        let details = [];
        details.push(`**Type:** ${categoryName}`);
        details.push(`**Statut:** ${ticket.status.toUpperCase()}`);
        details.push(`**Créé:** <t:${Math.floor(new Date(ticket.created_at).getTime() / 1000)}:R>`);
        
        if (ticket.closed_at) {
          details.push(`**Fermé:** <t:${Math.floor(new Date(ticket.closed_at).getTime() / 1000)}:R>`);
        }
        
        if (assignment) {
          details.push(`**Assigné à:** <@${assignment.assignee_discord_id}>`);
        }
        
        if (quote) {
          details.push(`**Devis:** €${(quote.amount_cents / 100).toFixed(2)} (${quote.status})`);
        }
        
        if (payment) {
          details.push(`**Paiement:** €${(payment.amount_cents / 100).toFixed(2)} (${payment.status})`);
        }

        return {
          name: `🎫 Ticket #${ticket.id.slice(-8)} - ${categoryName}`,
          value: details.join("\n"),
          inline: false
        };
      });

      const embed = brandEmbed({
        title: `🎫 Historique des tickets - ${targetUser.username}`,
        description: `**Total:** ${totalTickets} ticket(s)${statusFilter !== "all" ? ` (filtrés par "${statusFilter}")` : ""}\n\n**Répartition:** ${statusSummary}`,
        fields: fields
      });

      if (tickets.length > 10) {
        embed.setFooter({ text: `... et ${tickets.length - 10} autres tickets. Utilisez les filtres pour affiner la recherche.` });
      }

      if (targetUser.displayAvatarURL()) {
        embed.setThumbnail(targetUser.displayAvatarURL({ size: 128 }));
      }

      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      console.error("Erreur lors de la récupération de l'historique des tickets:", error);
      await interaction.editReply({
        embeds: [errorEmbed("❌ Erreur lors de la récupération de l'historique des tickets.")]
      });
    }
  }
};