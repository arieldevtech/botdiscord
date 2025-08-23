const { SlashCommandBuilder } = require("discord.js");
const { brandEmbed } = require("../../lib/embeds");

module.exports = {
  data: new SlashCommandBuilder().setName("serverinfo").setDescription("Show information about this server"),
  cooldown: 5,
  async execute(interaction) {
    const guild = interaction.guild;
    await guild.members.fetch({ withPresences: true }).catch(() => {});

    const total = guild.memberCount;
    const online = guild.members.cache.filter((m) => m.presence && m.presence.status !== "offline").size;
    const rolesCount = guild.roles.cache.size;
    const boost = guild.premiumTier ? `Level ${guild.premiumTier}` : "None";
    const created = `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`;
    const owner = await guild.fetchOwner().catch(() => null);

    const embed = brandEmbed({
      title: `🏰 ${guild.name}`,
      fields: [
        { name: "Members", value: `Total: **${total}**\nOnline: **${online}**`, inline: true },
        { name: "Roles", value: `**${rolesCount}**`, inline: true },
        { name: "Boost", value: `${boost}`, inline: true },
        { name: "Owner", value: owner ? `<@${owner.id}>` : "Unknown", inline: true },
        { name: "Created", value: created, inline: true },
      ],
    });
    if (guild.iconURL()) embed.setThumbnail(guild.iconURL({ size: 256 }));

    await interaction.reply({ ephemeral: true, embeds: [embed] });
  },
};