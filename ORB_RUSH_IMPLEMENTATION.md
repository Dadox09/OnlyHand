# Orb Rush — istruzioni per l'agente implementatore

## Obiettivo

Implementa un nuovo gioco **1v1 online** in `web/src/games/orb-rush/`. Due persone entrano con codice o link d'invito, competono per conquistare sfere in un'arena condivisa e possono chiedere la rivincita. Deve funzionare con fotocamera e con mouse/touch. Mantieni Pong funzionante.

Questo documento è una specifica di implementazione, non un'autorizzazione a modificare il progetto Supabase di produzione o a pubblicare il frontend. Prepara SQL e codice verificabili; applica la migrazione prima di un eventuale deployment coordinato.

## Leggi prima di modificare

- `AGENTS.md` e lo stato Git; preserva le modifiche già presenti.
- `supabase/README.md` e `supabase/pong_lobbies.sql` per il modello di stanze private.
- `web/src/games/pong/online.js` e `onlinePhysics.js` per host autoritativo, Presence, Broadcast, sequenze, rivincita e pulizia.
- `web/src/core/backend.js`, `web/src/views/gameHost.js`, `web/src/games/registry.js`, `web/src/main.js` e `web/src/input/handInput.js` per integrazione, routing e controlli.

Riusa i componenti già presenti in `core/gameKit.js` e gli overlay/CSS esistenti dove bastano. Evita nuove dipendenze e una riscrittura generale del multiplayer.

## Regole della partita

- Arena Canvas 800 × 500, due cursori colorati, **una sfera attiva** alla volta. Mostra sempre punteggio, tempo residuo, stato della connessione e progresso di conquista.
- La partita dura **60 secondi di gioco effettivo**. Parte quando entrambi sono presenti. Se uno si disconnette, timer e conquista si fermano; riprendono se torna lo stesso giocatore. Un nuovo ospite fa partire una partita nuova.
- La sfera si conquista restando con il cursore nel suo raggio per **0,7 secondi**. Se entrambi sono nel raggio, la conquista è contesa e nessuno avanza. Quando un cursore esce, il suo progresso torna a zero. Una conquista vale **1 punto**; dopo una breve pausa appare una nuova sfera in posizione casuale, lontana dai bordi e, per quanto pratico, dai due cursori.
- **Pinch** (clic tenuto su mouse/touch) attiva un impulso di **0,8 secondi** che raddoppia la velocità di conquista, con **5 secondi di ricarica**. Si attiva sul passaggio da rilasciato a premuto: tenerlo premuto non riattiva l'impulso. Mostra il cooldown. Qui il pinch accelera la conquista: uno scatto del cursore sarebbe poco utile, dato che il cursore segue già direttamente la mano.
- Allo scadere vince chi ha più punti; è possibile il pareggio. Nessun punto online entra nelle classifiche solo, XP o statistiche delle run. Mostra risultato, rivincita richiesta da entrambi e uscita.
- Niente power-up, account aggiuntivi, matchmaking pubblico, chat o avversario IA in questa versione.

## Controlli e presentazione

- Usa `onHandUpdate`: `x` e `y` normalizzati muovono il cursore; `pinch` attiva l'impulso. Rispetta la stessa inversione dell'asse X usata dagli altri giochi per la fotocamera; il fallback pointer deve seguire direttamente il puntatore.
- Se la mano sparisce, il cursore smette di conquistare e il pinch si rilascia. Il comportamento deve valere anche se il client è ospite. Evita che un input remoto vecchio resti attivo dopo una perdita di connessione.
- Evidenzia chiaramente sfere libere, contese e in conquista. Feedback sonoro/visivo breve, senza ostacolare la lettura del punteggio. Overlay e bottoni utilizzabili anche con tastiera e puntatore; riusa `handCursor` per i menu dove serve.
- Il gioco deve avere una voce visibile nel registry e una pagina raggiungibile dal hub. Se Supabase non è configurato, presenta un messaggio chiaro e un'uscita al hub; non avviare una finta partita offline.

## Rete e sicurezza

- Riprendi il modello di Pong: identità anonime Supabase, stanza a invito di due utenti, canale Realtime **privato** con Broadcast e Presence, e host che calcola tempo, posizione della sfera, conquista, punti e risultato. L'ospite invia solo `x`, `y`, `pinch` e rilevamento della mano; non invia punteggi o stato autorevole.
- Invia input e snapshot a circa **20 Hz**, come Pong. Il cursore locale deve rispondere subito; lo stato remoto può seguire gli snapshot. Ignora snapshot fuori ordine tramite sequenza. Non trasmettere immagini della webcam, landmark o dati del profilo.
- Valida i messaggi ricevuti prima di usarli: coordinate finite e limitate all'arena, booleani, sequenza e struttura dello stato. Se l'ultimo input dell'ospite è vecchio di oltre **1 secondo**, consideralo inattivo finché non ne arriva uno nuovo. La stanza e il canale devono escludere una terza persona anche se conosce il codice.
- Aggiungi una migrazione SQL **additiva** per le stanze Orb Rush, con RPC `create`, `join`, `leave`, permessi/RLS Realtime equivalenti a Pong, scadenza e pulizia programmata. Non alterare le RPC, le policy o il topic di Pong. Documenta in `supabase/README.md` l'ordine di applicazione, la necessità di disabilitare l'accesso pubblico Realtime e il controllo del job Cron.
- La partita resta casual come Pong: l'host può essere modificato da un client malevolo, quindi non attribuire risultati globali o premi persistenti.

## Integrazione minima

- Collega `#/games/orb-rush` e un percorso con codice d'invito, scelta crea/entra e avvio del modulo online. Il codice nel link va normalizzato e validato prima della RPC. Mantieni intatti route e lobby di Pong.
- `gameHost.js` oggi carica `pong/online.js` per qualunque `onlineRoom`: rendi la scelta del modulo dipendente dal gioco. L'uscita e `unmount()` devono chiamare la `leave` corretta e pulire canale, Presence, listener, RAF e overlay, anche in caso di errore o navigazione durante il collegamento.
- Non chiamare `onScore` per il risultato Orb Rush: quel percorso salva run e può inviare score alla classifica. Non aggiungere `orb-rush` al vincolo `scores_game_id_check`.
- Tieni la logica delle regole in una piccola funzione/modulo separato dal rendering, come `pong/onlinePhysics.js`, se serve per verificarla. Estrai codice condiviso fra Pong e Orb Rush solo se riduce davvero duplicazione senza cambiare il comportamento di Pong.

## Verifiche richieste

1. Lascia **un controllo eseguibile** per le regole non banali: conquista esclusiva, contesa, uscita dal raggio, impulso/cooldown e fine del tempo. Basta un piccolo test con `node:assert` e timer simulato; non serve un framework.
2. Esegui il test e `npm.cmd run build` da `web/`; controlla `git diff --check`.
3. Prova in **due profili browser separati**: creazione, ingresso via codice e link, movimento con mano e pointer, punteggio, pareggio/vittoria, rivincita, perdita della mano, disconnessione/riconnessione e uscita. Un terzo profilo deve essere rifiutato. Verifica che la classifica non cambi.
4. Se non puoi applicare la migrazione o provare due client reali, dichiara esattamente cosa resta da verificare. Non presentare come funzionante online una partita controllata solo con mock locali.

Consegna il diff, i comandi e risultati dei controlli, e le istruzioni SQL/deployment necessarie per mettere il gioco online senza interrompere Pong.
