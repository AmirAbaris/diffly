# syntax=docker/dockerfile:1

# =============================================================================
# Stage 1-3: Next.js Frontend (Production Standalone)
# =============================================================================
FROM node:22-alpine AS frontend-deps
RUN apk add --no-cache libc6-compat git
WORKDIR /app

ENV CI=true
RUN npm install -g pnpm@11.5.1

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --ignore-scripts

FROM node:22-alpine AS frontend-builder
RUN apk add --no-cache libc6-compat git
WORKDIR /app
RUN npm install -g pnpm@11.5.1

COPY --from=frontend-deps /app/node_modules ./node_modules
COPY . .

ENV CI=true
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ENV BACKEND_URL=http://backend:8000

RUN pnpm build

FROM node:22-alpine AS frontend
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV BACKEND_URL=http://backend:8000
ENV HOSTNAME="0.0.0.0"

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=frontend-builder /app/public ./public
COPY --from=frontend-builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=frontend-builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=15s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "server.js"]


# =============================================================================
# Stage 4-5: FastAPI Backend (Production Multi-Stage)
# =============================================================================
FROM python:3.11-slim AS backend-builder

WORKDIR /build

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt


FROM python:3.11-slim AS backend

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PATH="/opt/venv/bin:$PATH" \
    PORT=8000 \
    DATABASE_URL="sqlite:////app/data/diffly.db"

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd -g 1001 diffly && \
    useradd -u 1001 -g diffly -m -s /bin/bash diffly

COPY --from=backend-builder /opt/venv /opt/venv

RUN mkdir -p /app/data && chown -R diffly:diffly /app

COPY --chown=diffly:diffly api /app/api
COPY --chown=diffly:diffly backend /app/backend
COPY --chown=diffly:diffly pyproject.toml /app/pyproject.toml

USER diffly

EXPOSE 8000

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://127.0.0.1:8000/api/health || exit 1

CMD ["sh", "-c", "python -m backend.seed.seed_data && exec uvicorn api.index:app --host 0.0.0.0 --port ${PORT:-8000} --workers 2 --proxy-headers --forwarded-allow-ips '*'"]
