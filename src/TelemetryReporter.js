'use strict';

const schedule = require('node-schedule');
const { buildEnvelope } = require('./envelope');

class TelemetryReporter {
  constructor({ base, dispatch, errorCounter, schedule: cron = '0 * * * *', sendOnExit = true, startedAt }) {
    this.base = base;
    this.dispatch = dispatch;
    this.errorCounter = errorCounter;
    this.cron = cron;
    this.sendOnExit = sendOnExit;
    this.startedAt = startedAt;
    this.job = null;
    this._exitBound = null;
  }

  async flushNow(final = false) {
    const data = {
      startedAt: this.startedAt,
      uptimeMs: Date.now() - new Date(this.startedAt).getTime(),
      lastHeartbeatAt: new Date().toISOString(),
      errorCount: this.errorCounter ? this.errorCounter.getAndReset() : undefined,
    };
    if (final) data.final = true;
    await this.dispatch(buildEnvelope({ kind: 'summary', base: this.base, data }));
  }

  start() {
    if (this.job) return;
    this.job = schedule.scheduleJob(this.cron, () => { this.flushNow().catch(() => {}); });
    if (this.sendOnExit) {
      // 仅注册 beforeExit 作为「事件循环自然排空」时的兜底上报；
      // SIGTERM/SIGINT 不在此注册——信号退出由宿主 await shutdown() 负责，
      // 否则会与宿主的关闭流程并发触发 flushNow，产生重复 final 摘要，
      // 且此处无法阻塞进程退出，HTTP 会被 process.exit 强杀而发不出去。
      this._exitBound = () => { this.flushNow(true).catch(() => {}); };
      process.once('beforeExit', this._exitBound);
    }
  }

  stop() {
    if (this.job) { this.job.cancel(); this.job = null; }
    if (this._exitBound) {
      process.removeListener('beforeExit', this._exitBound);
      this._exitBound = null;
    }
  }
}

module.exports = { TelemetryReporter };
