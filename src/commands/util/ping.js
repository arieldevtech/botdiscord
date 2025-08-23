const { SlashCommandBuilder } = require("discord.js");
const { brandEmbed } = require("../../lib/embeds");

function formatUptime(sec) {
  const s = Math.floor(sec % 60);
  const m = Math.floor((sec / 60) % 60);
  const h = Math.floor((sec / 3600) % 24);
  const d = Math.floor(sec / 86400);
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(" ");
}

module.exports = {
  data: new SlashCommandBuilder().setName("ping").setDescription("Latency and bot status"),
  cooldown: 3,
  async execute(interaction) {
    const start = Date.now();
    const sent = await interaction.reply({ content: "Pinging...", ephemeral: true, fetchReply: true });
    const rtt = sent.createdTimestamp - start;
    const ws = Math.round(interaction.client.ws.ping);
    const uptime = formatUptime(process.uptime());

    const embed = brandEmbed({
      title: "📡 Ping",
      fields: [
        { name: "Latency (WS)", value: `**${ws}ms**`, inline: true },
        { name: "RTT", value: `**${rtt}ms**`, inline: true },
        { name: "Uptime", value: `**${uptime}**`, inline: true },
      ],
      footerText: "Status in real-time",
    });

    await interaction.editReply({ content: null, embeds: [embed] });
  },
};