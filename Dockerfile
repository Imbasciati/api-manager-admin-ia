# ─── Stage 1: Build ───────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY prisma/ ./prisma/
RUN npx prisma generate --schema prisma/schema.prisma

COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build


# ─── Stage 2: Production ──────────────────────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

ENV NODE_ENV=production

# Runtime dependencies only
COPY package*.json ./
RUN npm ci --omit=dev

# Prisma: client gerado + CLI para rodar migrations
COPY --from=builder /app/node_modules/.prisma         ./node_modules/.prisma
COPY --from=builder /app/node_modules/prisma          ./node_modules/prisma
COPY --from=builder /app/node_modules/.bin/prisma     ./node_modules/.bin/prisma

# Schema e migrations
COPY prisma/ ./prisma/

# Aplicação compilada
COPY --from=builder /app/dist ./dist

# Pasta de uploads
RUN mkdir -p uploads

EXPOSE 3001

CMD ["node", "dist/app.js"]
