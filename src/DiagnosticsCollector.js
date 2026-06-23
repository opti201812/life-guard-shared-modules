'use strict';

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { buildEnvelope } = require('./envelope');
const { collectEnv } = require('./env');

function readLogTail(logDir, maxBytes) {
  try {
    const files = fs.readdirSync(logDir)
      .filter((f) => f.endsWith('.log'))
      .map((f) => ({ f, m: fs.statSync(path.join(logDir, f)).mtimeMs }))
      .sort((a, b) => b.m - a.m);
    if (files.length === 0) return '<unavailable: no .log files>';
    const target = path.join(logDir, files[0].f);
    const { size } = fs.statSync(target);
    const start = Math.max(0, size - maxBytes);
    const fd = fs.openSync(target, 'r');
    try {
      const len = size - start;
      const buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, start);
      return buf.toString('utf8');
    } finally {
      fs.closeSync(fd);
    }
  } catch (e) {
    return `<unavailable: ${e.message}>`;
  }
}

class DiagnosticsCollector {
  constructor({ base, dispatch, logDir = 'logs', maxLogBytes = 256 * 1024, envWhitelist = [] }) {
    this.base = base;
    this.dispatch = dispatch;
    this.logDir = logDir;
    this.maxLogBytes = maxLogBytes;
    this.envWhitelist = envWhitelist;
  }

  async collect({ userMessage, extra } = {}) {
    const ref = uuidv4().slice(0, 8);
    const logs = readLogTail(this.logDir, this.maxLogBytes);
    const envelope = buildEnvelope({
      kind: 'diagnostics',
      base: this.base,
      ref,
      data: {
        userMessage,
        extra,
        env: collectEnv(this.envWhitelist),
        logs,
      },
    });
    await this.dispatch(envelope);
    return { ok: true, ref };
  }
}

module.exports = { DiagnosticsCollector, readLogTail };
