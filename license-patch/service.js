import { setRegistrationAdmission, setRegistrationEmailPolicy, trustedOrigins } from '@repo/auth';
import { getSetting, setSetting } from '@repo/db';
import { setRunRefusal } from 'api/src/modules/agents/core/run-refusal';
import { setInviteEmailPolicy } from 'api/src/modules/invites/email-policy';
import { setScimEmailPolicy } from 'api/src/modules/scim/email-policy';
import { setOwnedWorkspaceLimit } from 'api/src/shared/limits';
import { setRequestTracker } from 'api/src/shared/request-tracker';
import { HttpError } from 'api/src/shared/lib';
import { refuseOverBudget } from '../agent-budgets/service';
import { setProSchedules } from '../agent-schedules';
import { setProWorkflows } from '../agent-workflows';
import { setProWebhookEvents } from '../agent-workflows/run-finished';
import { setProHttpTools } from '../http-tools';
import { trackRequest } from '../audit-log/tracker';
import { admitsInvite, admitsRegistration, admitsScim } from '../email-domains/service';
import { admitSsoSignUp } from '../sso/service';
import { setFormNotices } from '../forms/notify';

// PATCHED (local deployment): signature verification, the domain check, the
// expiry check, and every license-server request have been removed. A
// "<base64url JSON>.<base64url>" string whose payload is an object with the
// string fields customer, domain and expiresAt is accepted as a license
// (that shape is what the API's LicenseResponse schema requires — without
// the signature gate, anything else would fail response validation on
// GET/PUT /license). Pro stays active as long as the setting is present. No
// network call is ever made.

const CERTIFICATE_SETTING = 'license';
const ACTIVATION_SETTING = 'license.key';
let license = null;
let active = false;

export function setLicensePublicKey() {
  // PATCHED: no-op, kept so every original import keeps working.
}

export function instanceDomain() {
  return new URL(trustedOrigins[0]).hostname;
}

function licenseShape(parsed) {
  return (
    typeof parsed === 'object' &&
    parsed !== null &&
    !Array.isArray(parsed) &&
    typeof parsed.customer === 'string' &&
    typeof parsed.domain === 'string' &&
    typeof parsed.expiresAt === 'string'
  );
}

function readCertificate(value) {
  const [payload, signature] = value.trim().split('.');
  if (!payload || !signature) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return licenseShape(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isValid(cert) {
  // PATCHED: domain and expiresAt are no longer checked.
  return cert != null;
}

export function applyCertificate(value) {
  license = value ? readCertificate(value) : null;
  const next = isValid(license);
  if (next === active) {
    return;
  }
  active = next;
  setOwnedWorkspaceLimit(active ? 0 : 1);
  setProSchedules(active);
  setProWorkflows(active);
  setProHttpTools(active);
  setProWebhookEvents(active);
  setRunRefusal(active ? refuseOverBudget : undefined);
  setRegistrationEmailPolicy(active ? admitsRegistration : undefined);
  setInviteEmailPolicy(active ? admitsInvite : undefined);
  setScimEmailPolicy(active ? admitsScim : undefined);
  setRegistrationAdmission(active ? admitSsoSignUp : undefined);
  setRequestTracker(active ? trackRequest : undefined);
  setFormNotices(active);
}

export function proActive() {
  return active;
}

export function requireLicense() {
  if (!active) {
    throw new HttpError(403, 'This needs a Pro license');
  }
}

export async function loadLicense() {
  applyCertificate(await getSetting(CERTIFICATE_SETTING));
}

export function licenseStatus() {
  return {
    active: active,
    license: license,
  };
}

export async function saveLicenseKey(value) {
  const trimmed = value.trim();
  const cert = readCertificate(trimmed);
  if (!cert) {
    throw new HttpError(400, 'This is not a license key');
  }
  // PATCHED: no activation-key exchange, no domain check, no expiry check.
  await setSetting(CERTIFICATE_SETTING, trimmed);
  await setSetting(ACTIVATION_SETTING, '');
  applyCertificate(trimmed);
  return licenseStatus();
}

export async function renewLicense() {
  // PATCHED: renewal removed. Certificates never expire locally and no
  // request is made to any license server.
}
