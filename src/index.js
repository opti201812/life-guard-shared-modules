'use strict';

const os = require('os');
const { v4: uuidv4 } = require('uuid');
const { createTransport } = require('./transports/Transport');

function createTelemetry(config = {}) {
  if (!config.appId) {
    throw new Error('createTelemetry 缺少必填配置 appId');
  }

  const base = {
    appId: config.appId,
    instanceId: config.instanceId || os.hostname(),
    version: config.version,
    env: config.env,
  };

  // 实例化 transports（骨架：未知类型容错跳过，不崩）
  const transports = [];
  for (const cfg of config.transports || []) {
    try {
      transports.push(createTransport(cfg));
    } catch (e) {
      console.warn(`[app-telemetry] 跳过无效 transport: ${e.message}`);
    }
  }

  const reporter = {
    start() { /* 阶段后续填充定时逻辑 */ },
    async flushNow() { return { ok: true, skipped: true }; },
  };

  const diagnostics = {
    async collect({ userMessage, extra } = {}) {
      const ref = uuidv4().slice(0, 8);
      return { ok: true, skipped: true, ref };
    },
  };

  async function shutdown() { /* 阶段后续填充 */ }

  return { reporter, diagnostics, shutdown, _base: base, _transports: transports };
}

module.exports = { createTelemetry };
