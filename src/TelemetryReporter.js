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
      this._exitBound = () => { this.flushNow(true).catch(() => {}); };
      process.once('SIGTERM', this._exitBound);
      process.once('SIGINT', this._exitBound);
      process.once('beforeExit', this._exitBound);
    }
  }

  stop() {
    if (this.job) { this.job.cancel(); this.job = null; }
    if (this._exitBound) {
      process.removeListener('SIGTERM', this._exitBound);
      process.removeListener('SIGINT', this._exitBound);
      process.removeListener('beforeExit', this._exitBound);
      this._exitBound = null;
    }
  }
}

module.exports = { TelemetryReporter };
