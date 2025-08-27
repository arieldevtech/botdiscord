const MS = 1000;

function getCooldownStore(client, commandName) {
  if (!client.cooldowns.has(commandName)) {
    client.cooldowns.set(commandName, new Map());
  }
  return client.cooldowns.get(commandName);
}

function checkAndSetCooldown(client, userId, command, cooldownSec = 3) {
  const store = getCooldownStore(client, command.data.name);
  const now = Date.now();
  const expiresAt = store.get(userId) || 0;
  if (now < expiresAt) {
    const remaining = Math.ceil((expiresAt - now) / MS);
    return { allowed: false, remaining };
  }
  store.set(userId, now + cooldownSec * MS);
  return { allowed: true, remaining: 0 };
}

module.exports = { checkAndSetCooldown };