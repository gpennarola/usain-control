/**
 * Persistent dispatch idempotency for USAIN.
 * Requires a transactional storage backend (e.g. a single Durable Object per event).
 * NOT yet wired to scheduled events or GitHub: no outbound requests.
 *
 * States are intentionally conservative: once a dispatch was attempted,
 * a network timeout is recorded as "unknown", not retried automatically.
 * A request might have reached GitHub even when its response was lost.
 */
export class DispatchLedger {
  constructor(storage) {
    if (!storage || typeof storage.transaction !== 'function')
      throw new TypeError('Transactional storage required');
    this.storage = storage;
  }

  async claim(eventKey, now = new Date().toISOString()) {
    if (!/^\d{4}-\d{2}-\d{2}\/\d{2}:00\/Europe-Rome$/.test(eventKey))
      throw new Error('Invalid event key');
    return this.storage.transaction(async tx => {
      const existing = await tx.get(eventKey);
      if (existing) return { claimed: false, record: existing };
      const record = { eventKey, state: 'claimed', claimedAt: now };
      await tx.put(eventKey, record);
      return { claimed: true, record };
    });
  }

  async recordAttempt(eventKey, status, now = new Date().toISOString()) {
    if (!['accepted_not_booked', 'unknown', 'rejected'].includes(status))
      throw new Error('Unsupported dispatch state');
    return this.storage.transaction(async tx => {
      const current = await tx.get(eventKey);
      if (!current || current.state !== 'claimed')
        return { updated: false, record: current || null };
      const record = { ...current, state: status, attemptAt: now };
      await tx.put(eventKey, record);
      return { updated: true, record };
    });
  }
}
