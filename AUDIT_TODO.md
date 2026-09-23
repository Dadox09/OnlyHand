# OnlyHand — lavoro emerso dalla revisione

Revisione statica del 23 settembre 2026. Lo stato del deployment, di Plausible e di Supabase di produzione va verificato prima di considerare risolte le attività che li riguardano.

Il deployment Production Vercel indica `2f511bb` (confermato dall'utente); l'asset JavaScript pubblicato coincide con una build locale dello stesso commit con la configurazione pubblica di produzione.

## Supabase di produzione — verifiche HTTP del 23 settembre 2026

- [x] **Limitare la lettura delle tabelle grezze.** Prima della correzione una richiesta senza sessione leggeva `profiles` (16 righe) e `scores` (63 righe) tramite REST. Dopo l'esecuzione SQL dell'utente entrambe rispondono 401 (`42501`). Due account anonimi temporanei non potevano leggere o inserire le righe grezze dell'altro; entrambi sono stati cancellati.
- [ ] **Valutare l'esposizione precedente come potenziale violazione di dati personali.** Registrare quando la lettura pubblica è iniziata e terminata, quali campi erano accessibili (ID anonimo, tag, avatar, date e cronologia dei punteggi), se i log mostrano accessi non previsti e il rischio per gli interessati. Non è stata accertata una consultazione da parte di terzi. Usare la [procedura del Garante](https://www.garanteprivacy.it/data-breach) per valutare documentazione ed eventuali obblighi di notifica; la decisione spetta al titolare.
- [x] **Allineare viste e cancellazione allo schema pubblicato.** `leaderboard` e `daily_leaderboard` rispondono alle richieste pubbliche. Con un account anonimo di test, creazione di profilo e punteggio, `delete_my_account()` e verifica della cancellazione a cascata sono riuscite.
- [x] **Verificare la configurazione del job Cron** `onlyhand-anonymous-retention`: il 23 settembre l'utente ha eseguito la query su `cron.job` e confermato una riga con `active = true`, `function_exists = true`, pianificazione `0 3 1 * *` e comando atteso.
- [ ] **Verificare la prima esecuzione Cron** nella cronologia del job dopo la prossima scadenza mensile; la configurazione attiva non prova ancora che l'esecuzione riesca.

## Priorità alta — sito pubblico

- [ ] **Completare l'informativa privacy** in `web/src/views/privacyView.js`: identità e contatti del titolare, finalità e basi giuridiche per ciascun trattamento, destinatari, eventuali trasferimenti, conservazione, diritti esercitabili e reclamo al Garante. Documentare la configurazione effettiva di hosting e servizi attivi. [Requisiti dell'informativa](https://www.garanteprivacy.it/home/principi-fondamentali-del-trattamento).
- [ ] **Verificare le condizioni dei fornitori e i trasferimenti prima di precisare l'informativa.** La [pagina DPA di Vercel](https://vercel.com/legal/dpa) dichiara che l'addendum si applica ai piani Pro ed Enterprise, mentre OnlyHand usa Hobby: verificare quale accordo e quali garanzie valgono effettivamente per questo account. Verificare anche l'applicabilità del [DPA Supabase](https://supabase.com/downloads/docs/Supabase%2BDPA%2B260317.pdf) e i rispettivi subfornitori. La regione primaria Supabase Irlanda, da sola, non descrive tutti i trattamenti o trasferimenti.
- [x] **Correggere le promesse sui dati**: il video non viene caricato, ma Creator Clip lo registra localmente dopo una scelta esplicita; il profilo resta solo locale *se Supabase è disattivato*. Con Supabase attivo il tag viene inviato già durante l'onboarding, mentre il database conserva anche ID anonimo, date e risultati delle partite. Riferimenti: `web/src/views/onboarding.js`, `web/src/core/backend.js`, `supabase/schema.sql`.
- [x] **Rendere l'informativa raggiungibile prima della raccolta**: collegamento nella schermata iniziale e prima di salvare il tag; il 23 settembre l'utente ha aperto "Privacy details" sul sito pubblicato e visto l'informativa aggiornata. Aprendo direttamente `#/hub` in una finestra privata, il link Privacy era visibile e non è apparsa una richiesta automatica di accesso alla fotocamera. Riferimenti: `web/src/views/onboarding.js`, `web/src/views/menu.js`.
- [x] **Verificare Plausible disattivato in produzione**: il 23 settembre HTML, bundle JavaScript e service worker pubblicati non contenevano riferimenti a Plausible; l'utente ha ricaricato il sito in un browser reale e non ha visto richieste a `plausible.io` nella scheda Network. Ha anche confermato l'assenza di `VITE_PLAUSIBLE_DOMAIN` in Vercel. Rivalutare consenso e informativa solo se si riattiva l'analisi, secondo le [indicazioni del Garante](https://www.garanteprivacy.it/faq/cookie).

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

- [x] Confrontare build e impostazioni del deployment con questo repository: Vercel Production indica `2f511bb`, il bundle pubblicato coincide con la build locale con configurazione pubblica, Supabase è attivo e Plausible non viene caricato secondo la verifica Network dell'utente.
- [ ] Provare su browser e dispositivi reali tutti i percorsi: il 23 settembre l'utente ha confermato che passando dai comandi a mano a mouse/touch o spegnendo la fotocamera l'indicatore si spegne. Restano Creator Clip (non provabile ora), classifica e cancellazione tramite UI; la cancellazione cloud via API è già stata provata con un account temporaneo.
