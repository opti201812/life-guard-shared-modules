const { createTelemetry } = require('../src');

describe('smoke', () => {
  test('createTelemetry 可调用并返回标准结构', () => {
    const t = createTelemetry({ appId: 'x', summary: { enabled: false } });
    expect(typeof t.shutdown).toBe('function');
    expect(t).toHaveProperty('reporter');
    expect(t).toHaveProperty('diagnostics');
  });
});
