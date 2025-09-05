#!/usr/bin/env npx tsx

import { Client } from 'pg';
import bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';

async function setupSuperAdmin() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL
  });

  try {
    console.log('🔌 Connecting to database...');
    await client.connect();

    const email = 'Ron@umbrapay.com';
    const password = 'Aug12@94!';
    const firstName = 'Ron';
    const lastName = 'Alden';

    console.log('🔍 Checking for existing super admin...');
    
    // Check if User table exists and if super admin exists
    const tableExistsResult = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'User'
      );
    `);

    if (!tableExistsResult.rows[0].exists) {
      console.log('❌ User table does not exist. Please run database migrations first.');
      console.log('💡 Try running: npx prisma db push');
      return;
    }

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
    console.log('🚀 You can now log in to the dashboard with these credentials.');

  } catch (error) {
    console.error('❌ Error creating super admin:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('unique constraint') || error.message.includes('duplicate key')) {
        console.log('ℹ️  User already exists with this email.');
      } else if (error.message.includes('relation') && error.message.includes('does not exist')) {
        console.log('💡 Please run database migrations first: npx prisma db push');
      }
    }
    
    throw error;
  } finally {
    console.log('🔌 Closing database connection...');
    await client.end();
  }
}

async function main() {
  console.log('🏗️  Setting up Super Admin User with Direct PostgreSQL Connection...\n');

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
  });