# USAIN Control protetto

La cartella `public` contiene la schermata da installare sull'iPhone. Il Worker
serve la schermata e `/api/settings` dallo stesso indirizzo. Le impostazioni
sono salvate in `control-settings.json` nel repository privato
`gpennarola/gobright-auto-booking`; nessun token è inviato al browser.

## Attivazione

1. Crea un Cloudflare Worker da questa cartella con `npx wrangler deploy`.
   Il Worker può usare il suo indirizzo `workers.dev` o un dominio personalizzato.
2. In Cloudflare Zero Trust, proteggi **tutte** le route del Worker con Access.
   Abilita il metodo di login One-time PIN e una policy **Include: Emails**
   limitata all'indirizzo del proprietario. Non usare una policy che ammetta
   genericamente qualsiasi indirizzo che riceva un PIN.
3. Configura le variabili `ACCESS_TEAM_DOMAIN` (esempio
   `nome.cloudflareaccess.com`), `ACCESS_AUD` (Audience tag dell'app Access) e
   `ALLOWED_EMAIL` (stesso indirizzo autorizzato nella policy).
4. Crea un GitHub fine-grained token limitato al solo repository privato,
   con `Contents: Read and write`. Salvalo come secret `GITHUB_TOKEN` del Worker
   con `npx wrangler secret put GITHUB_TOKEN`. Non inserirlo nel codice o
   nell'interfaccia pubblica.
5. Unisci la modifica coordinata nel repository privato, quindi salva una
   programmazione nell'app: il Worker creerà `control-settings.json`.
6. Apri il nuovo indirizzo protetto su iPhone, accedi con il PIN ricevuto via
   email e usa Safari → Condividi → Aggiungi alla schermata Home. La vecchia
   icona GitHub Pages continuerà a essere una copia locale separata.

Il workflow legge le impostazioni subito prima del tentativo delle 21:00.
Se la lettura fallisce, sospende la prenotazione e invia una notifica email.
Una prenotazione già effettuata non viene cancellata da “Salta domani”.
