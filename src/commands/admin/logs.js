const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require("discord.js");
const { brandEmbed, errorEmbed } = require("../../lib/embeds");
const { getDatabase } = require("../../services/database");
const config = require("../../../config.json");

function hasAdminRole(member) {
  const adminRoleId = config.roles?.adminRoleId;
  return adminRoleId ? member.roles.cache.has(adminRoleId) : false;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("logs")
    .setDescription("Consulter les logs et historiques")
    .addSubcommand(sub =>
      sub.setName("quotes")
        .setDescription("Historique des devis")
        .addStringOption(opt => opt.setName("status").setDescription("Filtrer par statut").addChoices(
          { name: "En attente", value: "pending" },
          { name: "Accepté", value: "accepted" },
          { name: "Refusé", value: "rejected" },
          { name: "Expiré", value: "expired" }
        ).setRequired(false))
        .addUserOption(opt => opt.setName("client").setDescription("Filtrer par client").setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName("payments")
        .setDescription("Historique des paiements")
        .addStringOption(opt => opt.setName("status").setDescription("Filtrer par statut").addChoices(
          { name: "Payé", value: "paid" },
          { name: "En attente", value: "pending" },
          { name: "Échoué", value: "failed" },
          { name: "Remboursé", value: "refunded" }
        ).setRequired(false))
        .addUserOption(opt => opt.setName("client").setDescription("Filtrer par client").setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName("tickets")
        .setDescription("Historique des tickets")
        .addStringOption(opt => opt.setName("status").setDescription("Filtrer par statut").addChoices(
          { name: "Ouvert", value: "open" },
          { name: "Pris en charge", value: "claimed" },
          { name: "En cours", value: "in_progress" },
          { name: "En attente paiement", value: "waiting_payment" },
          { name: "Terminé", value: "completed" },
          { name: "Fermé", value: "closed" }
        ).setRequired(false))
        .addUserOption(opt => opt.setName("client").setDescription("Filtrer par client").setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName("audit")
        .setDescription("Logs d'audit système")
        .addStringOption(opt => opt.setName("action").setDescription("Type d'action").setRequired(false))
        .addUserOption(opt => opt.setName("actor").setDescription("Utilisateur ayant effectué l'action").setRequired(false))
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  cooldown: 10,
  async execute(interaction) {
    const db = getDatabase();
    const member = interaction.member;
    
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
      const subcommand = interaction.options.getSubcommand();
      const statusFilter = interaction.options.getString("status");
      const clientFilter = interaction.options.getUser("client");
      const actionFilter = interaction.options.getString("action");
      const actorFilter = interaction.options.getUser("actor");

      switch (subcommand) {
        case "quotes": {
          let query = db.supabase
            .from("quotes")
            .select(`
              *,
              tickets!inner(
                ticket_type,
                users!inner(discord_id, discord_tag)
              )
            `)
            .order("created_at", { ascending: false })
            .limit(10);

          if (statusFilter) query = query.eq("status", statusFilter);
          if (clientFilter) {
            const user = await db.getUserByDiscordId(clientFilter.id);
            if (user) query = query.eq("tickets.user_id", user.id);
          }

          const { data: quotes, error } = await query;
          if (error) throw error;

          const fields = quotes?.map(q => ({
            name: `💰 Devis ${q.amount_cents / 100}€ - ${q.status.toUpperCase()}`,
            value: [
              `**Client:** ${q.tickets.users.discord_tag}`,
              `**Type:** ${q.tickets.ticket_type}`,
              `**Description:** ${q.description.slice(0, 100)}${q.description.length > 100 ? '...' : ''}`,
              `**Créé:** <t:${Math.floor(new Date(q.created_at).getTime() / 1000)}:R>`,
              q.accepted_at ? `**Accepté:** <t:${Math.floor(new Date(q.accepted_at).getTime() / 1000)}:R>` : null
            ].filter(Boolean).join("\n"),
            inline: false
          })) || [];

          const embed = brandEmbed({
            title: `📋 Historique des devis (${quotes?.length || 0})`,
            description: statusFilter ? `Filtre: **${statusFilter}**` : "Tous les devis récents",
            fields: fields.slice(0, 5)
          });

          if (quotes?.length > 5) {
            embed.setFooter({ text: `... et ${quotes.length - 5} autres devis` });
          }

          await interaction.editReply({ embeds: [embed] });
          break;
        }

        case "payments": {
          let query = db.supabase
            .from("payments")
            .select(`
              *,
              users!inner(discord_id, discord_tag)
            `)
            .order("created_at", { ascending: false })
            .limit(10);

          if (statusFilter) query = query.eq("status", statusFilter);
          if (clientFilter) {
            const user = await db.getUserByDiscordId(clientFilter.id);
            if (user) query = query.eq("user_id", user.id);
          }

          const { data: payments, error } = await query;
          if (error) throw error;

          const fields = payments?.map(p => ({
            name: `💳 ${(p.amount_cents / 100).toFixed(2)} ${p.currency} - ${p.status.toUpperCase()}`,
            value: [
              `**Client:** ${p.users.discord_tag}`,
              `**SKU:** ${p.sku || 'Devis personnalisé'}`,
              `**Session Stripe:** \`${p.stripe_session_id || 'N/A'}\``,
              `**Créé:** <t:${Math.floor(new Date(p.created_at).getTime() / 1000)}:R>`,
              p.paid_at ? `**Payé:** <t:${Math.floor(new Date(p.paid_at).getTime() / 1000)}:R>` : null
            ].filter(Boolean).join("\n"),
            inline: false
          })) || [];

          const embed = brandEmbed({
            title: `💳 Historique des paiements (${payments?.length || 0})`,
            description: statusFilter ? `Filtre: **${statusFilter}**` : "Tous les paiements récents",
            fields: fields.slice(0, 5)
          });

          if (payments?.length > 5) {
            embed.setFooter({ text: `... et ${payments.length - 5} autres paiements` });
          }

          await interaction.editReply({ embeds: [embed] });
          break;
        }

        case "tickets": {
          let query = db.supabase
            .from("tickets")
            .select(`
              *,
              users!inner(discord_id, discord_tag)
            `)
            .order("created_at", { ascending: false })
            .limit(10);

          if (statusFilter) query = query.eq("status", statusFilter);
          if (clientFilter) {
            const user = await db.getUserByDiscordId(clientFilter.id);
            if (user) query = query.eq("user_id", user.id);
          }

          const { data: tickets, error } = await query;
          if (error) throw error;

          const fields = tickets?.map(t => ({
            name: `🎫 ${t.ticket_type.toUpperCase()} - ${t.status.toUpperCase()}`,
            value: [
              `**Client:** ${t.users.discord_tag}`,
              `**Canal:** <#${t.channel_id}>`,
              `**Titre:** ${t.title || 'Sans titre'}`,
              `**Créé:** <t:${Math.floor(new Date(t.created_at).getTime() / 1000)}:R>`,
              t.closed_at ? `**Fermé:** <t:${Math.floor(new Date(t.closed_at).getTime() / 1000)}:R>` : null
            ].filter(Boolean).join("\n"),
            inline: false
          })) || [];

          const embed = brandEmbed({
            title: `🎫 Historique des tickets (${tickets?.length || 0})`,
            description: statusFilter ? `Filtre: **${statusFilter}**` : "Tous les tickets récents",
            fields: fields.slice(0, 5)
          });

          if (tickets?.length > 5) {
            embed.setFooter({ text: `... et ${tickets.length - 5} autres tickets` });
          }

          await interaction.editReply({ embeds: [embed] });
          break;
        }

        case "audit": {
          let query = db.supabase
            .from("audit_logs")
            .select("*")
            .order("created_at", { ascending: false })
            .limit(15);

          if (actionFilter) query = query.ilike("action", `%${actionFilter}%`);
          if (actorFilter) query = query.eq("actor_discord_id", actorFilter.id);

          const { data: logs, error } = await query;
          if (error) throw error;

          const fields = logs?.map(log => ({
            name: `🔍 ${log.action.toUpperCase()}`,
            value: [
              `**Acteur:** <@${log.actor_discord_id}>`,
              `**Cible:** ${log.target_type} (${log.target_id})`,
              `**Date:** <t:${Math.floor(new Date(log.created_at).getTime() / 1000)}:F>`,
              log.ip_address ? `**IP:** ${log.ip_address}` : null
            ].filter(Boolean).join("\n"),
            inline: true
          })) || [];

          const embed = brandEmbed({
            title: `🔍 Logs d'audit (${logs?.length || 0})`,
            description: actionFilter || actorFilter ? "Résultats filtrés" : "Actions récentes",
            fields: fields.slice(0, 6)
          });

          if (logs?.length > 6) {
            embed.setFooter({ text: `... et ${logs.length - 6} autres actions` });
          }

          await interaction.editReply({ embeds: [embed] });
          break;
        }
      }
    } catch (error) {
      console.error("Erreur lors de la récupération des logs:", error);
      await interaction.editReply({
        embeds: [errorEmbed("❌ Erreur lors de la récupération des logs.")]
      });
    }
  }
};