'use strict';

const fs = require('fs');
const path = require('path');

let seq = 0;

class Spool {
  constructor({ dir = '.telemetry-spool', maxItems = 200 } = {}) {
    this.dir = dir;
    this.maxItems = maxItems;
    fs.mkdirSync(this.dir, { recursive: true });
  }

  push(envelope) {
    seq += 1;
    const name = `${Date.now()}-${seq}.json`;
    fs.writeFileSync(path.join(this.dir, name), JSON.stringify(envelope));
    this._enforceLimit();
  }

  list() {
    if (!fs.existsSync(this.dir)) return [];
    return fs.readdirSync(this.dir)
      .filter((f) => f.endsWith('.json'))
      .sort()
      .map((f) => path.join(this.dir, f));
  }

  read(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }

  remove(file) { try { fs.unlinkSync(file); } catch (_) {} }

  _enforceLimit() {
    const items = this.list();
    if (items.length <= this.maxItems) return;
    const overflow = items.slice(0, items.length - this.maxItems);
    for (const f of overflow) this.remove(f);
    console.warn(`[app-telemetry] spool 超过 ${this.maxItems}，丢弃最旧 ${overflow.length} 条`);
  }
}

module.exports = { Spool };
