/**
 * Stateless coordinator decision. Does not send requests or create bookings.
 * Cron execution and persistent ledger must be wired only after review.
 */
import { bookingWindow } from './booking-coordinator.js';

export function coordinatorDecision(instant, options = {}) {
  const time = bookingWindow(instant, options);
  return {
    eventKey: time.eventKey,
    shouldPrepare: time.inPreparationWindow,
    shouldOpen: time.atOpeningMinute,
    action: time.inPreparationWindow ? 'candidate_for_durable_claim' : 'none',
    localTime: time.isoLocal
  };
}
