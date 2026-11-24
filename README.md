# missu · who misses more?

A tug of war for two, made by Aleem for Nurul. Every miss you send pulls the heart on the rope toward you. Whoever has pulled it further by Sunday midnight (Singapore time) missed more that week.

Production address: **https://missu.aleemxnurul.love**
Repository: **SeaBoiii/our_misses**

## How to play

- **Hold to miss.** Tap for a small heart (+1), hold for a bigger one (+2, then +3 at MAX). Hold past MAX and the heart bursts: you "missed them too much" and it goes as +1.
- **Hearts.** You can store 3. One comes back every 30 minutes, so the winner is whoever misses all week, not whoever taps fastest.
- **Miss you back.** Answer a miss within 5 minutes to start a rally. Each answer earns one more bonus point than the last (up to +5).
- **Same Brain.** If you both send a miss within 60 seconds without having seen the other's, you both get +3.
- **Prove It (once a day).** Claim how much you missed them today, from a kaya toast crumb (+1) to every star (+7), then prove it in a 20-second catch game: ❤️ +1, 🌟 +3, and the emails, meetings and alarms in the way cost 3. Bigger claims need bigger catches. Fall short and you get a BLUFF DETECTED stamp and nothing. Your claim stays hidden until you've both played (or midnight), then both results are revealed together and the points land.
- **VS.** When you're both on, challenge the other to **Tug of war** (15 seconds of tapping on the rope) or **Pour-off** (the water sort game from Sort of Us, the same puzzle on both phones; the first to sort every colour wins and ends the race, timed by the database). The first decisive VS win each day is worth +5 misses; rematches are for glory.
- **Seasons.** Each week resets Monday 00:00 in Singapore. Last week's winner gets a 🏆 shown next to their name.
- **History (🏆 button).** Every season ever played, newest first: who missed more, the score, misses sent, Same Brains and the longest rally, plus all-time trophies and the current winning streak. It's rebuilt from the ledger, which is never trimmed, so old weeks stay exactly as they were played.

The database decides every point (`supabase/migrations`); the browser only asks to send a miss. `src/game/rules.ts` mirrors the same rules for the demo and the countdowns, and both are tested against the same scenario.

Every game pays out in misses, so the rope and the all-time counter ("misses between you") stay the point of it all.

## On your phone

Open https://missu.aleemxnurul.love and install it: on Android, tap **Install missu** (or the browser menu → Install app); on iPhone, Safari → Share → **Add to Home Screen**, then open it from the home screen and sign in there once (iPhone keeps home-screen apps separate from Safari). After that it opens straight to the rope; sign out lives in the ⋯ menu.

## Run it

Node 22.12 or newer.

```sh
npm ci
npm run dev
```

With no Supabase configuration the app opens a **demo**: pick a player, and a pretend partner misses you back. It lives only in that browser. `?samebrain` makes her always miss you at the same moment; `?quiet` keeps her from acting on her own (she still accepts duels, slowly); `?duelme` makes her challenge you straight away.

To run against the real project, copy `.env.example` to `.env.local` and fill in the two public values.

## Checks

```sh
npm run lint
npm test            # the rules, and the catch game's difficulty against simulated players
npm run test:sql    # the migration in real PostgreSQL (PGlite), access rules and a scripted week
npm run build       # typecheck, build, domain/icon/secret checks
npm run test:e2e    # demo and mocked-Supabase browser tests (uses installed Edge locally)
```

## Going live

See [docs/SETUP.md](docs/SETUP.md): apply the migration, allowlist both accounts, add two repository variables, point the `missu` DNS record at GitHub Pages.
