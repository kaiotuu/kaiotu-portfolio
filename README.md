# kaiotu portfolio

Static site, no framework. One HTML file with inlined CSS/JS, system fonts, images as AVIF/WebP. Dark and light themes (OS preference by default, choice remembered).

## Update content (all in `content/`)
- `site.json` — name, tagline, intro, `styles`, About text, `skills` (the small "Areas of work" tags inside About Me; plain text list, add/remove/reorder), `events`, `contact`, `contact.discord` (`url` = profile link, `appUrl` = `discord://` link. On desktop the button tries the app first and opens the web profile if nothing handles it within ~1 s; phones use the https link directly. If `url` is empty the button copies the username instead), `url` (set once the domain is known: enables canonical, sitemap, og:url), `photo` (e.g. `"portrait.jpg"` placed in `source-images/`).
- `works.json` — add to `items` (array order = display order):
  `{ "title": "Hoodie", "category": "clothes", "images": ["clothes/hoodie-01.png","clothes/hoodie-02.png"], "description": "", "software": "", "date": "2026-10" }`
  Categories: `clothes`, `weapons`, `vehicles`, `assets`. Title, description, software and date are optional.
  Work shows one category at a time as a Netflix-style shelf (the next card peeks in). Categories with more than 3 items get **View all**, which turns the shelf into a grid; **Show less** returns.
- **Recent Work**: add `"recent": true` and a real `"date"` (`2026-10` or `2026-10-18`). Items without a date are never shown there. An item can be in a category and in Recent Work, or only in Recent Work (omit `category`). Max shown: `recentLimit`, newest first.
- `contributions.json` — the 7 experience IDs in required order; optional `note` per experience (your contribution).
- Put original renders in `source-images/` (any subfolders), then `npm install` once and `npm run build`. Output is `dist/`.

## Add images to Work (easiest way)

Drop image files into the folder of the category:

- `source-images/clothes/` → 3D Clothes
- `source-images/weapons/` → Firearms & Melee Weapons
- `source-images/vehicles/` → Cars & Vehicles
- `source-images/assets/` → Game Assets

Then run `npm run build`. Each image becomes a card (and also shows in **All**).
The file name is the title: `05-wooden-bridge.png` becomes "Wooden bridge". The leading number only sets the order.
Rename the file to rename the card. For several images in one piece, a description, software or date, add an entry in `content/works.json` instead.

## Recent Work without Discord (easiest)

Drop images into `source-images/recent/` and run `npm run build`. Name the file with the date first:
`2026-10-20-my-sword.png` (or `2026-10-20-1430-my-sword.png` with a time). The rest of the name is the title.
Without a date in the name, the file's modified time is used. The newest 12 show, with ages like 2H or 1 DAY.

The Discord way (below) only works after you set up a bot and a GitHub repository; sending an image to Discord alone changes nothing on the site.

## Roblox data
Seed data (read from the public API on 2026-10-18) ships in `content/roblox-cache.json` so the cards work immediately; the next `npm run build` refreshes it.

The seven IDs are **universe IDs** (checked against Roblox's public API). `npm run build` runs `scripts/roblox.mjs --soft`, which resolves name, visits, cover and the correct place URL and bakes them into the page. If Roblox is unreachable at build time the previous cache is kept; with no cache, cards show a neutral fallback with no link and no numbers.
Optional: on Cloudflare Pages, `functions/api/experiences.js` refreshes the data at the edge (6 h cache); the page only calls it when data is missing or older than a day.

## Deploy (simplest)
Cloudflare Pages (free): connect the repo, build command `npm run build`, output directory `dist`. Trigger a new deploy to refresh visit counts.


## Recent Work: automatic ages and carousel
Recent Work shows at most 12 items (newest first; older ones stay in `content/discord-posts.json` / `works.json`, they are just not displayed). With none, it shows "No creations yet." Every recent item shows its age (`4 MIN`, `2H`, `1 DAY`, `3 DAYS`, `1 MONTH`, `1 YEAR`), recalculated in the visitor's browser on load and every minute. Items posted from Discord carry an exact timestamp. Manual items with `"date": "2026-10-18"` show days, with `"2026-10"` months (nothing is guessed). The strip drifts continuously and loops without a jump; Pause/Play stops it, and previous/next arrows appear while paused. Mouse drag and touch swipe always work; with "reduce motion" on it starts paused.

## Publish from Discord (optional, needs setup)
Post an image with the title as the message text in one channel; `scripts/discord-sync.mjs` stores the image in `source-images/discord/` (permanent, independent of the Discord message) and the title/timestamp in `content/discord-posts.json`; the next build shows it first in Recent Work.
1. Discord Developer Portal: create an application and a bot; enable **Message Content Intent**; invite the bot to your server with *View Channel* and *Read Message History* on the channel only.
2. In GitHub (repo Settings, Secrets, Actions) add `DISCORD_BOT_TOKEN`, `DISCORD_CHANNEL_ID`, `DISCORD_ALLOWED_AUTHOR_IDS` (your Discord user ID; only these authors are published).
3. `.github/workflows/discord-sync.yml` checks every 15 minutes (or run it by hand) and commits new posts; your Pages deploy then rebuilds. Locally: set the same three variables and run `node scripts/discord-sync.mjs`.
Rules: the first run only records a starting point (old messages are not imported unless `DISCORD_BACKFILL=1`); PNG/JPG/WebP only, 12 MB max, checked by file signature; duplicate messages and duplicate images are ignored; a message without text is skipped (no title); failures are logged with the message ID and retried next run. Editing a message title later is not picked up. Images are served up to 2400 px wide (AVIF/WebP); the original file stays in the repo.

## Analytics (private dashboard at `/analytics`)

The site sends small anonymous events to `/api/collect` (a Cloudflare Function). They are stored in a free **D1** database. The dashboard lives at `yoursite/analytics` behind a username and password.

**What it shows:** different people and visits (with change vs the previous period), new vs returning, time on page, scroll depth, funnel (arrived, Work, opened a piece, Contributions, footer, tried to contact), time spent in each part of the site, category switches (from, to), which category and which piece people open (views, opens, open rate, time looking, zoom, next/back), clicks on Let's connect, X, Discord, Email, copy Discord, the contact panel, menu, theme, Recent Work controls and every Contributions card, countries and Brazilian states, devices, browsers, systems, screen sizes, languages, where visitors came from and UTM campaigns, busiest hours and weekdays, last visits as step-by-step journeys, who is on the site now, page speed (LCP and load) and script errors. CSV export of visits and events, and a "delete everything" button.

**What is stored:** a random id made in the visitor's browser (localStorage, no cookie), country and state from Cloudflare, device/browser/system class, language, screen size class, the referrer host and what was clicked. **Not stored:** IP, the raw user agent, names, emails. It is skipped for bots, for visitors with Do Not Track or Global Privacy Control on, on localhost, and in browsers you mark as yours. Turn it off completely with `"analytics": false` in `content/site.json`.

### One-time setup (Cloudflare, about 5 minutes, all free)
1. **Create the database:** Cloudflare dashboard, *Storage & Databases*, *D1*, *Create database*, name `kaiotu-analytics`. The tables are created automatically, there is no SQL to run.
2. **Connect it to the site:** *Workers & Pages*, your project, *Settings*, *Bindings*, *Add*, *D1 database*. Variable name must be exactly `DB`, pick `kaiotu-analytics`, save.
3. **Choose your login:** same page, *Variables and secrets*, add two (type *Secret*): `ANALYTICS_USER` (a user name you pick) and `ANALYTICS_PASSWORD` (long, at least 10 characters, ideally 16+ and unique). Changing the password later logs everyone out.
4. **Publish again** so the new settings apply: *Deployments*, the latest one, *Retry deployment* (or push any change).
5. Open `yoursite/analytics` and log in. In *Ajustes* click **Ignorar as minhas visitas neste navegador** on every device you use, so your own visits do not count.

Safety: 5 wrong passwords block that address for 15 minutes; the session cookie is HttpOnly, Secure, SameSite=Strict and lasts 12 hours; the pages are `noindex`, `no-store` and have a strict Content-Security-Policy. Without the database or the secrets the dashboard stays closed and the site works as before.

Tests: `npm run analytics:test` (collector, login, lockout, stats and reset against a SQLite stand-in for D1).
