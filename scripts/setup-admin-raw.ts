#!/usr/bin/env npx tsx

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';

// Create Prisma client with specific configuration to avoid prepared statement issues
const prisma = new PrismaClient({
  log: ['error'],
  datasourceUrl: process.env.DATABASE_URL,
});

async function setupSuperAdmin() {
  try {
    const email = 'Ron@umbrapay.com';
    const password = 'Aug12@94!';
    const firstName = 'Ron';
    const lastName = 'Alden';

    console.log('🔍 Checking for existing super admin using raw query...');
    
    // Use raw query to check for existing super admin
    const existingUsers = await prisma.$queryRaw`
      SELECT id, email FROM "User" WHERE role = 'SUPER_ADMIN' LIMIT 1
    `;

    if (Array.isArray(existingUsers) && existingUsers.length > 0) {
      console.log('❌ Super admin already exists. Email:', (existingUsers[0] as any).email);
      return;
    }

    console.log('🔐 Hashing password...');
    const hashedPassword = await bcrypt.hash(password, 12);

    console.log('👤 Creating super admin user with raw query...');
    const userId = randomUUID();
    const now = new Date();

    // Use raw query to insert the super admin
    await prisma.$executeRaw`
      INSERT INTO "User" (
        id, email, "passwordHash", "firstName", "lastName", role, 
        "isActive", "emailVerified", "emailVerifiedAt", "createdAt", "updatedAt"
      ) VALUES (
        ${userId}, ${email.toLowerCase()}, ${hashedPassword}, ${firstName}, ${lastName}, 'SUPER_ADMIN',
        true, true, ${now}, ${now}, ${now}
      )
    `;

    console.log('✅ Super admin created successfully!');
    console.log('📧 Email:', email.toLowerCase());
    console.log('👤 Name:', `${firstName} ${lastName}`);
    console.log('🔑 Role: SUPER_ADMIN');
    console.log('📅 Created:', now);
    console.log('🆔 ID:', userId);
    console.log('');
    console.log('🚀 You can now log in to the dashboard with these credentials.');

  } catch (error) {
    console.error('❌ Error creating super admin:', error);
    
    // If it's a unique constraint error, that means user already exists
    if (error instanceof Error && error.message.includes('unique constraint') || 
        error instanceof Error && error.message.includes('duplicate key')) {
      console.log('ℹ️  User might already exist with this email.');
    }
    
    throw error;
  }
}

async function main() {
  console.log('🏗️  Setting up Super Admin User with Raw SQL...\n');

  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL environment variable is required');
    process.exit(1);
  }

  await setupSuperAdmin();
}

main()
  .catch((error) => {
    console.error('❌ Setup failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    console.log('🔌 Disconnecting from database...');
    await prisma.$disconnect();
  });