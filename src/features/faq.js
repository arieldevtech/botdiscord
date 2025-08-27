const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { brandEmbed } = require("../lib/embeds");
const logger = require("../utils/logger");
const { syncFixedEmbed } = require("../utils/fixedEmbeds");
const config = require("../../config.json");

function sha256(text) {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

function readFaqContent() {
  const root = process.cwd();
  const jsonPath = path.join(root, "content", "faq.json");
  
  if (fs.existsSync(jsonPath)) {
    try {
      const raw = fs.readFileSync(jsonPath, "utf8");
      const data = JSON.parse(raw);
      return { type: "json", raw, data };
    } catch (e) {
      logger.warn("faq.json exists but could not be parsed");
      const raw = fs.readFileSync(jsonPath, "utf8");
      return { type: "json", raw, data: null };
    }
  }
  
  return { type: "none", raw: "", data: null };
}

function buildFaqMainEmbed(json) {
  const title = json.title || "Frequently Asked Questions";
  const version = json.version ?? null;
  const lastUpdated = json.lastUpdated || new Date().toISOString();
  
  const description = [
    "🔍 **Welcome to our FAQ section!**",
    "",
    "Find quick answers to the most common questions about our services, payments, and support system.",
    "",
    "**📋 How to use:**",
    "• Select a category from the dropdown below",
    "• Browse through questions and answers",
    "• Still need help? Open a support ticket!",
    "",
    "**💡 Can't find what you're looking for?**",
    "Don't hesitate to create a ticket in <#1407818322703290532> - our team is here to help!"
  ].join("\n");

  const sections = Array.isArray(json.sections) ? json.sections : [];
  const fields = sections.slice(0, 6).map(section => ({
    name: `${section.emoji || "📝"} ${section.name}`,
    value: `${section.items?.length || 0} question(s)`,
    inline: true
  }));

  const footerText = `© Bynex | FAQ v${version ?? "1"} | Last updated: ${lastUpdated}`;
  const embed = brandEmbed({ 
    title: `❓ ${title}`, 
    description,
    fields,
    footerText 
  });
  
  return { embed, version, lastUpdated };
}

function buildFaqSelectMenu(json) {
  const sections = Array.isArray(json.sections) ? json.sections : [];
  
  if (sections.length === 0) {
    return null;
  }

  const menu = new StringSelectMenuBuilder()
    .setCustomId("faq:select")
    .setPlaceholder("🔍 Choose a FAQ category...")
    .setMinValues(1)
    .setMaxValues(1);

  const options = sections.slice(0, 25).map(section => ({
    label: section.name,
    value: section.name.toLowerCase().replace(/[^a-z0-9]/g, '_'),
    description: `${section.items?.length || 0} questions available`,
    emoji: section.emoji || "📝"
  }));

  menu.addOptions(options);
  return new ActionRowBuilder().addComponents(menu);
}

function buildFaqCategoryEmbed(json, categoryKey) {
  const sections = Array.isArray(json.sections) ? json.sections : [];
  const section = sections.find(s => 
    s.name.toLowerCase().replace(/[^a-z0-9]/g, '_') === categoryKey
  );

  if (!section) {
    return brandEmbed({
      title: "❓ Category Not Found",
      description: "The requested FAQ category could not be found.",
    });
  }

  const items = Array.isArray(section.items) ? section.items : [];
  const fields = items.slice(0, 10).map((item, index) => ({
    name: `${index + 1}. ${item.question}`,
    value: item.answer,
    inline: false
  }));

  const embed = brandEmbed({
    title: `${section.emoji || "📝"} ${section.name}`,
    description: `Here are the most frequently asked questions about **${section.name.toLowerCase()}**:`,
    fields
  });

  return embed;
}

function buildFaqButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("faq:back")
      .setLabel("← Back to Categories")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("🔙"),
    new ButtonBuilder()
      .setCustomId("faq:support")
      .setLabel("Need More Help?")
      .setStyle(ButtonStyle.Primary)
      .setEmoji("🎫")
  );
}

async function syncFaqMessage(client) {
  const channelId = config.channels?.faqChannelId;
  if (!channelId) {
    logger.warn("[faq] channels.faqChannelId is not configured; skipping FAQ sync");
    return;
  }

  const content = readFaqContent();
  const hash = sha256(content.raw || "");
  
  let built;
  if (content.type === "json" && content.data) {
    built = buildFaqMainEmbed(content.data);
  } else {
    // Create default FAQ if none exists
    const defaultFaq = {
      version: 1,
      title: "Frequently Asked Questions",
      lastUpdated: new Date().toISOString(),
      sections: [
        {
          name: "General Questions",
          emoji: "❓",
          items: [
            {
              question: "How can I get support?",
              answer: "Open a ticket in <#1407818322703290532> and select the appropriate category."
            }
          ]
        }
      ]
    };
    built = buildFaqMainEmbed(defaultFaq);
  }

  // Create components
  const selectMenu = content.data ? buildFaqSelectMenu(content.data) : null;
  const components = selectMenu ? [selectMenu] : [];

  await syncFixedEmbed(client, {
    slug: "faq",
    channelId,
    payload: { 
      hash, 
      version: built.version, 
      lastUpdated: built.lastUpdated, 
      embed: built.embed,
      components 
    },
  });
}

module.exports = { 
  syncFaqMessage, 
  buildFaqCategoryEmbed, 
  buildFaqButtons,
  readFaqContent 
};