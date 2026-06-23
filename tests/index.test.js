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
