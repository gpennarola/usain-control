import assert from 'node:assert/strict';
import { Miniflare } from 'miniflare';
import { readFile } from 'node:fs/promises';

// Isolated workerd runtime; never contacts GitHub Actions or GoBright.
// This script uses an in-memory Durable Object namespace and a dedicated test worker.
const mf = new Miniflare({
  modules: true,
  script: [
    await readFile(new URL('../src/usain-booking-lock.js', import.meta.url), 'utf8'),
    `export default {
      async fetch(request, env) {
        const stub = env.USAIN_BOOKING_LOCK.get(env.USAIN_BOOKING_LOCK.idFromName('booking-coordinator'));
        return stub.fetch(request);
      }
    };`
  ].join('\\n'),
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
