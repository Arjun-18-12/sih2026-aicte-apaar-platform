/**
 * APAAR Verification Adapter
 * 
 * THIS IS A MOCK/PROTOTYPE IMPLEMENTATION.
 * All verification results are SIMULATED and do NOT reflect real APAAR data.
 * No real student data is sent to any external service.
 * 
 * Integration point: Replace MockVerificationProvider with OfficialApaarProvider
 * once authorized API credentials and documentation are available from APAAR/ABC.
 */

import type { APAARVerificationStatus } from '../types';
import { validateApaarFormat, sleep } from '../lib/utils';

export interface VerificationRequest {
  apaar_id: string;
  full_name: string;
  date_of_birth?: string;
}

export interface VerificationResponse {
  apaar_id: string;
  outcome: APAARVerificationStatus;
  is_simulated: boolean;
  provider: 'mock' | 'apaar_official';
  message: string;
  verified_at: string;
  request_reference: string;
}

export interface VerificationProvider {
  verify(req: VerificationRequest): Promise<VerificationResponse>;
  name: 'mock' | 'apaar_official';
}

export class MockVerificationProvider implements VerificationProvider {
  name: 'mock' = 'mock';

  async verify(req: VerificationRequest): Promise<VerificationResponse> {
    await sleep(300 + Math.random() * 400);

    const base: Omit<VerificationResponse, 'outcome' | 'message'> = {
      apaar_id: req.apaar_id,
      is_simulated: true,
      provider: 'mock',
      verified_at: new Date().toISOString(),
      request_reference: `MOCK-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    };

    if (!validateApaarFormat(req.apaar_id)) {
      return { ...base, outcome: 'invalid', message: '[SIMULATED] APAAR ID format invalid: must be 12 digits.' };
    }

    const last2 = req.apaar_id.slice(-2);
    const lastDigit = parseInt(req.apaar_id.slice(-1));

    if (last2 === '00') return { ...base, outcome: 'invalid', message: '[SIMULATED] APAAR record not found or deactivated.' };
    if (last2 === '99') return { ...base, outcome: 'unavailable', message: '[SIMULATED] APAAR verification service temporarily unavailable.' };
    if (lastDigit === 5) return { ...base, outcome: 'pending', message: '[SIMULATED] APAAR verification initiated. Result pending.' };

    return { ...base, outcome: 'verified', message: '[SIMULATED] APAAR ID format valid. Identity verification simulated as VERIFIED. This is NOT an official APAAR verification.' };
  }
}

export class OfficialApaarProvider implements VerificationProvider {
  name: 'apaar_official' = 'apaar_official';

  async verify(_req: VerificationRequest): Promise<VerificationResponse> {
    throw new Error(
      'Official APAAR API integration is not configured. ' +
      'Provide authorized API credentials and implement this provider ' +
      'once official access is granted.'
    );
  }
}

export const apaarVerificationProvider: VerificationProvider = new MockVerificationProvider();

export async function verifyApaarId(req: VerificationRequest): Promise<VerificationResponse> {
  if (!req.apaar_id) {
    return {
      apaar_id: '',
      outcome: 'pending',
      is_simulated: true,
      provider: 'mock',
      message: '[SIMULATED] No APAAR ID provided. Verification skipped.',
      verified_at: new Date().toISOString(),
      request_reference: 'SKIP-' + Date.now(),
    };
  }
  return apaarVerificationProvider.verify(req);
}
