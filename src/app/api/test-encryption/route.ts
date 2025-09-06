import { NextRequest, NextResponse } from 'next/server';
import { encryptSecret, decryptSecret, validateSecretKey, generateTestSecret } from '@/lib/encryption';

export async function GET(request: NextRequest) {
  try {
    // Check if WEBHOOK_ENCRYPTION_KEY exists
    const hasEncryptionKey = !!process.env.WEBHOOK_ENCRYPTION_KEY;
    const keyPreview = process.env.WEBHOOK_ENCRYPTION_KEY ? 
      process.env.WEBHOOK_ENCRYPTION_KEY.substring(0, 8) + '...' : 'NOT SET';
    
    if (!hasEncryptionKey) {
      return NextResponse.json({
        success: false,
        error: 'WEBHOOK_ENCRYPTION_KEY environment variable is not set',
        debug: { keyPreview }
      });
    }

    // First try to generate a test secret
    let testSecret;
    try {
      testSecret = generateTestSecret();
    } catch (error: any) {
      return NextResponse.json({
        success: false,
        error: 'Failed to generate test secret',
        details: error.message,
        debug: { keyPreview }
      });
    }

    // Try encryption step by step
    let encrypted;
    try {
      encrypted = encryptSecret(testSecret);
    } catch (error: any) {
      return NextResponse.json({
        success: false,
        error: 'Failed during encryption',
        details: error.message,
        debug: { keyPreview, testSecretLength: testSecret.length }
      });
    }

    // Try decryption
    let decrypted;
    try {
      decrypted = decryptSecret(encrypted);
    } catch (error: any) {
      return NextResponse.json({
        success: false,
        error: 'Failed during decryption',
        details: error.message,
        debug: { keyPreview, encryptedLength: encrypted.length }
      });
    }
    
    const isValid = validateSecretKey(testSecret);
    const cycleSuccess = testSecret === decrypted;

    return NextResponse.json({
      success: true,
      tests: {
        hasEncryptionKey,
        secretValidation: isValid,
        encryptionCycle: cycleSuccess,
        testSecretLength: testSecret.length,
        encryptedLength: encrypted.length
      },
      debug: { keyPreview },
      message: 'Encryption system test completed'
    });

  } catch (error: any) {
    console.error('Encryption test failed:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Encryption test failed',
      details: error.toString(),
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }, { status: 500 });
  }
}