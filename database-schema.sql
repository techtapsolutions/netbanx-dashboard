-- Netbanx Dashboard Database Schema
-- Run this in Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create tables based on Prisma schema
CREATE TABLE IF NOT EXISTS "public"."companies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "website" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "settings" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'COMPANY_USER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "timezone" TEXT,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "emailVerifiedAt" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "resetToken" TEXT,
    "resetTokenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "companyId" TEXT,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."sessions" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."api_tokens" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "permissions" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_tokens_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."webhook_events" (
    "id" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."transactions" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "merchantId" TEXT,
    "customerId" TEXT,
    "customerEmail" TEXT,
    "paymentMethod" TEXT,
    "description" TEXT,
    "metadata" JSONB,
    "processedAt" TIMESTAMP(3),
    "webhookEventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."accounts" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "merchantId" TEXT,
    "accountName" TEXT NOT NULL,
    "businessName" TEXT,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "status" TEXT NOT NULL,
    "subStatus" TEXT,
    "onboardingStage" TEXT,
    "creditCardId" TEXT,
    "directDebitId" TEXT,
    "businessType" TEXT,
    "industry" TEXT,
    "website" TEXT,
    "riskLevel" TEXT,
    "complianceStatus" TEXT,
    "approvedAt" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),
    "webhookEventId" TEXT,
    "metadata" JSONB,
    "companyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."account_status_history" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "subStatus" TEXT,
    "stage" TEXT,
    "reason" TEXT,
    "description" TEXT,
    "changedBy" TEXT,
    "metadata" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_status_history_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."payment_methods" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT,
    "status" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "capabilities" JSONB,
    "limits" JSONB,
    "activatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_methods_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."audit_logs" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "resource" TEXT,
    "resourceId" TEXT,
    "userId" TEXT,
    "companyId" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "details" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- Create unique indexes
CREATE UNIQUE INDEX IF NOT EXISTS "companies_email_key" ON "public"."companies"("email");
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_key" ON "public"."users"("email");
CREATE UNIQUE INDEX IF NOT EXISTS "sessions_token_key" ON "public"."sessions"("token");
CREATE UNIQUE INDEX IF NOT EXISTS "api_tokens_token_key" ON "public"."api_tokens"("token");
CREATE UNIQUE INDEX IF NOT EXISTS "transactions_externalId_key" ON "public"."transactions"("externalId");
CREATE UNIQUE INDEX IF NOT EXISTS "accounts_externalId_key" ON "public"."accounts"("externalId");

-- Create regular indexes
CREATE INDEX IF NOT EXISTS "users_companyId_idx" ON "public"."users"("companyId");
CREATE INDEX IF NOT EXISTS "sessions_userId_idx" ON "public"."sessions"("userId");
CREATE INDEX IF NOT EXISTS "api_tokens_companyId_idx" ON "public"."api_tokens"("companyId");
CREATE INDEX IF NOT EXISTS "transactions_status_idx" ON "public"."transactions"("status");
CREATE INDEX IF NOT EXISTS "transactions_webhookEventId_idx" ON "public"."transactions"("webhookEventId");
CREATE INDEX IF NOT EXISTS "accounts_status_idx" ON "public"."accounts"("status");
CREATE INDEX IF NOT EXISTS "accounts_companyId_idx" ON "public"."accounts"("companyId");
CREATE INDEX IF NOT EXISTS "account_status_history_accountId_idx" ON "public"."account_status_history"("accountId");
CREATE INDEX IF NOT EXISTS "payment_methods_accountId_idx" ON "public"."payment_methods"("accountId");
CREATE INDEX IF NOT EXISTS "audit_logs_userId_idx" ON "public"."audit_logs"("userId");
CREATE INDEX IF NOT EXISTS "audit_logs_companyId_idx" ON "public"."audit_logs"("companyId");

-- Add foreign key constraints
ALTER TABLE "public"."users" DROP CONSTRAINT IF EXISTS "users_companyId_fkey";
ALTER TABLE "public"."users" ADD CONSTRAINT "users_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."sessions" DROP CONSTRAINT IF EXISTS "sessions_userId_fkey";
ALTER TABLE "public"."sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."api_tokens" DROP CONSTRAINT IF EXISTS "api_tokens_companyId_fkey";
ALTER TABLE "public"."api_tokens" ADD CONSTRAINT "api_tokens_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."transactions" DROP CONSTRAINT IF EXISTS "transactions_webhookEventId_fkey";
ALTER TABLE "public"."transactions" ADD CONSTRAINT "transactions_webhookEventId_fkey" FOREIGN KEY ("webhookEventId") REFERENCES "public"."webhook_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."accounts" DROP CONSTRAINT IF EXISTS "accounts_companyId_fkey";
ALTER TABLE "public"."accounts" ADD CONSTRAINT "accounts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."accounts" DROP CONSTRAINT IF EXISTS "accounts_webhookEventId_fkey";
ALTER TABLE "public"."accounts" ADD CONSTRAINT "accounts_webhookEventId_fkey" FOREIGN KEY ("webhookEventId") REFERENCES "public"."webhook_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."account_status_history" DROP CONSTRAINT IF EXISTS "account_status_history_accountId_fkey";
ALTER TABLE "public"."account_status_history" ADD CONSTRAINT "account_status_history_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "public"."accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."payment_methods" DROP CONSTRAINT IF EXISTS "payment_methods_accountId_fkey";
ALTER TABLE "public"."payment_methods" ADD CONSTRAINT "payment_methods_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "public"."accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Success message
SELECT 'Database schema created successfully! All tables and indexes are ready.' as status;