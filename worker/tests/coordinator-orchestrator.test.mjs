import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const temp = await mkdtemp(join(tmpdir(), 'usain-orchestrator-'));
try {
  const modules = ['booking-coordinator', 'coordinator-decision', 'github-dispatch', 'coordinator-orchestrator'];
  for (const name of modules) {
    let source = await readFile(new URL('../src/' + name + '.js', import.meta.url), 'utf8');
    source = source.replaceAll('.js\'', '.mjs\'');
    await writeFile(join(temp, name + '.mjs'), source);
  }
  var { coordinateBooking } = await import(pathToFileURL(join(temp, 'coordinator-orchestrator.mjs')).href);
} finally {
  await rm(temp, { recursive: true, force: true });
}
const time='2026-10-27T19:45:00Z';

test('dry run never claims or calls GitHub',async()=>{
  let calls=0;
  const result=await coordinateBooking({instant:time,claim:async()=>{calls++;},send:async()=>{calls++;}});
  assert.equal(result.status,'simulated');
  assert.equal(calls,0);
});
test('outside window does nothing',async()=>{
  assert.equal((await coordinateBooking({instant:'2026-10-27T18:30:00Z'})).status,'outside_window');
});
test('duplicate prevents remote dispatch',async()=>{
  let calls=0;
  const result=await coordinateBooking({instant:time,mode:'live',repository:'gpennarola/gobright-auto-booking',token:'dummy',claim:async()=>({claimed:false}),send:async()=>{calls++;}});
  assert.equal(result.status,'duplicate_suppressed');
  assert.equal(calls,0);
});
test('accepted workflow is not a booked resource',async()=>{
  const result=await coordinateBooking({instant:time,mode:'live',repository:'gpennarola/gobright-auto-booking',token:'dummy',claim:async()=>({claimed:true}),send:async()=>({status:204})});
  assert.equal(result.status,'accepted_not_booked');
});
test('network uncertainty is not retried',async()=>{
  let calls=0;
  const result=await coordinateBooking({instant:time,mode:'live',repository:'gpennarola/gobright-auto-booking',token:'dummy',claim:async()=>({claimed:true}),send:async()=>{calls++;throw Error('timeout');}});
  assert.equal(result.status,'unknown_not_retryable');
  assert.equal(calls,1);
});

test('accepted workflow records dispatch outcome, not booking success',async()=>{
  const events=[];
  const result=await coordinateBooking({
    instant:time,mode:'live',repository:'gpennarola/gobright-auto-booking',
    token:'dummy',claim:async()=>({claimed:true}),
    send:async()=>({status:204}),
    record:async(key,status)=>events.push({key,status})
  });
  assert.equal(result.status,'accepted_not_booked');
  assert.deepEqual(events,[{key:'2026-10-27/21:00/Europe-Rome',status:'accepted_not_booked'}]);
});
test('timeout records unknown and never retries automatically',async()=>{
  const events=[];
  let sends=0;
  const result=await coordinateBooking({
    instant:time,mode:'live',repository:'gpennarola/gobright-auto-booking',
    token:'dummy',claim:async()=>({claimed:true}),
    send:async()=>{sends++;throw new Error('timeout');},
    record:async(key,status)=>events.push(status)
  });
  assert.equal(result.status,'unknown_not_retryable');
  assert.equal(sends,1);
  assert.deepEqual(events,['unknown']);
});
