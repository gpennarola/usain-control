# USAIN — Ripristino coordinamento Cloudflare → GitHub

Stato: proposta tecnica, **non distribuita**. Branch isolato dalla produzione.

## Evidenze (27 ottobre 2026)
- Cloudflare Worker `usain-control` esiste, con handler HTTP `fetch`, ma senza Cron Trigger.
- `worker/src/index.js` gestisce impostazioni e storico via GitHub Contents API; non espone `scheduled` né chiama l'endpoint GitHub Actions `workflow_dispatch`.
- `gobright-auto-booking/.github/workflows/book-desk.yml` accetta `workflow_dispatch` con input `wait_until_opening` e mantiene un cron GitHub ogni 15 minuti.
- Il 26 ottobre le richieste sono partite alle 21:00 ora italiana: il cambio d'ora non spiega da solo il rifiuto delle sale.

## Strategia da implementare e testare
1. Un handler `scheduled(controller, env, ctx)` su Cloudflare, con cron UTC frequente e controllo del fuso `Europe/Rome` (non cron fisso alle 19:xx/20:xx UTC).
2. Preparazione **prima** delle 21:00 locali, ma dentro la finestra di attesa supportata dallo script Python; verificare in modo esplicito il comportamento di `WAIT_UNTIL_OPENING` e delle regole di apertura prima di scegliere l'anticipo.
3. Invocare l'API GitHub `POST /repos/{owner}/{repo}/actions/workflows/book-desk.yml/dispatches` con `ref: main` e input di attesa. Usare token dedicato con Actions: write, custodito solo come secret Cloudflare. Il token Contents attuale potrebbe non essere sufficiente.
4. Controllare le esecuzioni recenti e predisporre idempotenza persistente per evento/giorno, non soltanto un controllo best-effort dei run; evitare duplicati e preservare la prenotazione già confermata.
5. Registrare timestamp UTC e Europe/Rome, stato di dispatch, identificativo run e latenza; allertare se runner non pronto entro la soglia. Non equiparare HTTP 204 del dispatch a prenotazione confermata.
6. Testare con dispatch simulato senza prenotazioni reali; confrontare il comportamento a cavallo dei cambi DST e su fallimento GitHub API.
7. Deploy controllato solo dopo revisione e verifica dei permessi. Mantenere cron GitHub come fallback finché il nuovo coordinamento non è osservato funzionare.

## Condizioni di accettazione
- Nessuna prenotazione di prova reale e nessuna modifica ai segreti esistenti.
- Nessuna doppia prenotazione per lo stesso slot.
- Runner pronto prima dell'apertura, richiesta inviata alle 21:00:00 Europe/Rome.
- Evidenza di un evento schedulato Cloudflare, dispatch GitHub, avvio runner e risposta GoBright, distinti nei log.
- Rollback documentato (disabilitare cron Cloudflare; mantenere workflow GitHub).

## Azione richiesta al proprietario
Quando la patch sarà pronta, verificare/approvare l'abilitazione di un token GitHub dedicato con permesso Actions: write sul solo repository `gpennarola/gobright-auto-booking`, senza incollarlo in chat. La creazione del secret Cloudflare va effettuata tramite procedura sicura.
