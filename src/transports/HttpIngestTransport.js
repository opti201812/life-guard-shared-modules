'use strict';

const axios = require('axios');
const { Transport } = require('./Transport');

const VENDORS = ['axiom', 'grafanaLoki'];

class HttpIngestTransport extends Transport {
  constructor(cfg = {}) {
    super(cfg);
    if (!VENDORS.includes(cfg.vendor)) {
      throw new Error(`HttpIngestTransport.vendor 必须是 ${VENDORS.join('/')}，收到: ${cfg.vendor}`);
    }
    this.vendor = cfg.vendor;
    this.endpoint = cfg.endpoint;
    this.token = cfg.token;
    this.dataset = cfg.dataset;
    this.userId = cfg.userId;
    this.timeout = cfg.timeout || 5000;
  }

  _toAxiom(envelope) {
    return {
      body: [{ _time: envelope.timestamp, ...envelope }],
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
    };
  }

  _toLoki(envelope) {
    const unixNano = `${new Date(envelope.timestamp).getTime()}000000`;
    const auth = 'Basic ' + Buffer.from(`${this.userId}:${this.token}`).toString('base64');
    return {
      body: {
        streams: [{
          stream: { app: envelope.appId, kind: envelope.kind },
          values: [[unixNano, JSON.stringify(envelope)]],
        }],
      },
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
    };
  }

  async send(envelope) {
    const { body, headers } = this.vendor === 'axiom'
      ? this._toAxiom(envelope)
      : this._toLoki(envelope);
    await axios.post(this.endpoint, body, { headers, timeout: this.timeout });
  }
}

module.exports = { HttpIngestTransport, VENDORS };
