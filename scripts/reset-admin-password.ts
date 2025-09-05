#!/usr/bin/env npx tsx

import { Client } from 'pg';
import bcrypt from 'bcryptjs';

async function resetAdminPassword() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL
  });

  try {
    console.log('🔌 Connecting to database...');
    await client.connect();

    const email = 'ron@umbrapay.com';
    const newPassword = 'TempPassword123!';

    console.log('🔐 Creating new temporary password hash...');
    const passwordHash = await bcrypt.hash(newPassword, 12);

    console.log('💾 Updating password in database...');
    const result = await client.query(
      'UPDATE "User" SET "passwordHash" = $1, "updatedAt" = $2 WHERE email = $3 RETURNING id, email',
      [passwordHash, new Date(), email]
    );

    if (result.rowCount === 0) {
      console.log('❌ User not found');
      return;
    }

    console.log('✅ Password updated successfully!');
    console.log('🔐 New temporary login credentials:');
    console.log('   Email: ron@umbrapay.com');
    console.log('   Password: TempPassword123!');
    console.log('');
    console.log('🌐 Dashboard: https://netbanx-dashboard.vercel.app');
    console.log('');
    console.log('⚠️  IMPORTANT: Change this password after logging in!');

  } catch (error) {
    console.error('❌ Error resetting password:', error);
    throw error;
  } finally {
    console.log('🔌 Closing database connection...');
    await client.end();
  }
}

async function main() {
  console.log('🔄 Resetting Admin Password...\n');

  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL environment variable is required');
    process.exit(1);
  }

  await resetAdminPassword();
}

main()
  .catch((error) => {
    console.error('❌ Password reset failed:', error);
    process.exit(1);
  });