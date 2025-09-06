import { NextRequest, NextResponse } from 'next/server';
import { withDatabase } from '@/lib/database';
import { encryptSecret, validateSecretKey, hashSecretForLogging } from '@/lib/encryption';
import { v4 as uuidv4 } from 'uuid';

// Create webhook secret directly without table initialization check
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { endpoint, name, description, secretKey, algorithm = 'sha256', companyId } = body;

    // Validate required fields
    if (!endpoint || !name || !secretKey) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: endpoint, name, secretKey' },
        { status: 400 }
      );
    }

    // Validate endpoint name
    const validEndpoints = ['netbanx', 'account-status', 'direct-debit', 'alternate-payments'];
    if (!validEndpoints.includes(endpoint)) {
      return NextResponse.json(
        { success: false, error: `Invalid endpoint. Must be one of: ${validEndpoints.join(', ')}` },
        { status: 400 }
      );
    }

    // Validate secret key
    if (!validateSecretKey(secretKey)) {
      return NextResponse.json(
        { success: false, error: 'Invalid secret key format. Key must be at least 32 characters long.' },
        { status: 400 }
      );
    }

    // Encrypt the secret key
    const encryptedKey = encryptSecret(secretKey);
    
    const webhookSecret = await withDatabase(async (db) => {
      // Check if secret already exists for this endpoint
      const existing = await db.webhookSecret.findUnique({
        where: { endpoint }
      });

      if (existing) {
        // Update existing secret
        return await db.webhookSecret.update({
          where: { endpoint },
          data: {
            name,
            description,
            encryptedKey,
            algorithm,
            keyVersion: existing.keyVersion + 1,
            isActive: true,
            updatedAt: new Date(),
            companyId,
          },
          select: {
            id: true,
            endpoint: true,
            name: true,
            description: true,
            algorithm: true,
            keyVersion: true,
            isActive: true,
            createdAt: true,
            updatedAt: true,
          }
        });
      } else {
        // Create new secret
        return await db.webhookSecret.create({
          data: {
            id: uuidv4(),
            endpoint,
            name,
            description,
            encryptedKey,
            algorithm,
            keyVersion: 1,
            isActive: true,
            companyId,
          },
          select: {
            id: true,
            endpoint: true,
            name: true,
            description: true,
            algorithm: true,
            keyVersion: true,
            isActive: true,
            createdAt: true,
            updatedAt: true,
          }
        });
      }
    });

    const existing = webhookSecret.keyVersion > 1;

    console.log(`Webhook secret ${existing ? 'updated' : 'created'} for endpoint: ${endpoint}`, {
      keyHash: hashSecretForLogging(secretKey),
      keyVersion: webhookSecret.keyVersion
    });

    return NextResponse.json({
      success: true,
      message: `Webhook secret ${existing ? 'updated' : 'created'} successfully`,
      secret: webhookSecret
    });

  } catch (error) {
    console.error('Error managing webhook secret:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to manage webhook secret', details: error.message },
      { status: 500 }
    );
  }
}