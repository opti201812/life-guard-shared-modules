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
