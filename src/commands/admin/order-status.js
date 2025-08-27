const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { brandEmbed, errorEmbed } = require("../../lib/embeds");
const { getDatabase } = require("../../services/database");
const config = require("../../../config.json");

function hasAdminRole(member) {
  const adminRoleId = config.roles?.adminRoleId;
  return adminRoleId ? member.roles.cache.has(adminRoleId) : false;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("order-status")
    .setDescription("Vérifier le statut détaillé d'une commande")
    .addStringOption(opt => opt.setName("order_id").setDescription("ID de la commande, paiement ou session Stripe").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  cooldown: 5,
  async execute(interaction) {
    const db = getDatabase();
    const member = interaction.member;
    const orderId = interaction.options.getString("order_id");
    
    // Vérification des permissions admin
    const hasAdmin = hasAdminRole(member) || member.permissions.has(PermissionFlagsBits.ManageGuild);
    if (!hasAdmin) {
      return interaction.reply({
        ephemeral: true,
        embeds: [errorEmbed("❌ Vous devez avoir le rôle administrateur pour utiliser cette commande.")]
      });
    }

    if (!db.isEnabled()) {
      return interaction.reply({
        ephemeral: true,
        embeds: [errorEmbed("❌ Base de données non disponible.")]
      });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      let order = null;
      let payment = null;

      // Rechercher par ID de commande
      const { data: orderById } = await db.supabase
        .from("orders")
        .select(`
          *,
          users!inner(discord_id, discord_tag),
          payments(id, stripe_session_id, amount_cents, status, created_at, paid_at)
        `)
        .eq("id", orderId)
        .single();

      if (orderById) {
        order = orderById;
        payment = orderById.payments;
      } else {
        // Rechercher par ID de paiement
        const { data: paymentById } = await db.supabase
          .from("payments")
          .select(`
            *,
            users!inner(discord_id, discord_tag),
            orders(id, sku, product_name, status, license_key, created_at, delivered_at)
          `)
          .eq("id", orderId)
          .single();

        if (paymentById) {
          payment = paymentById;
          order = paymentById.orders?.[0];
        } else {
          // Rechercher par session Stripe
          const { data: paymentBySession } = await db.supabase
            .from("payments")
            .select(`
              *,
              users!inner(discord_id, discord_tag),
              orders(id, sku, product_name, status, license_key, created_at, delivered_at)
            `)
            .eq("stripe_session_id", orderId)
            .single();

          if (paymentBySession) {
            payment = paymentBySession;
            order = paymentBySession.orders?.[0];
          }
        }
      }

      if (!payment && !order) {
        return interaction.editReply({
          embeds: [errorEmbed("❌ Aucune commande ou paiement trouvé avec cet identifiant.")]
        });
      }

      // Récupérer les informations de remboursement si applicable
      let refundInfo = null;
      if (payment) {
        const { data: refunds } = await db.supabase
          .from("refunds")
          .select("*")
          .eq("payment_id", payment.id)
          .order("created_at", { ascending: false });
        
        refundInfo = refunds?.[0];
      }

      // Construire l'embed de statut
      const user = payment?.users || order?.users;
      const statusEmojis = {
        pending: "⏳",
        paid: "✅",
        failed: "❌",
        refunded: "💸",
        delivered: "📦",
        expired: "⏰"
      };

      const embed = brandEmbed({
        title: "📋 Statut de commande détaillé",
        fields: [
          { 
            name: "👤 **Client**", 
            value: `${user.discord_tag}\n<@${user.discord_id}>`, 
            inline: true 
          },
          { 
            name: "🆔 **Identifiants**", 
            value: [
              order ? `**Commande:** \`${order.id}\`` : null,
              payment ? `**Paiement:** \`${payment.id}\`` : null,
              payment?.stripe_session_id ? `**Session:** \`${payment.stripe_session_id}\`` : null
            ].filter(Boolean).join("\n"), 
            inline: true 
          }
        ]
      });

      // Informations du paiement
      if (payment) {
        embed.addFields({
          name: "💳 **Paiement**",
          value: [
            `**Statut:** ${statusEmojis[payment.status] || "❓"} ${payment.status.toUpperCase()}`,
            `**Montant:** €${(payment.amount_cents / 100).toFixed(2)} ${payment.currency}`,
            `**Créé:** <t:${Math.floor(new Date(payment.created_at).getTime() / 1000)}:F>`,
            payment.paid_at ? `**Payé:** <t:${Math.floor(new Date(payment.paid_at).getTime() / 1000)}:F>` : null
          ].filter(Boolean).join("\n"),
          inline: false
        });
      }

      // Informations de la commande
      if (order) {
        embed.addFields({
          name: "📦 **Commande**",
          value: [
            `**Produit:** ${order.product_name}`,
            `**SKU:** \`${order.sku}\``,
            `**Statut:** ${statusEmojis[order.status] || "❓"} ${order.status.toUpperCase()}`,
            `**Prix:** €${(order.price_cents / 100).toFixed(2)}`,
            order.license_key ? `**Licence:** \`${order.license_key}\`` : null,
            `**Créée:** <t:${Math.floor(new Date(order.created_at).getTime() / 1000)}:F>`,
            order.delivered_at ? `**Livrée:** <t:${Math.floor(new Date(order.delivered_at).getTime() / 1000)}:F>` : null
          ].filter(Boolean).join("\n"),
          inline: false
        });
      }

      // Informations de remboursement
      if (refundInfo) {
        embed.addFields({
          name: "💸 **Remboursement**",
          value: [
            `**Statut:** ${statusEmojis[refundInfo.status] || "❓"} ${refundInfo.status.toUpperCase()}`,
            `**Montant:** €${(refundInfo.amount_cents / 100).toFixed(2)}`,
            `**Raison:** ${refundInfo.reason}`,
            `**Demandé:** <t:${Math.floor(new Date(refundInfo.created_at).getTime() / 1000)}:F>`,
            refundInfo.processed_at ? `**Traité:** <t:${Math.floor(new Date(refundInfo.processed_at).getTime() / 1000)}:F>` : null,
            refundInfo.processed_by_discord_id ? `**Par:** <@${refundInfo.processed_by_discord_id}>` : null
          ].filter(Boolean).join("\n"),
          inline: false
        });
      }

      // Timeline des événements
      const timeline = [];
      if (payment) {
        timeline.push(`<t:${Math.floor(new Date(payment.created_at).getTime() / 1000)}:t> - Paiement créé`);
        if (payment.paid_at) {
          timeline.push(`<t:${Math.floor(new Date(payment.paid_at).getTime() / 1000)}:t> - Paiement confirmé`);
        }
      }
      if (order) {
        timeline.push(`<t:${Math.floor(new Date(order.created_at).getTime() / 1000)}:t> - Commande créée`);
        if (order.delivered_at) {
          timeline.push(`<t:${Math.floor(new Date(order.delivered_at).getTime() / 1000)}:t> - Commande livrée`);
        }
      }
      if (refundInfo) {
        timeline.push(`<t:${Math.floor(new Date(refundInfo.created_at).getTime() / 1000)}:t> - Remboursement demandé`);
        if (refundInfo.processed_at) {
          timeline.push(`<t:${Math.floor(new Date(refundInfo.processed_at).getTime() / 1000)}:t> - Remboursement traité`);
        }
      }

      if (timeline.length > 0) {
        embed.addFields({
          name: "📅 **Timeline**",
          value: timeline.join("\n"),
          inline: false
        });
      }

      if (user.discord_id) {
        const discordUser = await interaction.client.users.fetch(user.discord_id).catch(() => null);
        if (discordUser?.displayAvatarURL()) {
          embed.setThumbnail(discordUser.displayAvatarURL({ size: 128 }));
        }
      }

      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      console.error("Erreur lors de la vérification du statut de commande:", error);
      await interaction.editReply({
        embeds: [errorEmbed("❌ Erreur lors de la vérification du statut de commande.")]
      });
    }
  }
};