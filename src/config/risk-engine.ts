import type { RiskEngineConfig } from '@/types';

/**
 * Default configuration for the risk scoring engine.
 * This can be overridden with environment-specific config or database settings.
 */
export const defaultRiskConfig: RiskEngineConfig = {
  // Category weights (must sum to 1.0)
  weights: {
    developer: 0.25,
    location: 0.25,
    construction: 0.20,
    market: 0.15,
    regulatory: 0.15,
  },

  // Score thresholds for traffic light
  thresholds: {
    greenMax: 35, // 0-35 = green (low risk)
    yellowMax: 65, // 36-65 = yellow (medium risk)
    // Above 65 = red (high risk)
  },

  // Developer risk rules
  developerRules: {
    unknownDeveloperPenalty: 40, // Points added for unknown developer
    delayHistoryWeight: 2.0, // Multiplier for delay months
    reputationWeight: 0.5, // How much reputation score affects risk
    projectsCompletedBonus: 0.5, // Bonus per 10 completed projects (max 20)
  },

  // Location risk rules
  locationRules: {
    demandWeight: 0.3,
    infrastructureWeight: 0.25,
    vacancyWeight: 0.25,
    priceGrowthWeight: 0.2,
  },

  // Construction risk rules
  constructionRules: {
    offPlanPenalty: 25, // Additional risk for off-plan
    longHandoverPenalty: 3, // Points per year of wait
    progressBonus: 0.3, // Reduction based on construction progress
  },
};

/**
 * Country-specific risk adjustments
 */
export const countryRiskAdjustments: Record<string, number> = {
  AE: 0, // UAE - baseline
  US: -5, // Lower regulatory risk
  GB: -3, // Stable market
  TR: 15, // Higher currency/political risk
  EG: 20, // Higher overall risk
  SA: 5, // Moderate adjustments
  QA: 0, // Similar to UAE
  BH: 5, // Slightly higher
};

/**
 * Property type risk adjustments
 */
export const propertyTypeRiskAdjustments: Record<string, number> = {
  apartment: 0,
  studio: 5, // Slightly higher (liquidity)
  villa: -5, // Lower risk
  townhouse: -3,
  penthouse: 10, // Higher risk (niche market)
  duplex: 0,
  loft: 5,
  land: 15, // Higher risk
  commercial: 20, // Higher risk
  office: 25, // Higher risk
  retail: 30, // Highest risk
  warehouse: 20,
  other: 10,
};

/**
 * Status-based risk adjustments
 */
export const propertyStatusRiskAdjustments: Record<string, number> = {
  ready: 0, // Baseline - ready property
  resale: 5, // Slight uncertainty
  under_construction: 20, // Construction risk
  off_plan: 35, // Highest construction risk
  pre_launch: 40, // Highest risk
};

/**
 * Calculate handover risk based on months until delivery
 */
export function calculateHandoverRisk(monthsUntilHandover: number): number {
  if (monthsUntilHandover <= 0) return 0;
  if (monthsUntilHandover <= 6) return 5;
  if (monthsUntilHandover <= 12) return 10;
  if (monthsUntilHandover <= 24) return 20;
  if (monthsUntilHandover <= 36) return 30;
  return 40 + Math.min((monthsUntilHandover - 36) / 6, 20);
}

/**
 * Price point risk - very high or very low prices can indicate risk
 */
export function calculatePriceRisk(
  pricePerSqFt: number,
  marketAverage: number = 1500
): number {
  const deviation = Math.abs(pricePerSqFt - marketAverage) / marketAverage;
  if (deviation < 0.1) return 0;
  if (deviation < 0.2) return 5;
  if (deviation < 0.3) return 10;
  if (deviation < 0.5) return 20;
  return 30; // Significant deviation from market
}
