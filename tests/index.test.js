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

describe('ErrorCounter 接入摘要', () => {
  test('注入 logger 后 flushNow 携带 errorCount', async () => {
    const listeners = [];
    const logger = { on(_e, fn){ listeners.push(fn); } };
    const t = createTelemetry({ appId: 'app1', logger });
    const tr = fakeTransport(['summary']);
    t._transports.length = 0; t._transports.push(tr);
    listeners.forEach(fn => fn({ level: 'info' }));
    listeners.forEach(fn => fn({ level: 'error' }));
    listeners.forEach(fn => fn({ level: 'error' }));
    await t.reporter.flushNow();
    expect(tr.sent[0].data.errorCount).toBe(2);
  });
});
