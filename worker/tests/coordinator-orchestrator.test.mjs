import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const a=await readFile(new URL('../src/coordinator-decision.js',import.meta.url),'utf8');
const b=await readFile(new URL('../src/booking-coordinator.js',import.meta.url),'utf8');
const c=await readFile(new URL('../src/github-dispatch.js',import.meta.url),'utf8');
const d=await readFile(new URL('../src/coordinator-orchestrator.js',import.meta.url),'utf8');
const base='data:text/javascript,';
const coord=base+encodeURIComponent(b);
const dec=base+encodeURIComponent(a.replace("'./booking-coordinator.js'","'"+coord+"'"));
const dispatch=base+encodeURIComponent(c);
const orchestrator=base+encodeURIComponent(d.replace("'./coordinator-decision.js'","'"+dec+"'").replace("'./github-dispatch.js'","'"+dispatch+"'"));
const {coordinateBooking}=await import(orchestrator);
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
