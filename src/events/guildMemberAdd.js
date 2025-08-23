const config = require("../../config.json");
const logger = require("../utils/logger");
const { brandEmbed } = require("../lib/embeds");
const { ChannelType } = require("discord.js");

module.exports = {
  name: "guildMemberAdd",
  once: false,
  async execute(member) {
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
        title: `🎉 Welcome, ${member.user.username}!`,
        description: "We’re excited to have you here. Please take a moment to review our rules and say hi!",
        fields: [
          { name: "__Getting Started__", value: "Introduce yourself in <#1407818331062272123> and check out <#rules>." },
          { name: "__Key Channels__", value: "• 📢 <#1407823254059483227> — Important updates\n• 💬 <#general> — Chat with everyone\n• 🆘 <#1407818324523618376> — Ask questions or open a ticket" },
          { name: "__Need Help?__", value: "Ask staff in <#1407818322703290532> or open a ticket. We’re here for you!" },
        ],
      });
      await channel.send({ content: `<@${member.id}>`, embeds: [embed] });
    } catch (e) {
      logger.warn(`[welcome] Failed to send welcome message: ${e.message}`);
    }
  },
};