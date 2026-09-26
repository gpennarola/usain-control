const encoder = new TextEncoder();

function base64url(input) {
  return Uint8Array.from(atob(input.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - input.length % 4) % 4)), c => c.charCodeAt(0));
}

async function identity(request, env) {
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token || !env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD || !env.ALLOWED_EMAIL) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const header = JSON.parse(new TextDecoder().decode(base64url(parts[0])));
    const payload = JSON.parse(new TextDecoder().decode(base64url(parts[1])));
    const team = env.ACCESS_TEAM_DOMAIN.replace(/^https?:\/\//, "").replace(/\/$/, "");
    if (header.alg !== "RS256" || !header.kid || payload.iss !== `https://${team}` ||
        !Array.isArray(payload.aud) || !payload.aud.includes(env.ACCESS_AUD) ||
        payload.exp <= Math.floor(Date.now() / 1000) ||
        payload.email?.toLowerCase() !== env.ALLOWED_EMAIL.toLowerCase()) return null;
    const response = await fetch(`https://${team}/cdn-cgi/access/certs`, { cf: { cacheTtl: 300, cacheEverything: true } });
    if (!response.ok) return null;
    const { keys } = await response.json();
    const jwk = keys.find(key => key.kid === header.kid);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    return await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, base64url(parts[2]), encoder.encode(`${parts[0]}.${parts[1]}`)) ? payload.email : null;
  } catch { return null; }
}

function validate(value) {
  const time = s => typeof s === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
  const date = s => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T12:00:00Z`));
  const slot = x => x && time(x.start) && time(x.end) && x.start < x.end;
  if (!value || !Array.isArray(value.schedules) || value.schedules.length > 20 ||
      !value.schedules.every(s => slot(s) && Number.isSafeInteger(s.id) &&
        typeof s.enabled === "boolean" && typeof s.label === "string" && s.label.length <= 80 &&
        Array.isArray(s.days) && s.days.length <= 7 && s.days.every(d => Number.isInteger(d) && d >= 0 && d <= 6)) ||
      (value.skipTomorrow !== null && !date(value.skipTomorrow)) ||
      (value.tomorrowOverride !== null && !(date(value.tomorrowOverride?.date) && slot(value.tomorrowOverride)))) return false;
  return true;
}

const defaults = { schedules: [{ id: 1, start: "15:00", end: "19:00", days: [1,2,3,4,5], enabled: true, label: "Sala Studenti" }], skipTomorrow: null, tomorrowOverride: null };

async function github(env, method, body) {
  const repository = env.GITHUB_REPOSITORY || "gpennarola/gobright-auto-booking";
  const path = env.CONFIG_PATH || "control-settings.json";
  const response = await fetch(`https://api.github.com/repos/${repository}/contents/${path}`, {
    method, headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: "application/vnd.github+json", "Content-Type": "application/json", "User-Agent": "usain-control" },
    body: body && JSON.stringify(body),
  });
  return { status: response.status, data: await response.json().catch(() => ({})) };
}

export default {
  async fetch(request, env) {
    if (!await identity(request, env)) return new Response("Accesso non autorizzato", { status: 401 });
    const url = new URL(request.url);
    if (url.pathname !== "/api/settings") return env.ASSETS.fetch(request);
    if (!env.GITHUB_TOKEN) return Response.json({ error: "Server non configurato" }, { status: 503 });
    if (request.method === "GET") {
      const { status, data } = await github(env, "GET");
      if (status === 404) return Response.json({ settings: defaults, sha: null }, { headers: { "Cache-Control": "no-store" } });
      if (status !== 200) return Response.json({ error: "Impossibile leggere le impostazioni" }, { status: 502 });
      const settings = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(data.content.replace(/\s/g, "")), c => c.charCodeAt(0))));
      return Response.json({ settings, sha: data.sha }, { headers: { "Cache-Control": "no-store" } });
    }
    if (request.method !== "PUT") return new Response("Metodo non consentito", { status: 405 });
    if (Number(request.headers.get("content-length")) > 12000) return new Response("Dimensione eccessiva", { status: 413 });
    let input;
    try { input = await request.json(); } catch { return new Response("JSON non valido", { status: 400 }); }
    if (!validate(input.settings) || (input.sha !== null && typeof input.sha !== "string")) return new Response("Impostazioni non valide", { status: 400 });
    const current = await github(env, "GET");
    if (current.status !== 200 && current.status !== 404) return new Response("Lettura non riuscita", { status: 502 });
    if ((current.data.sha || null) !== input.sha) return new Response("Impostazioni cambiate: ricarica la pagina", { status: 409 });
    const serialized = JSON.stringify(input.settings, null, 2) + "\n";
    const content = btoa(Array.from(encoder.encode(serialized), b => String.fromCharCode(b)).join(""));
    const payload = { message: "Update Usain booking settings", content, ...(input.sha ? { sha: input.sha } : {}) };
    const saved = await github(env, "PUT", payload);
    if (saved.status !== 200 && saved.status !== 201) return new Response("Salvataggio non riuscito", { status: 502 });
    return Response.json({ sha: saved.data.content.sha }, { headers: { "Cache-Control": "no-store" } });
  }
};
