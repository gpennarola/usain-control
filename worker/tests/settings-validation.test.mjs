import test from 'node:test';
import assert from 'node:assert/strict';
import { validate, retainOmittedFields, SLOT_PRIORITIES } from '../src/settings-validation.js';

const rule = (extra = {}) => ({ id: 1, label: 'Sala Studenti', days: [2, 3], start: '15:00', end: '19:00', enabled: true, ...extra });
const settings = (extra = {}) => ({ schedules: [rule()], skipTomorrow: null, tomorrowOverride: null, ...extra });

test('settings without a slot priority stay valid', () => {
  assert.equal(validate(settings()), true);
});

test('afternoon and morning are the only accepted priorities', () => {
  assert.deepEqual(SLOT_PRIORITIES, ['afternoon', 'morning']);
  assert.equal(validate(settings({ slotPriority: 'afternoon' })), true);
  assert.equal(validate(settings({ slotPriority: 'morning' })), true);
  assert.equal(validate(settings({ slotPriority: 'evening' })), false);
  assert.equal(validate(settings({ slotPriority: null })), false);
  assert.equal(validate(settings({ slotPriority: 1 })), false);
});

test('existing rule checks are unchanged', () => {
  assert.equal(validate(settings({ schedules: [rule({ start: '19:00', end: '15:00' })] })), false);
  assert.equal(validate(settings({ schedules: [rule(), rule()] })), false);
  assert.equal(validate(settings({ schedules: [rule(), rule({ id: 2, start: '16:00', end: '18:00' })] })), false);
  assert.equal(validate(settings({ schedules: [rule(), rule({ id: 2, start: '09:00', end: '13:00' })] })), true);
  assert.equal(validate(settings({ skipTomorrow: '2026-13-40' })), false);
  assert.equal(validate(null), false);
});

test('a save from a screen that omits the priority keeps the stored one', () => {
  const previous = settings({ slotPriority: 'morning', schedules: [rule({ openingTime: '21:00', preference: 'rooms_only' })] });
  const fromHome = retainOmittedFields(settings(), previous);
  assert.equal(fromHome.slotPriority, 'morning');
  assert.equal(fromHome.schedules[0].preference, 'rooms_only');
  assert.equal(fromHome.schedules[0].openingTime, '21:00');
});

test('an explicit priority replaces the stored one, and none is invented', () => {
  assert.equal(retainOmittedFields(settings({ slotPriority: 'afternoon' }), settings({ slotPriority: 'morning' })).slotPriority, 'afternoon');
  assert.equal('slotPriority' in retainOmittedFields(settings(), settings()), false);
});
