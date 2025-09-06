#!/usr/bin/env node

/**
 * Test Supabase Database Connection
 * Run: node test-db-connection.js "your-database-url-here"
 */

const { Pool } = require('pg');

async function testConnection(databaseUrl) {
  if (!databaseUrl) {
    console.log('❌ Please provide a database URL as argument');
    console.log('Usage: node test-db-connection.js "postgresql://..."');
    process.exit(1);
  }
  
  console.log('🔍 Testing database connection...');
  console.log('📡 URL:', databaseUrl.replace(/:([^@]+)@/, ':***@'));
  
  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false }
  });
  
  try {
    // Test basic connection
    const client = await pool.connect();
    console.log('✅ Successfully connected to database');
    
    // Test a simple query
    const result = await client.query('SELECT version()');
    console.log('✅ Database version:', result.rows[0].version);
    
    // Check if companies table exists (indicator of working schema)
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'companies'
      )
    `);
    
    if (tableCheck.rows[0].exists) {
      console.log('✅ Schema appears to be working (companies table found)');
    } else {
      console.log('⚠️ Schema may be empty (no companies table found)');
    }
    
    client.release();
    await pool.end();
    
    console.log('🎉 Connection test successful!');
    console.log('💡 You can use this DATABASE_URL in Vercel environment variables');
    
  } catch (error) {
    console.error('❌ Connection failed:', error.message);
    
    if (error.message.includes('password authentication failed')) {
      console.log('💡 Password issue: Check your database password');
    } else if (error.message.includes('does not exist')) {
      console.log('💡 Database issue: Check if the database name is correct');
    } else if (error.message.includes('timeout') || error.message.includes('ENOTFOUND')) {
      console.log('💡 Network issue: Check if the host/port is correct');
    } else if (error.message.includes('too many connections')) {
      console.log('💡 Connection limit: Try the connection pooling URL (port 6543)');
    }
    
    await pool.end();
    process.exit(1);
  }
}

const databaseUrl = process.argv[2];
testConnection(databaseUrl);