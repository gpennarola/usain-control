import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/coordinator-claim.js', import.meta.url), 'utf8');
const { claimBookingEvent } = await import('data:text/javascript,' + encodeURIComponent(source));

test('claims via Durable Object stub, never GitHub', async () => {
  let calls = 0;
  const namespace = {
    idFromName: name => { assert.equal(name, 'booking-coordinator'); return name; },
    get: () => ({
      fetch: async (url, init) => {
        calls++;
        assert.equal(new URL(url).pathname, '/claim');
        assert.equal(init.method, 'POST');
        assert.equal(JSON.parse(init.body).eventKey, '2026-10-27/21:00/Europe-Rome');
        return { ok: true, json: async () => ({ claimed: true }) };
      }
    })
  };
  assert.deepEqual(await claimBookingEvent(namespace, '2026-10-27/21:00/Europe-Rome'), { claimed: true });
  assert.equal(calls, 1);
});
test('rejects missing binding or bad key', async () => {
  await assert.rejects(claimBookingEvent(null, '2026-10-27/21:00/Europe-Rome'));
  await assert.rejects(claimBookingEvent({ idFromName(){}, get(){} }, 'bad-key'));
});
test('does not retry if Durable Object reports already claimed', async () => {
  let calls = 0;
  const namespace = { idFromName: () => 'id', get: () => ({
    fetch: async () => { calls++; return { ok: true, json: async () => ({ claimed: false }) }; }
  }) };
  assert.equal((await claimBookingEvent(namespace, '2026-10-27/21:00/Europe-Rome')).claimed, false);
  assert.equal(calls, 1);
});
