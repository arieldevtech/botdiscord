const { SlashCommandBuilder } = require("discord.js");
const { brandEmbed } = require("../../lib/embeds");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("userinfo")
    .setDescription("Show information about a user")
    .addUserOption((opt) => opt.setName("member").setDescription("Select a member").setRequired(false)),
  cooldown: 5,
  async execute(interaction) {
    const user = interaction.options.getUser("member") || interaction.user;
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);

    const created = `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`;
    const joined = member ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>` : "—";
    const roles = member ? member.roles.cache.filter((r) => r.name !== "@everyone").sort((a, b) => b.position - a.position).first(5) : [];
    const rolesStr = roles.length ? roles.map((r) => r.toString()).join(", ") : "None";

    const embed = brandEmbed({
      title: `👤 ${user.tag}`,
      fields: [
        { name: "ID", value: `
**${user.id}**`, inline: true },
        { name: "Account Created", value: created, inline: true },
        { name: "Joined Server", value: joined, inline: true },
        { name: "Top Roles", value: rolesStr, inline: false },
      ],
    });
    if (user.displayAvatarURL()) embed.setThumbnail(user.displayAvatarURL({ size: 256 }));

    await interaction.reply({ ephemeral: true, embeds: [embed] });
  },
};