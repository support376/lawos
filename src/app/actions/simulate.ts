'use server';

import { simulateRepayment, type RepaymentInput } from '@/lib/calculators/repayment';
import { recommendPath } from '@/lib/ai/recommend';

export async function simulateRepaymentAction(input: RepaymentInput) {
  return simulateRepayment(input);
}

export async function recommendPathAction(input: {
  monthlyIncome: number;
  familySize: number;
  unsecuredDebt: number;
  securedDebt?: number;
  assetValue?: number;
  hasStableJob: boolean;
  hasLitigationInProgress?: boolean;
  prefOccupationalRisk?: boolean;
  notes?: string;
}) {
  try {
    return await recommendPath(input);
  } catch (e) {
    throw new Error(e instanceof Error ? e.message : '추천 실패');
  }
}
