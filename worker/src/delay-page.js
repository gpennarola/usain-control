// No GoBright mutation endpoint is assumed. This page prepares a manual handoff.
export function delaySummary(booking, newStart, today) {
  const time = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (!booking || !/^\d{4}-\d{2}-\d{2}$/.test(booking.date || '') ||
      !time.test(booking.start || '') || !time.test(booking.end || '') ||
      !time.test(newStart || '') || booking.date < today ||
      newStart <= booking.start || newStart >= booking.end) {
    throw new Error('Scegli un orario successivo all’inizio e precedente alla fine, per una data non passata.');
  }
  return `${booking.date} · ${booking.space || 'Postazione'}\nInizio richiesto: ${booking.start} → ${newStart}\nFine invariata: ${booking.end}\nOra italiana (Europe/Rome).\nModifica da completare e verificare in GoBright. Nessun rinvio del check-in richiesto.`;
}

export const delayPage = `<!doctype html><html lang="it"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Ritarda accesso · USAIN</title><style>
body{background:#080809;color:#f5f5f7;font:16px system-ui;margin:0;padding:24px 18px}main{max-width:520px;margin:auto}section{background:#1c1c1e;padding:20px;border-radius:18px;margin:18px 0}a{color:#ffb34e}label{display:block;margin:16px 0 6px}select,input,button{box-sizing:border-box;width:100%;font:inherit;padding:12px;border-radius:10px}button{background:#ffaf36;color:#111;border:0;margin-top:14px;cursor:pointer}button:disabled{opacity:.5}p{line-height:1.5}pre{white-space:pre-wrap;font:inherit}small{color:#bbb}#status{min-height:2em}
</style></head><body><main><a href="/prenotazioni">← Prenotazioni</a>
<h1>Ritarda accesso</h1><p>Prepara la modifica dell’orario e completala nel portale GoBright.</p>
<section><strong>Due operazioni diverse</strong><p>Spostare l’inizio libera il posto per la parte iniziale. Il rinvio della scadenza di check-in mantiene l’inizio, ma richiede una regola della struttura: USAIN non dispone di un comando verificato per farlo.</p><p>Le conferme qui sotto sono storiche. Prima di modificare, verifica che la prenotazione sia ancora attiva e che gli orari coincidano nel portale.</p></section>
<section><form id="form"><label for="booking">Prenotazione registrata</label><select id="booking" required disabled><option value="">Caricamento…</option></select>
<label for="start">Nuovo inizio (ora italiana)</label><input id="start" type="time" required disabled>
<button id="prepare" disabled>Prepara riepilogo</button></form><p id="status" role="status" aria-live="polite"></p>
<div id="review" hidden><pre id="summary"></pre><p>La fine resta invariata. Verifica disponibilità, permessi e finestra di check-in in GoBright. Non cancellare la prenotazione per ricrearla: potresti perdere il posto.</p>
<label><input id="confirm" type="checkbox" style="width:auto"> Ho capito: l’apertura del portale non modifica la prenotazione.</label>
<button id="open" disabled>Apri GoBright per completare</button>
<p id="portal" hidden><a href="https://t2b.gobright.cloud/mwv/" target="_blank" rel="noopener noreferrer">Apri nuovamente il portale GoBright</a></p>
<ol><li>Accedi e seleziona la prenotazione dalla dashboard.</li><li>Se disponibile, usa la modifica dell’orario sulla prenotazione esistente e salva.</li><li>Riapri la prenotazione e controlla inizio, fine, postazione e richiesta di check-in.</li><li>Se la modifica non è consentita, chiedi al gestore di spostare l’inizio o autorizzare il ritardo prima della scadenza.</li></ol>
<p>Il check-in da app/portale è utilizzabile solo se abilitato e secondo il regolamento della struttura. La conferma anticipata di partecipazione non equivale al check-in.</p></div>
<button id="reload" type="button">Ricarica conferme storiche</button><small>Ricaricare non verifica lo stato attuale su GoBright.</small></section>
<p><a href="https://support.gobright.com/hc/en-us/articles/360009968520-Configure-desk-profile" target="_blank" rel="noopener noreferrer">Regole GoBright per check-in e no-show</a></p>
</main><script>
const delaySummary = ${delaySummary.toString()};
const byId=id=>document.getElementById(id);
let bookings=[];
function today(){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
function reset(){byId('review').hidden=true;byId('confirm').checked=false;byId('open').disabled=true;byId('portal').hidden=true;byId('status').textContent='Nessuna modifica inviata a GoBright.';}
async function load(){reset();bookings=[];byId('booking').replaceChildren();byId('booking').disabled=true;byId('start').disabled=true;byId('prepare').disabled=true;
try{const r=await fetch('/api/bookings',{cache:'no-store'});if(!r.ok)throw Error();const data=await r.json();if(!Array.isArray(data.bookings))throw Error();bookings=data.bookings.filter(b=>b&&/^\\d{4}-\\d{2}-\\d{2}$/.test(b.date||'')&&b.date>=today());
const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent='Seleziona una conferma';byId('booking').append(placeholder);
bookings.forEach((b,i)=>{const o=document.createElement('option');o.value=String(i);o.textContent=b.date+' · '+b.start+'–'+b.end+' · '+b.space;byId('booking').append(o);});
byId('booking').disabled=!bookings.length;byId('start').disabled=!bookings.length;byId('prepare').disabled=!bookings.length;byId('status').textContent=bookings.length?'Conferme caricate; stato attuale GoBright non verificato.':'Nessuna conferma per oggi o date future.';
}catch{byId('status').textContent='Conferme non disponibili. Riprova oppure apri direttamente GoBright.';const a=document.createElement('a');a.href='https://t2b.gobright.cloud/mwv/';a.textContent=' Apri GoBright';a.target='_blank';a.rel='noopener noreferrer';byId('status').append(a);}}
byId('booking').onchange=()=>{reset();byId('start').value='';};byId('start').oninput=reset;
byId('form').onsubmit=e=>{e.preventDefault();reset();try{const value=byId('booking').value;if(value==='')throw Error('Seleziona una prenotazione.');byId('summary').textContent=delaySummary(bookings[Number(value)],byId('start').value,today());byId('review').hidden=false;byId('status').textContent='Riepilogo pronto. Nessuna modifica inviata.';}catch(err){byId('status').textContent=err.message;}};
byId('confirm').onchange=()=>{byId('open').disabled=!byId('confirm').checked;};
byId('open').onclick=()=>{if(!byId('confirm').checked||byId('review').hidden)return;window.open('https://t2b.gobright.cloud/mwv/','_blank','noopener,noreferrer');byId('portal').hidden=false;byId('status').textContent='Passaggio al portale richiesto. Esito non verificato: controlla la prenotazione in GoBright.';};
byId('reload').onclick=load;load();
</script></body></html>`;
