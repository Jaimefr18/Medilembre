# MediLembre

PWA + API + worker + PostgreSQL (RLS por farmácia). Ver `docs/` e o plano de 28 dias.

## Arrancar (Ubuntu 24.04)

```bash
corepack enable && corepack prepare pnpm@9.15.0 --activate   # Node 22 (fnm/mise) já instalado
cp .env.example .env
pnpm install
pnpm db:up && pnpm db:migrate && pnpm db:seed
pnpm vapid          # cola as chaves em .env (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY)
pnpm dev            # web :5173, api :3000, worker
pnpm test           # core + isolamento RLS (precisa da BD)
```

## Dias 2-3: spike de Web Push no telemóvel
Service Worker e Push exigem HTTPS. Com `pnpm dev` a correr:

```bash
cloudflared tunnel --url http://localhost:5173
```

Abre o URL `https://….trycloudflare.com` no telemóvel, toca em "Ativar lembretes" e agenda 1, 5 e 30 min.
Testa: Chrome Android, Samsung Internet, Safari iPhone (ecrã inicial), poupança de bateria, ecrã bloqueado,
sem rede 30 min. Regista % entregue, atraso e se aparece no ecrã bloqueado. O worker envia a cada minuto,
por isso o atraso mínimo é até 60 s.

## Estrutura
- `apps/web` SvelteKit (SPA estática) + service worker · `apps/api` Fastify · `apps/worker` pg-boss + web-push
- `packages/core` regras puras (lembretes, fusos, estados) · `packages/shared` schemas zod
- `db/migrations` SQL com RLS · `scripts/db.mjs` migrações e seed

## Notas importantes
- A API liga como `medilembre_app` (sujeita a RLS); migrações e worker usam o admin. Nunca ligar a API como admin.
- O guard de tenant atual (`x-pharmacy-id`) é só de desenvolvimento e recusa em produção; o dia 5 substitui-o por sessões.
- Ainda não incluídos: Drizzle, Tailwind, painel da farmácia, QR, Caddy/deploy (entram nos dias 4, 8, 14).
