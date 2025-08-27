const express = require("express");
const Stripe = require("stripe");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const logger = require("../utils/logger");
const { readJson, writeJson, ensureDir } = require("../utils/cache");
const config = require("../../config.json");

const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const STRIPE_PORT = Number(process.env.STRIPE_PORT || 8787);
const DOWNLOAD_SECRET = process.env.DOWNLOAD_URL_SECRET || "download_secret_change_me";

const stripe = new Stripe(STRIPE_KEY, { apiVersion: "2024-06-20" });

let discordClient = null;

function setDiscordClient(client) { discordClient = client; }

function signDownloadToken(filePath, userId, hours = 24) {
  const exp = Math.floor(Date.now() / 1000) + hours * 3600;
  const payload = JSON.stringify({ filePath, userId, exp });
  const b64 = Buffer.from(payload).toString("base64url");
  const sig = crypto.createHmac("sha256", DOWNLOAD_SECRET).update(b64).digest("hex");
  return `${b64}.${sig}`;
}

function verifyDownloadToken(token) {
  const [b64, sig] = token.split(".");
  const expected = crypto.createHmac("sha256", DOWNLOAD_SECRET).update(b64).digest("hex");
  if (sig !== expected) return { ok: false, error: "bad-signature" };
  try {
    const json = JSON.parse(Buffer.from(b64, "base64url").toString("utf8"));
    if (json.exp < Math.floor(Date.now() / 1000)) return { ok: false, error: "expired" };
    return { ok: true, data: json };
  } catch (e) { return { ok: false, error: "bad-payload" }; }
}

function productsBySku() {
  const map = {};
  for (const p of (config.products || [])) map[p.sku] = p;
  return map;
}

async function createCheckoutSession(payload) {
  const { discord_user_id, discord_username, sku, name, description, priceEUR, deliverableFile } = payload;
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency: "eur",
          product_data: { name, description },
          unit_amount: Math.round(Number(priceEUR) * 100),
        },
        quantity: 1,
      },
    ],
    success_url: `https://checkout.stripe.com/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `https://checkout.stripe.com/cancel`,
    metadata: {
      discord_user_id,
      discord_username,
      sku,
      deliverableFile: deliverableFile || "",
    },
  });

  // store pending session
  const sessions = readJson(".cache/sessions.json", {});
  sessions[session.id] = {
    discord_user_id,
    discord_username,
    sku,
    status: "pending",
    created_at: new Date().toISOString(),
  };
  writeJson(".cache/sessions.json", sessions);

  return { id: session.id, url: session.url, expires_at: session.expires_at };
}

function buildSuccessDM({ userId, sku, session, licenseKey, downloadToken }) {
  const p = productsBySku()[sku] || { name: sku, priceEUR: "-" };
  const link = downloadToken ? `[Download here](http://localhost:${STRIPE_PORT}/stripe/dl?token=${downloadToken})` : "—";
  return {
    title: "✅ Payment Successful",
    description: `Thank you for your purchase of **${p.name}**. Your payment has been processed successfully.`,
    fields: [
      { name: "Session", value: `\`${session}\``, inline: false },
      { name: "Price", value: `€${p.priceEUR}`, inline: true },
      { name: "Download", value: link, inline: true },
      licenseKey ? { name: "License Key", value: `\`${licenseKey}\``, inline: false } : null,
    ].filter(Boolean),
  };
}

function buildFailedDM({ session, reason }) {
  return {
    title: "❌ Payment Failed",
    description: "Unfortunately, your payment could not be processed. No charges were made.",
    fields: [
      { name: "Session", value: `\`${session}\``, inline: true },
      { name: "Reason", value: reason || "Unknown error", inline: false },
    ],
  };
}

function buildRefundDM({ session, amount, currency }) {
  return {
    title: "💰 Refund Processed",
    description: "Your refund has been processed successfully and will appear in your account soon.",
    fields: [
      { name: "Session", value: `\`${session}\``, inline: true },
      { name: "Amount", value: `${(amount / 100).toFixed(2)} ${String(currency || "").toUpperCase()}`, inline: true },
    ],
  };
}

async function sendDM(userId, embedPayload) {
  if (!discordClient) return;
  try {
    const user = await discordClient.users.fetch(userId);
    const { brandEmbed } = require("../lib/embeds");
    await user.send({ embeds: [brandEmbed(embedPayload)] });
  } catch (e) {
    logger.warn(`[stripe] Failed to DM user ${userId}: ${e.message}`);
  }
}

function generateLicenseKey(userId, sku) {
  const raw = `${userId}:${sku}:${Date.now()}`;
  return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 24).toUpperCase();
}

function ensureCacheFiles() {
  ensureDir(path.join(process.cwd(), ".cache"));
  for (const f of ["sessions.json", "orders.json", "licenses.json"]) {
    const p = path.join(process.cwd(), ".cache", f);
    if (!fs.existsSync(p)) fs.writeFileSync(p, "{}", "utf8");
  }
}

function startServer(client) {
  ensureCacheFiles();
  setDiscordClient(client);
  const app = express();

  // Webhook FIRST with raw body
  app.post("/stripe/webhook", express.raw({ type: "application/json" }), async (req, res) => {
    let event;
    try {
      const sig = req.headers["stripe-signature"];
      event = Stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      logger.error("Webhook signature verification failed", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
      if (event.type === "checkout.session.completed") {
        const session = event.data.object;
        const meta = session.metadata || {};
        const sessions = readJson(".cache/sessions.json", {});
        const orders = readJson(".cache/orders.json", {});
        // Idempotency: if already processed, skip
        if (orders[session.id]?.status === "paid") {
          logger.info(`[stripe] Duplicate completed webhook ignored for ${session.id}`);
          return res.json({ received: true });
        }

        // Mark order
        orders[session.id] = {
          session_id: session.id,
          sku: meta.sku,
          user: meta.discord_user_id,
          amount: session.amount_total,
          currency: session.currency,
          status: "paid",
          created_at: new Date().toISOString(),
        };
        writeJson(".cache/orders.json", orders);

        // License + download (if any)
        let licenseKey = null;
        let downloadToken = null;
        if (meta.deliverableFile) {
          licenseKey = generateLicenseKey(meta.discord_user_id, meta.sku);
          const licenses = readJson(".cache/licenses.json", {});
          licenses[licenseKey] = {
            user: meta.discord_user_id,
            sku: meta.sku,
            session_id: session.id,
            created_at: new Date().toISOString(),
            revoked: false,
          };
          writeJson(".cache/licenses.json", licenses);
          downloadToken = signDownloadToken(meta.deliverableFile, meta.discord_user_id, 24);
        }

        // DM user
        await sendDM(meta.discord_user_id, buildSuccessDM({ userId: meta.discord_user_id, sku: meta.sku, session: session.id, licenseKey, downloadToken }));
        // Update sessions cache
        if (sessions[session.id]) { sessions[session.id].status = "completed"; writeJson(".cache/sessions.json", sessions); }
      }

      if (event.type === "payment_intent.payment_failed") {
        const intent = event.data.object;
        try {
          const list = await stripe.checkout.sessions.list({ payment_intent: intent.id, limit: 1 });
          const session = list.data?.[0];
          const meta = session?.metadata || {};
          if (meta.discord_user_id) {
            await sendDM(meta.discord_user_id, buildFailedDM({ session: session.id, reason: intent.last_payment_error?.message }));
          }
        } catch (e) { logger.warn("payment_failed DM issue", e.message); }
      }

      if (event.type === "charge.refunded") {
        const charge = event.data.object;
        try {
          const pi = charge.payment_intent;
          const list = await stripe.checkout.sessions.list({ payment_intent: pi, limit: 1 });
          const session = list.data?.[0];
          const meta = session?.metadata || {};
          if (meta.discord_user_id) {
            await sendDM(meta.discord_user_id, buildRefundDM({ session: session.id, amount: charge.amount_refunded, currency: charge.currency }));
          }
        } catch (e) { logger.warn("refund DM issue", e.message); }
      }

      return res.json({ received: true });
    } catch (e) {
      logger.error("Webhook handling error", e);
      return res.status(500).send("Webhook handler error");
    }
  });

  // JSON parser for all other routes
  app.use(express.json());

  // Checkout endpoint
  app.post("/stripe/checkout", async (req, res) => {
    try {
      const { sku, discord_user_id, discord_username } = req.body || {};
      const p = productsBySku()[sku];
      if (!p) return res.status(404).json({ error: "product_not_found" });
      const session = await createCheckoutSession({
        discord_user_id,
        discord_username,
        sku: p.sku,
        name: p.name,
        description: p.description,
        priceEUR: p.priceEUR,
        deliverableFile: p.deliverableFile || null,
      });
      return res.json(session);
    } catch (e) {
      logger.error("/stripe/checkout error", e);
      return res.status(500).json({ error: "checkout_failed" });
    }
  });

  // Signed download (dev/demo only)
  app.get("/stripe/dl", async (req, res) => {
    const token = req.query.token;
    if (!token) return res.status(400).send("Missing token");
    const ver = verifyDownloadToken(token);
    if (!ver.ok) return res.status(403).send("Invalid or expired token");
    const rel = path.join("files", ver.data.filePath);
    const abs = path.join(process.cwd(), rel);
    if (!fs.existsSync(abs)) return res.status(404).send("File not found");
    return res.sendFile(abs);
  });

  app.listen(STRIPE_PORT, () => {
    logger.success(`[stripe] Express listening on :${STRIPE_PORT}`);
  });
}

module.exports = { startServer, createCheckoutSession, setDiscordClient };