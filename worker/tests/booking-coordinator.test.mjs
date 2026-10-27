import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/booking-coordinator.js', import.meta.url), 'utf8');
const { bookingWindow, romeClock } = await import('data:text/javascript,' + encodeURIComponent(source));

test('preparation and opening time before end of daylight saving', () => {
  assert.equal(bookingWindow('2026-10-24T18:45:00Z').inPreparationWindow, true);
  assert.equal(bookingWindow('2026-10-24T19:00:00Z').atOpeningMinute, true);
});
test('preparation and opening time after end of daylight saving', () => {
  assert.equal(bookingWindow('2026-10-27T19:45:00Z').inPreparationWindow, true);
  assert.equal(bookingWindow('2026-10-27T20:00:00Z').atOpeningMinute, true);
  assert.equal(bookingWindow('2026-10-27T19:44:59Z').inPreparationWindow, false);
});
test('same opening hour across DST has stable Rome-local event key', () => {
  assert.equal(bookingWindow('2026-10-24T19:00:00Z').eventKey, '2026-10-24/21:00/Europe-Rome');
  assert.equal(bookingWindow('2026-10-27T20:00:00Z').eventKey, '2026-10-27/21:00/Europe-Rome');
});
test('invalid input rejected', () => {
  assert.throws(() => romeClock('not-a-date'), TypeError);
  assert.throws(() => bookingWindow(new Date(), { leadMinutes: -1 }), RangeError);
});
