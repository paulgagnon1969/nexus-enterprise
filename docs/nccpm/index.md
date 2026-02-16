---
title: "NCC Programming Manual (NccPM)"
type: manual
version: "1.0"
audience: [developers, warp-agents, technical-leads]
created: 2026-02-16
updated: 2026-02-16
maintainer: Warp & Development Team
---

# NCC Programming Manual (NccPM)

## Purpose
The NCC Programming Manual is the authoritative technical reference for the Nexus Control Center (NCC) application. It documents **what** we build, **why** we build it, and **how** the system works—serving as the institutional memory for development decisions and system architecture.

## Audience
- **Developers** - Understanding system architecture and implementation patterns
- **Warp Agents** - Context for future development sessions
- **Technical Leads** - Reference for design decisions and system capabilities

## How to Use This Manual

### For New Development Sessions
1. Review relevant module specs before making changes
2. Check architecture decisions (ADRs) for context on existing patterns
3. Reference session logs for recent work on related features

### For Adding New Features
1. Document the feature in the appropriate module spec
2. Create an ADR if making significant architectural choices
3. Update this index if adding new sections

### For Understanding the System
Start with Architecture Overview, then drill into specific modules as needed.

---

## Table of Contents

### 1. Architecture
System-wide design and patterns.

- [Architecture Overview](architecture/overview.md)
- [Monorepo Structure](architecture/monorepo-structure.md)
- [Data Model](architecture/data-model.md)
- [API Design Patterns](architecture/api-patterns.md)
- [Authentication & Authorization](architecture/auth.md)

### 2. Modules
Feature-by-feature specifications.

- [Daily Logs](modules/daily-logs.md)
- [Bills & Expenses](modules/bills.md)
- [Invoicing](modules/invoicing.md)
- [Projects](modules/projects.md)
- [PETL (Property/Equipment/Task/Location)](modules/petl.md)
- [Documents](modules/documents.md)
- [Contacts & Directory](modules/contacts.md)
- [User Management](modules/users.md)

### 3. Architecture Decisions (ADRs)
Records of significant technical decisions.

- [ADR-001: Monorepo with Turborepo](decisions/adr-001-monorepo-turborepo.md)
- [ADR-002: NestJS + Fastify for API](decisions/adr-002-nestjs-fastify.md)
- [ADR-003: Prisma for Database Access](decisions/adr-003-prisma.md)
- *(Add new ADRs as decisions are made)*

### 4. Procedures
Development workflows and processes.

- [Session Closeout Procedure](procedures/session-closeout.md)
- [Deployment Procedure](procedures/deployment.md)
- [Database Migration Procedure](procedures/database-migrations.md)
- [Feature Development Workflow](procedures/feature-workflow.md)

### 5. Session Logs
Chronological development context (symlinked from `docs/sessions/`).

*Session logs capture raw development context including decisions made, code locations, and implementation details. They serve as source material for more polished documentation.*

- [2026-02-15: Daily Log Reassignment](../sessions/2026-02-15-daily-log-reassignment.md)
- *(New sessions added automatically)*

---

## Quick Reference

### Key File Locations
| Component | Path |
|-----------|------|
| API Entry | `apps/api/src/main.ts` |
| Web App | `apps/web/app/` |
| Mobile App | `apps/mobile/src/` |
| Database Schema | `packages/database/prisma/schema.prisma` |
| Shared Types | `packages/types/src/` |

### Common Commands
```bash
# Development
npm run dev              # All apps
npm run dev:api          # API only
npm run dev:web          # Web only (if script exists)

# Build & Check
npm run build            # Build all
npm run check-types      # Type check all
npm run lint             # Lint all

# Database
npm -w packages/database run prisma:migrate    # Run migrations
npm -w packages/database run prisma:generate   # Regenerate client

# Deployment
./scripts/deploy-api-prod-env.sh              # Deploy API to Cloud Run
vercel --prod --archive=tgz                   # Deploy web to Vercel
```

### Environment Setup
See [Onboarding README](../onboarding/README.md) for full setup instructions.

---

## Contributing to This Manual

### Adding Module Documentation
1. Create spec in `modules/[module-name].md`
2. Use the Specification Document template from Manual Making Process SOP
3. Add entry to Table of Contents above

### Recording Decisions
1. Create ADR in `decisions/adr-[number]-[slug].md`
2. Use the Decision Record template
3. Add entry to ADRs section above

### After Development Sessions
1. Session MD goes to `docs/sessions/`
2. Extract relevant content into appropriate manual sections
3. Link session from Session Logs section

---

## Revision History
| Rev | Date | Changes |
|-----|------|---------|
| 1.0 | 2026-02-16 | Initial manual structure created |
