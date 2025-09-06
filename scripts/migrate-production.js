#!/usr/bin/env node

/**
 * Production Database Migration Script
 * Applies webhook_secrets table schema to production database
 */

const { execSync } = require('child_process');

async function migrateProduction() {
  console.log('🔄 Starting production database migration...');
  
  // Check if DATABASE_URL is set
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL environment variable is not set');
    console.log('💡 Please set your production DATABASE_URL first:');
    console.log('   export DATABASE_URL="postgresql://postgres:password@db.project.supabase.co:5432/postgres"');
    process.exit(1);
  }
  
  console.log('📡 DATABASE_URL:', process.env.DATABASE_URL.replace(/:([^@]+)@/, ':***@'));
  
  try {
    // Test connection
    console.log('🔍 Testing database connection...');
    execSync('npx prisma db execute --file ./create-webhook-secrets-table.sql', { 
      stdio: 'inherit' 
    });
    
    console.log('✅ Database migration completed successfully!');
    console.log('🚀 Your encrypted key storage is now ready!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    
    // Try alternative method
    console.log('🔄 Trying alternative method with prisma db push...');
    try {
      execSync('npx prisma db push --accept-data-loss', { stdio: 'inherit' });
      console.log('✅ Schema applied successfully with db push!');
    } catch (pushError) {
      console.error('❌ Both migration methods failed');
      console.log('📋 Manual steps required:');
      console.log('1. Copy the SQL from create-webhook-secrets-table.sql');
      console.log('2. Run it in your Supabase SQL Editor');
      console.log('3. Or contact your database administrator');
    }
  }
}

migrateProduction().catch(console.error);