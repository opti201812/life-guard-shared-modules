'use strict';

const fs = require('fs');
const path = require('path');

let seq = 0;

class Spool {
  constructor({ dir = '.telemetry-spool', maxItems = 200 } = {}) {
    this.dir = dir;
    this.maxItems = maxItems;
    this.enabled = true;
    try {
      fs.mkdirSync(this.dir, { recursive: true });
    } catch (e) {
      // 目录不可写（权限不足/只读文件系统等）：跳过持久化，telemetry 仍正常运行
      this.enabled = false;
      console.warn(`[app-telemetry] spool 目录不可写(${this.dir})，跳过持久化：${e.message}`);
    }
  }

  push(envelope) {
    if (!this.enabled) return;
    seq += 1;
    const name = `${Date.now()}-${seq}.json`;
    try {
      fs.writeFileSync(path.join(this.dir, name), JSON.stringify(envelope));
    } catch (e) {
      // 写入失败也降级关闭，避免后续反复尝试
      this.enabled = false;
    }
    this._enforceLimit();
  }

  list() {
    if (!this.enabled) return [];
    if (!fs.existsSync(this.dir)) return [];
    return fs.readdirSync(this.dir)
      .filter((f) => f.endsWith('.json'))
      .sort()
      .map((f) => path.join(this.dir, f));
  }

  read(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }

  remove(file) { try { fs.unlinkSync(file); } catch (_) {} }

  _enforceLimit() {
    if (!this.enabled) return;
    const items = this.list();
    if (items.length <= this.maxItems) return;
    const overflow = items.slice(0, items.length - this.maxItems);
    for (const f of overflow) this.remove(f);
    console.warn(`[app-telemetry] spool 超过 ${this.maxItems}，丢弃最旧 ${overflow.length} 条`);
  }
}

module.exports = { Spool };
