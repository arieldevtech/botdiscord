const { SlashCommandBuilder } = require("discord.js");
const { brandEmbed, errorEmbed } = require("../../lib/embeds");
const { TTLCache } = require("../../utils/cacheMem");

const cache = new TTLCache();

const popular = ["btc", "eth", "sol", "bnb", "xrp", "ada", "doge", "ton", "trx", "ltc"]; // basic set
const mapSymbol = {
  btc: "bitcoin",
  eth: "ethereum",
  sol: "solana",
  bnb: "binancecoin",
  xrp: "ripple",
  ada: "cardano",
  doge: "dogecoin",
  ton: "the-open-network",
  trx: "tron",
  ltc: "litecoin",
};

async function fetchPrice(id) {
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(id)}&vs_currencies=usd&include_24hr_change=true&include_market_cap=true`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`price ${res.status}`);
  const json = await res.json();
  const d = json[id];
  return { price: d?.usd, change: d?.usd_24h_change, mcap: d?.usd_market_cap };
}

async function fetchMarkets(id) {
  const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${encodeURIComponent(id)}&order=market_cap_desc&per_page=1&page=1&sparkline=false&price_change_percentage=24h`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`markets ${res.status}`);
  const json = await res.json();
  const d = json[0];
  return { name: d?.name || id.toUpperCase(), symbol: d?.symbol?.toUpperCase() || id.toUpperCase() };
}

function normalizeSymbol(sym) { return (sym || "").trim().toLowerCase(); }

module.exports = {
  data: new SlashCommandBuilder()
    .setName("crypto")
    .setDescription("Crypto price and market data")
    .addStringOption((opt) => opt
      .setName("symbol")
      .setDescription("e.g., BTC, ETH")
      .setRequired(true)
      .setAutocomplete(true)
    ),
  cooldown: 3,
  async autocomplete(interaction) {
    const focused = interaction.options.getFocused() || "";
    const filtered = popular.filter((s) => s.startsWith(focused.toLowerCase())).slice(0, 10);
    await interaction.respond(filtered.map((s) => ({ name: s.toUpperCase(), value: s })));
  },
  async execute(interaction) {
    const sym = normalizeSymbol(interaction.options.getString("symbol"));
    const id = mapSymbol[sym];
    if (!id) {
      const sugg = popular.slice(0, 5).map((s) => s.toUpperCase()).join(", ");
      return interaction.reply({ ephemeral: true, embeds: [errorEmbed(`Unknown symbol. Try: **${sugg}**`)] });
    }

    const key = `cg:${id}`;
    const cached = cache.get(key);
    if (cached) return interaction.reply({ ephemeral: true, embeds: [cached] });

    try {
      await interaction.deferReply({ ephemeral: true });
      const mkt = await fetchMarkets(id);
      const { price, change, mcap } = await fetchPrice(id);
      const embed = brandEmbed({
        title: `${mkt.symbol} — ${mkt.name}`,
        fields: [
          { name: "Price", value: price ? `$${price.toLocaleString()}` : "—", inline: true },
          { name: "24h", value: typeof change === "number" ? `${change.toFixed(2)}%` : "—", inline: true },
          { name: "Market cap", value: mcap ? `$${Math.round(mcap).toLocaleString()}` : "—", inline: true },
        ],
        footerText: "Source: CoinGecko",
      });
      cache.set(key, embed, 60 * 1000);
      await interaction.editReply({ embeds: [embed] });
    } catch (e) {
      console.error(e);
      await interaction.editReply({ embeds: [errorEmbed("Service temporarily unavailable. Please try again later.")] });
    }
  },
};