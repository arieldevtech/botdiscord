/** Simple in-memory TTL cache and per-user LRU memory */
class TTLCache {
  constructor() { this.map = new Map(); }
  set(key, value, ttlMs) { this.map.set(key, { value, expires: Date.now() + ttlMs }); }
  get(key) {
    const v = this.map.get(key);
    if (!v) return null;
    if (Date.now() > v.expires) { this.map.delete(key); return null; }
    return v.value;
  }
}

class UserLRU {
  constructor(limit = 5) { this.limit = limit; this.map = new Map(); }
  remember(userId, item) {
    const arr = this.map.get(userId) || [];
    const filtered = [item, ...arr.filter((x) => x.toLowerCase() !== item.toLowerCase())];
    this.map.set(userId, filtered.slice(0, this.limit));
  }
  suggestions(userId, prefix = "") {
    const arr = this.map.get(userId) || [];
    const p = prefix.toLowerCase();
    return arr.filter((x) => x.toLowerCase().startsWith(p));
  }
}

module.exports = { TTLCache, UserLRU };