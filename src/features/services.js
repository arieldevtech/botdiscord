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

function readServicesContent() {
  const root = process.cwd();
  const jsonPath = path.join(root, "content", "services.json");
  
  if (fs.existsSync(jsonPath)) {
    try {
      const raw = fs.readFileSync(jsonPath, "utf8");
      const data = JSON.parse(raw);
      return { type: "json", raw, data };
    } catch (e) {
      logger.warn("services.json exists but could not be parsed");
      const raw = fs.readFileSync(jsonPath, "utf8");
      return { type: "json", raw, data: null };
    }
  }
  
  return { type: "none", raw: "", data: null };
}

function buildServicesEmbedFromJson(json) {
  const title = json.title || "Our Services";
  const version = json.version ?? null;
  const lastUpdated = json.lastUpdated || new Date().toISOString();
  
  const description = [
    "🚀 **Transform Your Vision Into Reality**",
    "",
    "We offer **three core services** to bring your Minecraft vision to life. Whether you need custom development, professional builds, or a complete server solution, our expert team delivers exceptional results that exceed expectations.",
    "",
    "🎯 **Our Three Main Services:**",
    "",
    "🔧 **Plugin Development** — Custom Minecraft plugins of any type and complexity",
    "🏗️ **Minecraft Building** — Professional builds for any style or purpose", 
    "🎮 **Complete Server Setup** — Full server solutions with all plugins + maps included",
    "",
    "💎 **Why Choose Us?**",
    "• **Expert Team** — Years of experience in Minecraft development & building",
    "• **Complete Solutions** — From single plugins to entire server ecosystems",
    "• **Quality Guarantee** — We stand behind our work with ongoing support",
    "• **Turnkey Service** — Ready-to-launch servers with everything included"
  ].join("\n");

  const fields = [];
  const sections = Array.isArray(json.sections) ? json.sections : [];
  
  for (const sec of sections) {
    const name = `${sec.emoji || "📋"} **${sec.name || "Section"}**`;
    const items = Array.isArray(sec.items) ? sec.items : [];
    const value = items.map((i) => `${i}`).join("\n");
    fields.push({ name, value, inline: false });
  }

  // Add call-to-action field
  fields.push({
    name: "🚀 **Ready to Transform Your Server?**",
    value: [
      "Choose from our three specialized services and let us bring your vision to life:",
      "",
      "🎫 **Get Started:** Open a ticket in <#1407818322703290532>",
      "💬 **Free Consultation:** Discuss your project requirements with our experts",
      "📋 **Custom Quote:** Receive a detailed estimate tailored to your needs",
      "",
      "**From simple plugins to complete server ecosystems — we've got you covered!**"
    ].join("\n"),
    inline: false
  });

  const footerText = `© Bynex | Professional Minecraft Services | Last updated: ${new Date(lastUpdated).toLocaleDateString()}`;
  const embed = brandEmbed({ 
    title: `🎮 ${title}`, 
    description,
    fields, 
    footerText 
  });
  
  return { embed, version, lastUpdated };
}

async function syncServicesMessage(client) {
  const channelId = config.servicesChannelId;
  if (!channelId) {
    logger.warn("[services] servicesChannelId is not configured; skipping services sync");
    return;
  }
  
  const content = readServicesContent();
  const hash = sha256(content.raw || "");
  
  let built;
  if (content.type === "json" && content.data) {
    built = buildServicesEmbedFromJson(content.data);
  } else {
    // Create default services content
    const defaultServices = {
      version: 1,
      title: "Our Professional Services",
      lastUpdated: new Date().toISOString(),
      sections: [
        {
          name: "Development Services",
          emoji: "🔧",
          items: ["Custom Minecraft plugins and solutions"]
        }
      ]
    };
    built = buildServicesEmbedFromJson(defaultServices);
  }

  await syncFixedEmbed(client, {
    slug: "services",
    channelId,
    payload: { 
      hash, 
      version: built.version, 
      lastUpdated: built.lastUpdated, 
      embed: built.embed 
    },
  });
}

module.exports = { syncServicesMessage };