const { SlashCommandBuilder } = require("discord.js");
const { brandEmbed, errorEmbed } = require("../../lib/embeds");
const { TTLCache, UserLRU } = require("../../utils/cacheMem");
const { ApiQueue } = require("../../utils/apiQueue");

const cache = new TTLCache();
const queue = new ApiQueue();
const memory = new UserLRU(5);

const OPENMETEO_GEOCODE = "https://geocoding-api.open-meteo.com/v1/search";
const OPENMETEO_BASE = "https://api.open-meteo.com/v1/forecast";

async function geocode(city) {
  const url = `${OPENMETEO_GEOCODE}?name=${encodeURIComponent(city)}&count=5&language=en&format=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`geocode ${res.status}`);
  const json = await res.json();
  const r = (json.results || [])[0];
  if (!r) return null;
  return { display: `${r.name}${r.admin1 ? ", " + r.admin1 : ""}${r.country ? ", " + r.country : ""}`, lat: r.latitude, lon: r.longitude };
}

async function forecast(lat, lon) {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: ["temperature_2m", "apparent_temperature", "wind_speed_10m", "precipitation"].join(","),
    hourly: ["temperature_2m", "apparent_temperature", "wind_speed_10m", "precipitation"].join(","),
    timezone: "auto",
  });
  const res = await fetch(`${OPENMETEO_BASE}?${params.toString()}`);
  if (!res.ok) throw new Error(`forecast ${res.status}`);
  return res.json();
}

function normalizeCity(city) { return city.trim().toLowerCase(); }

module.exports = {
  data: new SlashCommandBuilder()
    .setName("weather")
    .setDescription("Current weather and short forecast")
    .addStringOption((opt) => opt
      .setName("city")
      .setDescription("City name")
      .setRequired(true)
      .setAutocomplete(true)
    ),
  cooldown: 5,
  async autocomplete(interaction) {
    const focused = (interaction.options.getFocused() || "").trim();
    const sugg = memory.suggestions(interaction.user.id, focused).slice(0, 5);
    if (sugg.length) return interaction.respond(sugg.map((s) => ({ name: s, value: s })));
    return interaction.respond([]);
  },
  async execute(interaction) {
    const city = interaction.options.getString("city");
    const key = `weather:${normalizeCity(city)}`;

    const run = async () => {
      const cached = cache.get(key);
      if (cached) {
        return interaction.reply({ ephemeral: true, embeds: [cached] });
      }
      try {
        await interaction.deferReply({ ephemeral: true });
        const g = await geocode(city);
        if (!g) {
          return interaction.editReply({ embeds: [errorEmbed("City not found. Try a broader query (e.g., 'Paris, FR').")] });
        }
        const data = await forecast(g.lat, g.lon);
        const cur = data.current;
        const tmp = cur.temperature_2m;
        const app = cur.apparent_temperature;
        const wind = cur.wind_speed_10m;
        const prec = cur.precipitation;
        const times = data.hourly?.time || [];
        const temps = data.hourly?.temperature_2m || [];
        const winds = data.hourly?.wind_speed_10m || [];
        const precs = data.hourly?.precipitation || [];
        const now = Date.now();
        // find first index >= now
        let idx = times.findIndex((t) => new Date(t).getTime() >= now);
        if (idx < 0) idx = 0;
        const horizon = 3;
        const nextTemps = temps.slice(idx, idx + horizon);
        const nextWinds = winds.slice(idx, idx + horizon);
        const nextPrecs = precs.slice(idx, idx + horizon);
        const avg = (arr) => arr.length ? (arr.reduce((a,b)=>a+Number(b||0),0)/arr.length) : 0;
        const sum = (arr) => arr.reduce((a,b)=>a+Number(b||0),0);
        const nextLine = `Temp ~ **${nextTemps.map((x)=>Number(x).toFixed(0)).join("/" )}°C** | Wind ~ **${avg(nextWinds).toFixed(0)} km/h** | Precip ~ **${sum(nextPrecs).toFixed(1)} mm**`;

        const embed = brandEmbed({
          title: `⛅ Weather — ${g.display}`,
          fields: [
            { name: "Current", value: `Temp: **${tmp}°C**\nWind: **${wind} km/h**\nPrecip: **${prec} mm**`, inline: true },
            { name: "Feels Like", value: `**${app}°C**`, inline: true },
            { name: "Next Hours", value: nextLine, inline: false },
          ],
          footerText: "Source: Open-Meteo",
        });

        cache.set(key, embed, 10 * 60 * 1000);
        memory.remember(interaction.user.id, g.display);
        await interaction.editReply({ embeds: [embed] });
      } catch (e) {
        console.error(e);
        await interaction.editReply({ embeds: [errorEmbed("Service temporarily unavailable. Please try again later.")] });
      }
    };

    await queue.enqueue(interaction.user.id, run);
  },
};