# justfile — Beta Admin IA API
# Uso: just <receita>
# Lista todas: just --list

compose     := "docker compose -f docker-compose.local.yml"
compose_ci  := "docker compose -f docker-compose.ci.yml"
container   := "beta-admin-ia-api-local"
container_ci := "beta-admin-ia-api-ci"
repo_name   := "api-manager-admin-ia"
registry    := "cursobeta-local"

# Lista receitas disponíveis
default:
    @just --list

# ── Dev local (sem Docker) ────────────────────────────────────────────────────

# Sobe o servidor em modo watch (tsx)
dev:
    npm run dev

# Build TypeScript
build:
    npm run build

# Lint
lint:
    npm run lint

# Verificação de tipos
types:
    npx tsc --noEmit

# Lint + types (rodar antes de commitar)
check: lint types

# ── Docker local (dev — com build inline) ─────────────────────────────────────

# Build da imagem e sobe os containers
up:
    {{ compose }} up -d --build

# Sobe sem rebuild
start:
    {{ compose }} up -d

# Para os containers (mantém volumes)
down:
    {{ compose }} down

# Para e destrói volumes (reset completo do banco)
reset:
    {{ compose }} down -v

# Rebuild sem cache e sobe
rebuild:
    {{ compose }} build --no-cache
    {{ compose }} up -d --force-recreate

# Status dos containers
ps:
    {{ compose }} ps

# ── CI/CD local — espelha o fluxo do GitHub Actions ──────────────────────────
#
# Fluxo equivalente ao workflow dev.yml:
#   Job Build  → ci-build : gera tag YYYYMMDD_N, builda e taga a imagem
#   Job Deploy → ci-up    : sobe o compose com IMAGE_LOCAL=<tag>
#   Completo   → ci-run   : ci-build + ci-up em sequência

# Simula o job Build: gera tag, builda e taga a imagem
ci-build run="1":
    #!/usr/bin/env bash
    set -euo pipefail
    GENERAL_TAG=$(date +'%Y%m%d')_{{ run }}
    IMAGE_LOCAL="{{ registry }}/{{ repo_name }}:${GENERAL_TAG}"
    echo "▶ [CI Build] Tag:   ${GENERAL_TAG}"
    echo "▶ [CI Build] Image: ${IMAGE_LOCAL}"
    docker build -f Dockerfile -t "${IMAGE_LOCAL}" .
    echo "✔ Imagem buildada: ${IMAGE_LOCAL}"
    echo "export GENERAL_TAG=${GENERAL_TAG}" > .ci-env
    echo "export IMAGE_LOCAL=${IMAGE_LOCAL}" >> .ci-env
    echo ""
    echo "Para subir: just ci-up"

# Simula o job Deploy: sobe o compose com a imagem tagueada gerada por ci-build
ci-up:
    #!/usr/bin/env bash
    set -euo pipefail
    if [ ! -f .ci-env ]; then
      echo "❌ .ci-env não encontrado — rode 'just ci-build' primeiro"
      exit 1
    fi
    source .ci-env
    echo "▶ [CI Deploy] Image: ${IMAGE_LOCAL}"
    IMAGE_LOCAL="${IMAGE_LOCAL}" {{ compose_ci }} up -d
    echo ""
    echo "⏳ Aguardando API ficar healthy..."
    for i in $(seq 1 20); do
      STATUS=$(docker inspect --format='{{ '{{' }}.State.Health.Status{{ '}}' }}' {{ container_ci }} 2>/dev/null || echo "starting")
      echo "   [${i}/20] status: ${STATUS}"
      if [ "${STATUS}" = "healthy" ]; then
        echo "✔ API healthy"
        break
      fi
      sleep 3
    done
    echo ""
    curl -s http://localhost:3002/health | python3 -m json.tool

# Build + Deploy em sequência (fluxo completo)
ci-run run="1": (ci-build run) ci-up

# Para containers de CI (mantém volumes)
ci-down:
    #!/usr/bin/env bash
    set -euo pipefail
    source .ci-env 2>/dev/null || true
    IMAGE_LOCAL="${IMAGE_LOCAL:-placeholder}" {{ compose_ci }} down

# Para e destrói volumes de CI
ci-reset:
    #!/usr/bin/env bash
    set -euo pipefail
    source .ci-env 2>/dev/null || true
    IMAGE_LOCAL="${IMAGE_LOCAL:-placeholder}" {{ compose_ci }} down -v
    rm -f .ci-env

# Lista imagens locais buildadas pelo ci-build
ci-images:
    @docker images {{ registry }}/{{ repo_name }}

# ── Logs ──────────────────────────────────────────────────────────────────────

# Logs da API (dev) em tempo real
logs:
    {{ compose }} logs -f api

# Logs da API (CI) em tempo real
ci-logs:
    {{ compose_ci }} logs -f api

# Últimas N linhas de log — dev (padrão: 100)
logs-tail n="100":
    {{ compose }} logs --tail={{ n }} api

# Últimas N linhas de log — CI (padrão: 100)
ci-logs-tail n="100":
    {{ compose_ci }} logs --tail={{ n }} api

# ── Banco de dados ────────────────────────────────────────────────────────────

# Abre shell psql no postgres local (dev)
db:
    docker exec -it beta-admin-ia-postgres-local psql -U beta_user -d beta_admin_ia

# Abre shell psql no postgres de CI
ci-db:
    docker exec -it beta-admin-ia-postgres-ci psql -U beta_user -d beta_admin_ia

# Roda migrations (dentro do container da API dev)
migrate:
    docker exec {{ container }} npx prisma migrate deploy --schema prisma/schema.prisma

# Abre Prisma Studio (local, fora do Docker)
studio:
    npx prisma studio

# ── Utilitários ───────────────────────────────────────────────────────────────

# Status de todos os containers do projeto
ps-all:
    @echo "=== DEV ===" && {{ compose }} ps 2>/dev/null || true
    @echo "=== CI  ===" && IMAGE_LOCAL=placeholder {{ compose_ci }} ps 2>/dev/null || true

# Abre shell no container da API (dev)
sh:
    docker exec -it {{ container }} sh

# Abre shell no container da API (CI)
ci-sh:
    docker exec -it {{ container_ci }} sh

# Testa o health check — dev (porta 3001)
health:
    curl -s http://localhost:3001/health | python3 -m json.tool

# Testa o health check — CI (porta 3002)
ci-health:
    curl -s http://localhost:3002/health | python3 -m json.tool
