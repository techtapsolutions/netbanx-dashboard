import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    // Check serverless environment detection
    const isServerless = !!(
      process.env.VERCEL || 
      process.env.AWS_LAMBDA_FUNCTION_NAME || 
      process.env.NETLIFY ||
      process.env.FUNCTIONS_WORKER_RUNTIME
    );

    // Check current DATABASE_URL
    const databaseUrl = process.env.DATABASE_URL;
    let connectionUrl = databaseUrl;
    
    if (isServerless && databaseUrl) {
      const url = new URL(databaseUrl);
      url.searchParams.set('prepared_statements', 'false');
      url.searchParams.set('connection_limit', '1');
      url.searchParams.set('pool_timeout', '10');
      connectionUrl = url.toString();
    }

    return NextResponse.json({
      success: true,
      environment: {
        isServerless,
        hasVercelEnv: !!process.env.VERCEL,
        nodeEnv: process.env.NODE_ENV,
        originalUrl: databaseUrl ? databaseUrl.replace(/:[^@]+@/, ':***@') : 'NOT SET',
        modifiedUrl: connectionUrl ? connectionUrl.replace(/:[^@]+@/, ':***@') : 'NOT SET',
        urlModified: connectionUrl !== databaseUrl
      }
    });

  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message,
      details: error.toString()
    }, { status: 500 });
  }
}