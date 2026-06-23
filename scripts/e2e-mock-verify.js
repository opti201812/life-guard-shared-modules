'use strict';
// 人工联调脚本：起本地 mock server，验证 app-telemetry 端到端真实发送（axiom + grafanaLoki 格式）。
// 用法：node scripts/e2e-mock-verify.js
// 无需真实账号——模拟 Axiom/Grafana 的 ingest endpoint。

const http = require('http');
const { createTelemetry } = require('../src');

const received = [];

const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    received.push({ url: req.url, auth: req.headers.authorization, body });
    res.writeHead(204, { 'Content-Type': 'application/json' });
    res.end('{}');
  });
});

server.listen(0, async () => {
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;
  console.log(`mock ingest server on ${base}`);

  const telemetry = createTelemetry({
    appId: 'example-backend',
    version: '0.0.1',
    env: 'demo',
    transports: [
      {
        type: 'httpIngest', vendor: 'axiom',
        endpoint: `${base}/v1/datasets/lifeguard/ingest`,
        token: 'xaat-test', dataset: 'lifeguard',
        use: ['summary', 'diagnostics'],
      },
      {
        type: 'httpIngest', vendor: 'grafanaLoki',
        endpoint: `${base}/loki/api/v1/push`,
        userId: '12345', token: 'glc-token',
        use: ['summary', 'diagnostics'],
      },
    ],
  });

  console.log('发送摘要...');
  await telemetry.reporter.flushNow();

  console.log('发送诊断...');
  const r = await telemetry.diagnostics.collect({
    userMessage: '示例：用户反馈页面卡顿',
    extra: { screen: 'demo' },
  });
  await telemetry.shutdown();

  console.log(`\n收到 ${received.length} 次请求，ref=${r.ref}`);
  let ok = true;
  for (const req of received) {
    console.log('\n---', req.url, '| auth:', req.auth);
    try {
      const parsed = JSON.parse(req.body);
      if (req.url.includes('/v1/datasets/')) {
        // axiom: 事件数组
        const ev = parsed[0];
        console.log('  axiom event:', { kind: ev.kind, appId: ev.appId, _time: ev._time });
        if (!Array.isArray(parsed) || !ev.appId) ok = false;
      } else if (req.url.includes('/loki/api/v1/push')) {
        // grafana: streams
        const line = parsed.streams[0].values[0][1];
        const ev = JSON.parse(line);
        console.log('  loki stream:', { app: parsed.streams[0].stream.app, kind: ev.kind, appId: ev.appId });
        if (!parsed.streams || !ev.appId) ok = false;
      }
    } catch (e) { console.log('  parse err', e.message); ok = false; }
  }

  console.log(`\n${ok && received.length === 4 ? 'PASS ✓ 端到端发送成功，4 次请求格式正确' : 'FAIL ✗'}`);
  server.close();
  process.exit(ok && received.length === 4 ? 0 : 1);
});
