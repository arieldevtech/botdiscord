const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const logger = require("./logger");
const { brandEmbed } = require("../lib/embeds");
const { readJson, writeJson, ensureDir } = require("./cache");

function sha256(text) {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

function cacheFileFor(slug) {
  return path.join(process.cwd(), ".cache", `${slug}.json`);
}

async function fetchMessageById(channel, id) {
  try {
    const msg = await channel.messages.fetch(id);
    return msg || null;
  } catch (_) {
    return null;
  }
}

/**
 * Generic fixed-embed sync utility that pins a single message and edits it when content changes.
 * @param {import('discord.js').Client} client
 * @param {{ slug: string, channelId: string, payload: { hash: string, version?: string|number, lastUpdated?: string, embed: any } }} options
 */
async function syncFixedEmbed(client, { slug, channelId, payload }) {
  if (!channelId) {
    logger.warn(`[fixedEmbeds:${slug}] Missing channelId in config; skipping`);
    return;
  }
  const guild = client.guilds.cache.get(client?.application?.guild?.id) || client.guilds.cache.first();
  const channel = client.channels.cache.get(channelId) || (await client.channels.fetch(channelId).catch(() => null));
  if (!channel) {
    logger.warn(`[fixedEmbeds:${slug}] Channel ${channelId} not found or not accessible`);
    return;
  }

  const cachePath = cacheFileFor(slug);
  const cache = readJson(cachePath, {});

  const { hash, version, lastUpdated, embed } = payload;
  const changed = cache.lastAppliedHash !== hash;

  // Helper to post & pin, then persist cache
  const postAndPin = async () => {
    try {
      const message = await channel.send({ embeds: [embed] });
      try { await message.pin(); } catch (_) {}
      writeJson(cachePath, { messageId: message.id, lastAppliedHash: hash, lastAppliedVersion: version ?? null, lastUpdated: lastUpdated || new Date().toISOString() });
      logger.success(`[fixedEmbeds:${slug}] Posted and pinned message (${message.id})`);
    } catch (e) {
      logger.error(`[fixedEmbeds:${slug}] Failed to post message:`, e);
    }
  };

  if (!cache.messageId) {
    await postAndPin();
    return;
  }

  // Always check whether the cached message still exists in the channel
  const existing = await fetchMessageById(channel, cache.messageId);
  if (!existing) {
    // Message deleted or not accessible anymore: recreate regardless of change
    await postAndPin();
    return;
  }

  // Ensure it's pinned (best-effort)
  try { if (!existing.pinned) await existing.pin(); } catch (_) {}

  if (!changed) {
    logger.info(`[fixedEmbeds:${slug}] No changes detected; keeping current message (${existing.id})`);
    return;
  }

  // Edit existing message content
  try {
    await existing.edit({ embeds: [embed] });
    writeJson(cachePath, { messageId: existing.id, lastAppliedHash: hash, lastAppliedVersion: version ?? null, lastUpdated: lastUpdated || new Date().toISOString() });
    logger.success(`[fixedEmbeds:${slug}] Edited pinned message (${existing.id})`);
  } catch (e) {
    logger.error(`[fixedEmbeds:${slug}] Failed to edit message:`, e);
  }
}

/** Build rules payload from JSON or Markdown content */
function buildRulesPayload() {
  const root = process.cwd();
  const jsonPath = path.join(root, "content", "rules.json");
  const mdPath = path.join(root, "content", "rules.md");
  ensureDir(path.dirname(jsonPath));

  let title = "Server Rules";
  let lines = [];
  let version = undefined;
  let lastUpdated = new Date().toISOString();
  let rawContent = "";

  if (fs.existsSync(jsonPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
      title = data.title || title;
      lines = Array.isArray(data.lines) ? data.lines : [];
      version = data.version ?? undefined;
      lastUpdated = data.lastUpdated || lastUpdated;
      rawContent = JSON.stringify(data);
    } catch (e) {
      rawContent = fs.readFileSync(jsonPath, "utf8");
    }
  } else if (fs.existsSync(mdPath)) {
    rawContent = fs.readFileSync(mdPath, "utf8");
    // Split into lines ignoring empty
    lines = rawContent.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  } else {
    // Create a default rules.json to guide users
    const defaultData = {
      version: 1,
      title: "Server Rules",
      lines: [
        "Be respectful to everyone.",
        "No spam, ads, or self-promo.",
        "Use the right channels for each topic.",
      ],
      lastUpdated,
    };
    writeJson(jsonPath, defaultData);
    title = defaultData.title;
    lines = defaultData.lines;
    version = defaultData.version;
    rawContent = JSON.stringify(defaultData);
  }

  const hash = sha256(rawContent);
  const bullets = lines.map((l) => `• ${l}`).join("\n");
  const vLabel = version ? `v${version}` : `#${hash.substring(0, 7)}`;

  const embed = brandEmbed({
    title: `${title} — Version ${vLabel}`,
    description: bullets + "\n\n" + `Last updated: ${lastUpdated}`,
  });

  return { hash, version: version ?? null, lastUpdated, embed };
}

module.exports = { syncFixedEmbed, buildRulesPayload };