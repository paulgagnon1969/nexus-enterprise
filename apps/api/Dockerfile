# Build-stage image
# Cache bust: 2026-02-16T15:35:00Z
FROM node:22-alpine AS builder

WORKDIR /app

# Install build tooling deps
RUN apk add --no-cache bash python3 make g++

# Copy root package manifest and lockfile for reproducible builds
COPY package.json package-lock.json ./

# Copy workspace package manifests that affect dependency graph
COPY apps/api/package.json apps/api/package.json
COPY packages/database/package.json packages/database/package.json

# Copy prisma schema BEFORE npm install (needed for postinstall hooks and prisma generate)
COPY packages/database/prisma packages/database/prisma
COPY packages/database/prisma.config.ts packages/database/prisma.config.ts

# Install dependencies (lockfile present for version pinning)
# NOTE: With partial workspace package.jsons npm may silently skip some deps.
RUN npm install

# Ensure pdf-parse is present (npm workspaces sometimes skips it with partial workspaces)
RUN cd /app/apps/api && npm install pdf-parse@1.1.1 --no-save 2>/dev/null || true

# Copy the rest of the repo
COPY . .

# Generate Prisma Client with the latest schema (explicit schema path to avoid caching issues)
RUN cd /app/packages/database && npx prisma generate --schema=./prisma/schema.prisma

# Build only the api (and its dependencies) via Turbo
ENV NODE_OPTIONS="--max-old-space-size=4096"
RUN npm run build -- --filter=api
ENV NODE_OPTIONS=""

# Copy non-TS assets that tsc doesn't emit (JSON data files loaded at runtime)
RUN mkdir -p apps/api/dist/modules/banking && \
    cp apps/api/src/modules/banking/job-name-map.json apps/api/dist/modules/banking/job-name-map.json && \
    echo "✅ Copied job-name-map.json" && \
    ls -la apps/api/dist/modules/banking/job-name-map.json

# Runtime image
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV TZ=America/Chicago

# Install Chromium and dependencies for Puppeteer PDF generation
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    font-noto-emoji

# Install poppler-utils (pdftoppm) and libwebp-tools (cwebp) for plan sheet processing
RUN apk add --no-cache poppler-utils libwebp-tools

# Tell Puppeteer to use system Chromium instead of downloading its own
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Copy root package.json for reference
COPY package.json ./

# Copy built api dist and its node_modules tree
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/node_modules ./node_modules
# Copy workspace-local node_modules (packages npm didn't hoist to root, e.g. pdf-parse)
COPY --from=builder /app/apps/api/node_modules ./apps/api/node_modules
# Copy workspace package source for @repo/database so the workspace symlink resolves at runtime
COPY --from=builder /app/packages/database ./packages/database
# Copy docs directories for SOP sync and CAM manual in production
COPY --from=builder /app/docs/sops-staging ./docs/sops-staging
COPY --from=builder /app/docs/cams ./docs/cams
COPY --from=builder /app/docs/policies ./docs/policies

# Set working directory to the api app
WORKDIR /app/apps/api

# Verify JSON files were copied correctly
RUN ls -la dist/modules/banking/job-name-map.json && \
    echo "✅ job-name-map.json is present in runtime image"

# Expose NestJS default port (Fastify)
EXPOSE 8000

CMD ["node", "dist/main.js"]
