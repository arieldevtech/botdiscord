const { ActionRowBuilder, StringSelectMenuBuilder, ChannelType, PermissionFlagsBits } = require("discord.js");
const config = require("../../../config.json");
const { brandEmbed } = require("../../lib/embeds");
const { readJson, writeJson } = require("../../utils/cache");
const { getDatabase } = require("../../services/database");
const logger = require("../../utils/logger");
const { TicketManager } = require("./ticketManager");

const CACHE_PATH = ".cache/support.json";

function buildHubEmbed() {
  const desc = [
    "Welcome to the **Ticket Hub**.",
    "Pick a category to open a private ticket with the support team.",
    "• One active ticket per user",
    "• Describe your request clearly for faster assistance",
  ].join("\n");
  return brandEmbed({ title: "🎫 Ticket Hub", description: desc });
}

function buildHubMenu() {
  const menu = new StringSelectMenuBuilder().setCustomId("support:select").setPlaceholder("Select a category");
  const cats = config.ticketCategories || {};
  const options = Object.entries(cats).map(([key, v]) => ({ label: v.name || key, value: key }));
  menu.addOptions(options.slice(0, 25));
  return new ActionRowBuilder().addComponents(menu);
}

async function ensureTicketHub(client) {
  const channelId = config.ticketHubChannelId;
  if (!channelId) return logger.warn("[support] ticketHubChannelId is not configured");

  const cache = readJson(CACHE_PATH, {});
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel) {
    logger.warn(`[support] Hub channel not found: ${channelId}`);
    return;
  }

  const embed = buildHubEmbed();
  const menu = buildHubMenu();

  if (cache.hubMessageId) {
    const msg = await channel.messages.fetch(cache.hubMessageId).catch(() => null);
    if (msg) {
      try {
        await msg.edit({ embeds: [embed], components: [menu] });
        logger.success("[support] Ticket Hub updated");
        return;
      } catch (e) {
        logger.warn("[support] Failed to update hub, recreating", e?.message);
      }
    }
  }

  const message = await channel.send({ embeds: [embed], components: [menu] });
  writeJson(CACHE_PATH, { ...cache, hubMessageId: message.id });
  logger.success(`[support] Ticket Hub published (${message.id})`);
}

async function createTicketChannel(guild, user, categoryKey) {
  const cat = (config.ticketCategories || {})[categoryKey];
  if (!cat) throw new Error("Unknown category");

  if (!cat.discordCategoryId) {
    logger.warn(`[support] Missing discordCategoryId for ${categoryKey}`);
  }

  const parentId = cat.discordCategoryId || null;
  const name = `ticket-${categoryKey}-${user.username}`.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 90);

  const overwrites = [
    { id: guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] },
    { id: user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks] },
  ];
  for (const rid of config.supportRoleIds || []) {
    overwrites.push({ id: rid, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.ManageMessages] });
  }

  const channel = await guild.channels.create({
    name,
    type: ChannelType.GuildText,
    parent: parentId || undefined,
    permissionOverwrites: overwrites,
  });

  return channel;
}

function buildTicketIntroEmbed(categoryKey) {
  const cat = (config.ticketCategories || {})[categoryKey];
  const questions = (cat?.introEmbed?.questions || []).map((q, i) => `- **Q${i + 1}.** ${q}`).join("\n");
  const desc = [
    `You opened a **${cat?.name || categoryKey}** ticket. Please answer the questions below:`,
    "",
    questions || "(No questions configured)",
    "",
    "> Use the button below to answer via form.",
  ].join("\n");
  return brandEmbed({ title: cat?.introEmbed?.title || "Ticket", description: desc });
}

async function validateTicketCategories(client) {
  const cats = config.ticketCategories || {};
  for (const [key, v] of Object.entries(cats)) {
    const id = v.discordCategoryId;
    if (!id) {
      logger.warn(`[support] Category '${key}': missing discordCategoryId`);
      continue;
    }
    const ch = await client.channels.fetch(id).catch(() => null);
    if (!ch || ch.type !== 4 /* GuildCategory */) {
      logger.warn(`[support] Category '${key}': ID ${id} is not a category or inaccessible`);
    }
  }
}

module.exports = { ensureTicketHub, createTicketChannel, buildTicketIntroEmbed, validateTicketCategories };