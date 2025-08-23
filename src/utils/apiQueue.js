/** Simple per-user sequential queue to avoid API burst */
class ApiQueue {
  constructor() { this.queues = new Map(); }
  enqueue(userId, fn) {
    const current = this.queues.get(userId) || Promise.resolve();
    const next = current.then(() => fn()).finally(() => {
      if (this.queues.get(userId) === next) this.queues.delete(userId);
    });
    this.queues.set(userId, next);
    return next;
  }
}

module.exports = { ApiQueue };