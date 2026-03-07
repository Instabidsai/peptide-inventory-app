/**
 * AES-256-GCM encryption/decryption for payment pool operator keys.
 * Uses Web Crypto API (available in Deno edge functions).
 *
 * Requires POOL_ENCRYPTION_KEY env var (64-char hex = 32 bytes).
 */

const ALGORITHM = 'AES-GCM';
const IV_LENGTH = 12; // 96 bits recommended for AES-GCM

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function getKey(): Promise<CryptoKey> {
  const keyHex = Deno.env.get('POOL_ENCRYPTION_KEY');
  if (!keyHex || keyHex.length !== 64) {
    throw new Error('POOL_ENCRYPTION_KEY must be a 64-character hex string (32 bytes)');
  }
  return crypto.subtle.importKey(
    'raw',
    hexToBytes(keyHex),
    { name: ALGORITHM },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * Encrypt a plaintext string. Returns hex-encoded "iv:ciphertext" string.
 */
export async function encryptKey(plaintext: string): Promise<string> {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    encoded,
  );
  return `${bytesToHex(iv)}:${bytesToHex(new Uint8Array(ciphertext))}`;
}

/**
 * Decrypt a "iv:ciphertext" hex string back to plaintext.
 */
export async function decryptKey(encrypted: string): Promise<string> {
  const [ivHex, ctHex] = encrypted.split(':');
  if (!ivHex || !ctHex) {
    throw new Error('Invalid encrypted format — expected "iv:ciphertext"');
  }
  const key = await getKey();
  const iv = hexToBytes(ivHex);
  const ciphertext = hexToBytes(ctHex);
  const plaintext = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv },
    key,
    ciphertext,
  );
  return new TextDecoder().decode(plaintext);
}
