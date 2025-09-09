import { NextResponse } from 'next/server';

// Simple test endpoint that doesn't require authentication
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    message: 'Server is running'
  });
}