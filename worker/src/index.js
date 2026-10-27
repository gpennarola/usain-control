import { coordinateBooking } from './coordinator-orchestrator.js';
export { UsainBookingLock } from './usain-booking-lock.js';
import { availabilityPage } from './availability-page.js';
import { schedulePage } from './schedule-page.js';
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const defaults = {
  schedules: [{ id: 1, start: "15:00", end: "19:00", days: [1, 2, 3, 4, 5], enabled: true, label: "Sala Studenti" }],
  skipTomorrow: null,
  tomorrowOverride: null
};

function base64url(input) {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - input.length % 4) % 4);
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

async function identity(request, env) {
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token || !env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD || !env.ALLOWED_EMAIL) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const header = JSON.parse(decoder.decode(base64url(parts[0])));
    const payload = JSON.parse(decoder.decode(base64url(parts[1])));
    const team = env.ACCESS_TEAM_DOMAIN.replace(/^https?:\/\//, "").replace(/\/$/, "");
    if (header.alg !== "RS256" || !header.kid || payload.iss !== "https://" + team ||
        !Array.isArray(payload.aud) || !payload.aud.includes(env.ACCESS_AUD) ||
        payload.exp <= Math.floor(Date.now() / 1000) ||
        payload.email?.toLowerCase() !== env.ALLOWED_EMAIL.toLowerCase()) return null;
    const response = await fetch("https://" + team + "/cdn-cgi/access/certs", { cf: { cacheTtl: 300, cacheEverything: true } });
    if (!response.ok) return null;
    const { keys } = await response.json();
    const jwk = keys.find((item) => item.kid === header.kid);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    return await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, base64url(parts[2]), encoder.encode(parts[0] + "." + parts[1])) ? payload.email : null;
  } catch {
    return null;
  }
}

function validate(value) {
  const time = (s) => typeof s === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
  const date = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + "T12:00:00Z"));
  const slot = (x) => x && time(x.start) && time(x.end) && x.start < x.end;
  if (!value || !Array.isArray(value.schedules) || value.schedules.length > 20 ||
      !value.schedules.every((s) => slot(s) && Number.isSafeInteger(s.id) && typeof s.enabled === "boolean" &&
        typeof s.label === "string" && s.label.length <= 80 && Array.isArray(s.days) && s.days.length <= 7 &&
        s.days.length > 0 && s.days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6) &&
        (s.openingDaysBefore === undefined || (Number.isInteger(s.openingDaysBefore) && s.openingDaysBefore >= 0 && s.openingDaysBefore <= 7)) &&
        (s.openingTime === undefined || time(s.openingTime)) &&
        (s.preference === undefined || ['rooms_then_desks', 'rooms_only', 'desks_only'].includes(s.preference))) ||
      new Set(value.schedules.map(s => s.id)).size !== value.schedules.length ||
      (value.skipTomorrow !== null && !date(value.skipTomorrow)) ||
      (value.tomorrowOverride !== null && !(date(value.tomorrowOverride?.date) && slot(value.tomorrowOverride)))) return false;
  // Overlapping rules would compete for the same account's booking limit.
  for (let i=0;i<value.schedules.length;i++) for(let j=i+1;j<value.schedules.length;j++) {
    const a=value.schedules[i],b=value.schedules[j];
    if(a.enabled && b.enabled && a.days.some(d=>b.days.includes(d)) && a.start<b.end && b.start<a.end) return false;
  }
  return true;
}

async function github(env, method, path, body) {
  const repository = env.GITHUB_REPOSITORY || "gpennarola/gobright-auto-booking";
  const response = await fetch("https://api.github.com/repos/" + repository + "/contents/" + path, {
    method,
    headers: {
      Authorization: "Bearer " + env.GITHUB_TOKEN,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "User-Agent": "usain-control"
    },
    body: body && JSON.stringify(body)
  });
  return { status: response.status, data: await response.json().catch(() => ({})) };
}

function decodedFile(data) {
  return JSON.parse(decoder.decode(Uint8Array.from(atob(data.content.replace(/\s/g, "")), (c) => c.charCodeAt(0))));
}

const historyWidget = [
  "<section id='usain-history' style='max-width:520px;margin:18px auto 100px;padding:0 18px;color:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,system-ui,sans-serif'>",
  "<div style='background:#171719;border:1px solid #29292d;border-radius:22px;padding:18px'>",
  "<h2 style='font-size:18px;margin:0 0 6px'>Prenotazioni effettuate</h2>",
  "<p style='font-size:12px;color:#a9a9ae;margin:0 0 15px'>Conferme ricevute da GoBright al momento della prenotazione. Eventuali modifiche successive non sono verificate qui.</p>",
  "<div id='usain-history-list' aria-live='polite'>Caricamento…</div>",
  "</div></section>",
  "<script>(function(){",
  "const box=document.getElementById('usain-history-list');",
  "function row(item){const card=document.createElement('div');card.style='border-top:1px solid #303035;padding:13px 0';",
  "const title=document.createElement('strong');title.textContent=new Intl.DateTimeFormat('it-IT',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(new Date(item.date+'T12:00:00'));card.append(title);",
  "const info=document.createElement('div');info.style='margin-top:4px;color:#dedee3';info.textContent=item.start+'–'+item.end+' · '+item.space;card.append(info);",
  "const proof=document.createElement('div');proof.style='margin-top:6px;color:#8be2a5;font-size:13px';proof.textContent='Confermata dal bot';card.append(proof);",
  "if(item.sentAt){const sent=document.createElement('div');sent.style='font-size:12px;margin-top:6px;color:#aaa';sent.textContent='Invio: '+new Intl.DateTimeFormat('it-IT',{timeZone:'Europe/Rome',dateStyle:'short',timeStyle:'medium'}).format(new Date(item.sentAt))+' · ora italiana';card.append(sent)}",
  "if(item.runUrl){const link=document.createElement('a');link.href=item.runUrl;link.textContent='Vedi conferma GitHub';link.target='_blank';link.rel='noopener noreferrer';link.style='display:inline-block;margin-top:8px;color:#f5a953;font-size:13px';card.append(link)}",
  "if(item.bookingId){const details=document.createElement('details');details.style='margin-top:8px;font-size:12px;color:#a9a9ae';const summary=document.createElement('summary');summary.textContent='Identificativo GoBright';details.append(summary);const id=document.createElement('div');id.textContent=item.bookingId;id.style='overflow-wrap:anywhere;margin-top:5px';details.append(id);card.append(details)}return card}",
  "fetch('/api/bookings',{cache:'no-store'}).then(async r=>{if(!r.ok)throw Error('HTTP '+r.status);return r.json()}).then(data=>{box.replaceChildren();",
  "if(!Array.isArray(data.bookings)||!data.bookings.length){box.textContent='Nessuna conferma registrata.';return}",
  "data.bookings.forEach(item=>box.append(row(item)))",
  "}).catch(()=>{box.textContent='Impossibile caricare le conferme. Riprova aggiornando la pagina.'})",
  "})();</script>"
].join("");

const historyPage = "<!doctype html><html lang='it'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>Prenotazioni USAIN</title></head><body style='background:#080809;margin:0;padding-top:25px'><nav style='max-width:520px;margin:auto;padding:0 18px;font:16px system-ui'><a href='/' style='color:#f5a953'>← USAIN Control</a></nav>" + historyWidget + "</body></html>";

export default {
  // Dry run only: no cron configured, no GitHub or GoBright requests.
  async scheduled(controller, env, ctx) {
    const instant = new Date(controller.scheduledTime ?? Date.now());
    const result = await coordinateBooking({instant, mode: 'dry-run'});
    console.log(JSON.stringify({
      component: 'usain-coordinator',
      mode: 'dry-run',
      lockConfigured: Boolean(env.USAIN_BOOKING_LOCK),
      utc: instant.toISOString(),
      ...result
    }));
  },
  async fetch(request, env) {
    if (!await identity(request, env)) return new Response("Accesso non autorizzato", { status: 401 });
    const url = new URL(request.url);
    const path = url.pathname;
    const configPath = env.CONFIG_PATH || "control-settings.json";
    if (path === '/disponibilita') {
      if (request.method !== 'GET') return new Response('Metodo non consentito', {status:405});
      return new Response(availabilityPage, {headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});
    }
    if (path === '/programmazione') {
      if (request.method !== 'GET') return new Response('Metodo non consentito', {status:405});
      return new Response(schedulePage.replace('<main>', "<main><a href='/prenotazioni'>Storico prenotazioni →</a>"), {headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});
    }
    if (path === "/prenotazioni") {
      if (request.method !== "GET") return new Response("Metodo non consentito", { status: 405 });
      return new Response(historyPage, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
    }
    if (path === "/api/bookings") {
      if (request.method !== "GET") return new Response("Metodo non consentito", { status: 405 });
      if (!env.GITHUB_TOKEN) return Response.json({ error: "Server non configurato" }, { status: 503 });
      try {
        const result = await github(env, "GET", "booking-history.json");
        if (result.status === 404) return Response.json({ bookings: [] }, { headers: { "Cache-Control": "no-store" } });
        if (result.status !== 200) return Response.json({ error: "Impossibile leggere le conferme" }, { status: 502 });
        const bookings = decodedFile(result.data);
        if (!Array.isArray(bookings)) throw new Error("Formato storico non valido");
        return Response.json({ bookings: bookings.slice(0, 120) }, { headers: { "Cache-Control": "no-store" } });
      } catch {
        return Response.json({ error: "Storico non disponibile" }, { status: 502 });
      }
    }
    if (path !== "/api/settings") {
      const asset = await env.ASSETS.fetch(request);
      if (request.method !== "GET" || !asset.headers.get("content-type")?.includes("text/html")) return asset;
      return new HTMLRewriter().on("body", {
        element(element) {
          element.append("<a href='/programmazione' style='display:block;max-width:484px;margin:18px auto;padding:12px 18px;color:#f5a953;font:16px system-ui'>Gestisci regole e orari di prenotazione →</a>", { html: true });
          element.append("<a href='/prenotazioni' style='display:block;max-width:484px;margin:10px auto;padding:0 18px;color:#f5a953;font:14px system-ui'>Apri lo storico prenotazioni →</a>", { html: true });
          element.prepend("<section style='max-width:484px;margin:18px auto;padding:18px;background:#1c1c1e;border-radius:18px;font:16px system-ui'><h2 style='margin:0 0 8px;font-size:20px'>Posti disponibili</h2><p style='color:#aaa'>Consulta la mappa GoBright live o scegli giorno e fascia oraria.</p><a href='/disponibilita' style='display:block;background:#ff9f0a;color:#111;padding:13px;border-radius:12px;text-align:center;text-decoration:none;font-weight:700'>Controlla disponibilità →</a></section>", {html:true});
          element.append(historyWidget, { html: true });
        }
      }).transform(asset);
    }
    if (!env.GITHUB_TOKEN) return Response.json({ error: "Server non configurato" }, { status: 503 });
    if (request.method === "GET") {
      const { status, data } = await github(env, "GET", configPath);
      if (status === 404) return Response.json({ settings: defaults, sha: null }, { headers: { "Cache-Control": "no-store" } });
      if (status !== 200) return Response.json({ error: "Impossibile leggere le impostazioni" }, { status: 502 });
      try {
        return Response.json({ settings: decodedFile(data), sha: data.sha }, { headers: { "Cache-Control": "no-store" } });
      } catch {
        return Response.json({ error: "Impostazioni non valide" }, { status: 502 });
      }
    }
    if (request.method !== "PUT") return new Response("Metodo non consentito", { status: 405 });
    if (Number(request.headers.get("content-length")) > 12e3) return new Response("Dimensione eccessiva", { status: 413 });
    let input;
    try { input = await request.json(); }
    catch { return new Response("JSON non valido", { status: 400 }); }
    if (!validate(input.settings) || (input.sha !== null && typeof input.sha !== "string")) return new Response("Impostazioni non valide", { status: 400 });
    const current = await github(env, "GET", configPath);
    if (current.status !== 200 && current.status !== 404) return new Response("Lettura non riuscita", { status: 502 });
    if ((current.data.sha || null) !== input.sha) return new Response("Impostazioni cambiate: ricarica la pagina", { status: 409 });
    // Older home controls omit opening fields: retain each rule's timing.
    const previous = current.status === 200 ? decodedFile(current.data) : defaults;
    for (const rule of input.settings.schedules) {
      const old = previous.schedules.find(s => s.id === rule.id);
      for (const key of ['openingDaysBefore', 'openingTime', 'preference']) {
        if (rule[key] === undefined && old?.[key] !== undefined) rule[key] = old[key];
      }
    }
    const serialized = JSON.stringify(input.settings, null, 2) + "\n";
    const content = btoa(Array.from(encoder.encode(serialized), (b) => String.fromCharCode(b)).join(""));
    const payload = { message: "Update Usain booking settings", content, ...(input.sha ? { sha: input.sha } : {}) };
    const saved = await github(env, "PUT", configPath, payload);
    if (saved.status !== 200 && saved.status !== 201) return new Response("Salvataggio non riuscito", { status: 502 });
    return Response.json({ sha: saved.data.content.sha }, { headers: { "Cache-Control": "no-store" } });
  }
};


