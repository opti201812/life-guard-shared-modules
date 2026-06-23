'use strict';

const axios = require('axios');
const { Transport } = require('./Transport');

class WebhookTransport extends Transport {
  constructor(cfg = {}) {
    super(cfg);
    if (!cfg.url) throw new Error('WebhookTransport 缺少必填配置 url');
    this.url = cfg.url;
    this.timeout = cfg.timeout || 5000;
  }

  _render(envelope) {
    const d = envelope.data || {};
    if (envelope.kind === 'summary') {
      return [
        `【应用摘要】${envelope.appId} (${envelope.env || '-'})`,
        `时间: ${envelope.timestamp}`,
        `启动: ${d.startedAt || '-'}`,
        `运行时长: ${Math.round((d.uptimeMs || 0) / 1000)}s`,
        `错误数: ${d.errorCount != null ? d.errorCount : '-'}`,
      ].join('\n');
    }
    return [
      `【诊断上报】${envelope.appId} (${envelope.env || '-'})`,
      `ref: ${envelope.ref}`,
      `用户描述: ${d.userMessage || '-'}`,
    ].join('\n');
  }

  async send(envelope) {
    const body = { msgtype: 'text', text: { content: this._render(envelope) } };
    await axios.post(this.url, body, { timeout: this.timeout });
  }
}

module.exports = { WebhookTransport };
