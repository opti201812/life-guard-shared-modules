# CSM 接入 app-telemetry 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans 实现本计划。步骤用 checkbox (`- [ ]`) 跟踪。

**Goal:** 将 `@life-guard/app-telemetry` 以 git submodule 方式接入 Collection Service Manager (CSM)，实现最小可用遥测：初始化 + 注入 winston logger 计数 error + flushNow/collect 可调用 + 优雅关闭补发 final 摘要。

**Architecture:** CSM 通过 `git submodule add` 引入 `life-guard-shared-modules`（置于 `shared/app-telemetry`），在 `src/app.js` 初始化 `createTelemetry`，注入现有 `logger`，在 `cleanup()` 中调用 `telemetry.shutdown()`。Axiom 用独立 `csm` dataset。

**Tech Stack:** CSM = CommonJS + Express + winston + axios；app-telemetry = CommonJS 模块。

## Global Constraints

- CSM 远端 `git@github.com:opti201812/life_csm.git`，当前分支 `develop/3/new`。接入在新分支 `feature/app-telemetry` 上进行。
- app-telemetry 远端 `https://github.com/opti201812/life-guard-shared-modules.git`，master 最新。
- 不动 CSM 业务逻辑，只在 app.js 加初始化与关闭接线。
- 模块自身错误绝不影响 CSM 启动/运行（createTelemetry 内部已 try/catch，但初始化本身也要包 try/catch）。
- CSM logger 已验证会触发 winston `data` 事件，ErrorCounter 计数可用。

---

## 文件结构

```
Collection Service Manager/
├── .gitmodules                      # 新增 shared/app-telemetry 条目
├── shared/app-telemetry/            # 新增 submodule（life-guard-shared-modules）
├── src/app.js                       # 修改：初始化 telemetry + cleanup 接 shutdown
├── .env                             # 修改：加 Axiom 占位配置
└── docs/app-telemetry-integration.md # 新增：接入说明
```

---

### Task 1: 在 CSM 创建分支并添加 submodule

**Files:**
- Modify: `.gitmodules`
- Create: `shared/app-telemetry/` (submodule)

- [ ] **Step 1: 在 CSM 建分支**

```bash
cd "Collection Service Manager"
git checkout -b feature/app-telemetry
```

- [ ] **Step 2: 添加 submodule**

```bash
git submodule add https://github.com/opti201812/life-guard-shared-modules.git shared/app-telemetry
```

- [ ] **Step 3: 确认 submodule 拉取成功**

```bash
ls shared/app-telemetry/src/index.js && cat .gitmodules
```
Expected: `src/index.js` 存在；`.gitmodules` 含 `[submodule "shared/app-telemetry"]`。

- [ ] **Step 4: 提交**

```bash
git add .gitmodules shared/app-telemetry
git commit -m "chore: 添加 app-telemetry submodule"
```

### Task 2: CSM package.json 不改依赖（submodule 直接 require）

> 说明：app-telemetry 的运行依赖（axios/node-schedule/uuid）CSM 已具备或可补。检查并补 uuid/node-schedule。

**Files:**
- Modify: `package.json`（仅在缺失时补依赖）

- [ ] **Step 1: 检查 CSM 是否已有 app-telemetry 运行依赖**

```bash
node -e "const p=require('./package.json'); ['axios','node-schedule','uuid'].forEach(d=>console.log(d, p.dependencies[d]||p.devDependencies?.[d]||'MISSING'))"
```

- [ ] **Step 2: 若 uuid 或 node-schedule 缺失，安装**

```bash
npm install uuid node-schedule 2>/dev/null || npm install uuid node-schedule
```
（axios CSM 已有。winston 已有。）

- [ ] **Step 3: 验证模块可加载**

```bash
node -e "const {createTelemetry}=require('./shared/app-telemetry/src'); console.log(typeof createTelemetry)"
```
Expected: `function`。

- [ ] **Step 4: 提交（若有 package.json 变更）**

```bash
git add package.json package-lock.json
git commit -m "chore: 补 app-telemetry 运行依赖" 2>/dev/null || echo "无依赖变更"
```

### Task 3: app.js 初始化 telemetry 并注入 logger

**Files:**
- Modify: `src/app.js`

**接入点：**
- 初始化：`startCSM()` 函数 try 块开头（logger 已就绪、machineCode 已设）。把 telemetry 实例挂到 `global`，供 collect 调用与 cleanup 访问。
- 关闭：`cleanup()` 内调用 `telemetry.shutdown()`（async，用 `.then`/`await` + 兜底超时，避免阻塞退出）。

- [ ] **Step 1: 在 app.js 顶部 require 区加导入**

在 `const { logger } = require('./utils/logger');` 之后插入：

```js
// app-telemetry 遥测模块（submodule）
const { createTelemetry } = require('../shared/app-telemetry/src');
```

- [ ] **Step 2: 在 startCSM() try 块开头初始化 telemetry**

在 `async function startCSM() {` 的 `try {` 之后、`logger.info('==> Starting CSM...');` 之前插入：

```js
        // 初始化应用遥测
        let telemetry = null;
        try {
            telemetry = createTelemetry({
                appId: 'csm',
                version: require('../package.json').version,
                env: process.env.NODE_ENV || 'development',
                logger,
                summary: {
                    enabled: process.env.TELEMETRY_SUMMARY_ENABLED !== 'false',
                    schedule: process.env.TELEMETRY_SUMMARY_CRON || '0 * * * *',
                    sendOnExit: true,
                },
                transports: buildTelemetryTransports(),
                diagnostics: {
                    logDir: process.env.CSM_LOG_DIR || 'tests/logs',
                    maxLogBytes: 256 * 1024,
                    envWhitelist: ['NODE_ENV', 'CSM_VERSION'],
                },
            });
            global.appTelemetry = telemetry;
            logger.info('==> app-telemetry 初始化完成');
        } catch (e) {
            logger.warn('==> app-telemetry 初始化失败（不影响启动）:', e.message);
        }
```

- [ ] **Step 3: 在 require 区之后、startCSM 之前加 buildTelemetryTransports 辅助函数**

在 `function cleanup()` 定义之前插入：

```js
// 构建 app-telemetry transports（按 .env 配置）
function buildTelemetryTransports() {
    const transports = [];
    if (process.env.AXIOM_TOKEN) {
        transports.push({
            type: 'httpIngest', vendor: 'axiom',
            region: process.env.AXIOM_REGION || 'eu-central-1',
            dataset: process.env.AXIOM_DATASET || 'csm',
            token: process.env.AXIOM_TOKEN,
            use: ['summary', 'diagnostics'],
        });
    }
    if (process.env.TELEMETRY_WEBHOOK_URL) {
        transports.push({
            type: 'webhook', url: process.env.TELEMETRY_WEBHOOK_URL,
            use: ['summary'],
        });
    }
    return transports;
}
```

- [ ] **Step 4: 在 cleanup() 中调用 telemetry.shutdown()**

在 `function cleanup() {` 内、`logger.info('Cleaning up connections...');` 之后插入：

```js
    // app-telemetry 优雅关闭：补发 final 摘要
    if (global.appTelemetry) {
        try {
            // shutdown 是 async，但 cleanup 同步退出进程——用 then 触发，不阻塞
            global.appTelemetry.shutdown().catch(() => {});
        } catch (_) {}
    }
```

> 注意：cleanup 末尾有 `process.exit(0)`。final 摘要发送是异步 HTTP，可能被 exit 截断。若需确保发出，可把 exit 延迟（见 Task 5 优化）。最小接入先这样，发送失败有 Spool 兜底。

- [ ] **Step 5: 语法检查**

```bash
node --check src/app.js && echo "syntax OK"
```
Expected: `syntax OK`。

- [ ] **Step 6: 提交**

```bash
git add src/app.js
git commit -m "feat: app.js 接入 app-telemetry（初始化+logger计数+关闭补发）"
```

### Task 4: 配置 .env 与接入说明文档

**Files:**
- Modify: `.env`
- Create: `docs/app-telemetry-integration.md`

- [ ] **Step 1: 在 .env 末尾追加遥测配置占位**

```bash
cat >> .env <<'EOF'

# ===== app-telemetry 遥测配置 =====
# Axiom（独立 csm dataset）
AXIOM_REGION=eu-central-1
AXIOM_DATASET=csm
AXIOM_TOKEN=
# 可选 Webhook（钉钉/企业微信）
TELEMETRY_WEBHOOK_URL=
# 摘要上报
TELEMETRY_SUMMARY_ENABLED=true
TELEMETRY_SUMMARY_CRON=0 * * * *
EOF
```

> 注意：.env 在 .gitignore 中（CSM 不提交 .env），所以这步只在本地生效，不入库。需同步在 `.env.example` 或文档里记录（Step 2）。

- [ ] **Step 2: 写接入说明 docs/app-telemetry-integration.md**

内容：submodule 路径、依赖、.env 配置项、Axiom dataset 申请步骤、collect 调用方式（供前端/路由后续接入）、已知限制（cleanup exit 可能截断 final 发送）。

- [ ] **Step 3: 提交**

```bash
git add docs/app-telemetry-integration.md
git commit -m "docs: app-telemetry 接入说明"
```

### Task 5: 验证接入

**Files:** 无（运行验证）

- [ ] **Step 1: 启动 CSM 确认 telemetry 初始化不报错**

```bash
# 先不填 AXIOM_TOKEN（transports 为空），验证初始化与启动正常
npm start 2>&1 | head -30
```
Expected: 日志含 `==> app-telemetry 初始化完成`，CSM 正常启动（无崩溃）。Ctrl+C 退出。

- [ ] **Step 2: 手动 flushNow/collect 冒烟（mock endpoint）**

写临时脚本 `scripts/telemetry-smoke.js`（不入库），用本地 mock server 验证 CSM 的 telemetry 实例能发 summary+diagnostics：

```bash
node scripts/telemetry-smoke.js
```
Expected: mock server 收到 summary + diagnostics 请求。

- [ ] **Step 3: 真实 Axiom 联调（需 csm dataset 已建 + token）**

填入 `.env` 的 `AXIOM_TOKEN`，启动 CSM，触发一次 flushNow（或临时脚本），确认 Axiom `csm` dataset 收到数据。

> 此步依赖你手动创建 csm dataset 并提供 token。若暂无，先跳过，标注待办。

- [ ] **Step 4: 提交验证脚本（可选，入 scripts/ 或不入）**

```bash
# 若保留冒烟脚本：
git add scripts/telemetry-smoke.js
git commit -m "test: telemetry 接入冒烟脚本"
```

---

## 自审

- **submodule 化**：Task 1 完成 git submodule add，CSM 可通过 `git clone --recursive` 拉到。
- **最小接入**：Task 2-3 完成初始化+logger+关闭，不动业务。
- **配置**：Task 4 .env + 文档。
- **验证**：Task 5 三级（空配置启动 / mock 冒烟 / 真实 Axiom）。
- **风险**：cleanup 同步 exit 可能截断 final 发送——最小接入靠 Spool 兜底，文档注明；真实 token 联调依赖你建 csm dataset。
