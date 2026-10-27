import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/usain-booking-lock.js', import.meta.url), 'utf8');
const { UsainBookingLock } = await import('data:text/javascript,' + encodeURIComponent(source));

function storage() {
  const records = new Map();
  let serial = Promise.resolve();
  return {
    async get(key) { return records.get(key); },
    transaction(fn) {
      const task = serial.then(() => fn({
        get: async key => records.get(key),
        put: async (key, value) => { records.set(key, value); }
      }));
      serial = task.then(() => undefined, () => undefined);
      return task;
    }
  };
}
function claim(lock, eventKey) {
  return lock.fetch(new Request('https://internal/claim', {
    method: 'POST', headers: {'content-type':'application/json'},
    body: JSON.stringify({eventKey})
  }));
}

test('ten concurrent claims allow exactly one winner', async () => {
  const lock = new UsainBookingLock({ storage: storage() });
  const responses = await Promise.all(Array.from({length:10}, () =>
    claim(lock, '2026-10-27/21:00/Europe-Rome')));
  const results = await Promise.all(responses.map(r => r.json()));
  assert.equal(results.filter(x => x.claimed).length, 1);
  assert.equal(results.filter(x => !x.claimed).length, 9);
});
test('different days are different booking events', async () => {
  const lock = new UsainBookingLock({ storage: storage() });
  assert.equal((await (await claim(lock,'2026-10-27/21:00/Europe-Rome')).json()).claimed, true);
  assert.equal((await (await claim(lock,'2026-10-28/21:00/Europe-Rome')).json()).claimed, true);
});
test('rejects invalid event and unsupported method', async () => {
  const lock = new UsainBookingLock({ storage: storage() });
  assert.equal((await claim(lock,'invalid')).status, 400);
  assert.equal((await lock.fetch(new Request('https://internal/claim'))).status, 405);
});

test('records accepted dispatch persistently and rejects duplicate claim', async () => {
  const lock = new UsainBookingLock({ storage: storage() });
  const eventKey = '2026-10-27/21:00/Europe-Rome';
  assert.equal((await (await claim(lock,eventKey)).json()).claimed,true);
  const recorded = await lock.fetch(new Request('https://internal/record', {
    method:'POST', headers:{'content-type':'application/json'},
    body:JSON.stringify({eventKey,status:'accepted_not_booked'})
  }));
  assert.equal((await recorded.json()).updated,true);
  const duplicate = await (await claim(lock,eventKey)).json();
  assert.equal(duplicate.claimed,false);
  assert.equal(duplicate.state,'accepted_not_booked');
});
test('cannot record without claim', async () => {
  const lock = new UsainBookingLock({ storage: storage() });
  const result = await lock.fetch(new Request('https://internal/record', {
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({eventKey:'2026-10-27/21:00/Europe-Rome',status:'unknown'})
  }));
  assert.equal((await result.json()).updated,false);
});
