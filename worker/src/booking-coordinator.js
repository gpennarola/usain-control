/**
 * USAIN booking coordinator — pure schedule eligibility, no side effects.
 * This module does not dispatch GitHub Actions or book GoBright resources.
 * Activation requires reviewed workflow coordination and durable idempotency.
 */
export function romeClock(instant) {
  const date = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(date.getTime())) throw new TypeError('Invalid instant');
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit',
    day: '2-digit', hour: '2-digit', minute: '2-digit',
    second: '2-digit', hourCycle: 'h23'
  }).formatToParts(date);
  const p = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    hour: Number(p.hour), minute: Number(p.minute), second: Number(p.second),
    isoLocal: `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`
  };
}

export function bookingWindow(instant, { openingHour = 21, leadMinutes = 15 } = {}) {
  if (!Number.isInteger(openingHour) || openingHour < 0 || openingHour > 23)
    throw new RangeError('openingHour must be 0..23');
  if (!Number.isInteger(leadMinutes) || leadMinutes < 0 || leadMinutes > 30)
    throw new RangeError('leadMinutes must be 0..30');
  const clock = romeClock(instant);
  const minutes = clock.hour * 60 + clock.minute;
  const opening = openingHour * 60;
  return {
    ...clock, openingHour,
    inPreparationWindow: minutes >= opening - leadMinutes && minutes < opening,
    atOpeningMinute: minutes === opening,
    eventKey: `${clock.date}/${String(openingHour).padStart(2, '0')}:00/Europe-Rome`
  };
}
