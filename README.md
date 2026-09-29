# Diiidar (دیدااار)

**A Telegram Mini App that helps people feel familiar before they meet in person.**

Diiidar creates a shared room for each event. Attendees can introduce themselves, add their Instagram and LinkedIn profiles, discover the people they are about to meet, and start building meaningful connections before the event begins.

## The Story Behind Diiidar

It all started on the night before an event called **Shab-e Didar**. 👁️

Like many events, a group had been created for coordination. 😊

People joined one by one, and almost every introduction followed the same pattern:

> “Hi, I’m [name]. I work in [industry].”

Then came a LinkedIn link.

And that was it. 😒

Honestly, I was tired of this kind of introduction.

We were going to spend several hours together the next day. We were supposed to talk, network, and perhaps even start new collaborations. Yet we were still nothing more than a name, a profile picture, and a LinkedIn link to one another.

That made me wonder:

**Why should the ice between people not begin to melt before the event even starts? 🥶**

Why should I not be able to get to know the people I am about to meet before I walk into a gathering?

- I want to know what they do. 👍
- I want to recognize their faces. 👍
- I want to have a sense of their style. 👍
- And perhaps, through the stories they share that night, even their voice and personality can already feel a little familiar. 👍

That was the moment the idea for **Diiidar** was born.

Diiidar creates a room for every event. 😎

Before the event, you open the invitation link and add your Instagram profile. Other attendees can see the stories you choose to share from that evening, making it much easier to recognize and find you when they arrive.

You add your LinkedIn profile so everyone can understand exactly what you do and which field you work in. 🤑

The vision also includes a public chat inside each room, so conversations can begin before anyone meets in person.

Someone might write:

> “Is anyone here working in BI? 👀”

And someone else might reply:

> “I am. Come find me when you arrive. 🤩”

That single conversation could become the beginning of a new connection, collaboration, or even friendship.

I do not want networking to be reduced to exchanging business cards and LinkedIn profiles. I want the people in a room to already feel a little **familiar** by the time they arrive.

That is why **Diiidar** exists:

- To help us know each other a little before we meet.
- To make finding the right people easier.
- And to make the first conversation feel more natural.

### Why the name Diiidar?

The name is a tribute to that invitation, that warm gathering, and the memorable evening that brought us together.

It felt like the perfect name for an idea designed to bring people closer before a real-life meeting. In Persian, **دیدار** means *meeting* or *encounter*.

Diiidar is more than a tool to me. It is an attempt to turn networking from a dry, repetitive introduction into a more genuine and human experience.

## What Diiidar Does

- Opens directly as a Telegram Mini App.
- Creates an event room with a shareable invitation link.
- Uses the attendee’s Telegram identity and profile photo when privacy settings allow it.
- Lets attendees add a name, role, bio, profile image, Instagram profile or story link, and LinkedIn profile.
- Shows attendees as visual profile cards inside the room.
- Opens Instagram and LinkedIn links in their native destinations.
- Provides a Persian, RTL, mobile-first interface.
- Includes a public-chat preview marked **Coming Soon**.

## Current MVP Status

The public GitHub Pages build is a static product preview:

**[Open the live Diiidar room](https://alizahrawi.github.io/didar-telegram-mini-app/?room=shab-didar)**

The preview reads the current Telegram user when opened as a Mini App and stores an added profile locally on that device. It includes realistic demo members so the room feels populated during testing.

The repository also contains the serverless backend for shared rooms and persistent profiles using Cloudflare Workers and D1. That backend must be deployed before data can be shared between different attendees. Public chat is intentionally deferred to a future release.

## Architecture

```text
Telegram Mini App / Browser
        │
        ├── Static assets ───── Cloudflare Workers Assets
        ├── REST API ────────── Cloudflare Worker
        ├── Telegram webhook ── Cloudflare Worker
        └── Rooms & profiles ── Cloudflare D1
```

The frontend and API can be deployed together without a VPS, always-on process, Docker container, Socket.IO server, or persistent server disk.

## Run Locally

Requirements: a current Node.js release and npm.

```bash
npm install
copy .dev.vars.example .dev.vars
npm run db:migrate:local
npm run dev
```

Open `http://localhost:8787/r/shab-didar`. Local development creates a demo room when `ALLOW_DEV_AUTH=true`. Never enable development authentication in production.

## Deploy to Cloudflare

### 1. Sign in

```bash
npx wrangler login
```

### 2. Create the D1 database

```bash
npx wrangler d1 create diiidar-db --location=weur
```

Copy the returned `database_id` into `wrangler.jsonc`.

### 3. Apply the database migration

```bash
npm run db:migrate
```

### 4. Add production secrets

```bash
npx wrangler secret put BOT_TOKEN
npx wrangler secret put BOT_USERNAME
npx wrangler secret put SESSION_SECRET
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
```

`SESSION_SECRET` must contain at least 32 random characters. `TELEGRAM_WEBHOOK_SECRET` must contain 12–256 characters using only letters, numbers, underscores, and hyphens.

### 5. Deploy

```bash
npm run deploy
```

The result will look similar to:

```text
https://diiidar-mini-app.YOUR_SUBDOMAIN.workers.dev
```

## Connect the Telegram Bot

Copy `.env.example` to `.env` and set `APP_URL`, `BOT_TOKEN`, `BOT_USERNAME`, and `TELEGRAM_WEBHOOK_SECRET` locally. Never commit the resulting `.env` file.

Then run:

```bash
npm run bot:setup
```

This configures the bot commands, menu button, and authenticated webhook. In [@BotFather](https://t.me/BotFather), open **Bot Settings → Configure Mini App** and register the deployed HTTPS URL as the Main Mini App.

## Environment Variables

| Variable | Type | Purpose |
|---|---|---|
| `BOT_TOKEN` | Secret | Telegram bot token |
| `BOT_USERNAME` | Secret | Bot username without `@` |
| `SESSION_SECRET` | Secret | Signs user sessions; minimum 32 random characters |
| `TELEGRAM_WEBHOOK_SECRET` | Secret | Authenticates Telegram webhook requests |
| `APP_URL` | Optional | Public deployment URL; the Worker origin is used by default |
| `ALLOW_DEV_AUTH` | Non-secret | Local development only; must be `false` in production |

## Instagram Story Limitation

Instagram does not provide unrestricted access to every user’s stories from a username alone, and stories are temporary. For this MVP, each attendee supplies their own Instagram profile or story URL. Diiidar stores the link and opens it when another attendee selects the profile image. The application does not scrape Instagram.

## Security

- Telegram `initData` is verified server-side with the official HMAC validation flow and a strict expiration window.
- Sessions are signed, expire automatically, and require a strong server-side secret.
- Telegram webhooks use the official `X-Telegram-Bot-Api-Secret-Token` header instead of exposing the secret in the URL.
- User-supplied links are limited to HTTPS, with domain restrictions for Instagram and LinkedIn.
- API responses disable caching and MIME sniffing.
- `.env`, `.dev.vars`, local databases, Wrangler state, and dependencies are excluded from Git.
- A repository security check scans tracked files and Git history for common credential patterns.

Run the security and test suite before every deployment:

```bash
npm run security:check
npm test
```

See [SECURITY.md](./SECURITY.md) for secret-handling and vulnerability-reporting guidance.

> **Important:** if a bot token is ever pasted into a chat, issue, commit, screenshot, or log, revoke it immediately in @BotFather and replace it everywhere it is used.

## Tests

```bash
npm test
```

The tests cover Telegram authentication, tampered and expired payloads, signed sessions, safe links, webhook authentication, and room slugs used in deep links.
