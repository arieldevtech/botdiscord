const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { brandEmbed } = require("../lib/embeds");
const logger = require("../utils/logger");
const { syncFixedEmbed } = require("../utils/fixedEmbeds");
const config = require("../../config.json");

function sha256(text) {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

function readRulesContent() {
  const root = process.cwd();
  const jsonPath = path.join(root, "content", "rules.json");
  const mdPath = path.join(root, "content", "rules.md");
  if (fs.existsSync(jsonPath)) {
    try {
      const raw = fs.readFileSync(jsonPath, "utf8");
      const data = JSON.parse(raw);
      return { type: "json", raw, data };
    } catch (e) {
      logger.warn("rules.json exists but could not be parsed, falling back to raw hash");
      const raw = fs.readFileSync(jsonPath, "utf8");
      return { type: "json", raw, data: null };
    }
  }
  if (fs.existsSync(mdPath)) {
    const raw = fs.readFileSync(mdPath, "utf8");
    return { type: "md", raw, data: null };
  }
  return { type: "none", raw: "", data: null };
}

function buildRulesEmbedFromJson(json) {
  const title = json.title || "Server Rules";
  const version = json.version ?? null;
  const lastUpdated = json.lastUpdated || new Date().toISOString();
  const fields = [];
  const sections = Array.isArray(json.sections) ? json.sections : [];
  for (const sec of sections) {
    const name = sec.name || "Section";
    const items = Array.isArray(sec.items) ? sec.items : [];
    const value = items.map((i) => `- ${i}`).join("\n");
    fields.push({ name, value });
  }
  // Footer override to include version + lastUpdated
  const footerText = `© Bynex | Version v${version ?? "1"} | Last updated: ${lastUpdated}`;
  const embed = brandEmbed({ title, fields, footerText });
  return { embed, version, lastUpdated };
}

function buildRulesEmbedFromMd(raw) {
  const lines = raw.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  // Heuristic: create a single field with content if no sections
  const fields = [{ name: "Rules", value: lines.map((l) => `- ${l}`).join("\n") }];
  const lastUpdated = new Date().toISOString();
  const footerText = `© Bynex | Version v1 | Last updated: ${lastUpdated}`;
  const embed = brandEmbed({ title: "Server Rules", fields, footerText });
  return { embed, version: 1, lastUpdated };
}

async function syncRulesMessage(client) {
  const channelId = config.channels?.rulesChannelId;
  if (!channelId) {
    logger.warn("[rules] channels.rulesChannelId is not configured; skipping rules sync");
    return;
  }
  const content = readRulesContent();
  const hash = sha256(content.raw || "");
  let built;
  if (content.type === "json" && content.data) built = buildRulesEmbedFromJson(content.data);
  else if (content.type === "md") built = buildRulesEmbedFromMd(content.raw);
  else built = buildRulesEmbedFromMd("These rules will be updated soon.");

  await syncFixedEmbed(client, {
    slug: "rules",
    channelId,
    payload: { hash, version: built.version, lastUpdated: built.lastUpdated, embed: built.embed },
  });
}

module.exports = { syncRulesMessage };