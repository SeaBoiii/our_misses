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
- **Why I miss you.** After sending a miss, tap why (🎵 a song came on, 🍜 food you'd love, 🌙 can't sleep…). The other phone sees it live, the feed keeps it, and History shows each of your top reasons.
- **This or That (once a day).** Today's question (chicken rice or nasi lemak?): pick yours and guess theirs. You both see the answers once you've each played; a right guess is +2 and picking the same is +1. Every day you both answer goes in the "Our answers" album.
- **Heart to Heart (daily).** One of the our_hearts questions, answered in writing (up to 600 characters). You see each other's answer once you've both written one, +2 misses each, and every day you both answered is kept in its own "Our answers" album.
- **Agak Agak (daily).** A spectrum from the sg_games deck (Shiok ↔ Sian, Atas ↔ Down-to-earth…). Today's Psychic sees where the hidden target sits and gives one clue; the other sets the needle. Within 3° is +4 each, then +3 and +2. The Psychic swaps every round.
- **Hold hands.** When you're both on, hold a thumb on the heart at the same time and the phones beat together. Every 20 seconds together is a miss each, up to 5 a day. Opening it asks the other phone to join.
- **Play** (when you're both on). Versus: **Tug of war** (15 seconds of tapping on the rope), **Pour-off** (the water sort game from Sort of Us, one shared puzzle; first to sort every colour wins, timed by the database), **Kiasu Quiz** (7 SG trivia questions from sg_games), **Next Stop** (an MRT quiz: next stations, lines and interchanges), **Kopi Rush** (one minute behind a kopitiam counter, the Kopi Master rules: the same orders on both phones, most drinks right wins) and **Scissors-Paper-Stone** (best of 5; each throw is stored before either phone sees the other's, and the database counts the wins). The first decisive versus win each day is +5 misses. Together: **Chapteh**, kicked back and forth between your phones on the beat (timing windows from Chapteh Kick); every 4 kicks you both agree on is a miss each, up to 6 a rally and 12 a day. **Cannot Say!** (the sg_games deck): one of you types clues without the banned words while the other guesses, swapping at 45 seconds; every word you get is a miss each, up to 6 a round and 12 a day.
- **A new lineup every day.** Each Singapore day has one daily game (Prove It, This or That, Heart to Heart or Agak Agak), three of the six versus games and one of the two together games, on a fixed 28-day cycle made once by a script: tomorrow's daily game and versus three never repeat today's, every daily game comes up 7 times in 28 days and every Play game 14. The Today card shows a peek at tomorrow. Hold hands and Why are always on. Only today's games can be started; the database checks (`our_misses_private.lineup`, mirrored in `src/game/lineup.ts`).
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

With no Supabase configuration the app opens a **demo**: pick a player, and a pretend partner misses you back. It lives only in that browser. `?allgames` turns the daily rotation off and `?lineupday=YYYY-MM-DD` plays as that day; `?samebrain` makes her always miss you at the same moment; `?quiet` keeps her from acting on her own (she still accepts duels, slowly); `?duelme`, `?pourme`, `?quizme`, `?mrtme`, `?chaptehme`, `?kopime`, `?spsme` and `?cannotme` make her challenge you straight away, `?handsme` makes her ask to hold hands, and `?fastbot` makes her solve a Pour-off in 12 seconds.

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
