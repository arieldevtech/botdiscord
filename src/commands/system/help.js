const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { brandEmbed } = require("../../lib/embeds");

function buildIndexEmbed(client) {
  const groups = {};
  for (const [, cmd] of client.commands) {
    const cat = (cmd.category || "misc").toLowerCase();
    if (!groups[cat]) groups[cat] = [];
    const name = cmd.data?.name || "?";
    const desc = cmd.data?.description || "—";
    groups[cat].push(`• **/${name}** — ${desc}`);
  }
  const order = ["util", "info", "system", "admin", ...Object.keys(groups).filter((k) => !["util", "info", "system", "admin"].includes(k))];
  const fields = order.filter((k) => groups[k]).map((k) => ({ name: k.toUpperCase(), value: groups[k].join("\n") }));
  return brandEmbed({ title: "📖 Help — Command Index", fields });
}

function buildCategoryEmbed(client, cat) {
  const items = [];
  for (const [, cmd] of client.commands) {
    if ((cmd.category || "").toLowerCase() === cat.toLowerCase()) {
      const name = cmd.data?.name || "?";
      const desc = cmd.data?.description || "—";
      items.push(`• **/${name}** — ${desc}`);
    }
  }
  const value = items.length ? items.join("\n") : "No commands in this category.";
  return brandEmbed({ title: `📖 Help — ${cat.toUpperCase()}`, fields: [{ name: cat.toUpperCase(), value }] });
}

function helpButtons(mode = "index") {
  if (mode === "index") {
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("help:util").setLabel("UTIL").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("help:info").setLabel("INFO").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("help:system").setLabel("SYSTEM").setStyle(ButtonStyle.Secondary)
    );
  }
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("help:index").setLabel("Back").setStyle(ButtonStyle.Secondary)
  );
}

module.exports = {
  data: new SlashCommandBuilder().setName("help").setDescription("Show dynamic help with pagination"),
  cooldown: 3,
  async execute(interaction) {
    const embed = buildIndexEmbed(interaction.client);
    const row = helpButtons("index");
    await interaction.reply({ ephemeral: true, embeds: [embed], components: [row] });
  },
  // Expose helpers for button handling via require in interactionCreate if needed
  __buildIndexEmbed: buildIndexEmbed,
  __buildCategoryEmbed: buildCategoryEmbed,
  __helpButtons: helpButtons,
};