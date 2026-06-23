# 应用遥测与诊断上报模块 设计文档

- **模块名**：`@life-guard/app-telemetry`
- **根目录**：`life-guard-shared-modules/`（独立新仓库，与 `life-guard-shared-components` 分开）
- **日期**：2026-06-23
- **状态**：待评审

---

## 1. 背景与目标

为 LifeGuard 各应用提供一个可复用的「遥测 + 诊断上报」模块，供其他应用 import 使用。两大功能：

1. **定期摘要上报**：定期把「应用启动时间、关闭时间、使用时长、期间错误数量」等摘要信息发给应用支持方。
2. **按需诊断上报**：提供一个功能模块，收集「最近日志、运行环境、用户自定义信息」发给支持方排查问题。应用方自行实现交互界面并调用此模块。
3. **发送方式**：给出搭/不搭服务的建议，并落地为可演进的实现。

### 已确认的约束（来自需求澄清）

| 维度 | 结论 |
|---|---|
| 应用形态 | **Node 后端服务**（如 LifeGuard Backend：CommonJS + Express + winston + axios + node-schedule + jest） |
| 部署网络 | **可稳定访问公网**，允许主动推送 |
| 支持方接收端 | **先不搭专门服务**（轻量优先），但保留演进到自建服务的能力 |
| 日志敏感度 | **不敏感，可直接上报**（仍提供 env 白名单，避免误传密钥） |
| 模块归属 | **单独新包**，不放进 React 组件库 |
| 接收平台选型 | **Axiom / Grafana Cloud**（纯 HTTP ingest，延迟/稳定性要求不高），摘要另走钉钉/企业微信 Webhook |

---

## 2. 发送方式建议（需求第 3 点）

### 搭 / 不搭服务对比

| | 不搭服务（本方案采用） | 搭轻量接收服务 |
|---|---|---|
| 摘要上报 | 推 Webhook（企业微信/钉钉机器人）+ 推日志 SaaS（Axiom / Grafana Cloud Loki） | 自建 `POST /v1/telemetry` 落库 |
| 诊断包 | 作为结构化事件推入 Axiom / Grafana，用 traceId 检索；或 zip 传对象存储 | 自建 `POST /v1/diagnostics` 存盘 + 列表页 |
| 优点 | 零运维、当天可用、成本近乎为零 | 可聚合查询、可告警、数据自管 |
| 缺点 | 查询/聚合依赖第三方平台 | 要开发+运维一个服务 |

### 选定方案

- **摘要** → 钉钉/企业微信 Webhook（人可读告警）**且/或** Axiom（可检索）。
- **诊断** → Axiom / Grafana Cloud（HTTP ingest JSON 事件，带 traceId）。
- Axiom 与 Grafana Loki 都是「HTTP POST + token」模式，收敛为同一个 `HttpIngestTransport`，靠 `vendor` 配置区分。

### Axiom / Grafana Cloud 接入配置

> 以下为调用两家 ingest API 所需的配置项。具体 endpoint host、token 申请入口请以各家官网当前文档为准（免费档与路径可能调整）。

#### Axiom

| 配置项 | 说明 | 从哪获取 |
|---|---|---|
| `dataset` | 数据集名，如 `life-guard` | Axiom 控制台 → Datasets，先创建一个 dataset |
| `region` | dataset 所在 edge deployment：`'us-east-1'`（默认）或 `'eu-central-1'` | 控制台创建 dataset 时选的 region；**必须与 dataset 实际区域一致**，否则跨区 ingest 报 400 |
| `token` | API token，形如 `xaat-xxxxxxxx` | Axiom 控制台 → Settings → API tokens，创建一个有 **ingest** 权限的 token |
| `endpoint` | 可选，覆盖自动推导的 URL | 一般不填，模块按 region 自动拼 |

- **关键：region 与 host 对应**（来自 [Axiom edge deployments 文档](https://axiom.co/docs/reference/edge-deployments)）：
  - **US East 1 (AWS)** → ingest 域名 `api.axiom.co`
  - **EU Central 1 (AWS)** → ingest 域名 `eu-central-1.aws.edge.axiom.co`
  - 模块按 `region` 自动选择 host。**token 与 dataset 必须同区**——US token 写不进 EU dataset（403），反之报 region 400。
- **ingest 路径**：`POST /v1/ingest/{dataset}`（注意是 `/v1/ingest/`，不是 `/v1/datasets/{name}/ingest`）。
- **认证**：HTTP Header `Authorization: Bearer <token>`
- **请求**：`POST`，`Content-Type: application/x-ndjson`，body 为 NDJSON（每行一个 JSON 事件对象）；可带 `_time`（ISO 时间），缺省用服务器时间。模块也兼容 JSON 数组格式。
- **完整 URL 示例**：
  - US：`https://api.axiom.co/v1/ingest/life-guard`
  - EU：`https://eu-central-1.aws.edge.axiom.co/v1/ingest/life-guard`
- **申请步骤**：注册 Axiom 账号 → 创建 dataset（记下 region）→ 创建带 ingest 权限的 API token（与 dataset 同区）。

#### Grafana Cloud（Loki）

| 配置项 | 说明 | 从哪获取 |
|---|---|---|
| `endpoint` | `https://logs-prod-xxx.grafana.net/loki/api/v1/push` | Grafana Cloud → 左侧 Loki/Logs 的 **Details/Send Logs** 页，host 因区域而异 |
| `userId` | Loki 实例的数字 user id | 同上页面（"User" 字段） |
| `token` | Cloud Access Policy token，需 `logs:write` scope | Grafana Cloud → Access Policies，创建 policy（含 logs:write）→ 生成 token |

- **认证**：HTTP Basic Auth，username = `userId`，password = `token`。
- **请求**：`POST`，`Content-Type: application/json`，body：
  ```json
  { "streams": [ { "stream": { "app": "lifeguard", "kind": "summary" },
                    "values": [ [ "<unix_nano_timestamp>", "<log line 字符串>" ] ] } ] }
  ```
  其中时间戳是纳秒级字符串，日志行是字符串（结构化数据需 JSON.stringify 后放入）。

#### 模块的抽象

`HttpIngestTransport` 用 `vendor: 'axiom' | 'grafanaLoki'` 区分，内部把统一的 `envelope`（见 §4）转换成各家 body 格式与认证头。应用方只填上表配置，不关心格式差异。

### 可插拔 Transport（核心设计决策）

发送方式做成可插拔接口。当下「不搭服务」即可落地；将来若支持方自建服务，只需新增/切换 Transport 配置，**应用代码不变**，避免返工。

```
TelemetryReporter / DiagnosticsCollector
        │  调用
        ▼
   Transport 接口  send(envelope)
   ├── WebhookTransport      （钉钉 / 企业微信，人可读摘要）
   └── HttpIngestTransport   （Axiom / Grafana Loki，可检索；vendor 配置切换）
   └── (预留) HttpApiTransport（将来支持方自建服务）
```

---

## 3. 架构与模块拆分

```
┌─────────────────────────────────────────────────────────┐
│  index.js  —— 对外门面，应用只 import 这一个               │
│    createTelemetry(config) → { reporter, diagnostics,     │
│                                 shutdown }                │
└───────────────┬───────────────────────┬──────────────────┘
                │                        │
   ┌────────────▼──────────┐  ┌──────────▼─────────────────┐
   │ TelemetryReporter      │  │ DiagnosticsCollector       │
   │ (需求1：定期摘要)       │  │ (需求2：按需诊断包)         │
   │ • 启动→记 startedAt     │  │ • collect(userInfo)         │
   │ • 错误计数(挂 winston)  │  │   收集最近日志+运行环境+    │
   │ • node-schedule 定时    │  │   用户自定义信息            │
   │ • 退出钩子→stop+uptime  │  │ • 交 Transport 发送，返回ref │
   └────────────┬──────────┘  └──────────┬─────────────────┘
                └───────────┬─────────────┘
                            ▼
              ┌──────────────────────────────┐
              │ Transport 接口  send(envelope)│
              │  ├ WebhookTransport            │
              │  └ HttpIngestTransport         │
              └──────────────┬───────────────┘
                             ▼
                   ┌───────────────────┐
                   │ Spool（断网兜底）  │
                   │ 失败落盘，下次重发  │
                   └───────────────────┘
```

### 单元职责

| 单元 | 做什么 | 怎么用 | 依赖 |
|---|---|---|---|
| `index.js` (门面) | 组装配置，产出 reporter/diagnostics/shutdown | `createTelemetry(config)` | 下面各单元 |
| `TelemetryReporter` | 采集并定期发送摘要 | 内部自动 start；可 `flushNow()` | node-schedule, Transport, Spool |
| `DiagnosticsCollector` | 收集诊断包并发送 | `collect({userMessage, extra})` | fs(读日志), Transport |
| `ErrorCounter` | 给 winston 挂自定义 transport 计数 error | 注入宿主 logger | winston |
| `Transport`(接口) | `send(envelope)` 统一发送 | 由配置实例化 | axios |
| `Spool` | 失败排队、重发、FIFO 截断 | 内部使用 | fs |

---

## 4. 功能详细设计

### 4.1 需求 1：定期摘要（`TelemetryReporter`）

**采集字段**

| 字段 | 来源 |
|---|---|
| `appId` / `instanceId` / `version` / `env` | 配置 |
| `startedAt` | 模块初始化时刻 |
| `stoppedAt` / `uptimeMs` | 进程退出钩子（`SIGTERM`/`SIGINT`/`beforeExit`） |
| `errorCount` | 窗口内 winston error 级日志计数 |
| `lastHeartbeatAt` | 每次定时发送时刻 |

**错误计数**：给宿主现有 winston logger 挂一个自定义 transport，`level==='error'` 时计数器 +1。零业务侵入，只累加整数、不缓存内容。

**发送时机**：`node-schedule` cron（默认每小时），外加进程退出补发一条 `final` 摘要。

**关于"关闭/时长"的诚实边界**：Node 进程的硬退出（`kill -9`、断电、OOM）无法被退出钩子捕获，因此「关闭时间/时长」采用两条腿：①退出钩子尽力补发；②摘要携带 `lastHeartbeatAt`，支持方可用「最后心跳」估算运行区间。文档明确不对硬退出做承诺。

### 4.2 需求 2：按需诊断（`DiagnosticsCollector`）

**对外 API**：`await diagnostics.collect({ userMessage, extra }) → { ok, ref }`

**收集内容**：

1. **最近日志** — 读 `logs/` 下 winston 当天滚动文件尾部（默认上限 `maxLogBytes`，对接现有 `combined.log` / `error.log`）。
2. **运行环境** — `process.version`、平台/架构、内存占用、env（仅 `envWhitelist` 字段）、应用 version。
3. **用户自定义信息** — 应用方传入的 `userMessage`（界面上用户填写）+ `extra`（任意结构）。

**发送**：打包为结构化诊断事件（日志过大则截断/分片）交 `HttpIngestTransport` 进 Axiom；返回 `ref`（traceId），便于支持方在 Axiom 检索本次诊断，也可展示给用户。

**界面归属**：模块**不含 UI**，仅暴露 `collect()`。应用方自行实现按钮/弹窗并调用（符合需求「应用内实现交互界面并调用此模块」）。

### 4.3 统一信封 envelope（Transport 的输入契约）

所有数据在交给 Transport 前先归一化为 `envelope`，Transport 再转成各家格式：

```js
{
  kind: 'summary' | 'diagnostics',   // 数据类别，对应 transport 的 use
  appId: 'lifeguard-backend',
  instanceId: 'host-1',
  version: '2.5.0',
  env: 'production',
  timestamp: '2026-06-23T08:00:00.000Z',  // ISO
  ref: 'a1b2c3d4',                   // diagnostics 必有；summary 可选
  data: { /* 摘要字段 或 诊断字段，见 4.1 / 4.2 */ }
}
```

- `WebhookTransport`：把 envelope 渲染成人可读 markdown/文本消息体。
- `HttpIngestTransport`：
  - axiom → `[{ _time: timestamp, ...envelope }]`
  - grafanaLoki → `{ streams: [{ stream: {app: appId, kind}, values: [[unixNano, JSON.stringify(envelope)]] }] }`

---

## 5. 配置结构

```js
const { createTelemetry } = require('@life-guard/app-telemetry');

const telemetry = createTelemetry({
  appId: 'lifeguard-backend',         // 必填
  instanceId: os.hostname(),          // 选填，默认 hostname
  version: process.env.APP_VERSION,   // 选填
  env: process.env.NODE_ENV,          // 选填

  logger,                             // 选填：注入现有 winston logger 以计数 error

  summary: {
    enabled: true,
    schedule: '0 * * * *',            // node-schedule cron，默认每小时
    sendOnExit: true,                 // 退出补发 final 摘要
  },

  transports: [
    { type: 'webhook',
      url: process.env.TELEMETRY_WEBHOOK_URL,
      use: ['summary'] },
    { type: 'httpIngest',
      vendor: 'axiom',                // 'axiom' | 'grafanaLoki'
      region: 'eu-central-1',         // axiom: dataset 所在区域 us-east-1|eu-central-1，模块按此选 host
      dataset: 'life-guard',          // axiom 必填
      token: process.env.AXIOM_TOKEN,
      // grafanaLoki 时改用：endpoint, userId, token
      use: ['summary', 'diagnostics'] },
  ],

  diagnostics: {
    logDir: 'logs',
    maxLogBytes: 256 * 1024,
    envWhitelist: ['NODE_ENV', 'APP_VERSION'],
  },

  spool: { dir: '.telemetry-spool', maxItems: 200 },
});
```

`use: [...]` 决定每个 transport 接收哪类数据（`summary` / `diagnostics`），可一对多、互不干扰。

---

## 6. 对外 API

```js
// 需求1：通常 createTelemetry 内部自动启动
telemetry.reporter.start();
await telemetry.reporter.flushNow();     // 手动立即发一次摘要（可选）

// 需求2：应用方在自己的 UI 里调用
const { ok, ref } = await telemetry.diagnostics.collect({
  userMessage: '用户填写的问题描述',
  extra: { lastScreen: 'roomDetail', customField: 123 },
});

// 优雅关闭：注销定时器、补发 final 摘要、flush spool
await telemetry.shutdown();
```

---

## 7. 错误处理与韧性

模块自身绝不拖垮宿主应用：

1. **隔离**：所有发送在 try/catch 内，失败只 `console.warn` + 写 spool，**不向上抛**到业务流程。
2. **重试**：发送失败 → 写本地 spool；下次定时任务 / 下次 collect 时先重发积压，成功则删除。
3. **截断**：spool 超过 `maxItems` 按 FIFO 丢最旧并记一条 warn（不静默丢弃）。
4. **超时**：HTTP 发送用 axios `timeout`（默认 5s）。
5. **读日志健壮性**：日志文件不存在/无权限时，诊断包对应字段标记 `"<unavailable: reason>"`，其余信息照常发送，不中断。
6. **背压**：错误计数器只累加整数，不缓存错误内容。

---

## 8. 测试策略（jest，与后端一致）

| 单元 | 用例要点 |
|---|---|
| `TelemetryReporter` | mock 时钟与 transport：摘要字段正确、退出补发 final、错误计数准确 |
| `DiagnosticsCollector` | 临时日志文件 + mock transport：尾部截断、env 白名单过滤、文件缺失兜底 |
| `Transport` | mock axios：成功发送、超时、失败落 spool |
| `Spool` | 满了 FIFO 截断、重发后清理 |
| `ErrorCounter` | 注入 mock logger：仅 error 级 +1 |

---

## 9. 目录结构（计划）

```
life-guard-shared-modules/
├── README.md
├── package.json                 # name: @life-guard/app-telemetry
├── docs/superpowers/specs/2026-06-23-app-telemetry-design.md
├── src/
│   ├── index.js                 # createTelemetry 门面
│   ├── TelemetryReporter.js
│   ├── DiagnosticsCollector.js
│   ├── ErrorCounter.js
│   ├── transports/
│   │   ├── Transport.js         # 接口/基类
│   │   ├── WebhookTransport.js
│   │   └── HttpIngestTransport.js
│   ├── Spool.js
│   └── env.js                   # 运行环境采集 + 白名单
└── tests/
    └── ...                      # 与 src 对应
```

> 说明：根目录 `life-guard-shared-modules/` 可作为「共享 Node 模块」聚合仓，未来其他后端共享模块也可放入，各模块独立 package。本期只实现 `app-telemetry`。

---

## 10. 非目标（YAGNI）

- 不内置任何 UI（界面由应用方实现）。
- 不自建接收服务（保留 `HttpApiTransport` 演进位，本期不做）。
- 不做日志脱敏引擎（日志不敏感；仅提供 env 白名单）。
- 不抓硬退出（`kill -9`/断电），以心跳估算代替。
- 不支持浏览器/Electron 形态（本期只针对 Node 后端；接口设计不排斥未来扩展）。
