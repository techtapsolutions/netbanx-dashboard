#!/usr/bin/env npx tsx

import { Client } from 'pg';
import bcrypt from 'bcrypt';

async function resetPassword() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL
  });

  try {
    console.log('🔌 Connecting to database...');
    await client.connect();

    const email = 'test@netbanx.com';
    const newPassword = 'TestPass123!';

    console.log('🔐 Hashing new password...');
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    console.log('🔄 Updating password for:', email);
    
    const result = await client.query(`
      UPDATE "User" 
      SET "passwordHash" = $1, "updatedAt" = CURRENT_TIMESTAMP
      WHERE email = $2
      RETURNING id, email, "firstName", "lastName"
    `, [hashedPassword, email.toLowerCase()]);

    if (result.rows.length === 0) {
      console.log('❌ User not found:', email);
    } else {
      const user = result.rows[0];
      console.log('✅ Password updated successfully!');
      console.log('👤 User:', user.firstName, user.lastName);
      console.log('📧 Email:', user.email);
      console.log('🔑 New Password:', newPassword);
    }

  } catch (error) {
    console.error('❌ Error resetting password:', error);
    throw error;
  } finally {
    console.log('🔌 Closing database connection...');
    await client.end();
  }
}

async function main() {
  console.log('🔐 Resetting Password...\n');

  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL environment variable is required');
    process.exit(1);
  }

  await resetPassword();
}

main()
  .catch((error) => {
    console.error('❌ Failed to reset password:', error);
    process.exit(1);
  });