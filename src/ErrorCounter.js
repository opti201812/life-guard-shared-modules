'use strict';

class ErrorCounter {
  constructor() { this.count = 0; }

  attach(logger) {
    if (!logger || typeof logger.on !== 'function') return this;
    // winston logger 是可读流，'data' 事件吐出每条 info
    logger.on('data', (info) => {
      if (info && info.level === 'error') this.count += 1;
    });
    return this;
  }

  get() { return this.count; }

  getAndReset() {
    const n = this.count;
    this.count = 0;
    return n;
  }
}

module.exports = { ErrorCounter };
