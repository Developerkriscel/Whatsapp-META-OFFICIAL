FROM node:20-alpine AS base
RUN npm install -g pnpm@8.15.0

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json ./
COPY packages ./packages
COPY database ./database
COPY apps/api ./apps/api

RUN pnpm install --frozen-lockfile
RUN cd apps/api && npx prisma generate --schema=../../database/schema.prisma
RUN pnpm --filter api build

EXPOSE 3001

CMD ["pnpm", "--filter", "api", "start"]
