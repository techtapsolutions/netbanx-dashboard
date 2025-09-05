#!/usr/bin/env npx tsx

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

// Create a fresh Prisma client instance
const prisma = new PrismaClient({
  log: ['error'],
});

interface AdminSetupData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

async function setupSuperAdmin(data: AdminSetupData) {
  try {
    console.log('🔍 Checking for existing super admin...');
    
    // Check if any super admin already exists
    const existingSuperAdmin = await prisma.user.findFirst({
      where: { role: 'SUPER_ADMIN' },
    });

    if (existingSuperAdmin) {
      console.log('❌ Super admin already exists. Email:', existingSuperAdmin.email);
      return;
    }

    console.log('🔐 Hashing password...');
    // Hash the password
    const hashedPassword = await bcrypt.hash(data.password, 12);

    console.log('👤 Creating super admin user...');
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

  const email = 'Ron@umbrapay.com';
  const password = 'Aug12@94!';
  const firstName = 'Ron';
  const lastName = 'Alden';

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
    console.log('🔌 Disconnecting from database...');
    await prisma.$disconnect();
  });