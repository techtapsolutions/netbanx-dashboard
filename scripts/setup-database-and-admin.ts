#!/usr/bin/env npx tsx

import { Client } from 'pg';
import bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';

async function setupDatabaseAndAdmin() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL
  });

  try {
    console.log('🔌 Connecting to database...');
    await client.connect();

    console.log('🏗️  Creating database tables...');

    // Create User table with all necessary fields
    await client.query(`
      CREATE TABLE IF NOT EXISTS "User" (
        id VARCHAR(191) PRIMARY KEY,
        email VARCHAR(191) UNIQUE NOT NULL,
        "passwordHash" VARCHAR(191) NOT NULL,
        "firstName" VARCHAR(191) NOT NULL,
        "lastName" VARCHAR(191) NOT NULL,
        role VARCHAR(191) NOT NULL DEFAULT 'READONLY',
        "isActive" BOOLEAN NOT NULL DEFAULT true,
        "emailVerified" BOOLEAN NOT NULL DEFAULT false,
        "emailVerifiedAt" TIMESTAMP(3),
        "lastLoginAt" TIMESTAMP(3),
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "companyId" VARCHAR(191),
        "apiTokens" TEXT[]
      );
    `);

    // Create Company table
    await client.query(`
      CREATE TABLE IF NOT EXISTS "Company" (
        id VARCHAR(191) PRIMARY KEY,
        name VARCHAR(191) NOT NULL,
        "isActive" BOOLEAN NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create other essential tables
    await client.query(`
      CREATE TABLE IF NOT EXISTS "WebhookEvent" (
        id VARCHAR(191) PRIMARY KEY,
        type VARCHAR(191) NOT NULL,
        payload JSONB NOT NULL,
        "processedAt" TIMESTAMP(3),
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "companyId" VARCHAR(191)
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS "Transaction" (
        id VARCHAR(191) PRIMARY KEY,
        "externalId" VARCHAR(191) UNIQUE,
        amount DECIMAL(10,2) NOT NULL,
        currency VARCHAR(191) NOT NULL DEFAULT 'USD',
        status VARCHAR(191) NOT NULL,
        type VARCHAR(191) NOT NULL,
        "merchantRefNum" VARCHAR(191),
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "companyId" VARCHAR(191)
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS "Account" (
        id VARCHAR(191) PRIMARY KEY,
        "externalId" VARCHAR(191) UNIQUE,
        "merchantRefNum" VARCHAR(191),
        status VARCHAR(191) NOT NULL,
        "creditCardId" VARCHAR(191),
        "directDebitId" VARCHAR(191),
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "companyId" VARCHAR(191)
      );
    `);

    console.log('✅ Database tables created successfully!');

    const email = 'Ron@umbrapay.com';
    const password = 'Aug12@94!';
    const firstName = 'Ron';
    const lastName = 'Alden';

    console.log('🔍 Checking for existing super admin...');
    
    const existingUserResult = await client.query(
      'SELECT id, email FROM "User" WHERE role = $1 LIMIT 1',
      ['SUPER_ADMIN']
    );

    if (existingUserResult.rows.length > 0) {
      console.log('❌ Super admin already exists. Email:', existingUserResult.rows[0].email);
      return;
    }

    console.log('🔐 Hashing password...');
    const hashedPassword = await bcrypt.hash(password, 12);

    console.log('👤 Creating super admin user...');
    const userId = randomUUID();
    const now = new Date();

    await client.query(`
      INSERT INTO "User" (
        id, email, "passwordHash", "firstName", "lastName", role, 
        "isActive", "emailVerified", "emailVerifiedAt", "createdAt", "updatedAt"
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `, [
      userId, email.toLowerCase(), hashedPassword, firstName, lastName, 'SUPER_ADMIN',
      true, true, now, now, now
    ]);

    console.log('✅ Super admin created successfully!');
    console.log('📧 Email:', email.toLowerCase());
    console.log('👤 Name:', `${firstName} ${lastName}`);
    console.log('🔑 Role: SUPER_ADMIN');
    console.log('📅 Created:', now);
    console.log('🆔 ID:', userId);
    console.log('');
    console.log('🚀 You can now log in to the dashboard with these credentials!');
    console.log('🌐 Dashboard URL: https://netbanx-dashboard.vercel.app');

  } catch (error) {
    console.error('❌ Error setting up database and admin:', error);
    throw error;
  } finally {
    console.log('🔌 Closing database connection...');
    await client.end();
  }
}

async function main() {
  console.log('🏗️  Setting up Database and Super Admin User...\n');

  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL environment variable is required');
    process.exit(1);
  }

  await setupDatabaseAndAdmin();
}

main()
  .catch((error) => {
    console.error('❌ Setup failed:', error);
    process.exit(1);
  });