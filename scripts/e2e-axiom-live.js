'use strict';
// 真实 Axiom 端到端提交测试：用模块 src 直接 ingest，靠 ingest API 返回的 ingested 计数验证成功。
// 用法：node scripts/e2e-axiom-live.js <AXIOM_TOKEN> [region] [dataset]
//   默认 region=eu-central-1 dataset=life-guard

const { createTelemetry } = require('../src');

const TOKEN = process.argv[2] || process.env.AXIOM_TOKEN;
const REGION = process.argv[3] || process.env.AXIOM_REGION || 'eu-central-1';
const DATASET = process.argv[4] || process.env.AXIOM_DATASET || 'life-guard';

if (!TOKEN) {
  console.error('缺少 AXIOM_TOKEN：node scripts/e2e-axiom-live.js <token> [region] [dataset]');
  process.exit(2);
}

(async () => {
  // 拦截 axios.post，记录 ingest 响应以验证
  const axios = require('axios');
  const responses = [];
  const origPost = axios.post.bind(axios);
  axios.post = async (url, body, opts) => {
    const res = await origPost(url, body, opts);
    responses.push({ url, status: res.status, data: res.data });
    return res;
  };

  const telemetry = createTelemetry({
    appId: 'example-backend',
    version: '0.1.0',
    env: 'live-test',
    summary: { enabled: false }, // 不自动起定时器，手动 flushNow
    transports: [{
      type: 'httpIngest', vendor: 'axiom',
      region: REGION, dataset: DATASET, token: TOKEN,
      use: ['summary', 'diagnostics'],
    }],
    diagnostics: { logDir: 'logs', maxLogBytes: 1024, envWhitelist: ['NODE_ENV'] },
  });

  console.log(`目标: ${REGION} / ${DATASET}`);

  console.log('1) 发送 summary...');
  await telemetry.reporter.flushNow();

  console.log('2) 发送 diagnostics...');
  const d = await telemetry.diagnostics.collect({
    userMessage: '真实 Axiom 端到端联调测试',
    extra: { screen: 'live-test', source: 'e2e-script' },
  });
  console.log('   collect ref =', d.ref);

  await telemetry.shutdown();

  console.log('\n3) ingest 响应:');
  let totalIngested = 0;
  let allOk = true;
  for (const r of responses) {
    const ingested = r.data && typeof r.data.ingested === 'number' ? r.data.ingested : '?';
    const failed = r.data && typeof r.data.failed === 'number' ? r.data.failed : '?';
    console.log(`   ${r.url}`);
    console.log(`     HTTP ${r.status} | ingested=${ingested} failed=${failed}`);
    if (r.status >= 300 || (typeof r.data?.failed === 'number' && r.data.failed > 0)) allOk = false;
    if (typeof ingested === 'number') totalIngested += ingested;
  }

  console.log(`\n共 ingest ${totalIngested} 条事件（summary + diagnostics + final summary）`);
  console.log(allOk && totalIngested >= 2 ? 'PASS ✓ Axiom 端到端提交成功' : 'FAIL ✗');
  process.exit(allOk && totalIngested >= 2 ? 0 : 1);
})().catch((e) => {
  console.error('异常:', e.message);
  process.exit(1);
});
