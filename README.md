# ⚡ App Compiler

> Natural Language → Executable App Schema via a 4-Stage AI Pipeline

## What It Does

Paste a plain-English app description. The system runs it through 4 Claude-powered stages and outputs a complete, validated, production-ready JSON schema covering:

- 🗄️ **Database** — tables, columns, types, indexes, relations
- ⚡ **API** — endpoints, methods, auth, request/response shapes
- 🖥️ **UI** — pages, layouts, components, API bindings
- 🔐 **Auth** — roles, permissions, protected routes

## Pipeline Architecture

```
User Input
    ↓
Stage 1: Intent Extraction     → structured intent JSON
    ↓
Stage 2: System Design         → entities, flows, roles, pages
    ↓
Stage 3: Schema Generation     → DB + API + UI + Auth schemas
    ↓
Stage 4: Refinement & Repair   → cross-layer consistency check + auto-fix
    ↓
Final Validated Schema JSON
```

## Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Add your API key
```bash
cp .env.example .env.local
```
Edit `.env.local` and replace `sk-ant-your-key-here` with your real key from [console.anthropic.com](https://console.anthropic.com).

### 3. Run locally
```bash
npm run dev
```
Visit [http://localhost:3000](http://localhost:3000)

## Deploy to Vercel (Recommended)

```bash
npm install -g vercel
vercel
```

Then in your Vercel dashboard:
- Go to **Settings → Environment Variables**
- Add `ANTHROPIC_API_KEY` = your key
- Redeploy

## Project Structure

```
app-compiler/
├── app/
│   ├── api/
│   │   └── compile/
│   │       └── route.js      ← Proxy route (keeps API key server-side)
│   ├── globals.css
│   ├── layout.js
│   └── page.js               ← Main UI
├── lib/
│   └── pipeline.js           ← All pipeline logic: prompts, validator, orchestrator
├── .env.example
├── .env.local                ← YOUR KEY GOES HERE (never commit this)
├── next.config.js
├── package.json
└── tailwind.config.js
```

## Key Design Decisions

| Decision | Why |
|---|---|
| Multi-stage pipeline | Isolates failures; each stage can retry independently |
| Server-side API proxy | API key never exposed to browser |
| Cross-layer validation | Catches DB/API/UI mismatches automatically |
| Auto-repair (not blind retry) | Re-runs only the broken stage, not the whole pipeline |
| JSON schema contracts | Every stage has a defined output shape enforced by validator |

## Security

- API key is **only** on the server (`process.env.ANTHROPIC_API_KEY`)  
- Never committed to git (`.gitignore` covers `.env.local`)  
- Browser calls `/api/compile` (your own server), never Anthropic directly
