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

describe('Spool 目录不可写时降级', () => {
  test('构造不抛错，enabled=false', () => {
    // 用一个不可写的父目录构造 spool 子目录（mkdirSync 会失败）
    const parent = tmpDir();
    fs.chmodSync(parent, 0o555); // 只读，无法在其下创建子目录
    let s;
    try {
      s = new Spool({ dir: path.join(parent, 'spool-sub'), maxItems: 10 });
    } finally {
      fs.chmodSync(parent, 0o755); // 恢复以便清理
    }
    expect(s.enabled).toBe(false);
  });

  test('disabled 时 push 不抛、list 返回空、不影响调用方', () => {
    const parent = tmpDir();
    fs.chmodSync(parent, 0o555);
    let s;
    try {
      s = new Spool({ dir: path.join(parent, 'spool-sub'), maxItems: 10 });
    } finally {
      fs.chmodSync(parent, 0o755);
    }
    expect(() => s.push({ n: 1 })).not.toThrow();
    expect(s.list()).toEqual([]);
  });

  test('disabled 时 read/remove 也安全 no-op', () => {
    const parent = tmpDir();
    fs.chmodSync(parent, 0o555);
    let s;
    try {
      s = new Spool({ dir: path.join(parent, 'spool-sub'), maxItems: 10 });
    } finally {
      fs.chmodSync(parent, 0o755);
    }
    expect(() => s.remove('/nonexistent/file')).not.toThrow();
  });
});
