const assert = require('assert');
const mod = require('./main.js');
const compute = mod.computeTodayDateForTimezone;
if (!compute) {
    console.error('computeTodayDateForTimezone not exported from main.js');
    process.exit(2);
}

// 固定の現在時刻（UTC）: 2026-01-18T15:30:00Z
const now = new Date(Date.UTC(2026, 0, 18, 15, 30, 0));

// UTC の場合は同日 00:00 UTC
const r1 = compute('UTC', now);
assert.strictEqual(r1.getTime(), Date.UTC(2026, 0, 18), 'UTC case failed');

// +09:00 の場合、UTC に +9 時すると 2026-01-19 00:30 => 日付は 2026-01-19
const r2 = compute('+09:00', now);
assert.strictEqual(r2.getTime(), Date.UTC(2026, 0, 19), '+09:00 case failed');

// -05:00 の場合、UTC に -5 時すると 2026-01-18 10:30 => 日付は 2026-01-18
const r3 = compute('-05:00', now);
assert.strictEqual(r3.getTime(), Date.UTC(2026, 0, 18), "-05:00 case failed");

console.log('test_getTodayDate.js: OK');
