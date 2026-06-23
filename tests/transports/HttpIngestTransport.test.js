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
