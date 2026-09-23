# OnlyHand — lavoro emerso dalla revisione

Revisione statica del 23 settembre 2026. Lo stato del deployment, di Plausible e di Supabase di produzione va verificato prima di considerare risolte le attività che li riguardano.

## Priorità alta — sito pubblico

- [ ] **Completare l'informativa privacy** in `web/src/views/privacyView.js`: identità e contatti del titolare, finalità e basi giuridiche per ciascun trattamento, destinatari, eventuali trasferimenti, conservazione, diritti esercitabili e reclamo al Garante. Documentare la configurazione effettiva di hosting e servizi attivi. [Requisiti dell'informativa](https://www.garanteprivacy.it/home/principi-fondamentali-del-trattamento).
- [x] **Correggere le promesse sui dati**: il video non viene caricato, ma Creator Clip lo registra localmente dopo una scelta esplicita; il profilo resta solo locale *se Supabase è disattivato*. Con Supabase attivo il tag viene inviato già durante l'onboarding, mentre il database conserva anche ID anonimo, date e risultati delle partite. Riferimenti: `web/src/views/onboarding.js`, `web/src/core/backend.js`, `supabase/schema.sql`.
- [x] **Rendere l'informativa raggiungibile prima della raccolta**: aggiungere un collegamento nella schermata iniziale e prima di salvare il tag. Verificare anche l'accesso diretto a `#/hub`, che può avviare la fotocamera automaticamente. Riferimenti: `web/src/views/onboarding.js`, `web/src/views/menu.js`.
- [ ] **Verificare Plausible disattivato in produzione**: dopo il deployment, controllare l'assenza dello script e degli eventi verso Plausible e rimuovere `VITE_PLAUSIBLE_DOMAIN` da Vercel. Rivalutare consenso e informativa solo se si riattiva l'analisi, secondo le [indicazioni del Garante](https://www.garanteprivacy.it/faq/cookie).

## Priorità alta — se si abilita Supabase

- [x] **Definire conservazione e cancellazione** di account anonimo, profilo e risultati. Predisporre una procedura per le richieste degli utenti; cancellare `localStorage` non elimina i dati nel cloud e può far perdere l'accesso all'account anonimo. Riferimenti: `web/src/core/backend.js`, `supabase/schema.sql`, [documentazione Supabase](https://supabase.com/docs/guides/auth/auth-anonymous).
- [x] **Decidere quali dati rendere pubblici**: `profiles` e `scores` sono leggibili integralmente secondo le policy SQL, inclusi ID e cronologia di tutte le partite. Se serve solo la classifica, esporre solo i campi necessari e aggiornare l'informativa. Riferimento: `supabase/schema.sql`.
- [x] **Presentare la classifica come casual** finché il server non verifica i risultati: il client può inviare punteggi arbitrari e il limite di uno ogni cinque secondi è per account anonimo. Riferimenti: `web/src/core/backend.js`, `supabase/schema.sql`.
- [x] **Correggere la classifica giornaliera**: calcolare il miglior punteggio per giocatore *prima* di applicare il limite, così 60 risultati di un giocatore non nascondono gli altri. Riferimento: `web/src/core/backend.js`, funzione `fetchDailyBoard`.
- [x] **Non creare account per la sola lettura della classifica**, oppure definire una pulizia degli account anonimi: `fetchLeaderboard` e `fetchDailyBoard` chiamano `ensureSession`. Riferimento: `web/src/core/backend.js`.
- [x] **Distinguere il fallback locale dalla classifica globale** quando la richiesta Supabase fallisce. Riferimenti: `web/src/views/leaderboardView.js`, `web/src/views/gameHost.js`.

## Affidabilità e comunicazione

- [x] **Aggiungere un modo per spegnere la fotocamera durante la sessione** e fermarla passando al mouse/touch, se era già attiva. Gestire anche l'errore dopo `getUserMedia` senza lasciare tracce aperte. Riferimenti: `web/src/core/camera.js`, `web/src/views/gameHost.js`.
- [x] **Correggere la gestione dei punti facciali fuori immagine**: `_normalized_to_pixel_coordinates` può restituire `None`, che `visualizeFaces` passa a `cv2.circle`. Riferimento: `basics/myLibraries.py`.
- [x] **Correggere la promessa di sincronizzazione tra dispositivi** nei documenti, oppure implementare il recupero di profilo e risultati dal cloud: il codice attuale li invia ma non li importa. Riferimenti: `web/GO_LIVE.md`, `web/src/core/backend.js`.
- [ ] **Raccogliere provenienza e licenze degli asset distribuiti** (sprite, immagini, modelli); l'assenza di una nota nel repository non prova una violazione, ma non consente di verificarne l'uso commerciale.

## Prima di rivolgersi a minori o attivare annunci

- [ ] **Minori:** se il servizio è rivolto a loro, definire le basi giuridiche e un'informativa comprensibile; se si usa il consenso per un servizio online, verificare il regime italiano per gli under 14. [Garante](https://www.garanteprivacy.it/temi/minori).
- [ ] **Annunci:** prima di caricare AdSense o altre tecnologie pubblicitarie, aggiornare l'informativa e implementare i controlli di consenso richiesti. Per AdSense nel SEE, Regno Unito e Svizzera verificare la [CMP certificata richiesta da Google](https://support.google.com/adsense/answer/13554020?hl=en-GB). Gli annunci risultano disattivati nel codice esaminato.

## Chiusura della revisione

- [ ] Confrontare build e impostazioni del deployment con questo repository; verificare se Supabase e Plausible sono realmente attivi.
- [ ] Provare su browser e dispositivi reali i percorsi fotocamera, mouse/touch, registrazione, classifica e cancellazione. I rilievi sopra derivano da analisi statica, senza test del deployment.
