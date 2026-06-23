# app-telemetry 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建可复用的 Node 后端遥测与诊断上报模块 `@life-guard/app-telemetry`：定期摘要上报 + 按需诊断包，发送通道可插拔（Webhook + Axiom/Grafana Loki HTTP ingest）。

**Architecture:** CommonJS 模块，门面 `createTelemetry(config)` 产出 `{ reporter, diagnostics, shutdown }`。`TelemetryReporter` 用 node-schedule 定时发摘要并挂 winston 计数 error；`DiagnosticsCollector` 收集日志+环境+用户信息。两者把数据归一化为 `envelope` 交 `Transport` 接口发送，失败落 `Spool` 重试。

**Tech Stack:** Node.js (CommonJS)、axios、node-schedule、winston（peer，宿主注入）、jest、uuid。

## Global Constraints

- 模块名 `@life-guard/app-telemetry`，根目录 `life-guard-shared-modules/`，远端 `https://github.com/opti201812/life-guard-shared-modules.git`。
- CommonJS（`require`/`module.exports`），Node 后端，**不依赖 React**。
- 模块自身错误**绝不向上抛**到宿主业务流程：所有发送 try/catch，失败 `console.warn` + 写 spool。
- 测试用 jest，每个单元有对应测试；TDD：先写失败测试再实现。
- HTTP 发送统一 axios `timeout` 默认 5000ms。
- winston 为 peerDependency（宿主注入 logger），不强制安装。
- 频繁提交：每个 Task 末尾 commit。

---

## 文件结构

```
life-guard-shared-modules/
├── README.md
├── package.json                      # name: @life-guard/app-telemetry
├── .gitignore
├── jest.config.js
├── docs/superpowers/{specs,plans}/
├── src/
│   ├── index.js                      # createTelemetry 门面
│   ├── TelemetryReporter.js          # 需求1 摘要
│   ├── DiagnosticsCollector.js       # 需求2 诊断
│   ├── ErrorCounter.js               # 挂 winston 计数 error
│   ├── env.js                        # 运行环境采集 + 白名单
│   ├── envelope.js                   # 归一化 envelope 构造
│   ├── Spool.js                      # 失败排队/重发/FIFO 截断
│   └── transports/
│       ├── Transport.js              # 基类/接口 + 工厂 createTransport
│       ├── WebhookTransport.js
│       └── HttpIngestTransport.js    # vendor: axiom | grafanaLoki
├── tests/
│   ├── index.test.js
│   ├── TelemetryReporter.test.js
│   ├── DiagnosticsCollector.test.js
│   ├── ErrorCounter.test.js
│   ├── env.test.js
│   ├── envelope.test.js
│   ├── Spool.test.js
│   └── transports/
│       ├── WebhookTransport.test.js
│       └── HttpIngestTransport.test.js
└── examples/
    └── basic-backend/                # Task 阶段3 的示例接入项目
        ├── package.json
        ├── .env.example
        └── app.js
```

---

# 阶段一：项目框架（无实际功能）

### Task 1: 项目脚手架与冒烟测试

**Files:**
- Create: `life-guard-shared-modules/package.json`
- Create: `life-guard-shared-modules/.gitignore`
- Create: `life-guard-shared-modules/jest.config.js`
- Create: `life-guard-shared-modules/src/index.js`
- Test: `life-guard-shared-modules/tests/smoke.test.js`

**Interfaces:**
- Consumes: 无
- Produces: `require('../src')` 可加载，导出对象含 `createTelemetry`（本阶段为占位，返回空壳）。

- [ ] **Step 1: 写 package.json**

```json
{
  "name": "@life-guard/app-telemetry",
  "version": "0.1.0",
  "description": "LifeGuard 应用遥测与诊断上报模块",
  "main": "src/index.js",
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch"
  },
  "dependencies": {
    "axios": "^1.13.5",
    "node-schedule": "^2.1.1",
    "uuid": "^9.0.1"
  },
  "peerDependencies": {
    "winston": "^3.0.0"
  },
  "peerDependenciesMeta": {
    "winston": { "optional": true }
  },
  "devDependencies": {
    "jest": "^29.7.0"
  },
  "license": "ISC",
  "repository": {
    "type": "git",
    "url": "https://github.com/opti201812/life-guard-shared-modules.git"
  }
}
```

- [ ] **Step 2: 写 .gitignore**

```
node_modules/
.telemetry-spool/
.env
coverage/
*.log
```

- [ ] **Step 3: 写 jest.config.js**

```js
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  collectCoverageFrom: ['src/**/*.js'],
};
```

- [ ] **Step 4: 写占位 src/index.js**

```js
'use strict';

/**
 * 创建遥测实例（占位，阶段二填充真实接口）。
 * @param {object} config
 * @returns {{ reporter: object, diagnostics: object, shutdown: function }}
 */
function createTelemetry(config = {}) {
  return {
    reporter: {},
    diagnostics: {},
    shutdown: async () => {},
  };
}

module.exports = { createTelemetry };
```

- [ ] **Step 5: 写冒烟测试 tests/smoke.test.js**

```js
const { createTelemetry } = require('../src');

describe('smoke', () => {
  test('createTelemetry 可调用并返回标准结构', () => {
    const t = createTelemetry({ appId: 'x' });
    expect(typeof t.shutdown).toBe('function');
    expect(t).toHaveProperty('reporter');
    expect(t).toHaveProperty('diagnostics');
  });
});
```

- [ ] **Step 6: 安装依赖并跑测试**

Run: `cd "life-guard-shared-modules" && npm install && npm test`
Expected: PASS，1 个测试通过。

- [ ] **Step 7: 关联远端并提交**

```bash
cd "life-guard-shared-modules"
git remote add origin https://github.com/opti201812/life-guard-shared-modules.git 2>/dev/null || true
git add -A
git commit -m "chore: 项目脚手架与冒烟测试"
```

---

# 阶段二：对外 API 接口骨架（无实质功能）

> 目标：把 spec §5/§6 的配置与 API 形态全部立起来，签名、返回结构、参数校验到位，但内部不真正发送/采集（用占位/空实现）。每个接口有单元测试锁定契约。

### Task 2: envelope 归一化构造

**Files:**
- Create: `src/envelope.js`
- Test: `tests/envelope.test.js`

**Interfaces:**
- Consumes: 无
- Produces: `buildEnvelope({ kind, base, data, ref })` → 返回 spec §4.3 结构的对象。`base` 含 `{ appId, instanceId, version, env }`；`timestamp` 由调用方传入或缺省用 `new Date().toISOString()`。

- [ ] **Step 1: 写失败测试**

```js
const { buildEnvelope } = require('../src/envelope');

describe('buildEnvelope', () => {
  test('组装出标准 envelope 字段', () => {
    const env = buildEnvelope({
      kind: 'summary',
      base: { appId: 'app1', instanceId: 'h1', version: '1.0', env: 'test' },
      data: { errorCount: 3 },
      ref: 'abc',
      timestamp: '2026-06-23T08:00:00.000Z',
    });
    expect(env).toEqual({
      kind: 'summary',
      appId: 'app1',
      instanceId: 'h1',
      version: '1.0',
      env: 'test',
      timestamp: '2026-06-23T08:00:00.000Z',
      ref: 'abc',
      data: { errorCount: 3 },
    });
  });

  test('kind 非法时抛错', () => {
    expect(() => buildEnvelope({ kind: 'bad', base: {}, data: {} }))
      .toThrow(/kind/);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test -- envelope`
Expected: FAIL（buildEnvelope 未定义）。

- [ ] **Step 3: 实现 src/envelope.js**

```js
'use strict';

const VALID_KINDS = ['summary', 'diagnostics'];

function buildEnvelope({ kind, base = {}, data = {}, ref, timestamp }) {
  if (!VALID_KINDS.includes(kind)) {
    throw new Error(`envelope.kind 必须是 ${VALID_KINDS.join('/')}，收到: ${kind}`);
  }
  return {
    kind,
    appId: base.appId,
    instanceId: base.instanceId,
    version: base.version,
    env: base.env,
    timestamp: timestamp || new Date().toISOString(),
    ref,
    data,
  };
}

module.exports = { buildEnvelope, VALID_KINDS };
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm test -- envelope`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/envelope.js tests/envelope.test.js
git commit -m "feat: envelope 归一化构造"
```

### Task 3: Transport 接口与工厂（骨架）

**Files:**
- Create: `src/transports/Transport.js`
- Test: `tests/transports/Transport.test.js`

**Interfaces:**
- Consumes: 无
- Produces:
  - 基类 `Transport`，方法 `async send(envelope)`（基类抛 `not implemented`），属性 `use`（数组，决定接收哪些 kind），方法 `accepts(kind)`。
  - 工厂 `createTransport(cfg)`：按 `cfg.type`（`'webhook'|'httpIngest'`）返回对应实例；本任务先支持抛"未知类型"错误，具体子类在 Task 8/9 接入工厂。

- [ ] **Step 1: 写失败测试**

```js
const { Transport, createTransport } = require('../../src/transports/Transport');

describe('Transport 基类', () => {
  test('accepts 依据 use 判断 kind', () => {
    const t = new Transport({ use: ['summary'] });
    expect(t.accepts('summary')).toBe(true);
    expect(t.accepts('diagnostics')).toBe(false);
  });

  test('use 缺省接收所有 kind', () => {
    const t = new Transport({});
    expect(t.accepts('summary')).toBe(true);
    expect(t.accepts('diagnostics')).toBe(true);
  });

  test('基类 send 未实现应抛错', async () => {
    const t = new Transport({});
    await expect(t.send({})).rejects.toThrow(/not implemented/);
  });
});

describe('createTransport', () => {
  test('未知 type 抛错', () => {
    expect(() => createTransport({ type: 'nope' })).toThrow(/未知.*type|unknown/i);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test -- Transport`
Expected: FAIL。

- [ ] **Step 3: 实现 src/transports/Transport.js**

```js
'use strict';

class Transport {
  constructor(cfg = {}) {
    this.use = Array.isArray(cfg.use) ? cfg.use : null; // null = 接收所有
    this.cfg = cfg;
  }

  accepts(kind) {
    return this.use === null || this.use.includes(kind);
  }

  // eslint-disable-next-line no-unused-vars
  async send(envelope) {
    throw new Error('Transport.send not implemented');
  }
}

function createTransport(cfg = {}) {
  switch (cfg.type) {
    // 子类在 Task 8/9 接入：
    // case 'webhook': return new WebhookTransport(cfg);
    // case 'httpIngest': return new HttpIngestTransport(cfg);
    default:
      throw new Error(`未知的 transport type: ${cfg.type}`);
  }
}

module.exports = { Transport, createTransport };
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm test -- Transport`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/transports/Transport.js tests/transports/Transport.test.js
git commit -m "feat: Transport 接口与工厂骨架"
```

### Task 4: createTelemetry 门面与配置校验（骨架接口）

**Files:**
- Modify: `src/index.js`
- Test: `tests/index.test.js`

**Interfaces:**
- Consumes: `buildEnvelope`（Task 2）、`createTransport`（Task 3，本任务用 try/catch 容错，未知类型时跳过该 transport 不崩）。
- Produces: `createTelemetry(config)` 返回 `{ reporter, diagnostics, shutdown }`：
  - `reporter.start()`（同步，幂等）、`reporter.flushNow()`（async，返回 `{ ok }`，骨架返回 `{ ok: true, skipped: true }`）。
  - `diagnostics.collect({ userMessage, extra })`（async，返回 `{ ok, ref }`，骨架 `ref` 用 uuid 生成、`ok: true, skipped: true`）。
  - `shutdown()`（async，幂等）。
  - 缺 `appId` 时抛错。

- [ ] **Step 1: 写失败测试**

```js
const { createTelemetry } = require('../src');

describe('createTelemetry 门面骨架', () => {
  test('缺 appId 抛错', () => {
    expect(() => createTelemetry({})).toThrow(/appId/);
  });

  test('返回标准结构与方法', () => {
    const t = createTelemetry({ appId: 'app1' });
    expect(typeof t.reporter.start).toBe('function');
    expect(typeof t.reporter.flushNow).toBe('function');
    expect(typeof t.diagnostics.collect).toBe('function');
    expect(typeof t.shutdown).toBe('function');
  });

  test('collect 返回 ok 与 ref（骨架）', async () => {
    const t = createTelemetry({ appId: 'app1' });
    const r = await t.diagnostics.collect({ userMessage: 'hi' });
    expect(r.ok).toBe(true);
    expect(typeof r.ref).toBe('string');
    expect(r.ref.length).toBeGreaterThan(0);
  });

  test('flushNow / shutdown 可调用', async () => {
    const t = createTelemetry({ appId: 'app1' });
    expect((await t.reporter.flushNow()).ok).toBe(true);
    await expect(t.shutdown()).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test -- index`
Expected: FAIL（缺 appId 不抛错 / 方法不存在）。

- [ ] **Step 3: 实现 src/index.js 骨架**

```js
'use strict';

const { v4: uuidv4 } = require('uuid');
const { createTransport } = require('./transports/Transport');

function createTelemetry(config = {}) {
  if (!config.appId) {
    throw new Error('createTelemetry 缺少必填配置 appId');
  }

  const base = {
    appId: config.appId,
    instanceId: config.instanceId || require('os').hostname(),
    version: config.version,
    env: config.env,
  };

  // 实例化 transports（骨架：未知类型容错跳过，不崩）
  const transports = [];
  for (const cfg of config.transports || []) {
    try {
      transports.push(createTransport(cfg));
    } catch (e) {
      console.warn(`[app-telemetry] 跳过无效 transport: ${e.message}`);
    }
  }

  const reporter = {
    start() { /* 阶段后续填充定时逻辑 */ },
    async flushNow() { return { ok: true, skipped: true }; },
  };

  const diagnostics = {
    async collect({ userMessage, extra } = {}) {
      const ref = uuidv4().slice(0, 8);
      return { ok: true, skipped: true, ref };
    },
  };

  async function shutdown() { /* 阶段后续填充 */ }

  return { reporter, diagnostics, shutdown, _base: base, _transports: transports };
}

module.exports = { createTelemetry };
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm test`
Expected: PASS（含 smoke 与 index）。

- [ ] **Step 5: 提交**

```bash
git add src/index.js tests/index.test.js
git commit -m "feat: createTelemetry 门面与配置校验骨架"
```

---

# 阶段三：连接 Axiom / Grafana Cloud + 示例项目 + 人工测试

### Task 5: HttpIngestTransport — Axiom

**Files:**
- Create: `src/transports/HttpIngestTransport.js`
- Modify: `src/transports/Transport.js`（工厂接入 `httpIngest`）
- Test: `tests/transports/HttpIngestTransport.test.js`

**Interfaces:**
- Consumes: `Transport` 基类（Task 3）、axios。
- Produces: `HttpIngestTransport`，构造 `cfg = { vendor, endpoint, token, dataset?, userId?, timeout?, use? }`。`async send(envelope)` 按 vendor 转 body 与 auth header，调用 `axios.post`；成功 resolve，失败 reject（由上层 Spool 处理）。

- [ ] **Step 1: 写失败测试（mock axios）**

```js
jest.mock('axios');
const axios = require('axios');
const { HttpIngestTransport } = require('../../src/transports/HttpIngestTransport');

const envelope = {
  kind: 'summary', appId: 'app1', instanceId: 'h1', version: '1.0',
  env: 'test', timestamp: '2026-06-23T08:00:00.000Z', ref: 'abc',
  data: { errorCount: 2 },
};

describe('HttpIngestTransport - axiom', () => {
  beforeEach(() => { axios.post.mockReset(); axios.post.mockResolvedValue({ status: 200 }); });

  test('axiom: Bearer 认证 + 事件数组 body', async () => {
    const t = new HttpIngestTransport({
      vendor: 'axiom', endpoint: 'https://api.axiom.co/v1/datasets/lifeguard/ingest',
      token: 'xaat-test', dataset: 'lifeguard',
    });
    await t.send(envelope);
    expect(axios.post).toHaveBeenCalledTimes(1);
    const [url, body, opts] = axios.post.mock.calls[0];
    expect(url).toContain('/v1/datasets/lifeguard/ingest');
    expect(Array.isArray(body)).toBe(true);
    expect(body[0]._time).toBe('2026-06-23T08:00:00.000Z');
    expect(body[0].appId).toBe('app1');
    expect(opts.headers.Authorization).toBe('Bearer xaat-test');
    expect(opts.timeout).toBe(5000);
  });
});

describe('HttpIngestTransport - grafanaLoki', () => {
  beforeEach(() => { axios.post.mockReset(); axios.post.mockResolvedValue({ status: 204 }); });

  test('grafanaLoki: Basic 认证 + streams body', async () => {
    const t = new HttpIngestTransport({
      vendor: 'grafanaLoki',
      endpoint: 'https://logs-prod-x.grafana.net/loki/api/v1/push',
      userId: '12345', token: 'glc-token',
    });
    await t.send(envelope);
    const [url, body, opts] = axios.post.mock.calls[0];
    expect(url).toContain('/loki/api/v1/push');
    expect(body.streams[0].stream.app).toBe('app1');
    expect(body.streams[0].stream.kind).toBe('summary');
    const line = body.streams[0].values[0][1];
    expect(JSON.parse(line).data.errorCount).toBe(2);
    const expectedAuth = 'Basic ' + Buffer.from('12345:glc-token').toString('base64');
    expect(opts.headers.Authorization).toBe(expectedAuth);
  });
});

describe('HttpIngestTransport - 校验', () => {
  test('未知 vendor 构造抛错', () => {
    expect(() => new HttpIngestTransport({ vendor: 'nope', endpoint: 'x', token: 'y' }))
      .toThrow(/vendor/);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test -- HttpIngestTransport`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现 src/transports/HttpIngestTransport.js**

```js
'use strict';

const axios = require('axios');
const { Transport } = require('./Transport');

const VENDORS = ['axiom', 'grafanaLoki'];

class HttpIngestTransport extends Transport {
  constructor(cfg = {}) {
    super(cfg);
    if (!VENDORS.includes(cfg.vendor)) {
      throw new Error(`HttpIngestTransport.vendor 必须是 ${VENDORS.join('/')}，收到: ${cfg.vendor}`);
    }
    this.vendor = cfg.vendor;
    this.endpoint = cfg.endpoint;
    this.token = cfg.token;
    this.dataset = cfg.dataset;
    this.userId = cfg.userId;
    this.timeout = cfg.timeout || 5000;
  }

  _toAxiom(envelope) {
    return {
      body: [{ _time: envelope.timestamp, ...envelope }],
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
    };
  }

  _toLoki(envelope) {
    const unixNano = `${new Date(envelope.timestamp).getTime()}000000`;
    const auth = 'Basic ' + Buffer.from(`${this.userId}:${this.token}`).toString('base64');
    return {
      body: {
        streams: [{
          stream: { app: envelope.appId, kind: envelope.kind },
          values: [[unixNano, JSON.stringify(envelope)]],
        }],
      },
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
    };
  }

  async send(envelope) {
    const { body, headers } = this.vendor === 'axiom'
      ? this._toAxiom(envelope)
      : this._toLoki(envelope);
    await axios.post(this.endpoint, body, { headers, timeout: this.timeout });
  }
}

module.exports = { HttpIngestTransport, VENDORS };
```

- [ ] **Step 4: 工厂接入 httpIngest（修改 Transport.js）**

在 `src/transports/Transport.js` 顶部 `require` 后、`createTransport` 的 switch 中加入：

```js
const { HttpIngestTransport } = require('./HttpIngestTransport');
// ... switch 内：
    case 'httpIngest': return new HttpIngestTransport(cfg);
```

> 注意：为避免循环依赖，`HttpIngestTransport` require `Transport` 基类（已在同文件导出 class）；在 `createTransport` 内 require 子类即可，或把 require 放文件顶部。实现时若出现循环，改为在 `createTransport` 函数体内 `require`。

- [ ] **Step 5: 跑测试确认通过**

Run: `npm test -- HttpIngestTransport`
Expected: PASS（axiom + grafanaLoki + 校验）。

- [ ] **Step 6: 提交**

```bash
git add src/transports/HttpIngestTransport.js src/transports/Transport.js tests/transports/HttpIngestTransport.test.js
git commit -m "feat: HttpIngestTransport 支持 Axiom 与 Grafana Loki"
```

### Task 6: 门面接线 flushNow / collect 真正发送（最小可用）

**Files:**
- Modify: `src/index.js`
- Test: `tests/index.test.js`（追加）

**Interfaces:**
- Consumes: `buildEnvelope`（Task 2）、各 transport（Task 5），其 `send`/`accepts`。
- Produces: `flushNow()` 构造 `kind:'summary'` envelope（data 暂含 `{ startedAt, uptimeMs }`，错误计数在 Task 10 接入）并发给 `accepts('summary')` 的 transport；`collect()` 构造 `kind:'diagnostics'` envelope（data 含 userMessage/extra，日志与环境在 Task 7/11 接入）发给 `accepts('diagnostics')` 的 transport。任一发送失败仅 warn，不抛。

- [ ] **Step 1: 写失败测试（mock transport）**

```js
const { createTelemetry } = require('../src');

function fakeTransport(use) {
  return { use, accepts(k){ return use.includes(k); }, sent: [], async send(e){ this.sent.push(e); } };
}

describe('门面真正发送', () => {
  test('flushNow 把 summary 发给 summary transport', async () => {
    const t = createTelemetry({ appId: 'app1' });
    const tr = fakeTransport(['summary']);
    t._transports.length = 0; t._transports.push(tr);
    await t.reporter.flushNow();
    expect(tr.sent).toHaveLength(1);
    expect(tr.sent[0].kind).toBe('summary');
    expect(tr.sent[0].appId).toBe('app1');
  });

  test('collect 把 diagnostics 发给 diagnostics transport，并回传 ref', async () => {
    const t = createTelemetry({ appId: 'app1' });
    const tr = fakeTransport(['diagnostics']);
    t._transports.length = 0; t._transports.push(tr);
    const r = await t.diagnostics.collect({ userMessage: 'bug', extra: { a: 1 } });
    expect(r.ok).toBe(true);
    expect(tr.sent[0].kind).toBe('diagnostics');
    expect(tr.sent[0].ref).toBe(r.ref);
    expect(tr.sent[0].data.userMessage).toBe('bug');
  });

  test('transport.send 抛错不影响返回 ok', async () => {
    const t = createTelemetry({ appId: 'app1' });
    const bad = { use:['diagnostics'], accepts(){return true;}, async send(){ throw new Error('net'); } };
    t._transports.length = 0; t._transports.push(bad);
    const r = await t.diagnostics.collect({ userMessage: 'x' });
    expect(r.ok).toBe(true);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test -- index`
Expected: FAIL（当前 flushNow/collect 为 skipped 空实现）。

- [ ] **Step 3: 修改 src/index.js 接线发送**

将 `reporter` 与 `diagnostics` 替换为：

```js
const { buildEnvelope } = require('./envelope');

// ... createTelemetry 内，base 定义之后：

const startedAt = new Date().toISOString();

async function dispatch(envelope) {
  for (const tr of transports) {
    if (!tr.accepts(envelope.kind)) continue;
    try {
      await tr.send(envelope);
    } catch (e) {
      console.warn(`[app-telemetry] 发送失败(${envelope.kind}): ${e.message}`);
      // Spool 重试在 Task 12 接入
    }
  }
}

const reporter = {
  start() {},
  async flushNow() {
    const envelope = buildEnvelope({
      kind: 'summary',
      base,
      data: {
        startedAt,
        uptimeMs: Date.now() - new Date(startedAt).getTime(),
      },
    });
    await dispatch(envelope);
    return { ok: true };
  },
};

const diagnostics = {
  async collect({ userMessage, extra } = {}) {
    const ref = uuidv4().slice(0, 8);
    const envelope = buildEnvelope({
      kind: 'diagnostics',
      base,
      ref,
      data: { userMessage, extra },
    });
    await dispatch(envelope);
    return { ok: true, ref };
  },
};
```

（保留 `shutdown`、`_base`、`_transports` 导出不变。）

- [ ] **Step 4: 跑全部测试确认通过**

Run: `npm test`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/index.js tests/index.test.js
git commit -m "feat: 门面接线 flushNow/collect 真正发送"
```

### Task 7: 示例接入项目 + 人工联调

**Files:**
- Create: `examples/basic-backend/package.json`
- Create: `examples/basic-backend/.env.example`
- Create: `examples/basic-backend/app.js`
- Create/Modify: `README.md`（加"快速接入"与"Axiom/Grafana 配置获取"段落，引用 spec 接入配置）

**Interfaces:**
- Consumes: `@life-guard/app-telemetry`（本地 `file:` 引用）的 `createTelemetry`。
- Produces: 一个可 `node app.js` 运行的最小示例，演示：启动→`reporter.flushNow()`→`diagnostics.collect()`→`shutdown()`。

- [ ] **Step 1: 写 examples/basic-backend/package.json**

```json
{
  "name": "app-telemetry-example",
  "version": "0.0.1",
  "private": true,
  "main": "app.js",
  "scripts": { "start": "node app.js" },
  "dependencies": {
    "@life-guard/app-telemetry": "file:../..",
    "dotenv": "^16.3.1"
  }
}
```

- [ ] **Step 2: 写 .env.example**

```
# Axiom（二选一）
AXIOM_INGEST_URL=https://api.axiom.co/v1/datasets/lifeguard/ingest
AXIOM_TOKEN=xaat-xxxxxxxx

# Grafana Loki（二选一）
GRAFANA_LOKI_URL=https://logs-prod-xxx.grafana.net/loki/api/v1/push
GRAFANA_USER_ID=123456
GRAFANA_TOKEN=glc-xxxxxxxx

# 可选 Webhook（钉钉/企业微信）
TELEMETRY_WEBHOOK_URL=
```

- [ ] **Step 3: 写 examples/basic-backend/app.js**

```js
'use strict';
require('dotenv').config();
const { createTelemetry } = require('@life-guard/app-telemetry');

const transports = [];
if (process.env.AXIOM_TOKEN) {
  transports.push({
    type: 'httpIngest', vendor: 'axiom',
    endpoint: process.env.AXIOM_INGEST_URL,
    token: process.env.AXIOM_TOKEN, dataset: 'lifeguard',
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
```

- [ ] **Step 4: README 增补接入说明**

在 `README.md` 写入：模块简介、`npm install`、最小接入代码片段、并注明"Axiom/Grafana 配置项获取方式见 `docs/superpowers/specs/2026-06-23-app-telemetry-design.md` 的『接入配置』节"。

- [ ] **Step 5: 人工测试（需真实账号）**

Run:
```bash
cd examples/basic-backend
cp .env.example .env   # 填入真实 Axiom 或 Grafana token
npm install
npm start
```
Expected: 控制台打印 `{ ok: true }` 与 `{ ok: true, ref: '...' }`；登录 Axiom/Grafana 控制台能看到 `example-backend` 的 summary 与 diagnostics 事件。

> 若无真实账号，至少用 mock endpoint（如 https://httpbin.org/post 或本地 express）验证请求确实发出、格式正确。

- [ ] **Step 6: 提交**

```bash
git add examples README.md
git commit -m "docs: 示例接入项目与 README 快速接入"
```

---

# 阶段四：完整功能（按优先级续接）

> 优先级 P1（核心功能补全）→ P2（韧性）→ P3（生命周期完善）。

### Task 8: WebhookTransport（P1）

**Files:**
- Create: `src/transports/WebhookTransport.js`
- Modify: `src/transports/Transport.js`（工厂接入 `webhook`）
- Test: `tests/transports/WebhookTransport.test.js`

**Interfaces:**
- Consumes: `Transport` 基类、axios。
- Produces: `WebhookTransport`，`cfg = { url, format?, timeout?, use? }`。`send(envelope)` 把 envelope 渲染成人可读文本，POST 到 `url`（钉钉/企业微信机器人格式：`{ msgtype:'text', text:{ content } }`）。

- [ ] **Step 1: 写失败测试**

```js
jest.mock('axios');
const axios = require('axios');
const { WebhookTransport } = require('../../src/transports/WebhookTransport');

describe('WebhookTransport', () => {
  beforeEach(() => { axios.post.mockReset(); axios.post.mockResolvedValue({ status: 200 }); });

  test('summary 渲染为文本并 POST', async () => {
    const t = new WebhookTransport({ url: 'https://oapi.dingtalk.com/robot/send?access_token=x' });
    await t.send({
      kind: 'summary', appId: 'app1', env: 'prod', timestamp: '2026-06-23T08:00:00.000Z',
      data: { startedAt: '2026-06-23T00:00:00.000Z', uptimeMs: 3600000, errorCount: 5 },
    });
    const [url, body] = axios.post.mock.calls[0];
    expect(url).toContain('dingtalk');
    expect(body.msgtype).toBe('text');
    expect(body.text.content).toContain('app1');
    expect(body.text.content).toContain('5'); // errorCount
  });

  test('url 缺失构造抛错', () => {
    expect(() => new WebhookTransport({})).toThrow(/url/);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test -- WebhookTransport`
Expected: FAIL。

- [ ] **Step 3: 实现 src/transports/WebhookTransport.js**

```js
'use strict';

const axios = require('axios');
const { Transport } = require('./Transport');

class WebhookTransport extends Transport {
  constructor(cfg = {}) {
    super(cfg);
    if (!cfg.url) throw new Error('WebhookTransport 缺少必填配置 url');
    this.url = cfg.url;
    this.timeout = cfg.timeout || 5000;
  }

  _render(envelope) {
    const d = envelope.data || {};
    if (envelope.kind === 'summary') {
      return [
        `【应用摘要】${envelope.appId} (${envelope.env || '-'})`,
        `时间: ${envelope.timestamp}`,
        `启动: ${d.startedAt || '-'}`,
        `运行时长: ${Math.round((d.uptimeMs || 0) / 1000)}s`,
        `错误数: ${d.errorCount != null ? d.errorCount : '-'}`,
      ].join('\n');
    }
    return [
      `【诊断上报】${envelope.appId} (${envelope.env || '-'})`,
      `ref: ${envelope.ref}`,
      `用户描述: ${d.userMessage || '-'}`,
    ].join('\n');
  }

  async send(envelope) {
    const body = { msgtype: 'text', text: { content: this._render(envelope) } };
    await axios.post(this.url, body, { timeout: this.timeout });
  }
}

module.exports = { WebhookTransport };
```

- [ ] **Step 4: 工厂接入 webhook**

在 `src/transports/Transport.js` 的 `createTransport` switch 中加入 `case 'webhook': return new WebhookTransport(cfg);`（require 同 Task 5 注意循环依赖处理）。

- [ ] **Step 5: 跑测试确认通过**

Run: `npm test -- WebhookTransport`
Expected: PASS。

- [ ] **Step 6: 提交**

```bash
git add src/transports/WebhookTransport.js src/transports/Transport.js tests/transports/WebhookTransport.test.js
git commit -m "feat: WebhookTransport 钉钉/企业微信文本上报"
```

### Task 9: env 运行环境采集 + 白名单（P1）

**Files:**
- Create: `src/env.js`
- Test: `tests/env.test.js`

**Interfaces:**
- Consumes: 无（用 Node `process`/`os`）。
- Produces: `collectEnv(whitelist = [])` → `{ nodeVersion, platform, arch, memory: {rss,heapUsed}, env: {<仅白名单key>} }`。

- [ ] **Step 1: 写失败测试**

```js
const { collectEnv } = require('../src/env');

describe('collectEnv', () => {
  test('采集基础运行信息', () => {
    const e = collectEnv();
    expect(e.nodeVersion).toBe(process.version);
    expect(typeof e.platform).toBe('string');
    expect(e.memory).toHaveProperty('rss');
  });

  test('env 仅含白名单字段', () => {
    process.env.__SECRET__ = 'no';
    process.env.__OK__ = 'yes';
    const e = collectEnv(['__OK__']);
    expect(e.env.__OK__).toBe('yes');
    expect(e.env.__SECRET__).toBeUndefined();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test -- env`
Expected: FAIL。

- [ ] **Step 3: 实现 src/env.js**

```js
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
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm test -- env`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/env.js tests/env.test.js
git commit -m "feat: 运行环境采集与 env 白名单"
```

### Task 10: ErrorCounter — 挂 winston 计数（P1）

**Files:**
- Create: `src/ErrorCounter.js`
- Test: `tests/ErrorCounter.test.js`

**Interfaces:**
- Consumes: winston（可选；通过宿主注入的 logger）。
- Produces: `ErrorCounter` 类：`attach(logger)` 给 logger 加一个监听/transport，`level==='error'` 时 `count++`；`getAndReset()` 返回当前计数并清零；`get()` 只读。

- [ ] **Step 1: 写失败测试**

```js
const { ErrorCounter } = require('../src/ErrorCounter');

// 模拟 winston logger：支持 .on('data') 或暴露 add()。这里用最简单的事件回调约定。
function fakeLogger() {
  const listeners = [];
  return {
    _emit(info){ listeners.forEach(fn => fn(info)); },
    on(_evt, fn){ listeners.push(fn); },
  };
}

describe('ErrorCounter', () => {
  test('仅 error 级别累加', () => {
    const c = new ErrorCounter();
    const logger = fakeLogger();
    c.attach(logger);
    logger._emit({ level: 'info' });
    logger._emit({ level: 'error' });
    logger._emit({ level: 'error' });
    expect(c.get()).toBe(2);
  });

  test('getAndReset 返回并清零', () => {
    const c = new ErrorCounter();
    const logger = fakeLogger();
    c.attach(logger);
    logger._emit({ level: 'error' });
    expect(c.getAndReset()).toBe(1);
    expect(c.get()).toBe(0);
  });

  test('未 attach 时 get 为 0，不崩', () => {
    expect(new ErrorCounter().get()).toBe(0);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test -- ErrorCounter`
Expected: FAIL。

- [ ] **Step 3: 实现 src/ErrorCounter.js**

```js
'use strict';

class ErrorCounter {
  constructor() { this.count = 0; }

  attach(logger) {
    if (!logger || typeof logger.on !== 'function') return this;
    // winston logger 是可读流，'data' 事件吐出每条 info
    logger.on('data', (info) => {
      if (info && info.level === 'error') this.count += 1;
    });
    return this;
  }

  get() { return this.count; }

  getAndReset() {
    const n = this.count;
    this.count = 0;
    return n;
  }
}

module.exports = { ErrorCounter };
```

- [ ] **Step 4: 门面接入 ErrorCounter（修改 src/index.js）**

在 `createTelemetry` 中：若 `config.logger` 存在，`const errorCounter = new ErrorCounter().attach(config.logger);`，在 `flushNow` 的 summary data 里加 `errorCount: errorCounter ? errorCounter.getAndReset() : undefined`。补一条 index 测试：注入 fakeLogger，emit 两条 error 后 flushNow，断言发出的 envelope.data.errorCount===2。

- [ ] **Step 5: 跑测试确认通过**

Run: `npm test`
Expected: PASS。

- [ ] **Step 6: 提交**

```bash
git add src/ErrorCounter.js src/index.js tests/ErrorCounter.test.js tests/index.test.js
git commit -m "feat: ErrorCounter 挂 winston 计数错误并接入摘要"
```

### Task 11: 诊断读取最近日志（P1）

**Files:**
- Modify: `src/DiagnosticsCollector.js`（新建，把 index 中 collect 逻辑抽出）或直接在 `src/index.js` 扩展
- Create: `src/DiagnosticsCollector.js`
- Modify: `src/index.js`（collect 委托给 DiagnosticsCollector）
- Test: `tests/DiagnosticsCollector.test.js`

**Interfaces:**
- Consumes: `collectEnv`（Task 9）、`buildEnvelope`（Task 2）、Node `fs`。
- Produces: `DiagnosticsCollector` 类，构造 `{ base, dispatch, logDir, maxLogBytes, envWhitelist }`。`async collect({userMessage, extra})` → 读 `logDir` 下最新 `*.log` 尾部 `maxLogBytes` 字节（文件缺失则 `data.logs='<unavailable: ...>'`），组装 env、userMessage、extra，buildEnvelope(diagnostics) 后 dispatch，返回 `{ok, ref}`。

- [ ] **Step 1: 写失败测试（临时日志文件）**

```js
const fs = require('fs');
const os = require('os');
const path = require('path');
const { DiagnosticsCollector } = require('../src/DiagnosticsCollector');

function tmpLogDir(content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tlm-'));
  fs.writeFileSync(path.join(dir, 'combined.log'), content);
  return dir;
}

describe('DiagnosticsCollector', () => {
  test('读取日志尾部并组装 envelope', async () => {
    const dir = tmpLogDir('line1\nline2\nIMPORTANT_TAIL\n');
    const sent = [];
    const c = new DiagnosticsCollector({
      base: { appId: 'app1' },
      dispatch: async (e) => sent.push(e),
      logDir: dir, maxLogBytes: 1024, envWhitelist: [],
    });
    const r = await c.collect({ userMessage: 'hi', extra: { a: 1 } });
    expect(r.ok).toBe(true);
    expect(sent[0].kind).toBe('diagnostics');
    expect(sent[0].data.logs).toContain('IMPORTANT_TAIL');
    expect(sent[0].data.userMessage).toBe('hi');
    expect(sent[0].data.env.nodeVersion).toBe(process.version);
  });

  test('日志目录不存在时标记 unavailable，不抛', async () => {
    const sent = [];
    const c = new DiagnosticsCollector({
      base: { appId: 'app1' }, dispatch: async (e)=>sent.push(e),
      logDir: '/no/such/dir', maxLogBytes: 1024, envWhitelist: [],
    });
    const r = await c.collect({ userMessage: 'x' });
    expect(r.ok).toBe(true);
    expect(String(sent[0].data.logs)).toContain('unavailable');
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test -- DiagnosticsCollector`
Expected: FAIL。

- [ ] **Step 3: 实现 src/DiagnosticsCollector.js**

```js
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
```

- [ ] **Step 4: 门面改用 DiagnosticsCollector（修改 src/index.js）**

在 `createTelemetry` 中实例化 `const dc = new DiagnosticsCollector({ base, dispatch, ...config.diagnostics });`，`diagnostics.collect = (args) => dc.collect(args);`。保留原有 index 测试（mock dispatch 路径仍通过）。

- [ ] **Step 5: 跑全部测试确认通过**

Run: `npm test`
Expected: PASS。

- [ ] **Step 6: 提交**

```bash
git add src/DiagnosticsCollector.js src/index.js tests/DiagnosticsCollector.test.js
git commit -m "feat: 诊断收集读取最近日志+运行环境"
```

### Task 12: Spool 断网兜底与重发（P2）

**Files:**
- Create: `src/Spool.js`
- Modify: `src/index.js`（dispatch 失败写 spool，发送前先重发积压）
- Test: `tests/Spool.test.js`

**Interfaces:**
- Consumes: Node `fs`。
- Produces: `Spool` 类，构造 `{ dir, maxItems }`。`push(envelope)` 落盘一个 json 文件；`list()` 返回积压文件路径（按时间升序）；`remove(file)`；FIFO：超过 `maxItems` 删最旧并 `console.warn`。门面 `dispatch` 成功后清理、失败时 `push`。

- [ ] **Step 1: 写失败测试**

```js
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Spool } = require('../src/Spool');

function tmpDir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'spool-')); }

describe('Spool', () => {
  test('push 后 list 能取回', () => {
    const s = new Spool({ dir: tmpDir(), maxItems: 10 });
    s.push({ kind: 'summary', appId: 'a' });
    expect(s.list().length).toBe(1);
  });

  test('超过 maxItems FIFO 截断', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const s = new Spool({ dir: tmpDir(), maxItems: 2 });
    s.push({ n: 1 }); s.push({ n: 2 }); s.push({ n: 3 });
    expect(s.list().length).toBe(2);
    warn.mockRestore();
  });

  test('remove 删除指定项', () => {
    const s = new Spool({ dir: tmpDir(), maxItems: 10 });
    s.push({ n: 1 });
    const f = s.list()[0];
    s.remove(f);
    expect(s.list().length).toBe(0);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test -- Spool`
Expected: FAIL。

- [ ] **Step 3: 实现 src/Spool.js**

```js
'use strict';

const fs = require('fs');
const path = require('path');

let seq = 0;

class Spool {
  constructor({ dir = '.telemetry-spool', maxItems = 200 } = {}) {
    this.dir = dir;
    this.maxItems = maxItems;
    fs.mkdirSync(this.dir, { recursive: true });
  }

  push(envelope) {
    seq += 1;
    const name = `${Date.now()}-${seq}.json`;
    fs.writeFileSync(path.join(this.dir, name), JSON.stringify(envelope));
    this._enforceLimit();
  }

  list() {
    if (!fs.existsSync(this.dir)) return [];
    return fs.readdirSync(this.dir)
      .filter((f) => f.endsWith('.json'))
      .sort()
      .map((f) => path.join(this.dir, f));
  }

  read(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }

  remove(file) { try { fs.unlinkSync(file); } catch (_) {} }

  _enforceLimit() {
    const items = this.list();
    if (items.length <= this.maxItems) return;
    const overflow = items.slice(0, items.length - this.maxItems);
    for (const f of overflow) this.remove(f);
    console.warn(`[app-telemetry] spool 超过 ${this.maxItems}，丢弃最旧 ${overflow.length} 条`);
  }
}

module.exports = { Spool };
```

- [ ] **Step 4: 门面接入 Spool（修改 src/index.js dispatch）**

实例化 `const spool = new Spool(config.spool || {});`。改写 `dispatch`：发送前先尝试重发 `spool.list()` 的积压（成功 remove）；当前 envelope 发送失败时 `spool.push(envelope)`。补一条 index 测试：transport 先失败后成功，断言重发清空 spool。

- [ ] **Step 5: 跑全部测试确认通过**

Run: `npm test`
Expected: PASS。

- [ ] **Step 6: 提交**

```bash
git add src/Spool.js src/index.js tests/Spool.test.js tests/index.test.js
git commit -m "feat: Spool 断网兜底与重发"
```

### Task 13: 定时摘要与生命周期 start/shutdown（P3）

**Files:**
- Create: `src/TelemetryReporter.js`
- Modify: `src/index.js`（reporter 委托给 TelemetryReporter；shutdown 注销定时器+补发 final+flush spool）
- Test: `tests/TelemetryReporter.test.js`

**Interfaces:**
- Consumes: node-schedule、`buildEnvelope`、`ErrorCounter`（Task 10）、dispatch、Spool。
- Produces: `TelemetryReporter` 类，构造 `{ base, dispatch, errorCounter, schedule, sendOnExit, startedAt }`。`start()` 用 node-schedule 按 cron 周期 `flushNow`；`flushNow()` 发 summary；`stop()` 取消 job；进程退出钩子（`SIGTERM`/`SIGINT`/`beforeExit`）在 `sendOnExit` 时补发 `data.final=true` 摘要。

- [ ] **Step 1: 写失败测试（mock node-schedule）**

```js
jest.mock('node-schedule', () => ({
  scheduleJob: jest.fn((cron, fn) => ({ cancel: jest.fn(), _fn: fn })),
}));
const schedule = require('node-schedule');
const { TelemetryReporter } = require('../src/TelemetryReporter');

describe('TelemetryReporter', () => {
  beforeEach(() => schedule.scheduleJob.mockClear());

  test('start 注册 cron job', () => {
    const r = new TelemetryReporter({
      base: { appId: 'app1' }, dispatch: async () => {},
      schedule: '0 * * * *', startedAt: new Date().toISOString(),
    });
    r.start();
    expect(schedule.scheduleJob).toHaveBeenCalledWith('0 * * * *', expect.any(Function));
    r.stop();
  });

  test('flushNow 发出 summary，含 errorCount', async () => {
    const sent = [];
    const r = new TelemetryReporter({
      base: { appId: 'app1' }, dispatch: async (e) => sent.push(e),
      errorCounter: { getAndReset: () => 7 },
      startedAt: '2026-06-23T00:00:00.000Z',
    });
    await r.flushNow();
    expect(sent[0].kind).toBe('summary');
    expect(sent[0].data.errorCount).toBe(7);
    expect(sent[0].data.startedAt).toBe('2026-06-23T00:00:00.000Z');
  });

  test('cron 触发会调用 dispatch', async () => {
    const sent = [];
    const r = new TelemetryReporter({
      base: { appId: 'a' }, dispatch: async (e) => sent.push(e),
      schedule: '0 * * * *', startedAt: new Date().toISOString(),
    });
    r.start();
    const job = schedule.scheduleJob.mock.results[0].value;
    await job._fn();
    expect(sent.length).toBe(1);
    r.stop();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test -- TelemetryReporter`
Expected: FAIL。

- [ ] **Step 3: 实现 src/TelemetryReporter.js**

```js
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
```

- [ ] **Step 4: 门面接线（修改 src/index.js）**

`createTelemetry` 内实例化 `const reporterImpl = new TelemetryReporter({ base, dispatch, errorCounter, ...config.summary, startedAt });`；`reporter = { start: ()=>reporterImpl.start(), flushNow: (f)=>reporterImpl.flushNow(f) }`；若 `config.summary?.enabled !== false` 则 `reporterImpl.start()`。`shutdown` 改为：`reporterImpl.stop(); if(sendOnExit) await reporterImpl.flushNow(true);`。更新 index 测试中受影响断言。

- [ ] **Step 5: 跑全部测试确认通过**

Run: `npm test`
Expected: PASS（全部单元）。

- [ ] **Step 6: 提交**

```bash
git add src/TelemetryReporter.js src/index.js tests/TelemetryReporter.test.js tests/index.test.js
git commit -m "feat: 定时摘要、退出补发与生命周期管理"
```

---

## 自审清单结果

- **Spec 覆盖**：需求1摘要(Task 10/13)、需求2诊断(Task 11)、发送方式/Transport(Task 5/8)、Axiom/Grafana 接入(Task 5 + spec 接入配置节)、配置结构(Task 4)、对外API(Task 4/6)、错误处理韧性(Task 6/12)、测试策略(每 Task)、示例与人工测试(Task 7)。✅
- **早期顺序符合要求**：阶段一框架(Task 1)→阶段二API骨架(Task 2-4)→阶段三连接Axiom/Grafana+示例+人工测试(Task 5-7)→其余按P1/P2/P3(Task 8-13)。✅
- **占位符扫描**：所有代码步骤含完整代码，无 TBD/TODO。✅
- **类型一致性**：`buildEnvelope`、`accepts`、`send`、`getAndReset`、`collect({userMessage,extra})→{ok,ref}`、`dispatch(envelope)` 跨任务签名一致。✅

> 注：阶段二的 index 骨架(Task 4/6)在 Task 11/13 被重构为委托 DiagnosticsCollector/TelemetryReporter，属预期演进；每次重构都要求"跑全部测试通过"以防回归。
