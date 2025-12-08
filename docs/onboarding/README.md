# Onboarding

Step-by-step instructions for getting a local environment running and understanding the codebase.

## Running apps

### Web
- From repo root: `npm run dev:web`
- Production build: `npx turbo run build --filter=web`

### Admin
- From repo root: `npm run dev:admin`
- Production build: `npx turbo run build --filter=admin`

### API (Node + tRPC)
- From repo root: `npm run dev:api`

### Mobile (Expo)
- From `apps/mobile`: `npm run start`
- Note: The mobile app is validated via Expo dev (`npm run start`), not a CI build. The root CI pipeline currently builds web, admin, and the Node API; mobile is expected to run interactively via Expo.
