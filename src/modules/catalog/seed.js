const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const config = require("../../../config.json");
const { brandEmbed } = require("../../lib/embeds");
const { readJson, writeJson } = require("../../utils/cache");
const crypto = require("crypto");
const logger = require("../../utils/logger");
const stripeServer = require("../../payments/stripeServer");

const CACHE_PATH = ".cache/catalog.json";

function hashProducts(products) {
  return crypto.createHash("sha256").update(JSON.stringify(products || []), "utf8").digest("hex");
}

function pageEmbeds(products, page, perPage = 5) {
  const start = page * perPage;
  const slice = products.slice(start, start + perPage);
  const embeds = slice.map((p) => {
    const lines = [p.description || "", "", `**Price:** €${p.priceEUR}`, ...(p.licensePolicy ? ["**License:** " + p.licensePolicy] : [])].filter(Boolean).join("\n");
    const e = brandEmbed({ title: `🛒 ${p.name}`, description: lines });
    if (p.images && p.images[0]) e.setThumbnail(p.images[0]);
    return e;
  });
  return embeds;
}

function pageButtons(products, page, perPage = 5) {
  const start = page * perPage;
  const slice = products.slice(start, start + perPage);
  const row1 = new ActionRowBuilder();
  for (const p of slice) {
    row1.addComponents(new ButtonBuilder().setCustomId(`catalog:buy:${p.sku}`).setLabel(`Buy: €${p.priceEUR}`).setStyle(ButtonStyle.Success));
  }
  const row2 = new ActionRowBuilder();
  row2.addComponents(
    new ButtonBuilder().setCustomId(`catalog:prev:${page}`).setLabel("Previous").setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
    new ButtonBuilder().setCustomId(`catalog:next:${page}`).setLabel("Next").setStyle(ButtonStyle.Secondary).setDisabled((page + 1) * perPage >= products.length)
  );
  return [row1, row2];
}

async function ensureProductShowcase(client) {
  const channelId = config.productShowcaseChannelId;
  if (!channelId) return logger.warn("[catalog] productShowcaseChannelId is not configured");

  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel) return logger.warn(`[catalog] Showcase channel not found: ${channelId}`);

  const products = config.products || [];
  const pages = Math.max(1, Math.ceil(products.length / 5));

  const cache = readJson(CACHE_PATH, {});
  const hash = hashProducts(products);

  const page = 0;
  const embeds = pageEmbeds(products, page);
  const components = pageButtons(products, page);

  if (cache.messageId) {
    const msg = await channel.messages.fetch(cache.messageId).catch(() => null);
    if (msg) {
      try {
        await msg.edit({ content: `Product showcase (${products.length}) — Page ${page + 1}/${pages}`, embeds, components });
        writeJson(CACHE_PATH, { messageId: msg.id, lastHash: hash, page });
        logger.success("[catalog] Showcase updated");
        return;
      } catch (e) {
        logger.warn("[catalog] Failed to update showcase, recreating", e?.message);
      }
    }
  }

  const message = await channel.send({ content: `Product showcase (${products.length}) — Page ${page + 1}/${pages}`, embeds, components });
  writeJson(CACHE_PATH, { messageId: message.id, lastHash: hash, page });
  logger.success(`[catalog] Showcase published (${message.id})`);
}

async function handleBuy(interaction, sku) {
  const products = config.products || [];
  const product = products.find((p) => p.sku === sku);
  if (!product) {
    return interaction.reply({ ephemeral: true, embeds: [brandEmbed({ title: "❌ Error", description: "Product not found." })] });
  }
  try {
    await interaction.deferReply({ ephemeral: true });
    const session = await stripeServer.createCheckoutSession({
      discord_user_id: interaction.user.id,
      discord_username: interaction.user.username,
      sku: product.sku,
      name: product.name,
      description: product.description,
      priceEUR: product.priceEUR,
      deliverableFile: product.deliverableFile || null,
    });

    const embed = brandEmbed({
      title: "💳 Checkout Ready",
      description: `Your checkout session for **${product.name}** is ready.\nClick the button below to complete your payment.`,
      fields: [
        { name: "Price", value: `€${product.priceEUR}`, inline: true },
        { name: "Security", value: "Secured by Stripe", inline: true },
      ],
    });
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Pay now").setURL(session.url)
    );

    await interaction.editReply({ embeds: [embed], components: [row] });
  } catch (e) {
    await interaction.editReply({ embeds: [brandEmbed({ title: "❌ Error", description: "Failed to create checkout session. Please try again later." })] });
  }
}

module.exports = { ensureProductShowcase, pageEmbeds, pageButtons, handleBuy };