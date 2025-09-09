#!/usr/bin/env node

// Script to create a test user for authentication testing
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const prisma = new PrismaClient();

async function createTestUser() {
  try {
    // Check if test user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: 'test@example.com' }
    });

    if (existingUser) {
      console.log('Test user already exists with ID:', existingUser.id);
      
      // Update the password to ensure it's correct
      const passwordHash = await bcrypt.hash('TestPassword123', 12);
      await prisma.user.update({
        where: { id: existingUser.id },
        data: { 
          passwordHash,
          isActive: true,
          emailVerified: true
        }
      });
      
      console.log('Password updated for test user');
    } else {
      // Create new test user
      const passwordHash = await bcrypt.hash('TestPassword123', 12);
      
      const user = await prisma.user.create({
        data: {
          email: 'test@example.com',
          passwordHash,
          firstName: 'Test',
          lastName: 'User',
          role: 'SUPER_ADMIN',
          isActive: true,
          emailVerified: true,
        }
      });
      
      console.log('Test user created with ID:', user.id);
    }

    console.log('\n✅ Test user ready!');
    console.log('Email: test@example.com');
    console.log('Password: TestPassword123');
    console.log('Role: SUPER_ADMIN');
    
  } catch (error) {
    console.error('Error creating test user:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createTestUser();