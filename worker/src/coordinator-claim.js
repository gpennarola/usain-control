/**
 * Claims a booking event through the bound Durable Object.
 * Call this only after schedule eligibility, and before any external dispatch.
 * No external GitHub/GoBright network call is performed here.
 */
export async function claimBookingEvent(namespace, eventKey) {
  if (!namespace || typeof namespace.idFromName !== 'function' || typeof namespace.get !== 'function')
    throw new Error('USAIN_BOOKING_LOCK binding is missing');
  if (typeof eventKey !== 'string' || !/^\d{4}-\d{2}-\d{2}\/\d{2}:00\/Europe-Rome$/.test(eventKey))
    throw new Error('Invalid event key');
  const stub = namespace.get(namespace.idFromName('booking-coordinator'));
  const result = await stub.fetch('https://internal/claim', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ eventKey })
  });
  if (!result.ok) throw new Error('Lock rejected with status ' + result.status);
  const answer = await result.json();
  if (typeof answer.claimed !== 'boolean') throw new Error('Invalid lock response');
  return answer;
}
