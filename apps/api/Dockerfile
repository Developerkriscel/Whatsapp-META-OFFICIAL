FROM node:20-alpine AS base
RUN npm install -g pnpm@9

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json ./
COPY packages ./packages
COPY database ./database
COPY apps/api ./apps/api

RUN pnpm install --frozen-lockfile
RUN cd apps/api && npx prisma generate
RUN pnpm --filter api build

FROM node:20-alpine AS runner
RUN npm install -g pnpm@9

WORKDIR /app

COPY --from=base /app /app

RUN mkdir -p /app/apps/api/uploads

EXPOSE 3001

CMD ["sh", "-c", "cd apps/api && npx prisma migrate deploy && cd /app && pnpm --filter api start"]
