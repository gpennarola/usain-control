import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const temp = await mkdtemp(join(tmpdir(), 'usain-flow-'));
const names = ['booking-coordinator','coordinator-decision','github-dispatch','coordinator-orchestrator','coordinator-claim'];
for (const name of names) {
  let source = await readFile(new URL('../src/'+name+'.js',import.meta.url),'utf8');
  source = source.replaceAll(".js'",".mjs'");
  await writeFile(join(temp,name+'.mjs'),source);
}
const { coordinateBooking } = await import(pathToFileURL(join(temp,'coordinator-orchestrator.mjs')).href);
const { claimBookingEvent, recordBookingDispatch } = await import(pathToFileURL(join(temp,'coordinator-claim.mjs')).href);

test('isolated complete pipeline: one dispatch and durable outcome, ten contenders', async () => {
  const states = new Map();
  let queue = Promise.resolve(), sends = 0;
  const namespace = {
    idFromName: ()=>'shared-lock',
    get: ()=>({
      fetch: async (url, options) => {
        const body=JSON.parse(options.body);
        const path=new URL(url).pathname;
        const task=queue.then(()=>{
          const existing=states.get(body.eventKey);
          if(path==='/claim') {
            if(existing) return { claimed:false,state:existing };
            states.set(body.eventKey,'claimed');
            return { claimed:true };
          }
          if(path==='/record') {
            if(existing!=='claimed') return { updated:false };
            states.set(body.eventKey,body.status);
            return { updated:true };
          }
          throw Error('unknown operation');
        });
        queue=task.then(()=>{},()=>{});
        return {ok:true,json:async()=>await task};
      }
    })
  };
  const options={
    instant:'2026-10-27T19:45:00Z',
    mode:'live',
    repository:'gpennarola/gobright-auto-booking',
    token:'test-placeholder',
    claim:(key)=>claimBookingEvent(namespace,key),
    record:(key,status)=>recordBookingDispatch(namespace,key,status),
    send:async()=>{ sends++;return {status:204}; }
  };
  const results=await Promise.all(Array.from({length:10},()=>coordinateBooking(options)));
  assert.equal(sends,1);
  assert.equal(results.filter(r=>r.status==='accepted_not_booked').length,1);
  assert.equal(results.filter(r=>r.status==='duplicate_suppressed').length,9);
  assert.equal(states.get('2026-10-27/21:00/Europe-Rome'),'accepted_not_booked');
});

test('dry run does not access storage or send external request',async()=>{
  const result=await coordinateBooking({instant:'2026-10-27T19:45:00Z'});
  assert.equal(result.status,'simulated');
});
await rm(temp,{recursive:true,force:true});
