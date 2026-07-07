# Asteroids — Piano "gioco completo"

Stato vivo del lavoro. Aggiornare le checkbox man mano. Contesto: `web/src/games/asteroids/`
(index.js = gioco, fleet.js = catalogo navi), hangar in `views/profileView.js` +
overlay pre-partita in `views/gameHost.js` (`showHangar`). Sprites: `web/public/assets/asteroids/ships/`.

## Tier 1 — trasforma il gioco

- [x] **1. Navi con statistiche** — fleet.js: `stats { agility, fire, hitbox, lives, score, double, triple }` + `perk` label.
      index.js le applica: smoothing, fire interval, hitbox (const HITBOX), vite iniziali, moltiplicatore punti,
      GOLIATH = colpo doppio parallelo, NOVA = triple stretto nativo (powerup triple = più largo).
- [x] **2. Sblocco navi via livello player** — fleet.js `unlock` + `isShipUnlocked()` (viper/comet 1, titan 3,
      phantom 5, pip 8, goliath 12, nova 16). Card bloccate (grayscale + lucchetto + "LV N") in entrambi
      gli hangar; in gameHost.showHangar selezione bloccata → fallback DEFAULT_SHIP.
- [x] **3. Bomba col pugno** — `state.fist` da `gesture === "Closed_Fist"`, edge-trigger + cooldown 90 frame.
      state.bombs (start 1, max 2, +1 per boss kill in damageBoss). detonateBomb(): pulisce proiettili,
      breakAsteroid su tutti (large splittano a cascata), fighter −3, UFO muore, boss −5.
      HUD "💣 N" basso-sinistra, anello shockwave disegnato (state.bombWave 0..34).
      registry.js description aggiornata ("fist = bomb").
- [x] **4. Boss con fasi** — makeBosses ha `phase`/`ringT`; damageBoss() gestisce transizioni:
      50% hp → fase 1 (fireRing 10 colpi ogni 2.6 s + 2 droni scorta), 25% → fase 2 enrage
      (shootEvery ×0.65, bulletSpeed ×1.2, strafe ×1.5, aura rossa pulsante in drawBosses).
      Cap 16 proiettili nemici a schermo (fireRing + fighter).

**Tier 1 COMPLETO** (build ok). Refactor: killFighter/damageBoss/fireRing/detonateBomb helper in index.js.
Manca test manuale con webcam (navi diverse, pugno→bomba, fasi boss al livello 3).

**Tier 2 COMPLETO** (build ok). Test manuale mancante: musica (start/pausa/boss), streak popup,
slow-mo a 1 vita, formazione V (level 6+), carrier (level 10+), hazard ai livelli 5/10/20 (storm/well/blackout).

## Tier 2 — polish

- [x] 5. Musica synth procedurale — gameKit `createMusic()`: scheduler lookahead (setInterval 80 ms,
      0.3 s ahead) su AudioContext condiviso, bus gain privato sotto gli sfx. Loop 32 step @112 BPM,
      Am/Am/F/G: kick+basso sempre, hat ≥0.35, arp ≥0.5, snare ≥0.6; filtro basso apre con l'intensità.
      index.js: intensità 0.32+level·0.015 (cap 0.55), boss 0.7 / fase1 0.85 / fase2 1.0.
      Start al mount (no-op finché il browser non sblocca l'audio), stop su pause/morte/unmount.
- [x] 6. Hit-stop + streak + slow-mo — `state.hitStop` (3 frame su boss kill, 2 su carrier) congela
      update(); addStreak su kill fighter/UFO/boss/carrier (finestra 55 frame) → popup DOUBLE/TRIPLE
      KILL/RAMPAGE (state.popups, drawPopups). Scesa a 1 vita: slowMo 110 frame a metà velocità
      (skip update alterni) + popup "LAST LIFE" + tinta ciano.
- [x] 7. Formazioni + warlord carrier — squad ≥2 spawna in V (wingman = tipo/lane/fase del leader,
      offset [-46,-36]/[46,-36]/[0,-72], volley sfalsate). Level 10+: ogni 3° squad (state.squadN)
      → makeCarrier(): warlord hp 14, hover come mini-boss, hp bar, spawna un drone ogni 4.2 s
      (cap MAX_FIGHTERS=5), ram non lo uccide, kill = 60 pt + drop garantito + hit-stop.
- [x] 8. Hazard ogni 5 livelli (mai sui boss level) — rotazione via state.hazardN (un modulo su N
      non raggiungerebbe mai BLACKOUT: ogni 15° è boss). STORM: rock/comete extra ogni 2.1 s finché
      il campo è vivo. WELL: vortice (anelli magenta) attira asteroidi/proiettili/nave (clamp anti
      slingshot). BLACKOUT: buio fuori dal raggio-luce della nave (~190 px pulsante); proiettili,
      powerup e nave disegnati sopra il velo (mai bullet-hell cieco). Banner + tag HUD col nome.

## Tier 3 — retention

- [x] 9. Daily run + board TODAY — index.js: `rand` module-level (mulberry32 + FNV del giorno UTC,
      solo codice sim; draw resta Math.random per non consumare il seed). Hangar: chip FREE FLIGHT /
      ★ DAILY RUN (gameHost `dailyMode`, reset a mount/unmount) → `mount({ daily })`, tag "★ DAILY RUN"
      in HUD. Submit cloud come `asteroids-daily` (recordPlay `opts.submitAs`) così l'all-time resta
      pulito; backend `fetchDailyBoard()` filtra scores `created_at >= oggi UTC`, best per player.
      schema.sql: constraint game_id migrato (drop/add, safe re-run) — **va rieseguito su Supabase**.
- [x] 10. Statistiche fine run — `state.stats` (shots/hits in fire + 4 branch proiettili, maxCombo in
      addScore, kills per tipo in breakAsteroid/killFighter/ufo/damageBoss). onScore(score, runStats)
      → Game Over: tile ACCURACY / MAX COMBO / SECTOR + riga kill (🪨🛩️🛰️🛸👹). Bomba non conta
      shots/hits: precisione = solo cannone.
- [x] 11. Badge asteroids in core/badges.js — Warlord Slayer (3 carrier), Untouchable (boss wave senza
      hit: `state.bossWaveHit` in hitShip, anche a scudo attivo; popup FLAWLESS), Fleet Admiral (tutte
      le navi: `PLAYER_SHIPS.length`, import fleet.js). Counter profilo (warlordKills/flawlessBosses/
      shipsFlown) scritti da gameHost `applyRunCounters` via recordPlay `opts.apply` prima di syncBadges.

**Tier 3 COMPLETO** (build ok). Test manuale mancante: daily run (stesso layout ondate su due partite
stesso giorno), board TODAY online, tile statistiche, badge FLAWLESS su level 3 senza hit.

## Note tuning

- Late game: telegraph sui colpi fighter, proiettili nemici rallentati se >10 a schermo.
- Controllo mano ha precisione ±10px: "difficile ma leggibile", mai bullet-hell cieco.
- README.md sezione web va aggiornato a fine Tier 1 (navi, bomba, fasi boss).
