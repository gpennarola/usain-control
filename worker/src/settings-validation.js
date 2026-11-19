// Validazione delle impostazioni salvate in control-settings.json.

// Fascia che entra per prima quando piu' fasce si aprono insieme. Il motore
// di prenotazione usa "afternoon" se la chiave manca.
export const SLOT_PRIORITIES = ['afternoon', 'morning'];

export function validate(value) {
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
      (value.tomorrowOverride !== null && !(date(value.tomorrowOverride?.date) && slot(value.tomorrowOverride))) ||
      (value.slotPriority !== undefined && !SLOT_PRIORITIES.includes(value.slotPriority))) return false;
  // Overlapping rules would compete for the same account's booking limit.
  for (let i=0;i<value.schedules.length;i++) for(let j=i+1;j<value.schedules.length;j++) {
    const a=value.schedules[i],b=value.schedules[j];
    if(a.enabled && b.enabled && a.days.some(d=>b.days.includes(d)) && a.start<b.end && b.start<a.end) return false;
  }
  return true;
}

// Le schermate piu' vecchie non inviano tutti i campi: quelli omessi
// conservano il valore gia' salvato invece di andare persi.
export function retainOmittedFields(settings, previous) {
  for (const rule of settings.schedules) {
    const old = previous.schedules.find(s => s.id === rule.id);
    for (const key of ['openingDaysBefore', 'openingTime', 'preference']) {
      if (rule[key] === undefined && old?.[key] !== undefined) rule[key] = old[key];
    }
  }
  if (settings.slotPriority === undefined && previous.slotPriority !== undefined) {
    settings.slotPriority = previous.slotPriority;
  }
  return settings;
}
