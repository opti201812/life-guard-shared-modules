'use strict';
require('dotenv').config();
const { createTelemetry } = require('@life-guard/app-telemetry');

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
  env: 'demo',
  transports,
});

(async () => {
  console.log('发送一次摘要...');
  console.log(await telemetry.reporter.flushNow());

  console.log('发送一次诊断...');
  console.log(await telemetry.diagnostics.collect({
    userMessage: '示例：用户反馈页面卡顿',
    extra: { screen: 'demo' },
  }));

  await telemetry.shutdown();
  console.log('完成。去 Axiom/Grafana 控制台查看是否收到 example-backend 的数据。');
})();
