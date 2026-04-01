# ─── Stage 1: Build ───────────────────────────────────────────────────────────
FROM node:24-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY prisma/ ./prisma/
RUN npx prisma generate --schema prisma/schema.prisma

COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build


# ─── Stage 2: Production ──────────────────────────────────────────────────────
FROM node:24-alpine AS production

WORKDIR /app

ENV NODE_ENV=production

# Runtime dependencies only
COPY package*.json ./
RUN npm ci --omit=dev

# Prisma: generated client + CLI for running migrations
COPY --from=builder /app/node_modules/.prisma         ./node_modules/.prisma
COPY --from=builder /app/node_modules/prisma          ./node_modules/prisma
COPY --from=builder /app/node_modules/.bin/prisma     ./node_modules/.bin/prisma

# Schema and migrations
COPY prisma/ ./prisma/

# Compiled app
COPY --from=builder /app/dist ./dist

# Startup script: migrate then start app
COPY migrate-and-start-dev.sh ./migrate-and-start-dev.sh
RUN chmod +x ./migrate-and-start-dev.sh

# Uploads directory
RUN mkdir -p uploads

EXPOSE 3001

CMD ["node", "dist/app.js"]
