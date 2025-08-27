const fs = require("fs");
const path = require("path");
const logger = require("../utils/logger");

async function loadEvents(client, eventsDir) {
  let totalLoaded = 0;

  if (!fs.existsSync(eventsDir)) {
    logger.warn(`Events directory not found at ${eventsDir}. Creating one.`);
    fs.mkdirSync(eventsDir, { recursive: true });
  }

  const files = fs.readdirSync(eventsDir).filter((f) => f.endsWith(".js"));

  for (const file of files) {
    const filePath = path.join(eventsDir, file);
    try {
      const event = require(filePath);
      if (!event?.name || !event?.execute) {
        logger.warn(`Skipping invalid event at ${filePath}`);
        continue;
      }

      if (event.once) {
        client.once(event.name, (...args) => event.execute(...args, client));
      } else {
        client.on(event.name, (...args) => event.execute(...args, client));
      }
      totalLoaded += 1;
    } catch (err) {
      logger.error(`Failed to load event ${filePath}`, err);
    }
  }

  logger.success(`Events loaded: ${totalLoaded}`);
  return totalLoaded;
}

module.exports = { loadEvents };