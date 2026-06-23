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
