FROM node:22-slim AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

# Copiar os manifestos do workspace
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/worker/package.json ./apps/worker/
COPY packages/shared/package.json ./packages/shared/
COPY packages/core/package.json ./packages/core/

# Instalar dependências (incluindo dev para compilar)
RUN pnpm install --frozen-lockfile

# Copiar o código fonte
COPY apps/worker/src ./apps/worker/src
COPY packages/shared/src ./packages/shared/src
COPY packages/core/src ./packages/core/src
COPY tsconfig.base.json ./
COPY apps/worker/tsconfig.json ./apps/worker/

# Compilar TypeScript
RUN pnpm --filter @medilembre/worker exec tsc

# Comando de arranque: executar o JavaScript compilado
CMD ["node", "apps/worker/dist/index.js"]
