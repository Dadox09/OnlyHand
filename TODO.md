# TODO — OnlyHand

Riepilogo delle priorità emerse dalla revisione statica della cartella `web/` e dei materiali di lancio.

## Prima di spingere traffico da TikTok

- [x] **Consentire l'uso in verticale.** L'ingresso, l'hub e le schermate di gioco non impongono più la rotazione; il manifest PWA accetta entrambi gli orientamenti.
- [ ] **Concludere la verifica del gioco in verticale e della webcam.** Pong in solo e Asteroids usano un campo logico più alto su schermi portrait e lo aggiornano alla rotazione; le partite online mantengono le coordinate condivise. La fascia webcam ora occupa più larghezza, mostra lo stato della camera e allinea i punti della mano anche se il formato video varia. Le schermate sovrapposte occupano tutto lo spazio del palco.
  - Chrome con viewport emulati 320×667, 390×844 e 844×390: scelta controller e gameplay di Pong in solo e Asteroids visibili, senza scroll orizzontale. Sul telefono stretto la scheda del record è nascosta per lasciare spazio al gioco. L'emulazione non verifica fotocamera, touch fisico o prestazioni reali.
  - Pong online e Orb Rush conservano il campo condiviso 800×500, che resta basso in verticale. Valutare un adattamento del campo condiviso solo dopo prove con due dispositivi e orientamenti diversi.
  - Verificare almeno un telefono stretto e uno standard in verticale: scelta controller, gioco, pausa/fine partita, camera attiva/spenta e webcam; controllare anche landscape, rotazione durante la partita e assenza di scroll orizzontale. Provare Pong in solo, Asteroids e le partite online con due dispositivi.
- [x] **Sanificare il nome giocatore nei punti che generano HTML.** Nome inserito come testo e nei campi tramite API DOM; la classifica già applicava escaping. Verificati tutti gli usi con `rg`.
- [x] **Correggere il conteggio dei giochi nell'onboarding.** Il numero deriva da `visibleGames`, come quello dell'hub.
- [ ] **Decidere se misurare il funnel.** Plausible è disattivato nel sito pubblicato e non c'è un account; i link TikTok hanno UTM. Se si decide di attivare l'analisi, completare prima la revisione privacy, poi configurare dominio e obiettivi e verificare una conversione.
- [ ] **Provare il percorso reale sui dispositivi.** Verificare fotocamera e modalità mouse/touch su desktop, Android Chrome, iPhone Safari e browser interno di TikTok; controllare autorizzazioni, passaggio al gioco e comportamento in verticale/orizzontale.
- [ ] **Valutare la lingua del pubblico.** Se i video sono rivolti soprattutto all'Italia, tradurre almeno onboarding e testi d'ingresso e aggiornare `lang` in `web/index.html`.

## Crescita e affidabilità delle funzioni social

- [ ] **Migliorare l'anteprima delle sfide condivise.** I link di sfida usano route hash (`#/challenge/...`) e i metadati Open Graph sono generici: i crawler non leggono gioco e punteggio dall'hash. Aggiungere una pagina di anteprima social con metadati specifici se le sfide diventano un canale importante. Vedi `web/src/core/challengeShare.js` e `web/index.html`.
- [ ] **Dichiarare chiaramente il livello di affidabilità della classifica.** Supabase limita valori e frequenza degli invii, ma i punteggi sono inviati dal client e possono essere falsificati. Tenerla casual/non competitiva oppure aggiungere verifiche server-side prima di promuoverla come classifica competitiva. Non presentarla come globale se Supabase di produzione non è configurato e verificato.
- [ ] **Preparare video nativi per TikTok.** Registrare in verticale 9:16, mostrare subito mano e reazione del gioco, aggiungere testo/sottotitoli leggibili e chiudere con una call to action. Provare più hook e formati, per esempio demo immediata, reazione e sfida sul punteggio.
- [ ] **Usare link tracciabili nei contenuti.** URL UTM preparato in `web/launch-posts.md`; resta da impostarlo nella bio e usarlo nei contenuti pubblicati.

## Prima di pubblicità a pagamento o monetizzazione

- [ ] Pubblicare versioni definitive di Privacy, Cookie e Termini con l'identità legale e i contatti del titolare.
- [ ] Configurare il consenso richiesto prima di caricare tecnologie pubblicitarie o di tracciamento che lo richiedono.
- [ ] Verificare dominio, impostazioni di produzione e configurazione Supabase prima di promuovere funzioni online.

## Riferimenti

- TikTok for Business, [Creative Codes](https://ads.tiktok.com/business/en/creative-codes) e [guida alla creatività](https://ads.tiktok.com/business/en/guides/what-is-ad-creative-guide).
- Checklist esistente: `web/GO_LIVE.md`.
- Il deployment privacy del 23 settembre 2026 è stato verificato; le modifiche locali successive e i percorsi sui dispositivi reali richiedono nuove verifiche. Vedi `AUDIT_TODO.md`.
- L'architettura attuale Vite + JavaScript è adeguata; non serve introdurre un framework per questi interventi.
