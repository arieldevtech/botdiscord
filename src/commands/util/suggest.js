const { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require("discord.js");
const { brandEmbed, errorEmbed, successEmbed } = require("../../lib/embeds");
const { getDatabase } = require("../../services/database");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("suggest")
    .setDescription("Proposer une amélioration ou une idée pour le serveur"),
  cooldown: 300, // 5 minutes
  async execute(interaction) {
    const modal = new ModalBuilder()
      .setCustomId("suggestion_modal")
      .setTitle("💡 Nouvelle suggestion");

    const titleInput = new TextInputBuilder()
      .setCustomId("suggestion_title")
      .setLabel("Titre de votre suggestion")
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(100)
      .setPlaceholder("Ex: Ajouter un système de récompenses");

    const descriptionInput = new TextInputBuilder()
      .setCustomId("suggestion_description")
      .setLabel("Description détaillée")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setMaxLength(1000)
      .setPlaceholder("Décrivez votre idée en détail...");

    const categoryInput = new TextInputBuilder()
      .setCustomId("suggestion_category")
      .setLabel("Catégorie")
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setMaxLength(50)
      .setPlaceholder("Ex: Bot, Serveur, Communauté");

    modal.addComponents(
      new ActionRowBuilder().addComponents(titleInput),
      new ActionRowBuilder().addComponents(descriptionInput),
      new ActionRowBuilder().addComponents(categoryInput)
    );

    await interaction.showModal(modal);
  }
};