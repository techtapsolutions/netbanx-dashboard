# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is the **Netbanx Dashboard Portal** - a Next.js 15 application for processing webhook data from Netbanx/Paysafe payment systems. The application provides real-time transaction monitoring, account onboarding tracking, and REST APIs for external integrations.

## Key Commands

```bash
# Development
npm run dev                    # Start development server with Turbopack
npm run build                  # Production build via custom script
npm run start                  # Start production server
npm run lint                   # ESLint validation

# Database Operations
npm run db:migrate             # Push Prisma schema changes (npx prisma db push)
npm run db:studio              # Open Prisma Studio
npx prisma generate            # Regenerate Prisma client

# Admin Setup
npm run setup:admin            # Create initial admin user (npx tsx scripts/setup-admin.ts)

# Production Build
node scripts/build.js          # Custom build script for Vercel (handles Prisma generation)
npm run vercel-build           # Alias for custom build script
```

## Architecture Overview

### Core Data Flow
The application follows a webhook-first architecture:
1. **Webhooks** (`/api/webhooks/*`) receive and validate incoming data from Netbanx/Paysafe
2. **Database** (PostgreSQL + Prisma) stores transactions, accounts, and audit data
3. **REST API** (`/api/v1/*`) exposes data for external integrations
4. **Authentication** (JWT-based) provides role-based access control

### Database Schema Design
- **WebhookEvent**: Central event log for all incoming webhooks
- **Transaction**: Financial transaction data with external ID mapping
- **Account**: Merchant account onboarding with CC/DD ID tracking (critical for payment processing)
- **User/Company**: Multi-tenant authentication with role hierarchy
- **ApiToken**: External API access with granular permissions

### Authentication Architecture
Role hierarchy: `SUPER_ADMIN` → `COMPANY_ADMIN` → `COMPANY_USER` → `READONLY`
- Session-based auth using JWT tokens
- API key auth for external integrations
- Company-level data isolation (except SUPER_ADMIN)
- Permission system via `AuthService.hasPermission()`

### Key Integration Points

#### Webhook Endpoints
- `/api/webhooks/netbanx` - Legacy transaction webhooks
- `/api/webhooks/account-status` - Account onboarding with CC/DD IDs
- `/api/webhooks/test` - Development testing endpoint

#### External API Endpoints
- `/api/v1/transactions` - Transaction data access
- `/api/v1/accounts` - Account onboarding status (includes creditCardId/directDebitId)
- Authentication: `Bearer <jwt_token>` or `Api-Key <api_key>`

## Critical Implementation Details

### Next.js 15 App Router Specifics
- Dynamic routes use `Promise<{param}>` for params (e.g., `{ params: Promise<{ id: string }> }`)
- Route handlers must only export valid HTTP methods: `GET`, `POST`, `PUT`, `DELETE`, `PATCH`, `OPTIONS`, `HEAD`
- Dynamic routes require `[id]` directory structure with separate `route.ts` files

### Production Build Configuration
- Custom build script (`scripts/build.js`) handles Prisma generation with placeholder DATABASE_URL
- Vercel configuration (`vercel.json`) uses custom build command
- TailwindCSS v4 requires `@tailwindcss/postcss` plugin in production dependencies
- Environment variables: `SKIP_ENV_VALIDATION=true` and `PRISMA_GENERATE_SKIP_AUTOINSTALL=true`

### Database Connection Patterns
- Use `import { db } from '@/lib/database'` for Prisma client (singleton)
- Connection string format: `postgresql://user:pass@host:port/db`
- URL encode special characters (e.g., `@` becomes `%40`)
- Production uses Supabase PostgreSQL with connection pooling

### Authentication Implementation
- JWT tokens managed via `AuthService` in `/src/lib/auth.ts`
- Session verification: `AuthService.verifySession(token)`
- Permission checking: `AuthService.hasPermission(user, 'read:accounts')`
- API routes use `authenticateApiRequest()` helper function

### Critical Payment Data
- **creditCardId** and **directDebitId** fields in Account model are essential for external API integrations
- These IDs enable payment processing and must be preserved in all account-related operations
- Account status transitions are tracked in `account_status_history` table

### Error Handling Patterns
- API routes return structured responses: `{ success: boolean, data?: any, error?: string }`
- Database errors are logged but return generic "Internal server error" messages
- Webhook validation failures return appropriate HTTP status codes
- Authentication failures return 401/403 with descriptive messages

### Development vs Production
- Development: Uses local environment variables and direct database connections
- Production: Uses Vercel environment variables and Supabase connection pooling
- Build process automatically handles environment differences via custom build script

## API Documentation
- Swagger/OpenAPI documentation accessible at `/api/docs`
- Interactive API explorer for testing endpoints
- Comprehensive parameter and response schema definitions