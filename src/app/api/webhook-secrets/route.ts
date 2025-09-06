import { NextRequest, NextResponse } from 'next/server';
import { withDatabase } from '@/lib/database';
import { encryptSecret, decryptSecret, validateSecretKey, hashSecretForLogging } from '@/lib/encryption';
import { ensureWebhookSecretsTable } from '@/lib/db-init';
import { v4 as uuidv4 } from 'uuid';

// Get all webhook secrets (without exposing the actual keys)
export async function GET(request: NextRequest) {
  try {
    // Ensure the table exists before querying
    const tableReady = await ensureWebhookSecretsTable();
    if (!tableReady) {
      console.error('Webhook secrets table is not ready');
      return NextResponse.json({
        success: true,
        secrets: [],
        count: 0,
        message: 'Webhook secrets table is being initialized'
      });
    }

    const secrets = await withDatabase(async (db) => {
      try {
        return await db.webhookSecret.findMany({
          select: {
            id: true,
            endpoint: true,
            name: true,
            description: true,
            algorithm: true,
            keyVersion: true,
            isActive: true,
            lastUsedAt: true,
            usageCount: true,
            createdAt: true,
            updatedAt: true,
            createdBy: true,
          },
          orderBy: {
            endpoint: 'asc'
          }
        });
      } catch (dbError: any) {
        // If table doesn't exist, return empty array
        if (dbError.code === 'P2021' || dbError.message?.includes('does not exist')) {
          console.log('Webhook secrets table does not exist yet');
          return [];
        }
        throw dbError;
      }
    });

    return NextResponse.json({
      success: true,
      secrets,
      count: secrets.length
    });
  } catch (error: any) {
    console.error('Error fetching webhook secrets:', error);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      stack: error.stack
    });
    return NextResponse.json(
      { success: false, error: 'Failed to fetch webhook secrets', details: error.message },
      { status: 500 }
    );
  }
}

// Create or update a webhook secret
export async function POST(request: NextRequest) {
  try {
    // Ensure the table exists before operating
    const tableReady = await ensureWebhookSecretsTable();
    if (!tableReady) {
      return NextResponse.json({
        success: false,
        error: 'Database schema not ready. Please try again in a moment.'
      }, { status: 503 });
    }

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
      { success: false, error: 'Failed to manage webhook secret' },
      { status: 500 }
    );
  }
}

// Delete a webhook secret
export async function DELETE(request: NextRequest) {
  try {
    // Ensure the table exists before operating
    const tableReady = await ensureWebhookSecretsTable();
    if (!tableReady) {
      return NextResponse.json({
        success: false,
        error: 'Database schema not ready'
      }, { status: 503 });
    }

    const { searchParams } = new URL(request.url);
    const endpoint = searchParams.get('endpoint');

    if (!endpoint) {
      return NextResponse.json(
        { success: false, error: 'Missing endpoint parameter' },
        { status: 400 }
      );
    }

    const deleted = await withDatabase(async (db) => {
      return await db.webhookSecret.delete({
        where: { endpoint }
      });
    });

    console.log(`Webhook secret deleted for endpoint: ${endpoint}`, {
      secretId: deleted.id
    });

    return NextResponse.json({
      success: true,
      message: 'Webhook secret deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting webhook secret:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete webhook secret' },
      { status: 500 }
    );
  }
}