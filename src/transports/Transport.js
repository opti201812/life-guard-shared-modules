'use strict';

class Transport {
  constructor(cfg = {}) {
    this.use = Array.isArray(cfg.use) ? cfg.use : null; // null = 接收所有
    this.cfg = cfg;
  }

  accepts(kind) {
    return this.use === null || this.use.includes(kind);
  }

  // eslint-disable-next-line no-unused-vars
  async send(envelope) {
    throw new Error('Transport.send not implemented');
  }
}

function createTransport(cfg = {}) {
  switch (cfg.type) {
    case 'httpIngest': {
      const { HttpIngestTransport } = require('./HttpIngestTransport');
      return new HttpIngestTransport(cfg);
    }
    // case 'webhook': return new WebhookTransport(cfg); // Task 8 接入
    default:
      throw new Error(`未知的 transport type: ${cfg.type}`);
  }
}

module.exports = { Transport, createTransport };
