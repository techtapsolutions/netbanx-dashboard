import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const dbUrl = process.env.DATABASE_URL;
    
    // Don't expose the full connection string, just show the host and database
    let connectionInfo = 'Not configured';
    if (dbUrl) {
      try {
        const url = new URL(dbUrl);
        connectionInfo = `Host: ${url.hostname}, Port: ${url.port}, DB: ${url.pathname.substring(1)}`;
      } catch (e) {
        connectionInfo = 'Invalid URL format';
      }
    }
    
    return NextResponse.json({
      success: true,
      hasConnection: !!dbUrl,
      connectionInfo,
      nodeEnv: process.env.NODE_ENV,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}