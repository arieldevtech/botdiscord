const { SlashCommandBuilder } = require("discord.js");
const { brandEmbed } = require("../../lib/embeds");
const { getDatabase } = require("../../services/database");
const config = require("../../../config.json");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("status")
    .setDescription("Vérifier le statut des services"),
  cooldown: 10,
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const db = getDatabase();
    const startTime = Date.now();

    // Test de la base de données
    let dbStatus = "❌ Indisponible";
    let dbLatency = "N/A";
    if (db.isEnabled()) {
      try {
        const dbStart = Date.now();
        const health = await db.healthCheck();
        dbLatency = `${Date.now() - dbStart}ms`;
        dbStatus = health.healthy ? "✅ Opérationnel" : "⚠️ Problème détecté";
      } catch (error) {
        dbStatus = "❌ Erreur de connexion";
      }
    }

    // Test de Stripe
    let stripeStatus = "❌ Non configuré";
    if (process.env.STRIPE_SECRET_KEY && !process.env.STRIPE_SECRET_KEY.includes('your_')) {
      stripeStatus = "✅ Configuré";
    }

    // Statistiques du bot
    const botLatency = `${Math.round(interaction.client.ws.ping)}ms`;
    const uptime = process.uptime();
    const uptimeFormatted = `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`;
    const memoryUsage = `${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB`;

    // Statistiques du serveur
    const guild = interaction.guild;
    const totalMembers = guild.memberCount;
    const onlineMembers = guild.members.cache.filter(m => m.presence?.status !== 'offline').size;

    const embed = brandEmbed({
      title: "📊 Statut des services",
      fields: [
        { 
          name: "🤖 Bot", 
          value: `**Latency:** ${botLatency}\n**Uptime:** ${uptimeFormatted}\n**Memory:** ${memoryUsage}`, 
          inline: true 
        },
        { 
          name: "💾 Base de données", 
          value: `**Status:** ${dbStatus}\n**Latency:** ${dbLatency}`, 
          inline: true 
        },
        { 
          name: "💳 Paiements", 
          value: `**Stripe:** ${stripeStatus}`, 
          inline: true 
        },
        { 
          name: "🏰 Serveur Discord", 
          value: `**Membres:** ${totalMembers}\n**En ligne:** ${onlineMembers}\n**Channels:** ${guild.channels.cache.size}`, 
          inline: true 
        },
        { 
          name: "⚙️ Configuration", 
          value: `**Version:** ${config.version}\n**Environnement:** ${process.env.NODE_ENV || 'development'}`, 
          inline: true 
        }
      ]
    });

    const responseTime = Date.now() - startTime;
    embed.setFooter({ text: `Temps de réponse: ${responseTime}ms` });

    await interaction.editReply({ embeds: [embed] });
  }
};