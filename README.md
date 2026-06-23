# @life-guard/app-telemetry

LifeGuard 应用遥测与诊断上报模块（Node 后端）。提供：

1. **定期摘要上报**：应用启动/关闭时间、使用时长、错误数量等摘要。
2. **按需诊断上报**：收集最近日志、运行环境、用户自定义信息，供支持方排查。
3. **可插拔发送通道**：Webhook（钉钉/企业微信）+ HTTP ingest（Axiom / Grafana Loki），可扩展。

## 安装

```bash
npm install @life-guard/app-telemetry
```

> winston 为可选 peerDependency：若注入 `config.logger`，模块会自动计数 error 级日志。

## 快速接入

```js
const { createTelemetry } = require('@life-guard/app-telemetry');

const telemetry = createTelemetry({
  appId: 'my-backend',
  version: '1.0.0',
  env: process.env.NODE_ENV,
  logger,                       // 可选：注入 winston logger 以计数 error
  summary: { schedule: '0 * * * *', sendOnExit: true },
  transports: [
    {
      type: 'httpIngest', vendor: 'axiom',
      region: 'eu-central-1',          // dataset 所在区域：us-east-1 | eu-central-1
      dataset: 'life-guard',
      token: process.env.AXIOM_TOKEN,
      use: ['summary', 'diagnostics'],
    },
  ],
  diagnostics: { logDir: 'logs', maxLogBytes: 262144, envWhitelist: ['NODE_ENV'] },
  spool: { dir: '.telemetry-spool', maxItems: 200 },
});

// 需求2：应用方在自己的交互界面里调用
const { ok, ref } = await telemetry.diagnostics.collect({
  userMessage: '用户填写的问题描述',
  extra: { screen: 'roomDetail' },
});

// 优雅关闭
await telemetry.shutdown();
```

## Axiom / Grafana Cloud 配置获取

两家平台所需的 `endpoint` / `token` / `dataset` / `userId` 获取方式，详见
`docs/superpowers/specs/2026-06-23-app-telemetry-design.md` 的「接入配置」节。

## 示例

见 `examples/basic-backend/`：`cp .env.example .env`（填入真实 token）后 `npm install && npm start`。

## 许可证

ISC
