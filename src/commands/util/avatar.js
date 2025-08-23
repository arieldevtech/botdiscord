const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { brandEmbed } = require("../../lib/embeds");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("avatar")
    .setDescription("Get a user's avatar in HD")
    .addUserOption((opt) => opt.setName("member").setDescription("Select a member").setRequired(false)),
  cooldown: 5,
  async execute(interaction) {
    const user = interaction.options.getUser("member") || interaction.user;
    const avatarPng = user.displayAvatarURL({ size: 1024, extension: "png" });
    const avatarJpg = user.displayAvatarURL({ size: 1024, extension: "jpg" });
    const avatarWebp = user.displayAvatarURL({ size: 1024, extension: "webp" });
    const embed = brandEmbed({ title: `🖼️ Avatar — ${user.tag}` });
    embed.setImage(user.displayAvatarURL({ size: 1024 }));
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel("Open Image").setStyle(ButtonStyle.Link).setURL(avatarWebp || avatarPng || avatarJpg)
    );
    await interaction.reply({ ephemeral: true, embeds: [embed], components: [row] });
  },
};