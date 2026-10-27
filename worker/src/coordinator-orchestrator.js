import { coordinatorDecision } from './coordinator-decision.js';
import { createBookingDispatch, classifyDispatchStatus } from './github-dispatch.js';

/**
 * Orchestrates a single opening. In dry-run, no lock or network operations.
 * In live mode callers must explicitly supply transactional claim and transport.
 * A claim is never retried after an unknown network outcome.
 */
export async function coordinateBooking({
  instant, mode = 'dry-run', repository, token, claim, send, record = async () => {},
  openingHour = 21, leadMinutes = 15
}) {
  const decision = coordinatorDecision(instant, { openingHour, leadMinutes });
  if (!decision.shouldPrepare) return { status: 'outside_window', ...decision };
  if (mode === 'dry-run') return { status: 'simulated', ...decision };
  if (mode !== 'live') throw new Error('Invalid mode');
  if (typeof claim !== 'function' || typeof send !== 'function' || typeof record !== 'function')
    throw new Error('Missing durable claim or transport');
  // Validate dispatch prerequisites BEFORE claiming the event.
  const request = createBookingDispatch({
    repository, token, ref: 'main', waitUntilOpening: true
  });
  const locked = await claim(decision.eventKey);
  if (!locked || locked.claimed !== true) return { status: 'duplicate_suppressed', ...decision };
  try {
    const response = await send(request);
    const status = classifyDispatchStatus(response.status);
    await record(decision.eventKey, status).catch(() => {});
    return { status, ...decision };
  } catch {
    // The request may have reached GitHub. Never dispatch again automatically.
    await record(decision.eventKey, 'unknown').catch(() => {});
    return { status: 'unknown_not_retryable', ...decision };
  }
}
