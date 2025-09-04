#!/usr/bin/env npx tsx

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

const prisma = new PrismaClient();

interface AdminSetupData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

async function setupSuperAdmin(data: AdminSetupData) {
  try {
    // Check if any super admin already exists
    const existingSuperAdmin = await prisma.user.findFirst({
      where: { role: 'SUPER_ADMIN' },
    });

    if (existingSuperAdmin) {
      console.log('❌ Super admin already exists. Email:', existingSuperAdmin.email);
      return;
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(data.password, 12);

    // Create the super admin user
    const superAdmin = await prisma.user.create({
      data: {
        email: data.email.toLowerCase(),
        passwordHash: hashedPassword,
        firstName: data.firstName,
        lastName: data.lastName,
        role: 'SUPER_ADMIN',
        isActive: true,
        emailVerified: true, // Auto-verify for super admin
        emailVerifiedAt: new Date(),
      },
    });

    console.log('✅ Super admin created successfully!');
    console.log('📧 Email:', superAdmin.email);
    console.log('👤 Name:', `${superAdmin.firstName} ${superAdmin.lastName}`);
    console.log('🔑 Role:', superAdmin.role);
    console.log('📅 Created:', superAdmin.createdAt);
    console.log('');
    console.log('🚀 You can now log in to the dashboard with these credentials.');

  } catch (error) {
    console.error('❌ Error creating super admin:', error);
    throw error;
  }
}

async function main() {
  console.log('🏗️  Setting up Super Admin User...\n');

  // Get admin details from command line arguments or environment
  const email = process.argv[2] || process.env.ADMIN_EMAIL;
  const password = process.argv[3] || process.env.ADMIN_PASSWORD;
  const firstName = process.argv[4] || process.env.ADMIN_FIRST_NAME || 'Super';
  const lastName = process.argv[5] || process.env.ADMIN_LAST_NAME || 'Admin';

  if (!email || !password) {
    console.log('❌ Missing required arguments.\n');
    console.log('Usage:');
    console.log('  npm run setup:admin <email> <password> [firstName] [lastName]');
    console.log('');
    console.log('Or set environment variables:');
    console.log('  ADMIN_EMAIL=admin@company.com');
    console.log('  ADMIN_PASSWORD=securePassword123');
    console.log('  ADMIN_FIRST_NAME=John');
    console.log('  ADMIN_LAST_NAME=Doe');
    console.log('');
    process.exit(1);
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    console.log('❌ Invalid email format');
    process.exit(1);
  }

  // Validate password strength
  if (password.length < 8) {
    console.log('❌ Password must be at least 8 characters long');
    process.exit(1);
  }

  await setupSuperAdmin({
    email,
    password,
    firstName,
    lastName,
  });
}

main()
  .catch((error) => {
    console.error('❌ Setup failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });