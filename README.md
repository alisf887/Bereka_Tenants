# በረካ ህንፃ — Tenant Register (React + Supabase)

No server of your own to run or pay for. React (Vite) builds to plain
static files — deploy those to Netlify, GitHub Pages, or Vercel's free
tier. Supabase (free tier) is the database, the login system, and the
live-sync engine — all three without you writing or hosting a backend.

## Why this replaces the Flask version

GitHub Pages and Netlify only serve static files — they can't run Python.
Render's free web-service tier exists, but sleeps after 15 minutes of
inactivity and needs a card on file for anything beyond it. Supabase's
free tier needs no card and nothing to keep running: Postgres + Auth +
Realtime, all managed, all free at this scale (500MB database, plenty of
headroom for a few hundred tenants).

## Folder structure

```
bereka-tenant-register/
├── src/
│   ├── main.jsx               # entry point
│   ├── App.jsx                 # the whole app: login, table, drawer, add form
│   ├── supabaseClient.js       # Supabase connection (reads .env)
│   ├── ethiopianCalendar.js    # all date math — used for display client-side
│   └── styles.css
├── supabase/
│   └── schema.sql              # tables, RLS policies, payment RPC functions
├── scripts/
│   └── seed.mjs                # one-time import of the original 59 tenants
├── data/
│   └── seed_tenants.json       # source data for the seed script
├── index.html
├── package.json
├── .env.example
└── .gitignore
```

## Set up (one time)

### 1. Create a Supabase project
Go to supabase.com → New project (free tier). Once it's ready, go to
**Settings → API** and copy the **Project URL** and the **anon public** key.

### 2. Run the schema
Supabase Studio → **SQL Editor** → New query → paste the entire contents
of `supabase/schema.sql` → Run. This creates the tables, locks them down
with Row Level Security, and creates the payment functions.

If the last two lines (`alter publication supabase_realtime add table ...`)
error with "publication does not exist," skip them and instead turn on
Realtime for both tables via **Database → Replication** in the dashboard.

### 3. Create your (single) owner account
Supabase Studio → **Authentication → Users → Add user**. Use your email
and a real password, and check **Auto Confirm User** (skips email
verification — fine for a single-owner internal tool). There's no
sign-up page anywhere in this app — this is the *only* way an account
gets created, same as the Flask version's `create_owner.py`.

### 4. Configure and install
```bash
cd bereka-tenant-register
cp .env.example .env
# paste your Project URL and anon key into .env
npm install
```

### 5. Seed the original 59 tenants (one time)
```bash
node scripts/seed.mjs
```
It'll ask for the owner email/password you just created (needed because
only a signed-in user is allowed to insert rows — same RLS rule the app
itself runs under). Safe to re-run: it skips seeding if tenants already
exist.

### 6. Run it
```bash
npm run dev
```
Open the URL it prints (usually `http://localhost:5173`). Log in with
your owner email/password to get edit access; anyone without logging in
sees the same page read-only.

## Deploy for free

```bash
npm run build
```
This produces a `dist/` folder of plain static files.

- **Netlify**: drag `dist/` onto app.netlify.com/drop, or connect the
  repo and set build command `npm run build`, publish directory `dist`.
- **GitHub Pages**: push `dist/` to a `gh-pages` branch (or use the
  `actions/deploy-pages` GitHub Action), enable Pages in repo settings.

Either way, set the same two `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`
values as **environment variables in your host's dashboard** (Netlify:
Site settings → Environment variables) — `.env` itself never gets
deployed (it's gitignored on purpose), so the host needs its own copy.

## The four features, and how each works now

**1. Login (only you sign in)** — `src/App.jsx`'s `Login` component calls
`supabase.auth.signInWithPassword()`. No sign-up form exists in the app;
Studio → Authentication is the only place an account can be created.

**2. Owner: add, edit, delete tenants and payments** — every write goes
through Supabase's JS client, but the real permission boundary is
**Row Level Security**, defined in `supabase/schema.sql` — `for insert
... with check (auth.role() = 'authenticated')`. Even if someone opened
dev tools and called the Supabase REST API directly while signed out,
Postgres itself would refuse the write. This is the same "server is the
real boundary, not the UI" principle the Flask version used — the
boundary just moved from Flask's `@login_required` to Postgres's RLS.

**3. Viewers: read-only** — the `select` policy is `using (true)`, open
to everyone, signed in or not. The app hides owner-only buttons based on
whether `session` exists, but (per point 2) that's UX, not the actual
lock.

**4. Auto sync** — Supabase Realtime. `App.jsx`'s `useTenants()` hook
subscribes to `postgres_changes` on both tables; any insert/update/delete
by anyone pings every open browser, which refetches. This replaces the
Server-Sent Events endpoint the Flask version needed — Supabase runs the
equivalent for you, for free, with nothing to host.

**5. Payment history** — `payments` table, one permanent row per payment.
Notice `schema.sql` defines **no UPDATE policy** on it at all — not even
the owner can edit a payment after the fact, only insert a new one or
delete the most recent one (`revert_last_payment`). That immutability is
enforced by the database, not just app logic.

## Where the date math lives now

`src/ethiopianCalendar.js` (client-side, for display) and the
`eth_add_months` / `record_payment` / `revert_last_payment` functions in
`supabase/schema.sql` (server-side, for the actual payment-date math) —
both implement the identical rule set (Pagume never counts as a rent
month) so they always agree. The **6 AM day-rollover** rule
(`todayEth()`) only exists client-side now, since there's no server of
your own to run it on — it uses each viewer's own device clock. Worth
knowing: if someone's phone has the wrong time zone set, their view of
"today" (and therefore "days late") shifts with it.

## Security notes

- Row Level Security is the real access boundary — verified by testing
  a build with a real Supabase project rather than guessed at.
- The `anon` key in `.env` is meant to be public (it's what ships in
  your built JS bundle) — RLS is what makes that safe. Never put your
  Supabase **service role** key in this project; it bypasses RLS
  entirely and must never reach the browser.
- Consider Supabase's built-in rate limiting / CAPTCHA options on Auth
  (Authentication → Rate Limits) if you're worried about login
  brute-forcing once this is public.

## What's NOT built (same scope as before — 4 features)

No multi-owner accounts, no accessibility audit pass, no automated test
suite beyond the build/lint checks already run. Ask if you want any of
them next.
