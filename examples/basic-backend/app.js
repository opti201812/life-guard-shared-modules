'use strict';
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const winston = require('winston');
const { createTelemetry } = require('@life-guard/app-telemetry');

// 准备日志目录，供诊断 collect 读取
const logDir = 'logs';
fs.mkdirSync(logDir, { recursive: true });

// 宿主应用自己的 winston logger（模块会挂 transport 计数 error）
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json(),
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: path.join(logDir, 'combined.log') }),
  ],
});

const transports = [];
if (process.env.AXIOM_TOKEN) {
  transports.push({
    type: 'httpIngest', vendor: 'axiom',
    region: process.env.AXIOM_REGION || 'us-east-1',
    dataset: process.env.AXIOM_DATASET || 'life-guard',
    token: process.env.AXIOM_TOKEN,
    use: ['summary', 'diagnostics'],
  });
}
if (process.env.GRAFANA_TOKEN) {
  transports.push({
    type: 'httpIngest', vendor: 'grafanaLoki',
    endpoint: process.env.GRAFANA_LOKI_URL,
    userId: process.env.GRAFANA_USER_ID, token: process.env.GRAFANA_TOKEN,
    use: ['summary', 'diagnostics'],
  });
}

const telemetry = createTelemetry({
  appId: 'example-backend',
  version: '0.0.1',
  env: process.env.NODE_ENV || 'demo',
  logger,                                 // 注入 logger → 自动计数 error
  transports,
  diagnostics: { logDir, maxLogBytes: 256 * 1024, envWhitelist: ['NODE_ENV'] },
});

(async () => {
  logger.info('应用启动');

  // 模拟运行期间产生若干 error（会被 ErrorCounter 计入摘要的 errorCount）
  logger.error('模拟错误：数据库连接超时');
  logger.error('模拟错误：某接口返回 500');

  console.log('1) 发送摘要（含 errorCount）...');
  console.log(await telemetry.reporter.flushNow());

  console.log('2) 发送诊断（含最近日志 + 运行环境 + 用户描述）...');
  const r = await telemetry.diagnostics.collect({
    userMessage: '示例：用户反馈页面卡顿',
    extra: { screen: 'demo', reportedBy: '测试人员' },
  });
  console.log('   ref =', r.ref);

  await telemetry.shutdown();
  logger.info('应用关闭');
  console.log('\n完成。去 Axiom/Grafana 控制台查看 example-backend 的 summary 与 diagnostics 事件。');
  // winston 的 transports 可能让进程不退出，强制退出
  process.exit(0);
})();
