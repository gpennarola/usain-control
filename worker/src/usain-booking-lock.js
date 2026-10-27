/** Durable Object registry for one booking opening per Europe/Rome date.
 * No external requests. To activate, a separate reviewed coordinator must call
 * this object and then dispatch GitHub Actions with a failure-safe protocol.
 */
export class UsainBookingLock {
  constructor(ctx) { this.ctx = ctx; }
  async fetch(request) {
    if (request.method !== 'POST') return new Response('Method not allowed', {status:405});
    const url = new URL(request.url);
    if (!['/claim','/record'].includes(url.pathname)) return new Response('Not found', {status:404});
    let eventKey, status;
    try { ({eventKey, status} = await request.json()); } catch { return new Response('Invalid JSON', {status:400}); }
    if (typeof eventKey !== 'string' || !/^\d{4}-\d{2}-\d{2}\/\d{2}:00\/Europe-Rome$/.test(eventKey))
      return new Response('Invalid event', {status:400});
    if (url.pathname === '/record') {
      if (!['accepted_not_booked','unknown','rejected','authentication_or_permission_error','workflow_or_repository_not_found','retryable_remote_error','dispatch_failed'].includes(status))
        return new Response('Invalid status', {status:400});
      const updated = await this.ctx.storage.transaction(async tx => {
        const current = await tx.get(eventKey);
        if (!current || current.state !== 'claimed') return false;
        await tx.put(eventKey, {...current, state:status, updatedAt:new Date().toISOString()});
        return true;
      });
      return Response.json({updated});
    }
    const found = await this.ctx.storage.get(eventKey);
    if (found) return Response.json({claimed:false, state:found.state});
    // A Durable Object serializes requests; use transaction to atomically claim.
    const claimed = await this.ctx.storage.transaction(async tx => {
      if (await tx.get(eventKey)) return false;
      await tx.put(eventKey, {state:'claimed', at:new Date().toISOString()});
      return true;
    });
    return Response.json({claimed});
  }
}
