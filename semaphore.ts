// Lightweight counting semaphore with FIFO queue.
// Provides acquire/release plus a convenience use() wrapper.

export class Semaphore {
  private readonly maxConcurrency: number;
  private currentCount = 0;
  private queue: Array<() => void> = [];

  constructor(maxConcurrency: number) {
    if (!Number.isInteger(maxConcurrency) || maxConcurrency <= 0) {
      throw new Error(`Semaphore maxConcurrency must be a positive integer (got ${maxConcurrency})`);
    }
    this.maxConcurrency = maxConcurrency;
  }

  async acquire(): Promise<void> {
    if (this.currentCount < this.maxConcurrency) {
      this.currentCount++;
      return;
    }
    await new Promise<void>(resolve => this.queue.push(resolve));
    this.currentCount++;
  }

  release(): void {
    if (this.currentCount === 0) {
      return;
    }
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      // next is defined because length > 0
      next!();
    } else {
      this.currentCount--;
    }
  }

  async use<T>(fn: () => Promise<T> | T): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

}

export default Semaphore;