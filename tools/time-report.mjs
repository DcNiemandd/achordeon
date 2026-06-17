#!/usr/bin/env node
// Totals from time.csv. Usage:
//   node tools/time-report.mjs            full report
//   node tools/time-report.mjs --month    group by month
//   node tools/time-report.mjs --task     group by task

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const csv = join(root, 'time.csv');

function parseRows() {
  return readFileSync(csv, 'utf8')
    .trim()
    .split(/\r?\n/)
    .slice(1) // drop header
    .filter(Boolean)
    .map((line, i) => {
      // task may contain commas; split only the first two
      const m = line.match(/^([^,]*),([^,]*),(.*)$/);
      if (!m) throw new Error(`Bad row ${i + 2}: ${line}`);
      const [, date, hours, task] = m;
      const h = Number(hours);
      if (Number.isNaN(h))
        throw new Error(`Bad hours on row ${i + 2}: ${hours}`);
      return { date: date.trim(), hours: h, task: task.trim() };
    });
}

function group(rows, keyFn, label) {
  const map = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    map.set(k, (map.get(k) ?? 0) + r.hours);
  }
  console.log(`\n${label}:`);
  for (const [k, v] of [...map].sort())
    console.log(`  ${k.padEnd(12)} ${v.toFixed(2)}h`);
}

function main() {
  const rows = parseRows();
  const total = rows.reduce((s, r) => s + r.hours, 0);
  const arg = process.argv[2];

  if (arg === '--month') group(rows, (r) => r.date.slice(0, 7), 'By month');
  else if (arg === '--task') group(rows, (r) => r.task, 'By task');
  else {
    console.log('\nAll entries:');
    for (const r of rows)
      console.log(`  ${r.date}  ${r.hours.toFixed(2)}h  ${r.task}`);
  }

  console.log(`\nTotal: ${total.toFixed(2)}h  (${rows.length} entries)\n`);
}

main();
