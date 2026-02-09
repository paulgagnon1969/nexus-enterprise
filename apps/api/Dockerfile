# Build-stage image
# Cache bust: 2026-02-09T13:58:00Z
FROM node:22-alpine AS builder

WORKDIR /app

# Install build tooling deps
RUN apk add --no-cache bash python3 make g++

# Copy root package manifest for better caching (other root files are not in this build context)
COPY package.json ./


# Copy workspace package manifests that affect dependency graph
COPY apps/api/package.json apps/api/package.json
COPY packages/database/package.json packages/database/package.json

# Install dependencies for the whole monorepo
# Use npm install instead of npm ci because we do not commit a package-lock.json yet
RUN npm install

# Copy the rest of the repo
COPY . .

# Generate Prisma Client with the latest schema
RUN npm run --workspace=packages/database prisma:generate

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
# Copy workspace package source for @repo/database so the workspace symlink resolves at runtime
COPY --from=builder /app/packages/database ./packages/database

# Set working directory to the api app
WORKDIR /app/apps/api

# Expose NestJS default port (Fastify)
EXPOSE 8000

CMD ["node", "dist/main.js"]
