const { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { brandEmbed, errorEmbed } = require("../../lib/embeds");
const { getDatabase } = require("../../services/database");
const config = require("../../../config.json");

function hasAdminRole(member) {
  const adminRoleId = config.roles?.adminRoleId;
  return adminRoleId ? member.roles.cache.has(adminRoleId) : false;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("refund")
    .setDescription("Traiter un remboursement")
    .addStringOption(opt => opt.setName("payment_id").setDescription("ID du paiement ou session Stripe").setRequired(true))
    .addStringOption(opt => opt.setName("reason").setDescription("Raison du remboursement").setRequired(false))
    .addIntegerOption(opt => opt.setName("amount").setDescription("Montant à rembourser en euros (partiel)").setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  cooldown: 10,
  async execute(interaction) {
    const db = getDatabase();
    const member = interaction.member;
    const paymentId = interaction.options.getString("payment_id");
    const reason = interaction.options.getString("reason") || "Remboursement demandé par l'administration";
    const partialAmount = interaction.options.getInteger("amount");
    
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
      // Rechercher le paiement par ID ou session Stripe
      let payment = null;
      
      // Essayer par ID de paiement
      const { data: paymentById } = await db.supabase
        .from("payments")
        .select(`
          *,
          users!inner(discord_id, discord_tag)
        `)
        .eq("id", paymentId)
        .single();

      if (paymentById) {
        payment = paymentById;
      } else {
        // Essayer par session Stripe
        const { data: paymentBySession } = await db.supabase
          .from("payments")
          .select(`
            *,
            users!inner(discord_id, discord_tag)
          `)
          .eq("stripe_session_id", paymentId)
          .single();
        
        if (paymentBySession) {
          payment = paymentBySession;
        }
      }

      if (!payment) {
        return interaction.editReply({
          embeds: [errorEmbed("❌ Paiement non trouvé. Vérifiez l'ID du paiement ou la session Stripe.")]
        });
      }

      if (payment.status !== 'paid') {
        return interaction.editReply({
          embeds: [errorEmbed("❌ Ce paiement n'est pas dans un état remboursable (statut: " + payment.status + ").")]
        });
      }

      // Vérifier s'il y a déjà un remboursement en cours
      const { data: existingRefund } = await db.supabase
        .from("refunds")
        .select("*")
        .eq("payment_id", payment.id)
        .in("status", ["requested", "approved"])
        .single();

      if (existingRefund) {
        return interaction.editReply({
          embeds: [errorEmbed("❌ Un remboursement est déjà en cours pour ce paiement.")]
        });
      }

      // Calculer le montant du remboursement
      const maxRefundAmount = payment.amount_cents;
      const refundAmountCents = partialAmount ? Math.min(partialAmount * 100, maxRefundAmount) : maxRefundAmount;
      const isPartialRefund = refundAmountCents < maxRefundAmount;

      // Créer l'embed de confirmation
      const confirmEmbed = brandEmbed({
        title: "⚠️ Confirmation de remboursement",
        description: `Êtes-vous sûr de vouloir ${isPartialRefund ? "partiellement " : ""}rembourser ce paiement ?`,
        fields: [
          { name: "👤 Client", value: `${payment.users.discord_tag} (<@${payment.users.discord_id}>)`, inline: true },
          { name: "💰 Montant original", value: `€${(payment.amount_cents / 100).toFixed(2)}`, inline: true },
          { name: "💸 Montant à rembourser", value: `€${(refundAmountCents / 100).toFixed(2)}`, inline: true },
          { name: "🏷️ Produit/Service", value: payment.sku || "Devis personnalisé", inline: true },
          { name: "🔗 Session Stripe", value: `\`${payment.stripe_session_id || "N/A"}\``, inline: true },
          { name: "📝 Raison", value: reason, inline: false }
        ]
      });

      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`refund:confirm:${payment.id}:${refundAmountCents}:${interaction.user.id}`)
            .setLabel(`Confirmer le remboursement`)
            .setStyle(ButtonStyle.Danger)
            .setEmoji("💸"),
          new ButtonBuilder()
            .setCustomId("refund:cancel")
            .setLabel("Annuler")
            .setStyle(ButtonStyle.Secondary)
            .setEmoji("❌")
        );

      await interaction.editReply({ embeds: [confirmEmbed], components: [row] });

    } catch (error) {
      console.error("Erreur lors de la préparation du remboursement:", error);
      await interaction.editReply({
        embeds: [errorEmbed("❌ Erreur lors de la préparation du remboursement.")]
      });
    }
  }
};