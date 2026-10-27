/** Durable Object registry for one booking opening per Europe/Rome date.
 * No external requests. To activate, a separate reviewed coordinator must call
 * this object and then dispatch GitHub Actions with a failure-safe protocol.
 */
export class UsainBookingLock {
  constructor(ctx) { this.ctx = ctx; }
  async fetch(request) {
    if (request.method !== 'POST') return new Response('Method not allowed', {status:405});
    const url = new URL(request.url);
    if (url.pathname !== '/claim') return new Response('Not found', {status:404});
    let eventKey;
    try { ({eventKey} = await request.json()); } catch { return new Response('Invalid JSON', {status:400}); }
    if (typeof eventKey !== 'string' || !/^\d{4}-\d{2}-\d{2}\/\d{2}:00\/Europe-Rome$/.test(eventKey))
      return new Response('Invalid event', {status:400});
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
