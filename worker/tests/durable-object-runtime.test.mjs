import assert from 'node:assert/strict';
import { Miniflare } from 'miniflare';

// Isolated workerd runtime; never contacts GitHub Actions or GoBright.
// This script uses an in-memory Durable Object namespace and a dedicated test worker.
const mf = new Miniflare({
  modules: true,
  script: `
    export class UsainBookingLock {
      constructor(ctx) { this.ctx = ctx; }
      async fetch(request) {
        if (request.method !== 'POST') return new Response('Method not allowed', {status:405});
        const {eventKey} = await request.json();
        if (typeof eventKey !== 'string' || !/^\\d{4}-\\d{2}-\\d{2}\\/\\d{2}:00\\/Europe-Rome$/.test(eventKey))
          return new Response('Invalid event', {status:400});
        const claimed = await this.ctx.storage.transaction(async tx => {
          if (await tx.get(eventKey)) return false;
          await tx.put(eventKey, {state:'claimed'});
          return true;
        });
        return Response.json({claimed});
      }
    }
    export default {
      async fetch(request, env) {
        const stub = env.USAIN_BOOKING_LOCK.get(env.USAIN_BOOKING_LOCK.idFromName('booking-coordinator'));
        return stub.fetch(request);
      }
    };
  `,
  durableObjects: { USAIN_BOOKING_LOCK: 'UsainBookingLock' },
  compatibilityDate: '2026-09-26'
});
try {
  const request = () => mf.dispatchFetch('https://isolated.example/claim', {
    method: 'POST', headers: {'content-type':'application/json'},
    body: JSON.stringify({eventKey:'2026-10-27/21:00/Europe-Rome'})
  });
  const responses = await Promise.all(Array.from({length:10},request));
  const values = await Promise.all(responses.map(r=>r.json()));
  assert.equal(values.filter(v=>v.claimed).length,1);
  assert.equal(values.filter(v=>!v.claimed).length,9);
  console.log('Isolated workerd Durable Object concurrency: 1 claim, 9 rejected');
} finally {
  await mf.dispose();
}
