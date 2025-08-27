const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require("discord.js");
const { brandEmbed, errorEmbed } = require("../../lib/embeds");
const { getDatabase } = require("../../services/database");
const config = require("../../../config.json");

/**
 * Gère les interactions liées aux tickets (boutons, modales, etc.)
 */
class TicketManager {
  constructor(client) {
    this.client = client;
    this.db = getDatabase();
  }

  /**
   * Crée les boutons d'action pour un ticket
   */
  createTicketButtons(ticketId, categoryKey) {
    const row1 = new ActionRowBuilder();
    
    // Bouton pour répondre aux questions
    row1.addComponents(
      new ButtonBuilder()
        .setCustomId(`ticket:answer:${ticketId}`)
        .setLabel("Répondre aux questions")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("📝")
    );

    const row2 = new ActionRowBuilder();
    
    // Boutons pour le staff
    row2.addComponents(
      new ButtonBuilder()
        .setCustomId(`ticket:claim:${ticketId}`)
        .setLabel("Prendre en charge")
        .setStyle(ButtonStyle.Success)
        .setEmoji("🎯")
    );

    // Bouton devis pour certaines catégories
    if (['plugin_dev', 'mc_build'].includes(categoryKey)) {
      row2.addComponents(
        new ButtonBuilder()
          .setCustomId(`ticket:quote:${ticketId}`)
          .setLabel("Demander un devis")
          .setStyle(ButtonStyle.Secondary)
          .setEmoji("💰")
      );
    }

    return [row1, row2];
  }

  /**
   * Crée la modale pour répondre aux questions
   */
  createAnswerModal(ticketId, categoryKey) {
    const category = config.ticketCategories[categoryKey];
    const questions = category?.introEmbed?.questions || [];
    
    const modal = new ModalBuilder()
      .setCustomId(`ticket:modal:${ticketId}`)
      .setTitle(`${category?.name || 'Ticket'} - Questions`);

    // Ajouter jusqu'à 5 questions (limite Discord)
    questions.slice(0, 5).forEach((question, index) => {
      const input = new TextInputBuilder()
        .setCustomId(`question_${index}`)
        .setLabel(question.length > 45 ? question.substring(0, 42) + "..." : question)
        .setPlaceholder(`Répondez à: ${question}`)
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(1000);

      const actionRow = new ActionRowBuilder().addComponents(input);
      modal.addComponents(actionRow);
    });

    return modal;
  }

  /**
   * Traite les réponses aux questions
   */
  async handleAnswerSubmission(interaction, ticketId) {
    try {
      const ticket = await this.db.getTicketByChannelId(interaction.channel.id);
      if (!ticket) {
        return interaction.reply({
          ephemeral: true,
          embeds: [errorEmbed("❌ Ticket non trouvé.")]
        });
      }

      // Collecter les réponses
      const responses = {};
      const category = config.ticketCategories[ticket.ticket_type];
      const questions = category?.introEmbed?.questions || [];

      questions.slice(0, 5).forEach((question, index) => {
        const answer = interaction.fields.getTextInputValue(`question_${index}`);
        responses[`question_${index + 1}`] = {
          question: question,
          answer: answer
        };
      });

      // Sauvegarder les réponses en base
      await this.db.updateTicketResponses(ticket.id, responses);

      // Créer l'embed récapitulatif
      const fields = Object.values(responses).map((resp, index) => ({
        name: `Q${index + 1}. ${resp.question}`,
        value: resp.answer,
        inline: false
      }));

      const summaryEmbed = brandEmbed({
        title: "📋 Récapitulatif des réponses",
        description: "Voici les informations fournies par le client :",
        fields: fields
      });

      // Boutons d'action pour le staff
      const actionRow = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`ticket:claim:${ticket.id}`)
            .setLabel("Prendre en charge")
            .setStyle(ButtonStyle.Success)
            .setEmoji("🎯")
        );

      if (['plugin_dev', 'mc_build'].includes(ticket.ticket_type)) {
        actionRow.addComponents(
          new ButtonBuilder()
            .setCustomId(`ticket:quote:${ticket.id}`)
            .setLabel("Créer un devis")
            .setStyle(ButtonStyle.Secondary)
            .setEmoji("💰")
        );
      }

      await interaction.reply({
        embeds: [summaryEmbed],
        components: [actionRow]
      });

      // Log de l'action
      await this.db.logAction('ticket_answered', interaction.user.id, 'ticket', ticket.id, {
        responses: responses
      });

    } catch (error) {
      console.error('Erreur lors du traitement des réponses:', error);
      await interaction.reply({
        ephemeral: true,
        embeds: [errorEmbed("❌ Une erreur est survenue lors du traitement de vos réponses.")]
      });
    }
  }

  /**
   * Gère le claim d'un ticket via bouton
   */
  async handleClaim(interaction, ticketId) {
    const member = interaction.member;
    const supportRoleIds = config.supportRoleIds || [];
    
    // Vérifier si l'utilisateur a un rôle de support
    const hasSupport = supportRoleIds.some(roleId => member.roles.cache.has(roleId));
    if (!hasSupport) {
      return interaction.reply({
        ephemeral: true,
        embeds: [errorEmbed("❌ Vous devez avoir un rôle de support pour prendre en charge ce ticket.")]
      });
    }

    try {
      const ticket = await this.db.getTicketByChannelId(interaction.channel.id);
      if (!ticket || ticket.status === 'closed') {
        return interaction.reply({
          ephemeral: true,
          embeds: [errorEmbed("❌ Ce ticket n'est pas valide ou est fermé.")]
        });
      }

      // Vérifier si déjà assigné
      const existingAssignment = await this.db.getTicketAssignment(ticket.id);
      if (existingAssignment) {
        return interaction.reply({
          ephemeral: true,
          embeds: [errorEmbed("❌ Ce ticket est déjà pris en charge.")]
        });
      }

      // Assigner le ticket
      await this.db.assignTicket(ticket.id, interaction.user.id, 'support');
      
      // Log de l'action
      await this.db.logAction('ticket_claimed', interaction.user.id, 'ticket', ticket.id, {
        channelId: interaction.channel.id
      });

      const embed = brandEmbed({
        title: "🎯 Ticket pris en charge",
        description: `${interaction.user} a pris en charge ce ticket.`,
        fields: [
          { name: "Status", value: "**Claimed**", inline: true },
          { name: "Assigné à", value: `<@${interaction.user.id}>`, inline: true }
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
        embeds: [errorEmbed("❌ Une erreur est survenue lors de la prise en charge.")]
      });
    }
  }

  /**
   * Ferme définitivement un ticket
   */
  async closeTicket(ticketId, closedBy, reason = "Aucune raison spécifiée") {
    try {
      const ticket = await this.db.getTicketByChannelId(interaction.channel.id);
      if (!ticket) return false;

      // Mettre à jour le statut en base
      await this.db.updateTicketStatus(ticket.id, 'closed');

      // Log de l'action
      await this.db.logAction('ticket_closed', closedBy, 'ticket', ticket.id, {
        reason: reason,
        channelId: ticket.channel_id
      });

      // Récupérer le canal et l'archiver
      const channel = await this.client.channels.fetch(ticket.channel_id).catch(() => null);
      if (channel) {
        // Créer un embed de fermeture
        const closeEmbed = brandEmbed({
          title: "🔒 Ticket fermé",
          description: `Ce ticket a été fermé par <@${closedBy}>.`,
          fields: [
            { name: "Raison", value: reason, inline: false },
            { name: "Fermé le", value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
          ]
        });

        await channel.send({ embeds: [closeEmbed] });

        // Supprimer le canal après 10 secondes
        setTimeout(async () => {
          try {
            await channel.delete("Ticket fermé");
          } catch (e) {
            console.error('Erreur lors de la suppression du canal:', e);
          }
        }, 10000);
      }

      // Notifier le client par DM
      try {
        const client = await this.client.users.fetch(ticket.users.discord_id);
        const dmEmbed = brandEmbed({
          title: "🔒 Votre ticket a été fermé",
          description: `Votre ticket a été fermé par notre équipe support.`,
          fields: [
            { name: "Raison", value: reason, inline: false },
            { name: "Fermé le", value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
          ]
        });
        await client.send({ embeds: [dmEmbed] });
      } catch (e) {
        // Ignore les erreurs de DM
      }

      return true;
    } catch (error) {
      console.error('Erreur lors de la fermeture du ticket:', error);
      return false;
    }
  }
}

module.exports = { TicketManager };