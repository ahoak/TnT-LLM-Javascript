class Semaphore {
  constructor(maxConcurrency) {
    this.maxConcurrency = maxConcurrency;
    this.currentCount = 0;
    this.queue = [];
  }
  async acquire() {
    if (this.currentCount < this.maxConcurrency) {
      this.currentCount++;
      return;
    }
    await new Promise(resolve => this.queue.push(resolve));
    this.currentCount++;
  }
  release() {
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      next();
    } else {
      this.currentCount--;
    }
  }
  async use(fn) {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}
module.exports = { Semaphore };