#!/usr/bin/env npx tsx

import { Client } from 'pg';

async function listUsers() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL
  });

  try {
    console.log('🔌 Connecting to database...');
    await client.connect();

    console.log('👥 Listing all users...');
    
    const result = await client.query(`
      SELECT id, email, "firstName", "lastName", role, "isActive", "createdAt"
      FROM "User"
      ORDER BY "createdAt" DESC
    `);

    if (result.rows.length === 0) {
      console.log('❌ No users found in database');
    } else {
      console.log(`✅ Found ${result.rows.length} users:`);
      result.rows.forEach((user, index) => {
        console.log(`${index + 1}. ${user.firstName} ${user.lastName} (${user.email})`);
        console.log(`   Role: ${user.role}, Active: ${user.isActive}`);
        console.log(`   Created: ${user.createdAt}`);
        console.log('');
      });
    }

  } catch (error) {
    console.error('❌ Error listing users:', error);
    throw error;
  } finally {
    console.log('🔌 Closing database connection...');
    await client.end();
  }
}

async function main() {
  console.log('📋 Listing Database Users...\n');

  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL environment variable is required');
    process.exit(1);
  }

  await listUsers();
}

main()
  .catch((error) => {
    console.error('❌ Failed to list users:', error);
    process.exit(1);
  });