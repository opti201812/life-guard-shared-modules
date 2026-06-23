'use strict';

const axios = require('axios');
const { Transport } = require('./Transport');

const VENDORS = ['axiom', 'grafanaLoki'];

// Axiom edge deployment 的 ingest 域名（见 https://axiom.co/docs/reference/edge-deployments）
const AXIOM_HOSTS = {
  'us-east-1': 'api.axiom.co',
  'eu-central-1': 'eu-central-1.aws.edge.axiom.co',
};

class HttpIngestTransport extends Transport {
  constructor(cfg = {}) {
    super(cfg);
    if (!VENDORS.includes(cfg.vendor)) {
      throw new Error(`HttpIngestTransport.vendor 必须是 ${VENDORS.join('/')}，收到: ${cfg.vendor}`);
    }
    this.vendor = cfg.vendor;
    this.token = cfg.token;
    this.timeout = cfg.timeout || 5000;

    if (this.vendor === 'axiom') {
      if (!cfg.dataset) throw new Error('HttpIngestTransport(axiom) 缺少必填配置 dataset');
      this.dataset = cfg.dataset;
      this.region = cfg.region || 'us-east-1';
      const host = AXIOM_HOSTS[this.region];
      if (!host) throw new Error(`HttpIngestTransport(axiom) 未知 region: ${this.region}，支持: ${Object.keys(AXIOM_HOSTS).join('/')}`);
      // endpoint 显式配置时覆盖自动推导
      this.endpoint = cfg.endpoint || `https://${host}/v1/ingest/${this.dataset}`;
    } else {
      // grafanaLoki
      if (!cfg.endpoint) throw new Error('HttpIngestTransport(grafanaLoki) 缺少必填配置 endpoint');
      this.endpoint = cfg.endpoint;
      this.userId = cfg.userId;
    }
  }

  _toAxiom(envelope) {
    // NDJSON：每行一个 JSON 事件对象
    const body = JSON.stringify({ _time: envelope.timestamp, ...envelope });
    return {
      body,
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/x-ndjson' },
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

module.exports = { HttpIngestTransport, VENDORS, AXIOM_HOSTS };
