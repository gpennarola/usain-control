import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/github-dispatch.js', import.meta.url), 'utf8');
const moduleUrl = 'data:text/javascript,' + encodeURIComponent(source);
const { createBookingDispatch, classifyDispatchStatus } = await import(moduleUrl);

test('prepares request without executing it', () => {
  const request = createBookingDispatch({
    repository: 'gpennarola/gobright-auto-booking',
    token: 'dummy',
  });
  assert.equal(request.method, 'POST');
  assert.equal(JSON.parse(request.body).ref, 'main');
  assert.equal(JSON.parse(request.body).inputs.wait_until_opening, true);
});
test('status 204 is not a booking confirmation', () => {
  assert.equal(classifyDispatchStatus(204), 'accepted_not_booked');
  assert.equal(classifyDispatchStatus(403), 'authentication_or_permission_error');
});
