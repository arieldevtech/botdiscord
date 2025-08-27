const { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { brandEmbed, errorEmbed } = require("../../lib/embeds");
const { getDatabase } = require("../../services/database");
const config = require("../../../config.json");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("close")
    .setDescription("Fermer ce ticket")
    .addStringOption(option =>
      option.setName("raison")
        .setDescription("Raison de la fermeture")
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  cooldown: 10,
  async execute(interaction) {
    const db = getDatabase();
    const member = interaction.member;
    const reason = interaction.options.getString("raison") || "Aucune raison spécifiée";
    const supportRoleIds = config.supportRoleIds || [];
    
    // Vérifier si l'utilisateur a un rôle de support OU si c'est le créateur du ticket
    const hasSupport = supportRoleIds.some(roleId => member.roles.cache.has(roleId));
    
    try {
      // Récupérer le ticket associé à ce canal
      const ticket = await db.getTicketByChannelId(interaction.channel.id);
      if (!ticket) {
        return interaction.reply({
          ephemeral: true,
          embeds: [errorEmbed("❌ Ce canal n'est pas un ticket valide.")]
        });
      }

      if (ticket.status === 'closed') {
        return interaction.reply({
          ephemeral: true,
          embeds: [errorEmbed("❌ Ce ticket est déjà fermé.")]
        });
      }

      // Vérifier les permissions (support OU créateur du ticket)
      const isTicketOwner = ticket.users.discord_id === interaction.user.id;
      if (!hasSupport && !isTicketOwner) {
        return interaction.reply({
          ephemeral: true,
          embeds: [errorEmbed("❌ You must have a support role or be the ticket creator to close it.")]
        });
      }

      // Embed de confirmation
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