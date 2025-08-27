const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { brandEmbed, errorEmbed } = require("../../lib/embeds");
const { getDatabase } = require("../../services/database");
const config = require("../../../config.json");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("assign")
    .setDescription("Assigner ce ticket à un membre du support")
    .addUserOption(option =>
      option.setName("membre")
        .setDescription("Membre du support à assigner")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  cooldown: 5,
  async execute(interaction) {
    const db = getDatabase();
    const member = interaction.member;
    const targetUser = interaction.options.getUser("membre");
    const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
    const supportRoleIds = config.supportRoleIds || [];
    
    // Vérifier si l'utilisateur a un rôle de support
    const hasSupport = supportRoleIds.some(roleId => member.roles.cache.has(roleId));
    if (!hasSupport) {
      return interaction.reply({
        ephemeral: true,
        embeds: [errorEmbed("❌ Vous devez avoir un rôle de support pour utiliser cette commande.")]
      });
    }

    // Vérifier si le membre cible a un rôle de support
    if (!targetMember || !supportRoleIds.some(roleId => targetMember.roles.cache.has(roleId))) {
      return interaction.reply({
        ephemeral: true,
        embeds: [errorEmbed("❌ Le membre sélectionné doit avoir un rôle de support.")]
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

      // Assigner le ticket (cela supprime l'ancienne assignation automatiquement)
      await db.assignTicket(ticket.id, targetUser.id, 'support');
      
      // Log de l'action
      await db.logAction('ticket_assigned', interaction.user.id, 'ticket', ticket.id, {
        channelId: interaction.channel.id,
        assignedTo: targetUser.id
      });

      // Embed de confirmation
      const embed = brandEmbed({
        title: "🔄 Ticket réassigné",
        description: `Ce ticket a été assigné à ${targetUser}.`,
        fields: [
          { name: "Assigné par", value: `<@${interaction.user.id}>`, inline: true },
          { name: "Assigné à", value: `<@${targetUser.id}>`, inline: true },
          { name: "Type", value: ticket.ticket_type, inline: true }
        ]
      });

      await interaction.reply({ embeds: [embed] });

      // Notifier le client par DM
      try {
        const client = await interaction.client.users.fetch(ticket.users.discord_id);
        const dmEmbed = brandEmbed({
          title: "🔄 Votre ticket a été réassigné",
          description: `Votre ticket a été assigné à un nouveau membre de notre équipe support.`,
          fields: [
            { name: "Ticket", value: `<#${interaction.channel.id}>`, inline: true },
            { name: "Nouveau assigné", value: targetUser.username, inline: true }
          ]
        });
        await client.send({ embeds: [dmEmbed] });
      } catch (e) {
        // Ignore les erreurs de DM
      }

    } catch (error) {
      console.error('Erreur lors de l\'assignation:', error);
      await interaction.reply({
        ephemeral: true,
        embeds: [errorEmbed("❌ Une erreur est survenue lors de l'assignation du ticket.")]
      });
    }
  }
};