#!/usr/bin/env npx tsx

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

async function createAdmin() {
  const prisma = new PrismaClient();

  try {
    console.log('🔌 Connecting to database via Prisma...');

    // First, check if any users exist
    const existingUserCount = await prisma.user.count();
    console.log(`📊 Current user count: ${existingUserCount}`);

    // List existing users
    const existingUsers = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true
      }
    });

    if (existingUsers.length > 0) {
      console.log('👥 Existing users:');
      existingUsers.forEach((user, index) => {
        console.log(`${index + 1}. ${user.firstName} ${user.lastName} (${user.email}) - ${user.role}`);
      });
    }

    // Create admin user
    const email = 'admin@netbanx.com';
    const password = 'AdminPass123!';
    const firstName = 'Admin';
    const lastName = 'User';

    console.log('🔍 Checking for existing admin...');
    
    const existingAdmin = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    });

    if (existingAdmin) {
      console.log('✅ Admin already exists, updating password...');
      
      const hashedPassword = await bcrypt.hash(password, 12);
      
      await prisma.user.update({
        where: { email: email.toLowerCase() },
        data: {
          passwordHash: hashedPassword,
          updatedAt: new Date()
        }
      });
      
      console.log('🔑 Password updated for existing admin');
    } else {
      console.log('🔐 Creating new admin user...');
      
      const hashedPassword = await bcrypt.hash(password, 12);
      
      const newUser = await prisma.user.create({
        data: {
          email: email.toLowerCase(),
          passwordHash: hashedPassword,
          firstName,
          lastName,
          role: 'SUPER_ADMIN',
          isActive: true,
          emailVerified: true,
          emailVerifiedAt: new Date(),
        }
      });
      
      console.log('✅ Admin user created successfully!');
      console.log('📧 Email:', newUser.email);
      console.log('👤 Name:', `${newUser.firstName} ${newUser.lastName}`);
      console.log('🔑 Role:', newUser.role);
      console.log('🆔 ID:', newUser.id);
    }
    
    console.log('');
    console.log('🚀 Login credentials:');
    console.log('📧 Email:', email.toLowerCase());
    console.log('🔑 Password:', password);
    console.log('🌐 Dashboard URL: https://netbanx-dashboard.vercel.app');

  } catch (error) {
    console.error('❌ Error creating admin:', error);
    throw error;
  } finally {
    console.log('🔌 Disconnecting from database...');
    await prisma.$disconnect();
  }
}

async function main() {
  console.log('👤 Creating Admin User via Prisma...\n');

  await createAdmin();
}

main()
  .catch((error) => {
    console.error('❌ Admin creation failed:', error);
    process.exit(1);
  });