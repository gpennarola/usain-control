import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const src = await readFile(new URL('../src/dispatch-ledger.js', import.meta.url), 'utf8');
const { DispatchLedger } = await import('data:text/javascript,' + encodeURIComponent(src));

// A mock serial transaction queue; production must use genuine durable transactional storage.
function memoryStore() {
  const values = new Map();
  let queue = Promise.resolve();
  return {
    transaction(fn) {
      const work = queue.then(() => fn({
        get: async key => values.get(key),
        put: async (key, value) => { values.set(key, value); }
      }));
      queue = work.then(() => undefined, () => undefined);
      return work;
    }
  };
}

test('only one dispatch claim succeeds for concurrent callers', async () => {
  const ledger = new DispatchLedger(memoryStore());
  const key = '2026-10-27/21:00/Europe-Rome';
  const results = await Promise.all(Array.from({ length: 10 }, () => ledger.claim(key)));
  assert.equal(results.filter(x => x.claimed).length, 1);
});

test('unknown remote outcome is never automatically reclaimed', async () => {
  const ledger = new DispatchLedger(memoryStore());
  const key = '2026-10-27/21:00/Europe-Rome';
  await ledger.claim(key);
  assert.equal((await ledger.recordAttempt(key, 'unknown')).updated, true);
  assert.equal((await ledger.claim(key)).claimed, false);
});

test('cannot record dispatch without claim', async () => {
  const ledger = new DispatchLedger(memoryStore());
  assert.equal((await ledger.recordAttempt('2026-10-27/21:00/Europe-Rome', 'rejected')).updated, false);
});
