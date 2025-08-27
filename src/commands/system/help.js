const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { brandEmbed } = require("../../lib/embeds");
const config = require("../../../config.json");

function buildIndexEmbed(client) {
  const groups = {};
  for (const [, cmd] of client.commands) {
    const cat = (cmd.category || "misc").toLowerCase();
    if (!groups[cat]) groups[cat] = [];
    const name = cmd.data?.name || "?";
    const desc = cmd.data?.description || "—";
    groups[cat].push(`• **/${name}** — ${desc}`);
  }
  const order = ["util", "info", "system", "admin", "ticket", ...Object.keys(groups).filter((k) => !["util", "info", "system", "admin", "ticket"].includes(k))];
  const fields = order.filter((k) => groups[k]).map((k) => ({ name: k.toUpperCase(), value: groups[k].join("\n") }));
  
  const totalCommands = client.commands.size;
  const botInfo = `**${config.botName}** v${config.version} • ${totalCommands} commandes disponibles`;
  
  return brandEmbed({ 
    title: "📖 **Command Help Center**", 
    description: `${botInfo}\n\nUtilisez les boutons ci-dessous pour naviguer entre les catégories ou consultez la liste complète des commandes.`,
    fields 
  });
}

function buildCategoryEmbed(client, cat) {
  const items = [];
  let totalInCategory = 0;
  for (const [, cmd] of client.commands) {
    if ((cmd.category || "").toLowerCase() === cat.toLowerCase()) {
      const name = cmd.data?.name || "?";
      const desc = cmd.data?.description || "—";
      const cooldown = cmd.cooldown ? ` (${cmd.cooldown}s cooldown)` : "";
      const permissions = cmd.permissions ? ` 🔒` : "";
      items.push(`• **/${name}**${permissions} — ${desc}${cooldown}`);
      totalInCategory++;
    }
  }
  const value = items.length ? items.join("\n") : "No commands in this category.";
  
  const categoryDescriptions = {
    util: "🛠️ Utility commands for everyday use",
    info: "ℹ️ Information and lookup commands", 
    system: "⚙️ System and bot management commands",
    admin: "👑 Administrative commands (staff only)",
    ticket: "🎫 Ticket management commands (staff only)",
    fun: "🎉 Fun and entertainment commands"
  };
  
  const description = categoryDescriptions[cat.toLowerCase()] || "Commands in this category";
  
  return brandEmbed({ 
    title: `📖 **${cat.toUpperCase()} Commands**`, 
    description: `${description}\n\n**${totalInCategory}** command(s) available in this category`,
    fields: [{ name: `${cat.toUpperCase()} (${totalInCategory})`, value }] 
  });
}

function helpButtons(mode = "index") {
  if (mode === "index") {
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("help:util").setLabel("UTIL").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("help:info").setLabel("INFO").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("help:system").setLabel("SYSTEM").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("help:admin").setLabel("ADMIN").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId("help:ticket").setLabel("TICKET").setStyle(ButtonStyle.Success)
    );
  }
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("help:index").setLabel("← Back to Index").setStyle(ButtonStyle.Secondary).setEmoji("🏠")
  );
}

module.exports = {
  data: new SlashCommandBuilder().setName("help").setDescription("Comprehensive help system with command categories"),
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