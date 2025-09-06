import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database';
import { encryptSecret, decryptSecret, validateSecretKey, hashSecretForLogging } from '@/lib/encryption';
import { v4 as uuidv4 } from 'uuid';

// Get all webhook secrets (without exposing the actual keys)
export async function GET(request: NextRequest) {
  try {
    const secrets = await db.webhookSecret.findMany({
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

    return NextResponse.json({
      success: true,
      secrets,
      count: secrets.length
    });
  } catch (error) {
    console.error('Error fetching webhook secrets:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch webhook secrets' },
      { status: 500 }
    );
  }
}

// Create or update a webhook secret
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
    
    // Check if secret already exists for this endpoint
    const existing = await db.webhookSecret.findUnique({
      where: { endpoint }
    });

    let webhookSecret;

    if (existing) {
      // Update existing secret
      webhookSecret = await db.webhookSecret.update({
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
      webhookSecret = await db.webhookSecret.create({
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
    const { searchParams } = new URL(request.url);
    const endpoint = searchParams.get('endpoint');

    if (!endpoint) {
      return NextResponse.json(
        { success: false, error: 'Missing endpoint parameter' },
        { status: 400 }
      );
    }

    const deleted = await db.webhookSecret.delete({
      where: { endpoint }
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