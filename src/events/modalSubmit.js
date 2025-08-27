const { brandEmbed, successEmbed, errorEmbed } = require("../lib/embeds");
const { getDatabase } = require("../services/database");
const config = require("../../config.json");

module.exports = {
  name: "interactionCreate",
  once: false,
  async execute(interaction) {
    if (!interaction.isModalSubmit()) return;

    // Gestion des suggestions
    if (interaction.customId === "suggestion_modal") {
      const title = interaction.fields.getTextInputValue("suggestion_title");
      const description = interaction.fields.getTextInputValue("suggestion_description");
      const category = interaction.fields.getTextInputValue("suggestion_category") || "Général";

      try {
        // Canal de suggestions (à configurer dans config.json)
        const suggestionsChannelId = config.suggestionsChannelId;
        if (suggestionsChannelId) {
          const channel = await interaction.client.channels.fetch(suggestionsChannelId).catch(() => null);
          if (channel) {
            const suggestionEmbed = brandEmbed({
              title: `💡 ${title}`,
              description: description,
              fields: [
                { name: "👤 Auteur", value: `<@${interaction.user.id}>`, inline: true },
                { name: "📂 Catégorie", value: category, inline: true },
                { name: "📅 Date", value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
              ]
            });

            if (interaction.user.displayAvatarURL()) {
              suggestionEmbed.setThumbnail(interaction.user.displayAvatarURL({ size: 128 }));
            }

            const message = await channel.send({ embeds: [suggestionEmbed] });
            await message.react("👍");
            await message.react("👎");
            await message.react("🤔");
          }
        }

        // Log en base de données
        const db = getDatabase();
        if (db.isEnabled()) {
          await db.logAction('suggestion_submitted', interaction.user.id, 'suggestion', title, {
            description,
            category,
            channel_id: suggestionsChannelId
          });
        }

        await interaction.reply({
          ephemeral: true,
          embeds: [successEmbed("✅ **Suggestion envoyée !**\n\nMerci pour votre contribution. Notre équipe examinera votre suggestion.")]
        });

      } catch (error) {
        console.error("Erreur lors de l'envoi de la suggestion:", error);
        await interaction.reply({
          ephemeral: true,
          embeds: [errorEmbed("❌ Une erreur est survenue lors de l'envoi de votre suggestion.")]
        });
      }
    }
  }
};