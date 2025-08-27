const { brandEmbed } = require("../lib/embeds");
const { getDatabase } = require("./database");
const logger = require("../utils/logger");

class NotificationService {
  constructor(client) {
    this.client = client;
    this.db = getDatabase();
  }

  /**
   * Envoie une notification à un utilisateur
   */
  async sendUserNotification(userId, notification) {
    try {
      const user = await this.client.users.fetch(userId);
      const embed = brandEmbed({
        title: `🔔 ${notification.title}`,
        description: notification.message,
        fields: notification.fields || []
      });

      await user.send({ embeds: [embed] });
      
      // Log la notification
      if (this.db.isEnabled()) {
        await this.db.logAction('notification_sent', 'system', 'user', userId, {
          type: notification.type,
          title: notification.title
        });
      }

      return true;
    } catch (error) {
      logger.error(`Failed to send notification to ${userId}:`, error);
      return false;
    }
  }

  /**
   * Notifications pour les mises à jour de ticket
   */
  async notifyTicketUpdate(ticketId, updateType, details = {}) {
    if (!this.db.isEnabled()) return;

    try {
      const ticket = await this.db.getTicketByChannelId(details.channelId);
      if (!ticket) return;

      const notifications = {
        'status_changed': {
          title: 'Mise à jour de votre ticket',
          message: `Le statut de votre ticket a été mis à jour : **${details.newStatus}**`,
          fields: [
            { name: 'Ticket', value: `<#${details.channelId}>`, inline: true },
            { name: 'Nouveau statut', value: details.newStatus, inline: true }
          ]
        },
        'message_received': {
          title: 'Nouveau message dans votre ticket',
          message: 'Un membre de notre équipe a répondu à votre ticket.',
          fields: [
            { name: 'Ticket', value: `<#${details.channelId}>`, inline: true },
            { name: 'De', value: details.authorName || 'Équipe support', inline: true }
          ]
        },
        'quote_ready': {
          title: 'Devis prêt',
          message: 'Votre devis personnalisé est maintenant disponible dans votre ticket.',
          fields: [
            { name: 'Montant', value: `€${details.amount}`, inline: true },
            { name: 'Ticket', value: `<#${details.channelId}>`, inline: true }
          ]
        }
      };

      const notification = notifications[updateType];
      if (notification) {
        notification.type = updateType;
        await this.sendUserNotification(ticket.users.discord_id, notification);
      }

    } catch (error) {
      logger.error('Error sending ticket notification:', error);
    }
  }

  /**
   * Notifications pour les paiements
   */
  async notifyPaymentUpdate(userId, paymentType, details = {}) {
    const notifications = {
      'payment_received': {
        title: 'Paiement confirmé',
        message: 'Votre paiement a été traité avec succès !',
        fields: [
          { name: 'Montant', value: `€${details.amount}`, inline: true },
          { name: 'Produit', value: details.product || 'Service personnalisé', inline: true }
        ]
      },
      'refund_processed': {
        title: 'Remboursement traité',
        message: 'Votre remboursement a été traité et apparaîtra bientôt sur votre compte.',
        fields: [
          { name: 'Montant', value: `€${details.amount}`, inline: true }
        ]
      },
      'vip_upgraded': {
        title: 'Niveau VIP mis à jour !',
        message: `Félicitations ! Vous avez atteint le niveau **${details.newLevel}**.`,
        fields: [
          { name: 'Nouveau niveau', value: details.newLevel, inline: true },
          { name: 'Avantages', value: details.benefits || 'Support prioritaire et réductions', inline: true }
        ]
      }
    };

    const notification = notifications[paymentType];
    if (notification) {
      notification.type = paymentType;
      await this.sendUserNotification(userId, notification);
    }
  }

  /**
   * Notifications système pour les admins
   */
  async notifyAdmins(notification) {
    const config = require("../../config.json");
    const adminRoleId = config.roles?.adminRoleId;
    
    if (!adminRoleId) return;

    try {
      const guild = this.client.guilds.cache.get(config.guildId);
      if (!guild) return;

      const role = guild.roles.cache.get(adminRoleId);
      if (!role) return;

      const admins = role.members;
      
      for (const [, member] of admins) {
        await this.sendUserNotification(member.user.id, {
          ...notification,
          type: 'admin_notification'
        });
      }

    } catch (error) {
      logger.error('Error sending admin notifications:', error);
    }
  }
}

module.exports = { NotificationService };