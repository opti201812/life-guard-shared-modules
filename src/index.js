'use strict';

const os = require('os');
const { createTransport } = require('./transports/Transport');
const { buildEnvelope } = require('./envelope');
const { ErrorCounter } = require('./ErrorCounter');
const { DiagnosticsCollector } = require('./DiagnosticsCollector');
const { Spool } = require('./Spool');

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

  const spool = new Spool(config.spool || {});

  async function sendToTransports(envelope) {
    let anySuccess = false;
    for (const tr of transports) {
      if (!tr.accepts(envelope.kind)) continue;
      try {
        await tr.send(envelope);
        anySuccess = true;
      } catch (e) {
        console.warn(`[app-telemetry] 发送失败(${envelope.kind}): ${e.message}`);
      }
    }
    return anySuccess;
  }

  async function dispatch(envelope) {
    // 先尝试重发积压
    for (const file of spool.list()) {
      try {
        const env = spool.read(file);
        if (await sendToTransports(env)) spool.remove(file);
      } catch (e) {
        // 读取异常跳过，保留待下次
      }
    }
    // 发送当前 envelope；全部失败则入队等下次重发
    const ok = await sendToTransports(envelope);
    if (!ok) spool.push(envelope);
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

  const diagCfg = config.diagnostics || {};
  const diagnosticsCollector = new DiagnosticsCollector({
    base,
    dispatch,
    logDir: diagCfg.logDir,
    maxLogBytes: diagCfg.maxLogBytes,
    envWhitelist: diagCfg.envWhitelist,
  });

  const diagnostics = {
    collect: (args) => diagnosticsCollector.collect(args),
  };

  async function shutdown() { /* Task 13 接入 */ }

  return { reporter, diagnostics, shutdown, _base: base, _transports: transports };
}

module.exports = { createTelemetry };
