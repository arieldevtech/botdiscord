const { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { brandEmbed, errorEmbed } = require("../../lib/embeds");
const { getDatabase } = require("../../services/database");
const config = require("../../../config.json");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("close")
    .setDescription("Close this ticket")
    .addStringOption(option =>
      option.setName("reason")
        .setDescription("Reason for closing")
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  cooldown: 10,
  async execute(interaction) {
    const db = getDatabase();
    const member = interaction.member;
    const reason = interaction.options.getString("reason") || "No reason specified";
    const supportRoleIds = config.supportRoleIds || [];
    
    // Check if user has support role OR is ticket creator
    const hasSupport = supportRoleIds.some(roleId => member.roles.cache.has(roleId));
    
    try {
      // Get ticket associated with this channel
      const ticket = await db.getTicketByChannelId(interaction.channel.id);
      if (!ticket) {
        return interaction.reply({
          ephemeral: true,
          embeds: [errorEmbed("❌ This channel is not a valid ticket.")]
        });
      }

      if (ticket.status === 'closed') {
        return interaction.reply({
          ephemeral: true,
          embeds: [errorEmbed("❌ This ticket is already closed.")]
        });
      }

      // Check permissions (support OR ticket creator)
      const isTicketOwner = ticket.users.discord_id === interaction.user.id;
      
      // Check if user is assigned to this ticket (for support members)
      let isAssigned = false;
      if (hasSupport) {
        const assignment = await db.getTicketAssignment(ticket.id);
        isAssigned = assignment && assignment.assignee_discord_id === interaction.user.id;
      }
      
      if (!isTicketOwner && !isAssigned) {
        return interaction.reply({
          ephemeral: true,
          embeds: [errorEmbed("❌ You can only close tickets that are assigned to you or that you created.")]
        });
      }

      // Confirmation embed
      const confirmEmbed = brandEmbed({
        title: "⚠️ Close Confirmation",
        description: `Are you sure you want to close this ticket?\n\n**Reason:** ${reason}`,
        fields: [
          { name: "🎫 Ticket", value: `<#${interaction.channel.id}>`, inline: true },
          { name: "📋 Type", value: ticket.ticket_type, inline: true },
          { name: "📅 Created", value: `<t:${Math.floor(new Date(ticket.created_at).getTime() / 1000)}:R>`, inline: true }
        ]
      });

      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`ticket:confirm_close:${ticket.id}:${interaction.user.id}`)
            .setLabel("Confirm Close")
            .setStyle(ButtonStyle.Danger)
            .setEmoji("🔒"),
          new ButtonBuilder()
            .setCustomId("ticket:cancel_close")
            .setLabel("Cancel")
            .setStyle(ButtonStyle.Secondary)
            .setEmoji("❌")
        );

      await interaction.reply({ embeds: [confirmEmbed], components: [row] });

    } catch (error) {
      console.error('Error during close:', error);
      await interaction.reply({
        ephemeral: true,
        embeds: [errorEmbed("❌ An error occurred while closing the ticket.")]
      });
    }
  }
};