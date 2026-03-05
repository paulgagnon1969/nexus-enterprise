# ---- Build stage ----
# Use Debian slim instead of Alpine — Next.js 16 native bindings (SWC,
# @parcel/watcher) require glibc which Alpine/musl doesn't provide reliably.
FROM node:22-slim AS builder

WORKDIR /app

# Install build tooling
RUN apt-get update && apt-get install -y --no-install-recommends \
      bash python3 make g++ && rm -rf /var/lib/apt/lists/*

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

# Copy the full repo (turbo needs workspace context)
COPY . .

# The macOS-generated lockfile omits linux-arm64-gnu optional deps.
# Reinstall next + parcel-watcher to pull correct platform binaries.
RUN npm install next@16.1.6 @parcel/watcher@2.5.6 --force --legacy-peer-deps 2>&1 | tail -5

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

# Debug: verify native bindings are loadable before build
RUN node -e "var bs=['@next/swc','@parcel/watcher','lightningcss'];bs.forEach(function(b){try{require(b);console.log('OK',b)}catch(e){console.log('FAIL',b,String(e).slice(0,100))}});console.log('arch:',process.arch,'platform:',process.platform)"

# Build the web app via Turbo (resolves workspace deps first)
ENV NODE_OPTIONS="--max-old-space-size=8192"
RUN npm run build -- --filter=web
ENV NODE_OPTIONS=""

# ---- Runtime stage ----
FROM node:22-slim AS runner

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
