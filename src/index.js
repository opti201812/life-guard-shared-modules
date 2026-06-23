'use strict';

const os = require('os');
const { v4: uuidv4 } = require('uuid');
const { createTransport } = require('./transports/Transport');
const { buildEnvelope } = require('./envelope');
const { ErrorCounter } = require('./ErrorCounter');

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

  const startedAt = new Date().toISOString();

  const errorCounter = config.logger ? new ErrorCounter().attach(config.logger) : null;

  async function dispatch(envelope) {
    for (const tr of transports) {
      if (!tr.accepts(envelope.kind)) continue;
      try {
        await tr.send(envelope);
      } catch (e) {
        console.warn(`[app-telemetry] 发送失败(${envelope.kind}): ${e.message}`);
        // Spool 重试在 Task 12 接入
      }
    }
  }

  const reporter = {
    start() { /* Task 13 接入定时逻辑 */ },
    async flushNow() {
      const envelope = buildEnvelope({
        kind: 'summary',
        base,
        data: {
          startedAt,
          uptimeMs: Date.now() - new Date(startedAt).getTime(),
          errorCount: errorCounter ? errorCounter.getAndReset() : undefined,
        },
      });
      await dispatch(envelope);
      return { ok: true };
    },
  };

  const diagnostics = {
    async collect({ userMessage, extra } = {}) {
      const ref = uuidv4().slice(0, 8);
      const envelope = buildEnvelope({
        kind: 'diagnostics',
        base,
        ref,
        data: { userMessage, extra },
      });
      await dispatch(envelope);
      return { ok: true, ref };
    },
  };

  async function shutdown() { /* Task 13 接入 */ }

  return { reporter, diagnostics, shutdown, _base: base, _transports: transports };
}

module.exports = { createTelemetry };
