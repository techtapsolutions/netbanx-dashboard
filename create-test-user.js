#!/usr/bin/env node

const { Client } = require('pg');
const bcrypt = require('bcrypt');

async function createTestUser() {
  const client = new Client({ 
    connectionString: process.env.DATABASE_URL 
  });
  
  try {
    await client.connect();
    console.log('✅ Connected to database');
    
    const email = 'test@netbanx.com';
    const password = 'TestPass123!';
    const hashedPassword = await bcrypt.hash(password, 12);
    
    // Delete any existing test user and their sessions
    await client.query('DELETE FROM "Session" WHERE "userId" IN (SELECT id FROM "User" WHERE email = $1)', [email]);
    await client.query('DELETE FROM "User" WHERE email = $1', [email]);
    
    // Create new test user
    const userId = 'test-user-' + Date.now();
    await client.query(`
      INSERT INTO "User" (id, email, "passwordHash", "firstName", "lastName", role, "isActive", "createdAt", "updatedAt")
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, [userId, email, hashedPassword, 'Test', 'User', 'SUPER_ADMIN', true, new Date(), new Date()]);
    
    console.log('✅ Test user created successfully!');
    console.log('');
    console.log('🔑 LOGIN CREDENTIALS:');
    console.log('Email: test@netbanx.com');
    console.log('Password: TestPass123!');
    console.log('');
    
    // Also fix the original user password  
    const ronHashedPassword = await bcrypt.hash('SimplePass123', 12);
    await client.query('UPDATE "User" SET "passwordHash" = $1, "updatedAt" = $2 WHERE email = $3', 
      [ronHashedPassword, new Date(), 'ron@umbrapay.com']);
    
    console.log('✅ Also updated ron@umbrapay.com password to: SimplePass123');
    
  } catch (error) {
    console.error('❌ Error creating test user:', error);
  } finally {
    await client.end();
  }
}

createTestUser();