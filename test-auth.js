#!/usr/bin/env node

const bcrypt = require('bcryptjs');

async function testAuth() {
  console.log('🔐 Testing authentication locally...');
  
  const testPassword = 'TestPass123!';
  const hashedPassword = await bcrypt.hash(testPassword, 12);
  
  console.log('Password:', testPassword);
  console.log('Hash:', hashedPassword);
  
  const isValid = await bcrypt.compare(testPassword, hashedPassword);
  console.log('Valid?', isValid);
  
  // Test with known hash from database
  const testEmail = 'test@netbanx.com';
  
  console.log('\n🧪 Testing curl command:');
  console.log(`curl -X POST https://netbanx-dashboard.vercel.app/api/auth/login \\
  -H "Content-Type: application/json" \\
  -d '{"email":"${testEmail}","password":"${testPassword}"}'`);
}

testAuth();