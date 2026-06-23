jest.mock('node-schedule', () => ({
  scheduleJob: jest.fn((cron, fn) => ({ cancel: jest.fn(), _fn: fn })),
}));
const schedule = require('node-schedule');
const { TelemetryReporter } = require('../src/TelemetryReporter');

describe('TelemetryReporter', () => {
  beforeEach(() => schedule.scheduleJob.mockClear());

  test('start 注册 cron job', () => {
    const r = new TelemetryReporter({
      base: { appId: 'app1' }, dispatch: async () => {},
      schedule: '0 * * * *', startedAt: new Date().toISOString(),
    });
    r.start();
    expect(schedule.scheduleJob).toHaveBeenCalledWith('0 * * * *', expect.any(Function));
    r.stop();
  });

  test('flushNow 发出 summary，含 errorCount', async () => {
    const sent = [];
    const r = new TelemetryReporter({
      base: { appId: 'app1' }, dispatch: async (e) => sent.push(e),
      errorCounter: { getAndReset: () => 7 },
      startedAt: '2026-06-23T00:00:00.000Z',
    });
    await r.flushNow();
    expect(sent[0].kind).toBe('summary');
    expect(sent[0].data.errorCount).toBe(7);
    expect(sent[0].data.startedAt).toBe('2026-06-23T00:00:00.000Z');
  });

  test('cron 触发会调用 dispatch', async () => {
    const sent = [];
    const r = new TelemetryReporter({
      base: { appId: 'a' }, dispatch: async (e) => sent.push(e),
      schedule: '0 * * * *', startedAt: new Date().toISOString(),
    });
    r.start();
    const job = schedule.scheduleJob.mock.results[0].value;
    await job._fn();
    expect(sent.length).toBe(1);
    r.stop();
  });
});
