#!/usr/bin/env npx tsx

import { Client } from 'pg';
import bcrypt from 'bcryptjs'; // Use bcryptjs to match the auth service

async function fixPasswordHash() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL
  });

  try {
    console.log('🔌 Connecting to database...');
    await client.connect();

    const email = 'ron@umbrapay.com';
    const password = 'Aug12@94!';

    console.log('🔍 Finding user...');
    const userResult = await client.query(
      'SELECT id, email, "passwordHash" FROM "User" WHERE email = $1',
      [email]
    );

    if (userResult.rows.length === 0) {
      console.log('❌ User not found');
      return;
    }

    const user = userResult.rows[0];
    console.log('✅ User found:', user.email);

    console.log('🔐 Testing current password...');
    const currentHashWorks = await bcrypt.compare(password, user.passwordHash);
    
    if (currentHashWorks) {
      console.log('✅ Current password hash works! No need to update.');
      return;
    }

    console.log('❌ Current password hash does not work with bcryptjs.');
    console.log('🔄 Creating new password hash with bcryptjs...');
    
    // Create new hash using bcryptjs (to match auth service)
    const newHash = await bcrypt.hash(password, 12);
    
    console.log('💾 Updating password hash in database...');
    await client.query(
      'UPDATE "User" SET "passwordHash" = $1, "updatedAt" = $2 WHERE id = $3',
      [newHash, new Date(), user.id]
    );

    console.log('🔐 Verifying new password hash...');
    const newHashWorks = await bcrypt.compare(password, newHash);
    
    if (newHashWorks) {
      console.log('✅ New password hash verified successfully!');
      console.log('🚀 Login should now work with these credentials:');
      console.log('   Email: ron@umbrapay.com');
      console.log('   Password: Aug12@94!');
    } else {
      console.log('❌ New password hash verification failed!');
    }

  } catch (error) {
    console.error('❌ Error fixing password hash:', error);
    throw error;
  } finally {
    console.log('🔌 Closing database connection...');
    await client.end();
  }
}

async function main() {
  console.log('🔧 Fixing Password Hash for Authentication...\n');

  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL environment variable is required');
    process.exit(1);
  }

  await fixPasswordHash();
}

main()
  .catch((error) => {
    console.error('❌ Password hash fix failed:', error);
    process.exit(1);
  });