import { getSetting } from '@repo/db';

// PATCHED (local deployment): signature verification, the domain check, the
// expiry check, and any license-server dependency have been removed. A
// "<base64url JSON>.<base64url>" string whose payload is an object with the
// string fields customer, domain and expiresAt (the LicenseResponse shape
// the api serves) is treated as a valid license.

export const PUBLIC_KEY =
  '-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAwABjQKu1P94eV4X/34ikHT0CiEw/THpbhFeSxRlD2bs=\n-----END PUBLIC KEY-----';

const CERTIFICATE_SETTING = 'license';
let active = false;

export function setLicensePublicKey() {
  // PATCHED: no-op, kept so every original import keeps working.
}

export function certificateValid(value) {
  // PATCHED: no signature, domain, or expiry check. The payload must be an
  // object with the string fields customer, domain and expiresAt.
  const [payload, signature] = (value ?? '').trim().split('.');
  if (!payload || !signature) {
    return false;
  }
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return (
      typeof parsed === 'object' &&
      parsed !== null &&
      !Array.isArray(parsed) &&
      typeof parsed.customer === 'string' &&
      typeof parsed.domain === 'string' &&
      typeof parsed.expiresAt === 'string'
    );
  } catch {
    return false;
  }
}

export async function loadLicense() {
  active = certificateValid(await getSetting(CERTIFICATE_SETTING));
}

export function proActive() {
  return active;
}
