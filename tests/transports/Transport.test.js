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
