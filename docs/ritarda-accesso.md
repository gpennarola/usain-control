# Ritarda accesso — verifica del 18 ottobre 2026

## Esito e limiti

GoBright supporta modifiche di data e ora nel portale, soggette ai diritti
dell'utente. Non è verificato che l'account Sala Studenti possa farlo, né è
disponibile nel codice esaminato un contratto API verificato per aggiornare una
prenotazione esistente. Non si può concludere che GoBright non lo supporti:
il limite riguarda l'integrazione USAIN attuale e le informazioni accessibili.

La pagina `/ritarda-accesso` implementa una **procedura assistita**, non un
comando remoto: selezione da storico, nuovo inizio, riepilogo con fine invariata,
conferma esplicita e passaggio al portale autenticato. Gli stati sono
"riepilogo pronto" e "esito non verificato"; non viene registrato un falso
successo, né alterato lo storico. Ricaricare le conferme rilegge GitHub, non
GoBright. Il flusso non richiede credenziali GoBright e non usa i refresh token.

## Le operazioni da distinguere

| Operazione | Effetto | Supporto verificato |
| --- | --- | --- |
| Modifica dell'inizio, es. 15:00 → 16:00, fine 19:00 | Riduce l'intervallo prenotato; il posto non è riservato dalle 15 alle 16 | Modifica orari prevista nel portale; autorizzazione e API del tenant da verificare |
| Differimento del check-in | Mantiene l'intervallo originario ma sposta la scadenza di conferma | Nessun comando individuale documentato trovato; finestra configurata dall'amministratore |
| Check-in via portale/app | Conferma la prenotazione nella finestra prevista | Metodo ufficiale, solo se abilitato; non equivale a rinviare la scadenza |
| Early Presence Confirmation | Conferma preventiva dell'intenzione di usare il posto | Separata dal check-in/no-show, non garantisce di evitarlo |

Le postazioni "Sala Stud" sono trattate come Desk (`bookingType: 2`) dallo
script, anche se l'utente le chiama aula/sala. Non applicare automaticamente
le regole delle meeting room.

## Regole ufficiali e dati ancora mancanti

- Il profilo Desk definisce una finestra in minuti prima/dopo l'inizio. I
  valori nell'esempio della documentazione sono esempi, non valori Sala Studenti.
- Se il no-show è attivo e manca il check-in entro la finestra, la prenotazione
  viene interrotta e il posto liberato.
- Il metodo app/portale deve essere abilitato dall'amministratore; in alternativa
  possono essere richiesti Connect/Interact, NFC/QR o sensore.
- Con fasce Half day, la finestra può essere allineata a Start of day / Start
  afternoon, anziché a un inizio personalizzato.
- I sensori possono accorciare automaticamente la prenotazione in assenza di
  occupazione: il check-in remoto non garantisce da solo il mantenimento.
- Non sono stati letti configurazione del profilo, ruolo effettivo, regolamento
  della struttura o stato live delle prenotazioni. Nessuna prenotazione reale è
  stata modificata o usata come test.

## Codice esaminato

`gpennarola/usain-control`, base `50383b8`: `/api/bookings` legge esclusivamente
`booking-history.json` dal repository del bot; non contatta GoBright.
`gpennarola/gobright-auto-booking/book_desk.py` su main: creazione via POST
`/api/v2.0/bookings/` e cancellazione via DELETE `bookings/extended`, dichiarati
endpoint interni non ufficialmente documentati. La presenza di id/composedId
nel body di creazione non dimostra da sola come eseguire un aggiornamento.
Non si è chiamato login/token (che ruota il refresh token), né alcuna API GoBright.

## Alternativa utilizzabile ora

Aprire GoBright da USAIN, selezionare la prenotazione attuale e, **se il comando
di modifica è disponibile**, spostare l'inizio lasciando la fine invariata.
Salvare e riaprire la stessa prenotazione per controllare l'esito e il check-in.
La modifica va effettuata prima della scadenza no-show originaria; non si assume
che possa recuperare una prenotazione già interrotta.

Se manca il comando, chiedere al gestore prima della scadenza di modificare
l'inizio o autorizzare una gestione del ritardo conforme al regolamento.
In alternativa usare il check-in ufficiale da app/portale soltanto se abilitato
e consentito dalla struttura. Non automatizzare una falsa attestazione di presenza.
Non cancellare e ricreare automaticamente: la risorsa può essere presa da altri
e il ripristino non è garantito.

## Requisiti per abilitare in futuro l'operazione automatica

1. Ottenere regole del profilo e autorizzazione della struttura; verificare
   possibilità di modificare la propria prenotazione, no-show, sensori e Half day.
2. Verificare contratto supportato per lettura live e aggiornamento in-place
   (ID istanza/composedId, proprietà, fuso, ricorrenze, campi da preservare).
   Servono documentazione API o ambiente di prova autorizzato; non indovinare
   verbo, URL o payload dagli endpoint di creazione.
3. Prima della conferma leggere lo stato live; accettare solo prenotazioni
   possedute dall'utente, attive, singole e non già iniziate per la prima release.
   Nuovo inizio nel futuro e prima della fine, stesso giorno in Europe/Rome.
   Mostrare perdita della fascia iniziale e nuova finestra solo se verificata.
4. Alla conferma rileggere e rifiutare cambiamenti concorrenti; aggiornare la
   stessa prenotazione senza DELETE/CREATE. Prevenire doppi invii. In caso di
   timeout non ripetere ciecamente: riconciliare con lettura live.
5. Mostrare successo solo dopo lettura dei dati aggiornati su GoBright; distinguere
   errore, esito incerto e confermato. Conservare lo storico originario e un audit
   separato senza token. Coordinare il rinnovo token con il bot esistente.
6. Testare con fixture e mock: proprietà, ID sconosciuti, cancellazioni, conflitti,
   ricorrenze, finestre no-show, ora legale, scadenza sessione e timeout.

## Verifica della procedura assistita

`node --test worker/tests/delay.test.mjs`

Test isolati: validazione e fine invariata; input errati/date passate;
parsing JavaScript; flusso DOM simulato con conferma obbligatoria e reset al
cambio input; sole letture dello storico; route protetta senza sessione.
Nessun test apre sessioni GoBright o esegue prenotazioni. Il test DOM non
sostituisce un collaudo grafico su iPhone. Nessun deploy incluso.

## Fonti ufficiali

- [Configure desk profile](https://support.gobright.com/hc/en-us/articles/360009968520-Configure-desk-profile): finestra, metodi, Half day, sensori.
- [How to check-in to a Desk booking](https://support.gobright.com/hc/en-us/articles/4414539533074-How-to-check-in-to-a-Desk-booking): procedura app/portale e amministratore.
- [Provide reason for change when editing a booking](https://support.gobright.com/hc/en-us/articles/22584873771292-Provide-reason-for-change-when-editing-a-booking): modifiche data/ora anche per desk e diritti.
- [Book a desk](https://support.gobright.com/hc/en-us/articles/360005323073-Book-a-desk): selezione degli orari, Advanced Booking e fasce.
