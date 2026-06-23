const { ErrorCounter } = require('../src/ErrorCounter');

// 模拟 winston logger：支持 .on('data')。winston logger 是可读流，'data' 事件吐出每条 info。
function fakeLogger() {
  const listeners = [];
  return {
    _emit(info){ listeners.forEach(fn => fn(info)); },
    on(_evt, fn){ listeners.push(fn); },
  };
}

describe('ErrorCounter', () => {
  test('仅 error 级别累加', () => {
    const c = new ErrorCounter();
    const logger = fakeLogger();
    c.attach(logger);
    logger._emit({ level: 'info' });
    logger._emit({ level: 'error' });
    logger._emit({ level: 'error' });
    expect(c.get()).toBe(2);
  });

  test('getAndReset 返回并清零', () => {
    const c = new ErrorCounter();
    const logger = fakeLogger();
    c.attach(logger);
    logger._emit({ level: 'error' });
    expect(c.getAndReset()).toBe(1);
    expect(c.get()).toBe(0);
  });

  test('未 attach 时 get 为 0，不崩', () => {
    expect(new ErrorCounter().get()).toBe(0);
  });
});
