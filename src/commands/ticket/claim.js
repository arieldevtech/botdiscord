const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { brandEmbed, errorEmbed, successEmbed } = require("../../lib/embeds");
const { getDatabase } = require("../../services/database");
const config = require("../../../config.json");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("claim")
    .setDescription("Prendre en charge ce ticket")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  cooldown: 5,
  async execute(interaction) {
    const db = getDatabase();
    const member = interaction.member;
    const supportRoleIds = config.supportRoleIds || [];
    
    // Vérifier si l'utilisateur a un rôle de support
    const hasSupport = supportRoleIds.some(roleId => member.roles.cache.has(roleId));
    if (!hasSupport) {
      return interaction.reply({
        ephemeral: true,
        embeds: [errorEmbed("❌ You must have a support role to use this command.")]
      });
    }

    try {
      // Récupérer le ticket associé à ce canal
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

      // Vérifier si le ticket est déjà assigné
      const existingAssignment = await db.getTicketAssignment(ticket.id);
      if (existingAssignment) {
        return interaction.reply({
          ephemeral: true,
          embeds: [errorEmbed("❌ This ticket is already being handled by another support member.")]
        });
      }

      // Assigner le ticket
      await db.assignTicket(ticket.id, interaction.user.id, 'support');
      
      // Log de l'action
      await db.logAction('ticket_claimed', interaction.user.id, 'ticket', ticket.id, {
        channelId: interaction.channel.id
      });

      // Embed de confirmation
      const embed = brandEmbed({
        title: "🎯 Ticket Claimed",
        description: `${interaction.user} has claimed this ticket.`,
        fields: [
          { name: "📋 Status", value: "**Claimed**", inline: true },
          { name: "👤 Assigned to", value: `<@${interaction.user.id}>`, inline: true },
          { name: "🎫 Type", value: ticket.ticket_type, inline: true }
        ]
      });

      await interaction.reply({ embeds: [embed] });

      // Notifier le client par DM
      try {
        const client = await interaction.client.users.fetch(ticket.users.discord_id);
        const dmEmbed = brandEmbed({
          title: "🎯 Your Ticket Has Been Claimed",
          description: `A member of our support team is now handling your request.`,
          fields: [
            { name: "🎫 Ticket", value: `<#${interaction.channel.id}>`, inline: true },
            { name: "👤 Assigned to", value: interaction.user.username, inline: true }
          ]
        });
        await client.send({ embeds: [dmEmbed] });
      } catch (e) {
        // Ignore les erreurs de DM
      }

    } catch (error) {
      console.error('Error during claim:', error);
      await interaction.reply({
        ephemeral: true,
        embeds: [errorEmbed("❌ An error occurred while claiming the ticket.")]
      });
    }
  }
};