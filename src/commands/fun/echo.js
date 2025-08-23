const { SlashCommandBuilder } = require("discord.js");
const { buildEmbed } = require("../../utils/embed");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("echo")
    .setDescription("Echo back your input")
    .addStringOption((opt) => opt.setName("text").setDescription("What should I say?").setRequired(true)),
  cooldown: 3,
  async execute(interaction) {
    const text = interaction.options.getString("text");
    await interaction.reply({
      embeds: [buildEmbed({ title: "Echo", description: text })],
      ephemeral: true,
    });
  },
};