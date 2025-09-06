import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  // Check various environment variable sources
  const envDebug = {
    NODE_ENV: process.env.NODE_ENV,
    DATABASE_URL_exists: !!process.env.DATABASE_URL,
    DATABASE_URL_preview: process.env.DATABASE_URL ? 
      process.env.DATABASE_URL.replace(/:([^@]+)@/, ':***@') : 'NOT SET',
    POSTGRES_URL_exists: !!process.env.POSTGRES_URL,
    POSTGRES_URL_preview: process.env.POSTGRES_URL ? 
      process.env.POSTGRES_URL.replace(/:([^@]+)@/, ':***@') : 'NOT SET',
    // Check if it's using the old format
    uses_old_format: process.env.DATABASE_URL?.includes('db.yufxjpyesqstlmvuxtiy.supabase.co:5432') || false,
    uses_new_format: process.env.DATABASE_URL?.includes('aws-1-us-west-1.pooler.supabase.com:6543') || false,
  };
  
  return NextResponse.json({
    success: true,
    environment: envDebug,
    message: 'Environment variable debug info'
  });
}