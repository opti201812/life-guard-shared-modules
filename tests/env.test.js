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
