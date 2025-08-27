const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { brandEmbed, errorEmbed } = require("../../lib/embeds");
const { getDatabase } = require("../../services/database");
const config = require("../../../config.json");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("assign")
    .setDescription("Assign this ticket to a support member")
    .addUserOption(option =>
      option.setName("member")
        .setDescription("Support member to assign")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  cooldown: 5,
  async execute(interaction) {
    const db = getDatabase();
    const member = interaction.member;
    const targetUser = interaction.options.getUser("member");
    const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
    const supportRoleIds = config.supportRoleIds || [];
    
    // Check if user has support role
    const hasSupport = supportRoleIds.some(roleId => member.roles.cache.has(roleId));
    if (!hasSupport) {
      return interaction.reply({
        ephemeral: true,
        embeds: [errorEmbed("❌ You must have a support role to use this command.")]
      });
    }

    // Check if target member has support role
    if (!targetMember || !supportRoleIds.some(roleId => targetMember.roles.cache.has(roleId))) {
      return interaction.reply({
        ephemeral: true,
        embeds: [errorEmbed("❌ The selected member must have a support role.")]
      });
    }

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

      // Assign ticket (automatically removes old assignment)
      await db.assignTicket(ticket.id, targetUser.id, 'support');
      
      // Log action
      await db.logAction('ticket_assigned', interaction.user.id, 'ticket', ticket.id, {
        channelId: interaction.channel.id,
        assignedTo: targetUser.id
      });

      // Confirmation embed
      const embed = brandEmbed({
        title: "🔄 Ticket Reassigned",
        description: `This ticket has been assigned to ${targetUser}.`,
        fields: [
          { name: "Assigned by", value: `<@${interaction.user.id}>`, inline: true },
          { name: "Assigned to", value: `<@${targetUser.id}>`, inline: true },
          { name: "Type", value: ticket.ticket_type, inline: true }
        ]
      });

      await interaction.reply({ embeds: [embed] });

      // Notify client via DM
      try {
        const client = await interaction.client.users.fetch(ticket.users.discord_id);
        const dmEmbed = brandEmbed({
          title: "🔄 Your Ticket Has Been Reassigned",
          description: `Your ticket has been assigned to a new member of our support team.`,
          fields: [
            { name: "Ticket", value: `<#${interaction.channel.id}>`, inline: true },
            { name: "New Assignee", value: targetUser.username, inline: true }
          ]
        });
        await client.send({ embeds: [dmEmbed] });
      } catch (e) {
        // Ignore DM errors
      }

    } catch (error) {
      console.error('Error during assignment:', error);
      await interaction.reply({
        ephemeral: true,
        embeds: [errorEmbed("❌ An error occurred while assigning the ticket.")]
      });
    }
  }
};