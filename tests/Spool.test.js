const fs = require('fs');
const os = require('os');
const path = require('path');
const { Spool } = require('../src/Spool');

function tmpDir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'spool-')); }

describe('Spool', () => {
  test('push 后 list 能取回', () => {
    const s = new Spool({ dir: tmpDir(), maxItems: 10 });
    s.push({ kind: 'summary', appId: 'a' });
    expect(s.list().length).toBe(1);
  });

  test('超过 maxItems FIFO 截断', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const s = new Spool({ dir: tmpDir(), maxItems: 2 });
    s.push({ n: 1 }); s.push({ n: 2 }); s.push({ n: 3 });
    expect(s.list().length).toBe(2);
    warn.mockRestore();
  });

  test('remove 删除指定项', () => {
    const s = new Spool({ dir: tmpDir(), maxItems: 10 });
    s.push({ n: 1 });
    const f = s.list()[0];
    s.remove(f);
    expect(s.list().length).toBe(0);
  });
});
