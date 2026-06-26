'use strict';

const os = require('os');
const { createTransport } = require('./transports/Transport');
const { ErrorCounter } = require('./ErrorCounter');
const { DiagnosticsCollector } = require('./DiagnosticsCollector');
const { Spool } = require('./Spool');
const { TelemetryReporter } = require('./TelemetryReporter');

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

  const summaryCfg = config.summary || {};
  const reporterImpl = new TelemetryReporter({
    base,
    dispatch,
    errorCounter,
    schedule: summaryCfg.schedule,
    sendOnExit: summaryCfg.sendOnExit,
    startedAt,
  });

  const reporter = {
    start: () => reporterImpl.start(),
    flushNow: (final) => reporterImpl.flushNow(final).then(() => ({ ok: true })),
  };

  if (summaryCfg.enabled !== false) {
    reporterImpl.start();
    // 启动即上报一次：不等结果（失败有定时重试与 Spool 兜底），
    // 便于在 Axiom 第一时间看到实例上线事件，而非等到首个 cron 周期。
    reporterImpl.flushNow().catch(() => {});
  }

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

  async function shutdown() {
    reporterImpl.stop();
    if (summaryCfg.sendOnExit !== false) {
      try { await reporterImpl.flushNow(true); } catch (_) {}
    }
  }

  return { reporter, diagnostics, shutdown, _base: base, _transports: transports, _reporterImpl: reporterImpl };
}

module.exports = { createTelemetry };
