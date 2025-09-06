import crypto from 'crypto';

// Encryption configuration
const ALGORITHM = 'aes-256-cbc';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16;  // 128 bits
const SALT_LENGTH = 64; // 512 bits
const ITERATIONS = 100000; // PBKDF2 iterations

// Get encryption key from environment variable
function getEncryptionKey(): Buffer {
  const masterKey = process.env.WEBHOOK_ENCRYPTION_KEY;
  if (!masterKey) {
    throw new Error('WEBHOOK_ENCRYPTION_KEY environment variable is required');
  }
  
  // Use PBKDF2 to derive a key from the master key
  const salt = Buffer.from('webhook-secrets-salt-v1', 'utf8');
  return crypto.pbkdf2Sync(masterKey, salt, ITERATIONS, KEY_LENGTH, 'sha256');
}

// Encrypt HMAC secret key
export function encryptSecret(plaintext: string): string {
  try {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    // Combine IV + encrypted data for CBC mode
    const result = iv.toString('hex') + ':' + encrypted;
    return result;
  } catch (error) {
    console.error('Error encrypting secret:', error);
    throw new Error(`Failed to encrypt webhook secret: ${error.message}`);
  }
}

// Decrypt HMAC secret key
export function decryptSecret(encryptedData: string): string {
  try {
    const key = getEncryptionKey();
    const parts = encryptedData.split(':');
    
    if (parts.length !== 2) {
      throw new Error('Invalid encrypted data format');
    }
    
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('Error decrypting secret:', error);
    throw new Error('Failed to decrypt webhook secret');
  }
}

// Validate HMAC secret key format
export function validateSecretKey(key: string): boolean {
  if (!key || typeof key !== 'string') {
    return false;
  }
  
  // Check for reasonable length (at least 32 characters)
  if (key.length < 32) {
    return false;
  }
  
  // Check if it looks like base64 encoded
  const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
  if (base64Regex.test(key)) {
    try {
      const decoded = Buffer.from(key, 'base64');
      return decoded.length >= 32; // At least 256 bits
    } catch {
      return false;
    }
  }
  
  // Check if it's a hex string
  const hexRegex = /^[a-fA-F0-9]+$/;
  if (hexRegex.test(key)) {
    return key.length >= 64; // At least 256 bits in hex
  }
  
  // For other formats, just check minimum length
  return key.length >= 32;
}

// Generate a secure random key for testing
export function generateTestSecret(): string {
  const randomBytes = crypto.randomBytes(32);
  return randomBytes.toString('base64');
}

// Hash key for logging (safe to log)
export function hashSecretForLogging(key: string): string {
  const hash = crypto.createHash('sha256');
  hash.update(key);
  return hash.digest('hex').substring(0, 16) + '...';
}