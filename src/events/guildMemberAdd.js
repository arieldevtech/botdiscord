const config = require("../../config.json");
const logger = require("../utils/logger");
const { brandEmbed } = require("../lib/embeds");
const { getDatabase } = require("../services/database");

module.exports = {
  name: "guildMemberAdd",
  once: false,
  async execute(member) {
    const db = getDatabase();
    
    // Create user in database
    try {
      const user = await db.createUser(member.user.id, member.user.tag);
      logger.info(`[Welcome] User ${member.user.tag} added to database`);
      
      // Assigner le rôle VIP Bronze par défaut
      if (user && db.isEnabled()) {
        await db.updateDiscordVipRole(member.user.id, 0); // Bronze par défaut
      }
    } catch (error) {
      logger.error(`[Welcome] Failed to add user to database:`, error);
    }

    // Auto role
    const roleId = config.roles?.autoRoleId;
    if (roleId) {
      try {
        const role = member.guild.roles.cache.get(roleId) || (await member.guild.roles.fetch(roleId).catch(() => null));
        if (role) await member.roles.add(role).catch(() => {});
      } catch (e) {
        logger.warn(`[welcome] Failed to assign role ${roleId} to ${member.user.tag}: ${e.message}`);
      }
    }

    // Welcome embed
    const channelId = config.channels?.welcomeChannelId;
    if (!channelId) return;
    try {
      const channel = member.client.channels.cache.get(channelId) || (await member.client.channels.fetch(channelId).catch(() => null));
      if (!channel) return;
      const embed = brandEmbed({
        title: `🎉 **Welcome to the server, ${member.user.username}!**`,
        description: "We're excited to have you join our community! Here's everything you need to get started:",
        fields: [
          { name: "🚀 **Getting Started**", value: "• Read our <#1407818299399475270> carefully\n• Introduce yourself in <#1407818331062272123>\n• Explore our channels and have fun!", inline: false },
          { name: "📢 **Important Channels**", value: "• <#1407823254059483227> — Server announcements\n• <#1407818324523618376> — General chat\n• <#1407818322703290532> — Get support", inline: false },
          { name: "🆘 **Need Help?**", value: "• Ask questions in <#1407818324523618376>\n• Open a support ticket in <#1407818322703290532>\n• Our staff team is here to help!", inline: false },
        ],
      });
      await channel.send({ content: `<@${member.id}>`, embeds: [embed] });
    } catch (e) {
      logger.warn(`[welcome] Failed to send welcome message: ${e.message}`);
    }
  },
};