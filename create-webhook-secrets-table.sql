-- Create webhook_secrets table for encrypted HMAC key storage
CREATE TABLE IF NOT EXISTS "webhook_secrets" (
    "id" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "encryptedKey" TEXT NOT NULL,
    "algorithm" TEXT NOT NULL DEFAULT 'sha256',
    "keyVersion" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "companyId" TEXT,
    "lastUsedAt" TIMESTAMP(3),
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "webhook_secrets_pkey" PRIMARY KEY ("id")
);

-- Create unique index on endpoint
CREATE UNIQUE INDEX IF NOT EXISTS "webhook_secrets_endpoint_key" ON "webhook_secrets"("endpoint");

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS "webhook_secrets_endpoint_idx" ON "webhook_secrets"("endpoint");
CREATE INDEX IF NOT EXISTS "webhook_secrets_companyId_idx" ON "webhook_secrets"("companyId");
CREATE INDEX IF NOT EXISTS "webhook_secrets_isActive_idx" ON "webhook_secrets"("isActive");

-- Add foreign key constraint to companies table if it exists
ALTER TABLE "webhook_secrets" 
ADD CONSTRAINT "webhook_secrets_companyId_fkey" 
FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;