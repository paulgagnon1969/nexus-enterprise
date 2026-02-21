# Dockerfile for Nexus Enterprise monorepo API service
# Builds and runs the NestJS API on Cloud Run (or any Docker runtime)
# (No-op change to trigger CI/CD deployment)

FROM node:20-alpine

# Install Chromium and fonts for Puppeteer PDF generation
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    font-noto-emoji

# Create app directory
WORKDIR /app

# Ensure Puppeteer does not download Chromium during install (we use system chromium)
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Install root dependencies (workspace-aware)
# Copy only manifest files first for better Docker layer caching
COPY package*.json ./
COPY tsconfig.json ./
COPY turbo.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY packages/database/package.json ./packages/database/package.json
# Prisma schema needed for postinstall prisma:generate
COPY packages/database/prisma ./packages/database/prisma

RUN npm ci --legacy-peer-deps

# Copy the rest of the repository
COPY . .

# Generate Prisma client for the shared database package
RUN npm run prisma:generate --workspace @repo/database

# Build the API app (TypeScript -> dist) via Turborepo, filtering to the api app
RUN npm run build -- --filter=api

# Ensure our working directory is the API app for runtime
WORKDIR /app/apps/api

# Runtime configuration
ENV NODE_ENV=production
ENV TZ=America/Chicago
# Cloud Run will inject PORT; default to 8080 for local runs
ENV PORT=8080

EXPOSE 8080

# Start the NestJS API
CMD ["node", "dist/main.js"]
