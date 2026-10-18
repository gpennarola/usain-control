import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {delaySummary, delayPage} from '../src/delay-page.js';
import worker from '../src/index.js';

const booking={date:'2026-10-19',start:'15:00',end:'19:00',space:'Sala Stud 1'};
test('prepares later start, preserves end and original historical record',()=>{
  const original=structuredClone(booking);
  assert.match(delaySummary(booking,'16:00','2026-10-18'),/15:00 → 16:00/);
  assert.match(delaySummary(booking,'16:00','2026-10-18'),/Fine invariata: 19:00/);
  assert.deepEqual(booking,original);
});
test('rejects missing booking, invalid time, earlier/equal start, end and past date',()=>{
  for(const time of ['','24:00','16:60','9:00','14:59','15:00','19:00','20:00'])
    assert.throws(()=>delaySummary(booking,time,'2026-10-18'));
  assert.throws(()=>delaySummary(null,'16:00','2026-10-18'));
  assert.throws(()=>delaySummary(booking,'16:00','2026-10-20'));
});
test('embedded script parses and no historical content is interpolated as HTML',()=>{
  const script=delayPage.match(/<script>([\s\S]*)<\/script>/)[1];
  new vm.Script(script);
  assert.match(script,/textContent=delaySummary/);
  assert.doesNotMatch(script,/innerHTML|localStorage|sessionStorage/);
});
test('guided flow loads only historical confirmations and opens portal without mutations',async()=>{
  const elements=new Map();
  function element(){return {value:'',hidden:false,disabled:false,checked:false,textContent:'',children:[],append(x){this.children.push(x);},replaceChildren(){this.children=[];}};}
  const document={getElementById(id){if(!elements.has(id))elements.set(id,element());return elements.get(id);},createElement:element};
  const calls=[],opened=[];
  const context=vm.createContext({document,Intl,Date,Error,Number,String,fetch:async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>({bookings:[{...booking,date:'2099-10-19',space:'<img onerror=alert(1)>'}]})};},window:{open(...args){opened.push(args);}}});
  vm.runInContext(delayPage.match(/<script>([\s\S]*)<\/script>/)[1],context);
  await new Promise(resolve=>setImmediate(resolve));
  const el=id=>elements.get(id);
  el('booking').value='0';el('start').value='16:00';el('form').onsubmit({preventDefault(){}});
  assert.equal(el('review').hidden,false);
  el('open').onclick();assert.equal(opened.length,0);
  el('confirm').checked=true;el('confirm').onchange();el('open').onclick();
  assert.equal(opened[0][0],'https://t2b.gobright.cloud/mwv/');
  assert.match(el('status').textContent,/Esito non verificato/);
  el('start').oninput();assert.equal(el('review').hidden,true);assert.equal(el('open').disabled,true);
  await el('reload').onclick();
  assert.equal(calls.length,2);
  assert.ok(calls.every(c=>c.url==='/api/bookings'&&!c.options.method));
});
test('route remains behind Access without contacting any external service',async()=>{
  const response=await worker.fetch(new Request('https://usain.example/ritarda-accesso'),{});
  assert.equal(response.status,401);
});
