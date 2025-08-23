const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { brandEmbed, successEmbed, errorEmbed } = require("../../lib/embeds");
const config = require("../../../config.json");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("clear")
    .setDescription("Secure bulk deletion of recent messages")
    .addIntegerOption((opt) => opt.setName("amount").setDescription("Number of messages to delete (1-100)").setRequired(true))
    .addStringOption((opt) => opt.setName("target").setDescription("Filter target").addChoices({ name: "bot", value: "bot" }, { name: "all", value: "all" }).setRequired(false))
    .addUserOption((opt) => opt.setName("author").setDescription("Only delete messages from this user").setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  cooldown: 5,
  permissions: ["ManageMessages"],
  async execute(interaction) {
    const amount = interaction.options.getInteger("amount");
    const target = interaction.options.getString("target") || "bot";
    const author = interaction.options.getUser("author") || null;

    const member = interaction.member;
    const adminRoleId = config.roles?.adminRoleId;
    const hasAdminRole = adminRoleId ? member.roles?.cache?.has(adminRoleId) : false;
    const hasPerm = member.permissions?.has(PermissionFlagsBits.ManageMessages) || hasAdminRole;
    if (!hasPerm) {
      return interaction.reply({ ephemeral: true, embeds: [errorEmbed("**⚠️ Permission Denied**\nYou need ManageMessages or the configured ADMIN role.")] });
    }

    if (amount < 1 || amount > 100) {
      return interaction.reply({ ephemeral: true, embeds: [errorEmbed("Amount must be between **1** and **100**.")] });
    }

    const channel = interaction.channel;
    try {
      const fetched = await channel.messages.fetch({ limit: 100 });
      const filtered = fetched.filter((m) => {
        if (author && m.author.id !== author.id) return false;
        if (target === "bot" && !m.author.bot) return false;
        // discord.js bulkDelete will auto-skip >14d if second arg true
        return true;
      });
      const toDelete = filtered.first(amount);
      const count = toDelete.length;
      await channel.bulkDelete(toDelete, true);

      const embed = brandEmbed({
        title: "✅ Messages Cleared",
        description: `Successfully deleted **${count}** message(s).`,
        fields: [
          { name: "Channel", value: `${channel}` , inline: true },
          { name: "Target", value: author ? `<@${author.id}>` : target.toUpperCase(), inline: true },
          { name: "Executed", value: `<t:${Math.floor(Date.now()/1000)}:F>`, inline: true },
        ],
      });

      await interaction.reply({ ephemeral: true, embeds: [embed] });
    } catch (e) {
      const msg = e?.message?.includes("14 days")
        ? "**❌ Error**\nCannot delete messages older than **14 days**."
        : "**⚠️ Permission Denied**\nI couldn’t delete messages. Please verify I have the required permissions.";
      await interaction.reply({ ephemeral: true, embeds: [errorEmbed(msg)] });
    }
  },
};