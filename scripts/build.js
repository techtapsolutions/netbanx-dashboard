#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

console.log('🚀 Starting production build...');

// Set minimal DATABASE_URL for Prisma generation if not present
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
  console.log('⚠️  Using placeholder DATABASE_URL for build');
}

// Generate Prisma client
console.log('📦 Generating Prisma client...');
const prismaGenerate = spawn('npx', ['prisma', 'generate'], {
  stdio: 'inherit',
  env: { ...process.env, SKIP_ENV_VALIDATION: 'true' }
});

prismaGenerate.on('close', (code) => {
  if (code !== 0) {
    console.error('❌ Prisma generation failed');
    process.exit(1);
  }
  
  console.log('✅ Prisma client generated successfully');
  console.log('🔨 Building Next.js application...');
  
  // Build Next.js
  const nextBuild = spawn('npm', ['run', 'build'], {
    stdio: 'inherit',
    env: { ...process.env, SKIP_ENV_VALIDATION: 'true' }
  });
  
  nextBuild.on('close', (buildCode) => {
    if (buildCode !== 0) {
      console.error('❌ Next.js build failed');
      process.exit(1);
    }
    
    console.log('✅ Build completed successfully!');
  });
});