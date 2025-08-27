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
    .setDescription("Manage quotes for tickets")
    .addSubcommand(sub =>
      sub.setName("create")
        .setDescription("Create a quote for this ticket")
        .addIntegerOption(opt => opt.setName("amount").setDescription("Amount in euros").setRequired(true))
        .addStringOption(opt => opt.setName("description").setDescription("Quote description").setRequired(true))
        .addIntegerOption(opt => opt.setName("deposit").setDescription("Deposit amount in euros (optional)").setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName("list")
        .setDescription("List quotes for this ticket")
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  cooldown: 5,
  async execute(interaction) {
    const db = getDatabase();
    const member = interaction.member;
    const supportRoleIds = config.supportRoleIds || [];
    
    // Check if user has support role OR admin
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
      // Get ticket associated with this channel
      const ticket = await db.getTicketByChannelId(interaction.channel.id);
      if (!ticket) {
        return interaction.reply({
          ephemeral: true,
          embeds: [errorEmbed("❌ This channel is not a valid ticket.")]
        });
      }

      switch (subcommand) {
        case "create": {
          const amount = interaction.options.getInteger("amount");
          const description = interaction.options.getString("description");
          const deposit = interaction.options.getInteger("deposit") || 0;

          if (amount <= 0) {
            return interaction.reply({
              ephemeral: true,
              embeds: [errorEmbed("❌ Amount must be greater than 0.")]
            });
          }

          if (deposit < 0 || deposit >= amount) {
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
              amount_cents: amount * 100,
              currency: 'EUR',
              description: description,
              deposit_cents: deposit * 100,
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
            title: "💰 New Quote Created",
            description: `A quote has been created for this ticket.`,
            fields: [
              { name: "💰 Amount", value: `**€${amount}**`, inline: true },
              { name: "💳 Deposit", value: deposit > 0 ? `**€${deposit}**` : "None", inline: true },
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
                { name: "Ticket", value: `<#${interaction.channel.id}>`, inline: true },
                { name: "Amount", value: `€${amount}`, inline: true },
                { name: "Description", value: description, inline: false }
              ]
            });
            await client.send({ embeds: [dmEmbed] });
          } catch (e) {
            // Ignore DM errors
          }

          // Log action
          await db.logAction('quote_created', interaction.user.id, 'quote', quote.id, {
            ticketId: ticket.id,
            amount: amount,
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
              embeds: [errorEmbed("❌ No quotes found for this ticket.")]
            });
          }

          const fields = quotes.map(q => ({
            name: `💰 €${(q.amount_cents / 100).toFixed(2)} - ${q.status.toUpperCase()}`,
            value: [
              `**Description:** ${q.description}`,
              `**Created:** <t:${Math.floor(new Date(q.created_at).getTime() / 1000)}:R>`,
              q.accepted_at ? `**Accepted:** <t:${Math.floor(new Date(q.accepted_at).getTime() / 1000)}:R>` : null,
              `**Expires:** <t:${Math.floor(new Date(q.expires_at).getTime() / 1000)}:R>`
            ].filter(Boolean).join("\n"),
            inline: false
          }));

          const embed = brandEmbed({
            title: `💰 Ticket Quotes (${quotes.length})`,
            fields: fields.slice(0, 5)
          });

          await interaction.reply({ ephemeral: true, embeds: [embed] });
          break;
        }
      }
    } catch (error) {
      console.error('Error managing quote:', error);
      await interaction.reply({
        ephemeral: true,
        embeds: [errorEmbed("❌ An error occurred while managing the quote.")]
      });
    }
  }
};