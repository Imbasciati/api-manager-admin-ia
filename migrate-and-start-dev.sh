#!/bin/sh
set -eu

echo "[startup] Running Prisma migrations..."
npx prisma migrate deploy --schema prisma/schema.prisma

echo "[startup] Starting API..."
node dist/app.js
