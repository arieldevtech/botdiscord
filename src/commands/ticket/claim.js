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
        embeds: [errorEmbed("❌ Vous devez avoir un rôle de support pour utiliser cette commande.")]
      });
    }

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

      // Vérifier si le ticket est déjà assigné
      const existingAssignment = await db.getTicketAssignment(ticket.id);
      if (existingAssignment) {
        return interaction.reply({
          ephemeral: true,
          embeds: [errorEmbed("❌ Ce ticket est déjà pris en charge par un autre membre du support.")]
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
        title: "🎯 Ticket pris en charge",
        description: `${interaction.user} a pris en charge ce ticket.`,
        fields: [
          { name: "Status", value: "**Claimed**", inline: true },
          { name: "Assigné à", value: `<@${interaction.user.id}>`, inline: true },
          { name: "Type", value: ticket.ticket_type, inline: true }
        ]
      });

      await interaction.reply({ embeds: [embed] });

      // Notifier le client par DM
      try {
        const client = await interaction.client.users.fetch(ticket.users.discord_id);
        const dmEmbed = brandEmbed({
          title: "🎯 Votre ticket a été pris en charge",
          description: `Un membre de notre équipe support s'occupe maintenant de votre demande.`,
          fields: [
            { name: "Ticket", value: `<#${interaction.channel.id}>`, inline: true },
            { name: "Assigné à", value: interaction.user.username, inline: true }
          ]
        });
        await client.send({ embeds: [dmEmbed] });
      } catch (e) {
        // Ignore les erreurs de DM
      }

    } catch (error) {
      console.error('Erreur lors du claim:', error);
      await interaction.reply({
        ephemeral: true,
        embeds: [errorEmbed("❌ Une erreur est survenue lors de la prise en charge du ticket.")]
      });
    }
  }
};