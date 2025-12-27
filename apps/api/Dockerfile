# Build-stage image
FROM node:22-alpine AS builder

WORKDIR /app

# Install build tooling deps
RUN apk add --no-cache bash python3 make g++

# Copy root package manifests and lockfile first for better caching
COPY package.json package-lock.json turbo.json tsconfig.json ./

# Copy workspace package manifests that affect dependency graph
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/database/package.json packages/database/package.json

# Install dependencies for the whole monorepo
RUN npm ci

# Copy the rest of the repo
COPY . .

# Build only the api (and its dependencies) via Turbo
RUN npm run build -- --filter=api

# Runtime image
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Copy root package.json for reference
COPY package.json ./

# Copy built api dist and its node_modules tree
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/node_modules ./node_modules

# Set working directory to the api app
WORKDIR /app/apps/api

# Expose NestJS default port (Fastify)
EXPOSE 8000

CMD ["node", "dist/main.js"]
