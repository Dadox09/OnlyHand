# TODO — OnlyHand

Riepilogo delle priorità emerse dalla revisione statica della cartella `web/` e dei materiali di lancio.

## Prima di spingere traffico da TikTok

- [x] **Rendere navigabili in verticale ingresso e hub.** L'overlay di rotazione ora appare solo sulle schermate di gioco; ingresso e hub restano navigabili in verticale.
- [x] **Sanificare il nome giocatore nei punti che generano HTML.** Nome inserito come testo e nei campi tramite API DOM; la classifica già applicava escaping. Verificati tutti gli usi con `rg`.
- [x] **Correggere il conteggio dei giochi nell'onboarding.** Il numero deriva da `visibleGames`, come quello dell'hub.
- [ ] **Configurare la misurazione del funnel.** `VITE_PLAUSIBLE_DOMAIN` è nel build di produzione e i link TikTok hanno UTM. Restano da aggiungere dominio e obiettivi evento alla dashboard Plausible e verificare una conversione dopo il deploy.
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
- Questa revisione è statica: deployment live e dispositivi reali non sono stati verificati.
- L'architettura attuale Vite + JavaScript è adeguata; non serve introdurre un framework per questi interventi.
