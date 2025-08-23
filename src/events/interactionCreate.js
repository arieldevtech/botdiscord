const { InteractionType, PermissionFlagsBits, ComponentType } = require("discord.js");
const logger = require("../utils/logger");
const { checkAndSetCooldown } = require("../utils/cooldown");
const { brandEmbed } = require("../lib/embeds");

module.exports = {
  name: "interactionCreate",
  once: false,
  async execute(interaction, client) {
    try {
      // Autocomplete support
      if (interaction.type === InteractionType.ApplicationCommandAutocomplete) {
        const command = client.commands.get(interaction.commandName);
        if (command?.autocomplete) {
          try { await command.autocomplete(interaction, client); } catch (e) { logger.error("autocomplete error:", e); }
        } else {
          await interaction.respond([]).catch(() => {});
        }
        return;
      }

      // Button interactions (help pagination)
      if (interaction.isButton() && interaction.customId.startsWith("help:")) {
        try {
          const cat = interaction.customId.split(":")[1];
          const help = require("../commands/system/help");
          if (cat === "index") {
            const embed = help.__buildIndexEmbed(client);
            const row = help.__helpButtons("index");
            return interaction.update({ embeds: [embed], components: [row] });
          }
          const embed = help.__buildCategoryEmbed(client, cat);
          const row = help.__helpButtons("cat");
          return interaction.update({ embeds: [embed], components: [row] });
        } catch (e) {
          logger.error("help button error:", e);
          return interaction.deferUpdate().catch(() => {});
        }
      }

      if (interaction.type !== InteractionType.ApplicationCommand) return; // ignore others

      const command = client.commands.get(interaction.commandName);
      if (!command) return; // graceful ignore

      // Permission check (per command)
      if (command.permissions) {
        const member = interaction.member;
        const hasPerms = command.permissions.every((p) => member.permissions?.has(PermissionFlagsBits[p] ?? p));
        if (!hasPerms) {
          return interaction.reply({
            ephemeral: true,
            embeds: [
              brandEmbed({
                title: "⚠️ Permission Denied",
                description: "You don't have the required permissions to run this command.",
              }),
            ],
          });
        }
      }

      // Cooldown check
      const cd = command.cooldown ?? 3; // default 3s
      const gate = checkAndSetCooldown(client, interaction.user.id, command, cd);
      if (!gate.allowed) {
        return interaction.reply({
          ephemeral: true,
          embeds: [
            brandEmbed({ title: "Slow down", description: `Please wait ${gate.remaining}s before using this again.` }),
          ],
        });
      }

      await command.execute(interaction, client);
    } catch (err) {
      logger.error("interactionCreate handler error:", err);
      try {
        if (interaction.deferred || interaction.replied) {
          await interaction.followUp({ ephemeral: true, embeds: [brandEmbed({ title: "❌ Error", description: "Something went wrong, please try again later." })] });
        } else {
          await interaction.reply({ ephemeral: true, embeds: [brandEmbed({ title: "❌ Error", description: "Something went wrong, please try again later." })] });
        }
      } catch (_) {
        // swallow
      }
    }
  },
};