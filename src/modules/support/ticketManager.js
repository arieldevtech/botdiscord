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
    if (['plugin_dev', 'mc_build', 'complete_server'].includes(categoryKey)) {
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

    // Check if user already has an assigned ticket
    const { data: userActiveTickets, error: activeError } = await this.db.supabase
      .from("assignments")
      .select(`
        *,
        tickets!inner(id, status, channel_id)
      `)
      .eq("assignee_discord_id", interaction.user.id)
      .in("tickets.status", ["open", "claimed", "in_progress", "waiting_payment"]);

    if (activeError) throw activeError;

    if (userActiveTickets && userActiveTickets.length > 0) {
      const activeTicket = userActiveTickets[0];
      return interaction.reply({
        ephemeral: true,
        embeds: [errorEmbed(`❌ You already have an active ticket assigned to you.\n\n**Current ticket:** <#${activeTicket.tickets.channel_id}>\n\nPlease complete or close your current ticket before claiming a new one.`)]
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
        title: "🎯 **Ticket Claimed**",
        description: `${interaction.user} has taken ownership of this ticket and will assist you shortly.`,
        fields: [
          { name: "📋 Status", value: "**Claimed**", inline: true },
          { name: "👤 Assigned to", value: `<@${interaction.user.id}>`, inline: true },
          { name: "⏰ Next Steps", value: "Please wait for the assigned staff member to respond", inline: false }
        ]
      });

      await interaction.reply({ embeds: [embed] });

      // Notifier le client par DM
      try {
        const client = await interaction.client.users.fetch(ticket.users.discord_id);
        const dmEmbed = brandEmbed({
          title: "🎯 **Your Ticket Has Been Claimed**",
          description: `Great news! A member of our support team has taken ownership of your ticket and will assist you shortly.`,
          fields: [
            { name: "🎫 Ticket Channel", value: `<#${interaction.channel.id}>`, inline: true },
            { name: "👤 Assigned Staff", value: interaction.user.username, inline: true },
            { name: "⏰ What's Next", value: "Please wait for your assigned staff member to respond in the ticket channel.", inline: false }
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
      // Récupérer le ticket par ID
      const { data: ticket, error } = await this.db.supabase
        .from("tickets")
        .select(`
          *,
          users!inner(discord_id, discord_tag)
        `)
        .eq("id", ticketId)
        .single();

      if (error || !ticket) return false;

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
        // Créer un transcript avant fermeture
        const transcript = await this.createTicketTranscript(ticket, channel);
        
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

        // Envoyer le transcript dans le canal d'archive
        await this.sendToArchive(ticket, transcript, reason, closedBy);

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
          title: "🔒 **Your Ticket Has Been Closed**",
          description: `Your support ticket has been closed by our team. Thank you for using our support system!`,
          fields: [
            { name: "📝 Reason", value: reason, inline: false },
            { name: "🕐 Closed At", value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
            { name: "💬 Feedback", value: "If you need further assistance, feel free to open a new ticket!", inline: false }
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

  /**
   * Crée un transcript du ticket
   */
  async createTicketTranscript(ticket, channel) {
    try {
      const messages = await channel.messages.fetch({ limit: 100 });
      const sortedMessages = messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
      
      const transcript = {
        ticket_id: ticket.id,
        ticket_type: ticket.ticket_type,
        client: ticket.users.discord_tag,
        created_at: ticket.created_at,
        closed_at: new Date().toISOString(),
        messages: sortedMessages.map(msg => ({
          author: msg.author.tag,
          content: msg.content,
          timestamp: msg.createdAt.toISOString(),
          attachments: msg.attachments.map(att => att.url)
        }))
      };

      // Sauvegarder en base
      await this.db.supabase
        .from("archives")
        .insert({
          ticket_id: ticket.id,
          transcript_data: transcript,
          file_size_bytes: JSON.stringify(transcript).length
        });

      return transcript;
    } catch (error) {
      console.error('Erreur lors de la création du transcript:', error);
      return null;
    }
  }

  /**
   * Envoie le résumé dans le canal d'archive
   */
  async sendToArchive(ticket, transcript, reason, closedBy) {
    try {
      const config = require("../../../config.json");
      const archiveChannelId = config.archiveChannelId;
      
      if (!archiveChannelId) return;
      
      const archiveChannel = await this.client.channels.fetch(archiveChannelId).catch(() => null);
      if (!archiveChannel) return;

      const category = config.ticketCategories[ticket.ticket_type];
      const messageCount = transcript?.messages?.length || 0;
      
      const archiveEmbed = brandEmbed({
        title: `📁 Ticket archivé - ${category?.name || ticket.ticket_type}`,
        fields: [
          { name: "👤 Client", value: `${ticket.users.discord_tag} (<@${ticket.users.discord_id}>)`, inline: true },
          { name: "🎫 Type", value: category?.name || ticket.ticket_type, inline: true },
          { name: "🔒 Fermé par", value: `<@${closedBy}>`, inline: true },
          { name: "📅 Durée", value: `<t:${Math.floor(new Date(ticket.created_at).getTime() / 1000)}:R> → <t:${Math.floor(Date.now() / 1000)}:R>`, inline: false },
          { name: "💬 Messages", value: `${messageCount} messages`, inline: true },
          { name: "📝 Raison", value: reason, inline: false }
        ]
      });

      await archiveChannel.send({ embeds: [archiveEmbed] });
      
    } catch (error) {
      console.error('Erreur lors de l\'archivage:', error);
    }
  }
}

module.exports = { TicketManager };