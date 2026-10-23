# Social Media AI Agent

A Next.js app where AI agents plan, create, schedule and publish social media campaigns. Each campaign runs a pipeline of agents (Research → Creator → Scheduler → Publisher) inside its own E2B cloud desktop, with background jobs on Inngest and posting through Blotato.

**Stack:** Next.js 16, React 19, Tailwind CSS 4, shadcn/ui, InsForge (auth, Postgres, storage, realtime), Drizzle ORM, Inngest, OpenAI Agents SDK, Gemini, E2B, ImageKit.

## Prerequisites

- Node.js 20.9 or newer, and npm
- An [InsForge](https://insforge.dev) project (database, auth and storage)
- API keys for [OpenAI](https://platform.openai.com), [Gemini](https://aistudio.google.com), [E2B](https://e2b.dev) and [ImageKit](https://imagekit.io)
- A [Blotato](https://blotato.com) account to connect social accounts (each user adds their own key in the app)

## Setup

### 1. Clone and install

```bash
git clone <repo-url>
cd social-media-ai-agent
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env.local
```

Fill in `.env.local`:

| Variable | Required | Where to get it |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | Yes | `http://localhost:3000` locally |
| `DATABASE_URL` | Yes | Postgres connection string of your InsForge project |
| `NEXT_PUBLIC_INSFORGE_URL` | Yes | InsForge dashboard → project API base URL |
| `NEXT_PUBLIC_INSFORGE_ANON_KEY` | Yes | InsForge dashboard → anon key |
| `INSFORGE_API_KEY` | Optional | InsForge API key; used for file storage when ImageKit isn't set |
| `OPENAI_API_KEY` | Yes | OpenAI dashboard |
| `GEMINI_API_KEY` | Yes | Google AI Studio |
| `E2B_API_KEY` | Yes | E2B dashboard |
| `IMAGEKIT_PRIVATE_KEY` | Yes | ImageKit → Developer options |
| `IMAGEKIT_URL_ENDPOINT` | Yes | ImageKit → URL endpoint |
| `IMAGE_PROVIDER` | Optional | `gemini` (default), `imagekit` or `openai` |
| `OPENAI_IMAGE_MODEL` / `GEMINI_IMAGE_MODEL` | Optional | Override the image models |
| `INTEGRATIONS_ENCRYPTION_KEY` | Yes | Generate with `openssl rand -base64 32` |
| `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY` | Production only | [Inngest dashboard](https://app.inngest.com); not needed locally |

> Keep `INTEGRATIONS_ENCRYPTION_KEY` stable. Changing it makes stored Blotato keys unreadable and users have to reconnect.

### 3. Link InsForge and run migrations

The SQL migrations live in [`migrations/`](migrations/). Apply them to your InsForge project with the InsForge CLI:

```bash
npx -y @insforge/cli login
npx -y @insforge/cli link            # pick your project
npx -y @insforge/cli db migrations up --all
```

To browse the tables, run `npm run db:studio` (Drizzle Studio, uses `DATABASE_URL`).

### 4. Start the app

Run these in two terminals:

```bash
# Terminal 1: Next.js dev server
npm run dev

# Terminal 2: Inngest dev server (background jobs and the scheduling cron)
npm run inngest:dev
```

- App: http://localhost:3000
- Inngest dashboard: http://localhost:8288

### 5. First run

1. Sign up and sign in.
2. Create a campaign from the onboarding flow.
3. Go to **Dashboard → Settings → Integrations**, add your Blotato API key, and connect your social accounts under **Accounts** to schedule and publish posts.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Next.js dev server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | Run ESLint |
| `npm run inngest:dev` | Start the local Inngest dev server |
| `npm run db:generate` | Generate Drizzle migrations from `db/schema.ts` |
| `npm run db:push` | Push the Drizzle schema to the database |
| `npm run db:studio` | Open Drizzle Studio |

## Project structure

```
app/            Routes, pages and API handlers (agents, inngest, media, sandbox, ...)
components/     UI components (shadcn/ui based)
db/             Drizzle schema and client
lib/            Agents, tools, orchestration, Inngest functions, storage, integrations
migrations/     InsForge SQL migrations
docs/           Design notes (see docs/agent-workflow.md)
```

## Deploying

Set every variable from step 2 in your host (for example Vercel), with `NEXT_PUBLIC_APP_URL` set to the deployed URL. Add `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY`, then sync the app in the Inngest dashboard at `https://<your-domain>/api/inngest`.
