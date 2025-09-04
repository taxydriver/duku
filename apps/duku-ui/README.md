# Duku UI Starter (Acme + Next.js + shadcn/ui)

This repo is a *source overlay* for a fresh Next.js (App Router) app.
It includes an Acme-style shell, rating flow, algorithm playground, and mock API routes.

## Quick start

1) Create a new Next.js app (TypeScript + Tailwind):

```bash
npx create-next-app@latest duku-ui --ts --use-npm --eslint --tailwind --src-dir --import-alias "@/*"
cd duku-ui
```

2) Add dependencies:

```bash
npx shadcn@latest init -d
npx shadcn@latest add button card input label select slider navigation-menu sheet separator avatar dropdown-menu toast badge tabs textarea table skeleton
npm i lucide-react swr zod
npm i next-auth
```

3) Copy the files from this starter **over** your project root:

```bash
# assuming you unzipped this next to the created app
rsync -av --exclude='.DS_Store' duku-ui-starter/ ./duku-ui/
```

> Or manually copy the `src/` and `README_ADDON.md` contents.

4) Run the dev server:

```bash
npm run dev
```

You should see:
- Sidebar/Topbar shell
- **Rate** page with mock popular movies and like/dislike
- **Algo** page with knobs (Serendipity / Exploration / Novelty) and live-updating mock recs

## Backend integration (Merlin)

Set an env var in `duku-ui/.env.local` when ready:
```
MERLIN_API=http://localhost:8080
```

Then, replace the mock implementations in:
- `src/app/api/recs/route.ts`
- `src/app/api/ratings/route.ts`
- `src/app/api/movies/search/route.ts`
- `src/app/api/movies/popular/route.ts`

with `fetch(process.env.MERLIN_API + "/...")` calls.

## Monorepo vs. split

**Recommended:** keep the UI and Merlin backend as **separate services** in a monorepo:

```
duku/
  apps/
    duku-ui/        # Next.js UI (this)
  services/
    merlin-api/     # your Python/Triton service
```

- Local dev: UI runs at http://localhost:3000, backend at http://localhost:8080
- In prod: put a reverse proxy (NGINX) or Next.js `rewrites` to hide the backend host.

Alternatively, you can keep entirely separate repos.

See `README_ADDON.md` for more details.
