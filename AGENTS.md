# Ripresa dell'audit OnlyHand

Se l'utente riprende il lavoro sulla conformità/privacy dopo `/clear`, leggi
`AUDIT_TODO.md` e verifica lo stato Git e del deployment prima di agire. Questa
è una fotografia del 23 settembre 2026, non una prova dello stato live.

## Stato confermato in chat

- Il sito è generalista, accessibile a chi lo visita; non introdurre una verifica
  dell'età solo perché può essere visitato da minori.
- L'utente ha chiesto di rimandare la questione delle licenze degli asset.
- Vercel usa il piano Hobby; Web Analytics e Speed Insights sono spenti.
  In Vercel sono presenti `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`, ma
  non `VITE_PLAUSIBLE_DOMAIN`. Supabase è nella regione West EU (Ireland).
- L'utente non ha un account Plausible. Il codice non carica più Plausible e
  `.env.production` è stato rimosso; verificare che il nuovo deployment sia live.
- È stata scelta la pulizia degli account anonimi dopo 12 mesi senza scritture
  cloud. L'utente riferisce di aver abilitato Supabase Cron ed eseguito i
  blocchi di `supabase/retention.sql`; il job `onlyhand-anonymous-retention`
  e il suo funzionamento non sono stati verificati direttamente.
- `model_audit/` è stato eliminato su richiesta. Gli sprite in
  `shmup_obj_audit/` sono stati conservati.

## Stato del repository al momento del promemoria

- `main` e `origin/main` puntano a `2f511bb`; working tree pulito prima di
  creare questo file. Il commit include privacy, disattivazione Plausible,
  `supabase/retention.sql` e gli sprite di audit. Non ripetere il push.
- `npm.cmd run build` è passato; il bundle generato non conteneva riferimenti
  a Plausible. `git diff --check` era passato prima del commit.

## Verifiche live del 23 settembre 2026

- Il sito pubblico risponde HTTP 200. Ricostruendo `web` da `2f511bb` con le
  due variabili pubbliche estratte dal bundle pubblicato, il nome dell'asset
  JavaScript coincide (`index-sXh3K7mP.js`). Il bundle contiene l'informativa
  aggiornata e non contiene `plausible.io`. L'utente ha confermato che il
  deployment Production nel pannello Vercel indica `2f511bb`. L'utente ha
  ricaricato il sito con la scheda Network aperta e non ha visto richieste a
  `plausible.io`. Ha aperto "Privacy details" prima di salvare il tag e visto
  l'informativa aggiornata al 23 settembre 2026. Aprendo `#/hub` in una
  finestra privata, ha visto il link Privacy senza richiesta automatica della
  fotocamera. Passando dai comandi a mano a mouse/touch o spegnendo la
  fotocamera, l'indicatore del dispositivo si è spento. Creator Clip non è
  stato provato su dispositivo reale.
- Lo schema Supabase inizialmente esponeva le tabelle grezze e non serviva
  `daily_leaderboard`. Dopo l'esecuzione SQL dell'utente, `profiles` e
  `scores` rispondono 401 senza sessione; entrambe le viste pubbliche
  rispondono. Test con account anonimi temporanei: isolamento RLS fra utenti,
  `delete_my_account()` e cancellazione a cascata riusciti; account di prova
  cancellati. L'utente ha confermato il job Cron attivo con funzione, comando
  e pianificazione attesi; verificare la cronologia dopo la prima scadenza.
  Non considerare conclusa la revisione privacy.

## Prossimi controlli

1. Provare su browser e dispositivi reali fotocamera, mouse/touch,
   registrazione, classifica e cancellazione dal profilo.
2. Verificare nella cronologia Supabase la prima esecuzione riuscita del job
   Cron dopo la prossima scadenza mensile.
3. Completare le voci aperte in `AUDIT_TODO.md` sulla configurazione effettiva,
   sui fornitori/trasferimenti e sulle prove in browser e dispositivi reali.
   Non dichiarare completata la revisione sulla sola base del codice.

Aggiorna o rimuovi questo promemoria quando i controlli saranno conclusi.
