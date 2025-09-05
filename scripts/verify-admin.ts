#!/usr/bin/env npx tsx

import { Client } from 'pg';
import bcrypt from 'bcrypt';

async function verifyAdmin() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL
  });

  try {
    console.log('🔌 Connecting to database...');
    await client.connect();

    const email = 'ron@umbrapay.com';
    const password = 'Aug12@94!';

    console.log('🔍 Checking for super admin user...');
    
    const userResult = await client.query(
      'SELECT id, email, "passwordHash", "firstName", "lastName", role, "isActive", "emailVerified" FROM "User" WHERE email = $1',
      [email]
    );

    if (userResult.rows.length === 0) {
      console.log('❌ No user found with email:', email);
      return;
    }

    const user = userResult.rows[0];
    console.log('✅ User found!');
    console.log('📧 Email:', user.email);
    console.log('👤 Name:', `${user.firstName} ${user.lastName}`);
    console.log('🔑 Role:', user.role);
    console.log('🟢 Active:', user.isActive);
    console.log('📬 Email Verified:', user.emailVerified);
    console.log('🆔 ID:', user.id);

    console.log('\n🔐 Testing password verification...');
    const passwordMatch = await bcrypt.compare(password, user.passwordHash);
    
    if (passwordMatch) {
      console.log('✅ Password verification successful!');
    } else {
      console.log('❌ Password verification failed!');
      console.log('💡 This could be why login is not working.');
    }

    // Check if user is active and email verified
    if (!user.isActive) {
      console.log('⚠️  Warning: User account is not active!');
    }

    if (!user.emailVerified) {
      console.log('⚠️  Warning: User email is not verified!');
    }

    if (user.role !== 'SUPER_ADMIN') {
      console.log('⚠️  Warning: User role is not SUPER_ADMIN!');
    }

    console.log('\n📊 Login Checklist:');
    console.log('- User exists:', userResult.rows.length > 0 ? '✅' : '❌');
    console.log('- Password matches:', passwordMatch ? '✅' : '❌');
    console.log('- Account active:', user.isActive ? '✅' : '❌');
    console.log('- Email verified:', user.emailVerified ? '✅' : '❌');
    console.log('- Is super admin:', user.role === 'SUPER_ADMIN' ? '✅' : '❌');

  } catch (error) {
    console.error('❌ Error verifying admin:', error);
    throw error;
  } finally {
    console.log('🔌 Closing database connection...');
    await client.end();
  }
}

async function main() {
  console.log('🔍 Verifying Super Admin User...\n');

  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL environment variable is required');
    process.exit(1);
  }

  await verifyAdmin();
}

main()
  .catch((error) => {
    console.error('❌ Verification failed:', error);
    process.exit(1);
  });