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
