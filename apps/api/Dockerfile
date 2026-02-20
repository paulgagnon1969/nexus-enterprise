# Build-stage image
# Cache bust: 2026-02-16T15:35:00Z
FROM node:22-alpine AS builder

WORKDIR /app

# Install build tooling deps
RUN apk add --no-cache bash python3 make g++

# Copy root package manifest for better caching (other root files are not in this build context)
COPY package.json ./

# Copy workspace package manifests that affect dependency graph
COPY apps/api/package.json apps/api/package.json
COPY packages/database/package.json packages/database/package.json

# Copy prisma schema BEFORE npm install (needed for postinstall hooks and prisma generate)
COPY packages/database/prisma packages/database/prisma
COPY packages/database/prisma.config.ts packages/database/prisma.config.ts

# Install dependencies for the whole monorepo
# Use npm install instead of npm ci because we do not commit a package-lock.json yet
RUN npm install

# Copy the rest of the repo
COPY . .

# Generate Prisma Client with the latest schema (explicit schema path to avoid caching issues)
RUN cd /app/packages/database && npx prisma generate --schema=./prisma/schema.prisma

# Build only the api (and its dependencies) via Turbo
RUN npm run build -- --filter=api

# Runtime image
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Install Chromium and dependencies for Puppeteer PDF generation
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    font-noto-emoji

# Tell Puppeteer to use system Chromium instead of downloading its own
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Copy root package.json for reference
COPY package.json ./

# Copy built api dist and its node_modules tree
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/node_modules ./node_modules
# Copy workspace package source for @repo/database so the workspace symlink resolves at runtime
COPY --from=builder /app/packages/database ./packages/database
# Copy docs/sops-staging for SOP sync capability in production
COPY --from=builder /app/docs/sops-staging ./docs/sops-staging

# Set working directory to the api app
WORKDIR /app/apps/api

# Expose NestJS default port (Fastify)
EXPOSE 8000

CMD ["node", "dist/main.js"]
