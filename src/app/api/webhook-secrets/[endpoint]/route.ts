import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database';
import { decryptSecret } from '@/lib/encryption';

interface RouteParams {
  params: Promise<{ endpoint: string }>;
}

// Get a specific webhook secret (for internal use only - returns decrypted key)
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { endpoint } = await params;
    
    // This endpoint is for internal use only - could add API key validation here
    const secret = await db.webhookSecret.findUnique({
      where: { endpoint, isActive: true }
    });

    if (!secret) {
      return NextResponse.json(
        { success: false, error: 'Webhook secret not found' },
        { status: 404 }
      );
    }

    // Decrypt the key for internal use
    const decryptedKey = decryptSecret(secret.encryptedKey);

    // Update usage tracking
    await db.webhookSecret.update({
      where: { endpoint },
      data: {
        lastUsedAt: new Date(),
        usageCount: { increment: 1 }
      }
    });

    return NextResponse.json({
      success: true,
      secret: {
        id: secret.id,
        endpoint: secret.endpoint,
        name: secret.name,
        description: secret.description,
        algorithm: secret.algorithm,
        keyVersion: secret.keyVersion,
        decryptedKey, // Only returned for internal API calls
        isActive: secret.isActive,
        createdAt: secret.createdAt,
        updatedAt: secret.updatedAt,
      }
    });

  } catch (error) {
    console.error(`Error fetching webhook secret for endpoint ${endpoint}:`, error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch webhook secret' },
      { status: 500 }
    );
  }
}

// Update specific webhook secret properties
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { endpoint } = await params;
    const body = await request.json();
    const { isActive, name, description } = body;

    const updated = await db.webhookSecret.update({
      where: { endpoint },
      data: {
        ...(typeof isActive === 'boolean' && { isActive }),
        ...(name && { name }),
        ...(description !== undefined && { description }),
        updatedAt: new Date(),
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

    return NextResponse.json({
      success: true,
      message: 'Webhook secret updated successfully',
      secret: updated
    });

  } catch (error) {
    console.error(`Error updating webhook secret for endpoint ${endpoint}:`, error);
    return NextResponse.json(
      { success: false, error: 'Failed to update webhook secret' },
      { status: 500 }
    );
  }
}