/**
 * USAIN: prepare a GitHub Actions dispatch request without sending it.
 * Production invocation requires an independent, durable idempotency guard.
 */
export function createBookingDispatch({ repository, token, ref = 'main', waitUntilOpening = true }) {
  if (repository !== 'gpennarola/gobright-auto-booking') throw new Error('Repository not allowed');
  if (typeof token !== 'string' || !token.trim()) throw new Error('Missing Actions token');
  if (ref !== 'main') throw new Error('Ref not allowed');
  return {
    url: 'https://api.github.com/repos/gpennarola/gobright-auto-booking/actions/workflows/book-desk.yml/dispatches',
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
      'User-Agent': 'usain-cloudflare-coordinator',
      'X-GitHub-Api-Version': '2022-11-28'
    },
    body: JSON.stringify({ ref, inputs: { wait_until_opening: Boolean(waitUntilOpening) } })
  };
}

export function classifyDispatchStatus(status) {
  if (status === 204) return 'accepted_not_booked';
  if (status === 401 || status === 403) return 'authentication_or_permission_error';
  if (status === 404) return 'workflow_or_repository_not_found';
  if (status === 429 || status >= 500) return 'retryable_remote_error';
  return 'dispatch_failed';
}
