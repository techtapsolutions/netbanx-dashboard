#!/usr/bin/env node

const crypto = require('crypto');

console.log('🔐 Generating secure secrets for production deployment...\n');

// Generate JWT Secret (64 bytes)
const jwtSecret = crypto.randomBytes(64).toString('hex');
console.log('JWT_SECRET:');
console.log(jwtSecret);
console.log('');

// Generate NextAuth Secret (32 bytes)
const nextAuthSecret = crypto.randomBytes(32).toString('hex');
console.log('NEXTAUTH_SECRET:');
console.log(nextAuthSecret);
console.log('');

console.log('📋 Copy these values to your Vercel Environment Variables:');
console.log('---');
console.log(`JWT_SECRET = ${jwtSecret}`);
console.log(`NEXTAUTH_SECRET = ${nextAuthSecret}`);
console.log('---\n');

console.log('⚠️  Keep these secrets secure and never commit them to version control!');