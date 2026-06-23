'use strict';

const os = require('os');

function collectEnv(whitelist = []) {
  const mem = process.memoryUsage();
  const env = {};
  for (const key of whitelist) {
    if (process.env[key] !== undefined) env[key] = process.env[key];
  }
  return {
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    hostname: os.hostname(),
    memory: { rss: mem.rss, heapUsed: mem.heapUsed },
    env,
  };
}

module.exports = { collectEnv };
