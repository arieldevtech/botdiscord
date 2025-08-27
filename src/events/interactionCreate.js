const { SlashCommandBuilder, PermissionFlagsBits, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { brandEmbed, errorEmbed, successEmbed } = require("../../lib/embeds");
const { getDatabase } = require("../../services/database");
const config = require("../../../config.json");

function hasAdminRole(member) {
  const adminRoleId = config.roles?.adminRoleId;
  return adminRoleId ? member.roles.cache.has(adminRoleId) : false;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("quote")
    .setDescription("Gérer les devis")
    .addSubcommand(sub =>
      sub.setName("create")
        .setDescription("Créer un devis pour ce ticket")
        .addIntegerOption(opt => opt.setName("montant").setDescription("Montant en euros").setRequired(true))
        .addStringOption(opt => opt.setName("description").setDescription("Description du devis").setRequired(true))
        .addIntegerOption(opt => opt.setName("acompte").setDescription("Acompte en euros (optionnel)").setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName("list")
        .setDescription("Lister les devis de ce ticket")
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  cooldown: 5,
  async execute(interaction) {
    const db = getDatabase();
    const member = interaction.member;
    const supportRoleIds = config.supportRoleIds || [];
    
    // Vérifier si l'utilisateur a un rôle de support OU admin
    const hasSupport = supportRoleIds.some(roleId => member.roles.cache.has(roleId));
    const hasAdmin = hasAdminRole(member) || member.permissions.has(PermissionFlagsBits.ManageGuild);
    
    if (!hasSupport && !hasAdmin) {
      return interaction.reply({
        ephemeral: true,
        embeds: [errorEmbed("❌ You must have a support role to use this command.")]
      });
    }

    if (!db.isEnabled()) {
      return interaction.reply({
        ephemeral: true,
        embeds: [errorEmbed("❌ Database not available.")]
      });
    }

    const subcommand = interaction.options.getSubcommand();

    try {
      // Récupérer le ticket associé à ce canal
      const ticket = await db.getTicketByChannelId(interaction.channel.id);
      if (!ticket) {
        return interaction.reply({
          ephemeral: true,
          embeds: [errorEmbed("❌ This channel is not a valid ticket.")]
        });
      }

      switch (subcommand) {
        case "create": {
          const montant = interaction.options.getInteger("montant");
          const description = interaction.options.getString("description");
          const acompte = interaction.options.getInteger("acompte") || 0;

          if (montant <= 0) {
            return interaction.reply({
              ephemeral: true,
              embeds: [errorEmbed("❌ Amount must be greater than 0.")]
            });
          }

          if (acompte < 0 || acompte >= montant) {
            return interaction.reply({
              ephemeral: true,
              embeds: [errorEmbed("❌ Deposit must be between 0 and the total amount.")]
            });
          }

          // Create quote in database
          const { data: quote, error } = await db.supabase
            .from("quotes")
            .insert({
              ticket_id: ticket.id,
              amount_cents: montant * 100,
              currency: 'EUR',
              description: description,
              deposit_cents: acompte * 100,
              status: 'pending'
            })
            .select()
            .single();

          if (error) throw error;

          // Create action buttons
          const row = new ActionRowBuilder()
            .addComponents(
              new ButtonBuilder()
                .setCustomId(`ticket:accept_quote:${quote.id}`)
                .setLabel("Accept Quote")
                .setStyle(ButtonStyle.Success)
                .setEmoji("✅"),
              new ButtonBuilder()
                .setCustomId(`ticket:reject_quote:${quote.id}`)
                .setLabel("Reject Quote")
                .setStyle(ButtonStyle.Danger)
                .setEmoji("❌")
            );

          const embed = brandEmbed({
            title: "💰 New Quote",
            description: `A quote has been created for this ticket.`,
            fields: [
              { name: "💰 Amount", value: `**€${montant}**`, inline: true },
              { name: "💳 Deposit", value: acompte > 0 ? `**€${acompte}**` : "None", inline: true },
              { name: "📝 Description", value: description, inline: false },
              { name: "⏰ Expires", value: `<t:${Math.floor((Date.now() + 7 * 24 * 60 * 60 * 1000) / 1000)}:F>`, inline: true }
            ]
          });

          await interaction.reply({ embeds: [embed], components: [row] });

          // Notify client via DM
          try {
            const client = await interaction.client.users.fetch(ticket.users.discord_id);
            const dmEmbed = brandEmbed({
              title: "💰 New Quote Received",
              description: `You have received a quote for your ticket.`,
              fields: [
                { name: "Description", value: description, inline: false }
              ]
            });
            await client.send({ embeds: [dmEmbed] });
          } catch (e) {
            // Ignore les erreurs de DM
          }

          // Log de l'action
          await db.logAction('quote_created', interaction.user.id, 'quote', quote.id, {
            ticketId: ticket.id,
            amount: montant,
            description: description
          });

          break;
        }

        case "list": {
          const { data: quotes, error } = await db.supabase
            .from("quotes")
            .select("*")
            .eq("ticket_id", ticket.id)
            .order("created_at", { ascending: false });

          if (error) throw error;

          if (!quotes || quotes.length === 0) {
            return interaction.reply({
              ephemeral: true,
              embeds: [errorEmbed("❌ Aucun devis trouvé pour ce ticket.")]
            });
          }

          const fields = quotes.map(q => ({
            name: `💰 €${(q.amount_cents / 100).toFixed(2)} - ${q.status.toUpperCase()}`,
            value: [
              `**Description:** ${q.description}`,
              `**Créé:** <t:${Math.floor(new Date(q.created_at).getTime() / 1000)}:R>`,
              q.accepted_at ? `**Accepté:** <t:${Math.floor(new Date(q.accepted_at).getTime() / 1000)}:R>` : null,
              `**Expire:** <t:${Math.floor(new Date(q.expires_at).getTime() / 1000)}:R>`
            ].filter(Boolean).join("\n"),
            inline: false
          }));

          const embed = brandEmbed({
            title: `💰 Devis du ticket (${quotes.length})`,
            fields: fields.slice(0, 5)
          });

          await interaction.reply({ ephemeral: true, embeds: [embed] });
          break;
        }
      }
    } catch (error) {
      console.error('Erreur lors de la gestion du devis:', error);
      await interaction.reply({
        ephemeral: true,
        embeds: [errorEmbed("❌ Une erreur est survenue lors de la gestion du devis.")]
      });
    }
  }
};