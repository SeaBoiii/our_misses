# Going live at missu.aleemxnurul.love

Four parts: the database, the repository, the domain, and a first check. Nothing here needs a secret key: the site ships only the project URL and a **publishable** key, and the database decides who can do what.

## 1. Database (Supabase)

**Recommended: reuse the our_miles project.** Both Auth accounts already exist there, and two apps using it every day keeps the free project from pausing. Every object this migration creates is prefixed `our_misses`, so it doesn't touch the wallet tables. (A fresh project works too; then also follow our_miles' guide for creating the two accounts with sign-ups turned off.)

1. Open the project's **SQL Editor** and run the whole of [`supabase/migrations/202611230001_our_misses.sql`](../supabase/migrations/202611230001_our_misses.sql). It creates the ledger, hearts, the three functions the app calls, the row-level security rules, live updates for the ledger, and the private "room" used for the *is here* dot.
2. Allowlist the two players. If you reused the our_miles project, copy its pair:

   ```sql
   insert into public.our_misses_members (player, user_id)
   select owner, user_id from public.our_miles_members;
   ```

   Otherwise insert `('Aleem', '<Aleem's Auth user UID>'), ('Nurul', '<Nurul's Auth user UID>')`. Until both rows exist, nobody can read or send anything.
3. Check it:

   ```sql
   select player from public.our_misses_members order by 1;          -- Aleem, Nurul
   select player, stored from public.our_misses_hearts order by 1;   -- both 3
   select tablename from pg_publication_tables
   where pubname = 'supabase_realtime' and tablename = 'our_misses_events';  -- one row
   ```

4. In **Authentication → URL Configuration**, add `https://missu.aleemxnurul.love` to the redirect URLs. (Sign-in is email + password, so this is only for completeness.)

Points are only ever written by `our_misses_send`; members can read the ledger but cannot insert, edit or delete rows. The test suite (`npm run test:sql`) checks strangers, a third account, direct writes, the hearts clock, rallies, Same Brain and the Singapore week boundary.

## 2. Repository and Pages

1. Create an empty public repository **SeaBoiii/our_misses** (no README).
2. **Settings → Secrets and variables → Actions → Variables**, add:

   | Variable | Value |
   | --- | --- |
   | `SUPABASE_URL` | the project URL, `https://<ref>.supabase.co` |
   | `SUPABASE_PUBLISHABLE_KEY` | the `sb_publishable_…` key |

   The workflow refuses to deploy without them, so the public site can never fall back to the demo.
3. **Settings → Pages → Source: GitHub Actions.**
4. Push `main`. The workflow lints, runs the rule, SQL and browser tests, then builds with the real values and deploys.

## 3. Domain (Cloudflare)

1. In the `aleemxnurul.love` zone add **CNAME** `missu` → `seaboiii.github.io`. Either proxy setting works:
   - **Proxied (orange cloud)**, like the apex: Cloudflare serves HTTPS with its own certificate. This is how it's live. Turn on **SSL/TLS → Edge Certificates → Always Use HTTPS** so `http://` redirects.
   - **DNS only (grey cloud)**: GitHub issues the certificate; tick **Enforce HTTPS** in Pages settings once it appears.
2. **Settings → Pages → Custom domain:** `missu.aleemxnurul.love` (already set). Sites deployed by Actions ignore the `CNAME` file; it's kept in `public/` so the build check catches a wrong domain.

## 4. First check

Open https://missu.aleemxnurul.love on two phones, signed in as each of you. Send a miss from one: the other should get the heart, the toast and the rope pull within a second, and the green *is here* dot should show whoever has the app open. Add it to both home screens (Share → Add to Home Screen).
