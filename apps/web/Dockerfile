# ---- Build stage ----
FROM node:22-alpine AS builder

WORKDIR /app

# Install build tooling (includes deps for native addon compilation)
RUN apk add --no-cache bash python3 make g++ libc-dev

# Copy root manifests
COPY package.json package-lock.json ./

# Copy workspace manifests that affect the dependency graph
COPY apps/web/package.json apps/web/package.json
COPY packages/database/package.json packages/database/package.json

# Copy prisma schema BEFORE npm install (needed for postinstall hooks)
COPY packages/database/prisma packages/database/prisma
COPY packages/database/prisma.config.ts packages/database/prisma.config.ts

# Install all dependencies (needed for next build)
RUN npm install

# Ensure native binaries are available for Alpine ARM64 (musl).
# @parcel/watcher for file watching, @next/swc for Next.js compilation.
RUN npm install --no-save @parcel/watcher-linux-arm64-musl@2.5.6 2>/dev/null || true
RUN npm install --no-save @next/swc-linux-arm64-musl 2>/dev/null \
    || npm rebuild next 2>/dev/null \
    || true

# Copy the full repo (turbo needs workspace context)
COPY . .

# Build-time env vars (NEXT_PUBLIC_* are inlined at build time)
ARG NEXT_PUBLIC_API_BASE_URL
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_MAPBOX_TOKEN
ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_SECURITY_INSPECTOR_ENABLED

ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_MAPBOX_TOKEN=$NEXT_PUBLIC_MAPBOX_TOKEN
ENV NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=$NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_SECURITY_INSPECTOR_ENABLED=$NEXT_PUBLIC_SECURITY_INSPECTOR_ENABLED

# Build the web app via Turbo (resolves workspace deps first)
ENV NODE_OPTIONS="--max-old-space-size=8192"
RUN npm run build -- --filter=web
ENV NODE_OPTIONS=""

# ---- Runtime stage ----
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV TZ=America/Chicago

# next.js standalone output copies only what's needed
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public

# Next.js standalone listens on port 3000 by default
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "apps/web/server.js"]
