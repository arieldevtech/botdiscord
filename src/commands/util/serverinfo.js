const { SlashCommandBuilder } = require("discord.js");
const { brandEmbed } = require("../../lib/embeds");
const { getDatabase } = require("../../services/database");

module.exports = {
  data: new SlashCommandBuilder().setName("serverinfo").setDescription("Show detailed information about this Discord server"),
  cooldown: 5,
  async execute(interaction) {
    const db = getDatabase();
    const guild = interaction.guild;
    
    await interaction.deferReply({ ephemeral: true });
    
    // Fetch members with presences for accurate online count
    await guild.members.fetch({ withPresences: true }).catch(() => {});

    // Basic server stats
    const total = guild.memberCount;
    const online = guild.members.cache.filter((m) => m.presence && m.presence.status !== "offline").size;
    const bots = guild.members.cache.filter((m) => m.user.bot).size;
    const humans = total - bots;
    
    const rolesCount = guild.roles.cache.size;
    const channelsCount = guild.channels.cache.size;
    const textChannels = guild.channels.cache.filter(c => c.type === 0).size;
    const voiceChannels = guild.channels.cache.filter(c => c.type === 2).size;
    const categories = guild.channels.cache.filter(c => c.type === 4).size;
    
    const boost = guild.premiumTier ? `Level ${guild.premiumTier}` : "None";
    const boostCount = guild.premiumSubscriptionCount || 0;
    
    const created = `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`;
    const owner = await guild.fetchOwner().catch(() => null);
    
    // Security and verification
    const verificationLevels = {
      0: "None",
      1: "Low", 
      2: "Medium",
      3: "High",
      4: "Very High"
    };
    const verificationLevel = verificationLevels[guild.verificationLevel] || "Unknown";
    
    // Features
    const features = guild.features;
    const notableFeatures = [];
    if (features.includes('COMMUNITY')) notableFeatures.push('🏘️ Community');
    if (features.includes('PARTNERED')) notableFeatures.push('🤝 Partnered');
    if (features.includes('VERIFIED')) notableFeatures.push('✅ Verified');
    if (features.includes('DISCOVERABLE')) notableFeatures.push('🔍 Discoverable');
    if (features.includes('MONETIZATION_ENABLED')) notableFeatures.push('💰 Monetization');
    if (features.includes('TICKETED_EVENTS_ENABLED')) notableFeatures.push('🎫 Events');
    
    const fields = [
      { 
        name: "👥 **Members**", 
        value: `**Total:** ${total}\n**Humans:** ${humans}\n**Bots:** ${bots}\n**Online:** ${online}`, 
        inline: true 
      },
      { 
        name: "📊 **Server Stats**", 
        value: `**Roles:** ${rolesCount}\n**Channels:** ${channelsCount}\n**Categories:** ${categories}\n**Text:** ${textChannels} | **Voice:** ${voiceChannels}`, 
        inline: true 
      },
      { 
        name: "🚀 **Boost Status**", 
        value: `**Level:** ${boost}\n**Boosts:** ${boostCount}\n**Verification:** ${verificationLevel}`, 
        inline: true 
      },
      { 
        name: "👑 **Server Info**", 
        value: `**Owner:** ${owner ? `<@${owner.id}>` : "Unknown"}\n**Created:** ${created}\n**Server ID:** \`${guild.id}\``, 
        inline: false 
      }
    ];
    
    if (notableFeatures.length > 0) {
      fields.push({ 
        name: "✨ **Features**", 
        value: notableFeatures.join("\n"), 
        inline: false 
      });
    }
    
    // Database statistics if available
    if (db.isEnabled()) {
      try {
        const [usersResult, ticketsResult, ordersResult] = await Promise.all([
          db.supabase.from("users").select("count").single(),
          db.supabase.from("tickets").select("count").single(), 
          db.supabase.from("orders").select("count").single()
        ]);
        
        const dbUsers = usersResult.data?.count || 0;
        const dbTickets = ticketsResult.data?.count || 0;
        const dbOrders = ordersResult.data?.count || 0;
        
        fields.push({
          name: "💾 **Database Stats**",
          value: `**Registered Users:** ${dbUsers}\n**Total Tickets:** ${dbTickets}\n**Total Orders:** ${dbOrders}`,
          inline: true
        });
      } catch (error) {
        console.error("Error fetching database stats:", error);
      }
    }
    
    // Emojis info
    const emojis = guild.emojis.cache;
    const staticEmojis = emojis.filter(e => !e.animated).size;
    const animatedEmojis = emojis.filter(e => e.animated).size;
    const totalEmojis = emojis.size;
    
    if (totalEmojis > 0) {
      fields.push({
        name: "😀 **Emojis**",
        value: `**Total:** ${totalEmojis}\n**Static:** ${staticEmojis}\n**Animated:** ${animatedEmojis}`,
        inline: true
      });
    }

    const embed = brandEmbed({
      title: `🏰 **${guild.name}**`,
      description: guild.description || "No server description set",
      fields: fields
    });
    
    if (guild.iconURL()) embed.setThumbnail(guild.iconURL({ size: 256 }));
    if (guild.bannerURL()) embed.setImage(guild.bannerURL({ size: 1024 }));

    await interaction.editReply({ embeds: [embed] });
  },
};