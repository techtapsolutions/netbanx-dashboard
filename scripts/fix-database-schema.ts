#!/usr/bin/env npx tsx

import { Client } from 'pg';

async function fixDatabaseSchema() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL
  });

  try {
    console.log('🔌 Connecting to database...');
    await client.connect();

    console.log('🏗️  Creating missing tables and fixing schema...');

    // Create Session table (required for authentication)
    await client.query(`
      CREATE TABLE IF NOT EXISTS "Session" (
        id SERIAL PRIMARY KEY,
        token VARCHAR(191) UNIQUE NOT NULL,
        "userId" VARCHAR(191) NOT NULL,
        "expiresAt" TIMESTAMP(3) NOT NULL,
        "ipAddress" VARCHAR(191),
        "userAgent" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create index on token for faster lookups
    await client.query(`
      CREATE INDEX IF NOT EXISTS "Session_token_idx" ON "Session"("token");
    `);

    // Create index on userId for faster user session lookups
    await client.query(`
      CREATE INDEX IF NOT EXISTS "Session_userId_idx" ON "Session"("userId");
    `);

    // Create AuditLog table (used by auth system)
    await client.query(`
      CREATE TABLE IF NOT EXISTS "AuditLog" (
        id SERIAL PRIMARY KEY,
        action VARCHAR(191) NOT NULL,
        resource VARCHAR(191),
        "resourceId" VARCHAR(191),
        "userId" VARCHAR(191),
        "companyId" VARCHAR(191),
        "ipAddress" VARCHAR(191),
        "userAgent" TEXT,
        details JSONB,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Add missing columns to User table if they don't exist
    await client.query(`
      ALTER TABLE "User" 
      ADD COLUMN IF NOT EXISTS "resetToken" VARCHAR(191),
      ADD COLUMN IF NOT EXISTS "resetTokenAt" TIMESTAMP(3);
    `);

    // Create foreign key constraints if they don't exist
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints 
          WHERE constraint_name = 'Session_userId_fkey'
        ) THEN
          ALTER TABLE "Session" 
          ADD CONSTRAINT "Session_userId_fkey" 
          FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE CASCADE;
        END IF;
      END $$;
    `);

    console.log('✅ Database schema updated successfully!');

    // Verify the user exists and check password hash format
    console.log('🔍 Verifying user and password hash...');
    const userResult = await client.query(
      'SELECT id, email, "passwordHash" FROM "User" WHERE email = $1',
      ['ron@umbrapay.com']
    );

    if (userResult.rows.length > 0) {
      const user = userResult.rows[0];
      console.log('✅ User found:', user.email);
      
      // Check if password hash format looks correct (bcrypt hashes start with $2a$, $2b$, or $2y$)
      const hash = user.passwordHash;
      if (hash.startsWith('$2a$') || hash.startsWith('$2b$') || hash.startsWith('$2y$')) {
        console.log('✅ Password hash format looks correct');
      } else {
        console.log('⚠️  Password hash format might be incorrect:', hash.substring(0, 10) + '...');
      }
    }

  } catch (error) {
    console.error('❌ Error fixing database schema:', error);
    throw error;
  } finally {
    console.log('🔌 Closing database connection...');
    await client.end();
  }
}

async function main() {
  console.log('🔧 Fixing Database Schema for Authentication...\n');

  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL environment variable is required');
    process.exit(1);
  }

  await fixDatabaseSchema();
}

main()
  .catch((error) => {
    console.error('❌ Schema fix failed:', error);
    process.exit(1);
  });