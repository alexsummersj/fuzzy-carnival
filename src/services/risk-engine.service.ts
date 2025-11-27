/**
 * Risk Scoring Engine
 * Calculates comprehensive risk scores for real estate investments
 */

import type {
  PropertyData,
  RiskScores,
  RiskCategoryScore,
  RiskFactor,
  TrafficLightColor,
} from '@/types';
import {
  defaultRiskConfig,
  countryRiskAdjustments,
  propertyTypeRiskAdjustments,
  propertyStatusRiskAdjustments,
  calculateHandoverRisk,
  calculatePriceRisk,
} from '@/config/risk-engine';
import { prisma } from '@/lib/db';
import { clamp, normalizeString } from '@/lib/utils';
import { evaluateDeveloperWithAI, evaluateLocationWithAI, evaluateCountryWithAI } from '@/services/llm.service';

/**
 * External data interfaces for risk enrichment
 */
interface DeveloperRiskData {
  found: boolean;
  reputationScore: number;
  riskScore: number;
  projectsCompleted: number;
  description: string;
  concerns: string[];
  positives: string[];
}

interface LocationRiskData {
  found: boolean;
  demandScore: number;
  infrastructureScore: number;
  riskScore: number;
  description: string;
  concerns: string[];
  positives: string[];
}

interface CountryRiskData {
  found: boolean;
  regulatoryRisk: number;
  legalSecurityScore: number;
  riskScore: number;
  description: string;
  concerns: string[];
  positives: string[];
}

/**
 * Main risk calculation function
 */
export async function calculateRiskScores(
  propertyData: PropertyData,
  language: string = 'en'
): Promise<RiskScores> {
  // Fetch enrichment data with language for AI responses
  const [developerData, locationData, countryData] = await Promise.all([
    fetchDeveloperData(propertyData.developerNormalized || propertyData.developer, propertyData.country, language),
    fetchLocationData(propertyData.countryCode, propertyData.city, propertyData.area, language),
    fetchCountryData(propertyData.countryCode, language),
  ]);

  // Calculate individual category scores
  const developerScore = calculateDeveloperRisk(propertyData, developerData);
  const locationScore = calculateLocationRisk(propertyData, locationData);
  const constructionScore = calculateConstructionRisk(propertyData);
  const marketScore = calculateMarketRisk(propertyData, locationData);
  const regulatoryScore = calculateRegulatoryRisk(propertyData, countryData);

  // Calculate weighted overall score
  const weights = defaultRiskConfig.weights;
  const overall = clamp(
    Math.round(
      developerScore.score * weights.developer +
      locationScore.score * weights.location +
      constructionScore.score * weights.construction +
      marketScore.score * weights.market +
      regulatoryScore.score * weights.regulatory
    ),
    0,
    100
  );

  // Determine traffic light
  const trafficLight = getTrafficLight(overall);

  return {
    developer: developerScore,
    location: locationScore,
    construction: constructionScore,
    market: marketScore,
    regulatory: regulatoryScore,
    overall,
    trafficLight,
  };
}

/**
 * Determine traffic light color based on overall score
 */
function getTrafficLight(score: number): TrafficLightColor {
  const { greenMax, yellowMax } = defaultRiskConfig.thresholds;
  if (score <= greenMax) return 'green';
  if (score <= yellowMax) return 'yellow';
  return 'red';
}

/**
 * Calculate developer risk score
 */
function calculateDeveloperRisk(
  propertyData: PropertyData,
  developerData: DeveloperRiskData
): RiskCategoryScore {
  const factors: RiskFactor[] = [];
  let baseScore = 50; // Start at medium risk

  if (!propertyData.developer) {
    // No developer mentioned - high risk
    factors.push({
      name: 'unknown_developer',
      impact: 'negative',
      score: defaultRiskConfig.developerRules.unknownDeveloperPenalty,
      description: 'Developer is not specified in the documents',
    });
    baseScore += defaultRiskConfig.developerRules.unknownDeveloperPenalty;
  } else if (!developerData.found) {
    // Developer mentioned but AI couldn't find information
    factors.push({
      name: 'unverified_developer',
      impact: 'negative',
      score: 20,
      description: `Developer "${propertyData.developer}" - limited information available`,
    });
    baseScore = 60;
  } else {
    // AI evaluated the developer - use AI risk score directly
    baseScore = developerData.riskScore;

    // Add reputation factor
    factors.push({
      name: 'ai_reputation',
      impact: developerData.reputationScore >= 70 ? 'positive' : developerData.reputationScore >= 50 ? 'neutral' : 'negative',
      score: developerData.riskScore,
      description: developerData.description,
    });

    // Add concerns as risk factors
    developerData.concerns.forEach((concern, index) => {
      if (index < 3) { // Limit to 3 concerns
        factors.push({
          name: `concern_${index + 1}`,
          impact: 'negative',
          score: 0, // Already included in riskScore
          description: concern,
        });
      }
    });

    // Add positives as factors
    developerData.positives.forEach((positive, index) => {
      if (index < 3) { // Limit to 3 positives
        factors.push({
          name: `positive_${index + 1}`,
          impact: 'positive',
          score: 0, // Already included in riskScore
          description: positive,
        });
      }
    });

    // Projects completed bonus
    if (developerData.projectsCompleted > 10) {
      const completedBonus = Math.min(
        Math.floor(developerData.projectsCompleted / 10) * defaultRiskConfig.developerRules.projectsCompletedBonus,
        15
      );
      factors.push({
        name: 'track_record',
        impact: 'positive',
        score: -completedBonus,
        description: `Approximately ${developerData.projectsCompleted} projects completed`,
      });
      baseScore -= completedBonus;
    }
  }

  const finalScore = clamp(Math.round(baseScore), 0, 100);

  return {
    score: finalScore,
    weight: defaultRiskConfig.weights.developer,
    factors,
    summary: generateDeveloperSummary(finalScore, developerData),
  };
}

/**
 * Calculate location risk score
 */
function calculateLocationRisk(
  propertyData: PropertyData,
  locationData: LocationRiskData
): RiskCategoryScore {
  const factors: RiskFactor[] = [];
  let baseScore = 50;

  if (!locationData.found) {
    factors.push({
      name: 'unknown_location',
      impact: 'negative',
      score: 20,
      description: 'Limited information available for this location',
    });
    baseScore = 55;
  } else {
    // Use AI risk score directly
    baseScore = locationData.riskScore;

    // Add main AI assessment
    factors.push({
      name: 'ai_location_assessment',
      impact: locationData.riskScore <= 40 ? 'positive' : locationData.riskScore <= 60 ? 'neutral' : 'negative',
      score: locationData.riskScore,
      description: locationData.description,
    });

    // Add concerns
    locationData.concerns.forEach((concern, index) => {
      if (index < 3) {
        factors.push({
          name: `location_concern_${index + 1}`,
          impact: 'negative',
          score: 0,
          description: concern,
        });
      }
    });

    // Add positives
    locationData.positives.forEach((positive, index) => {
      if (index < 3) {
        factors.push({
          name: `location_positive_${index + 1}`,
          impact: 'positive',
          score: 0,
          description: positive,
        });
      }
    });
  }

  const finalScore = clamp(Math.round(baseScore), 0, 100);

  return {
    score: finalScore,
    weight: defaultRiskConfig.weights.location,
    factors,
    summary: generateLocationSummary(finalScore, propertyData, locationData),
  };
}

/**
 * Calculate construction risk score
 */
function calculateConstructionRisk(propertyData: PropertyData): RiskCategoryScore {
  const factors: RiskFactor[] = [];
  let baseScore = 0;

  // Property status
  const statusAdjustment = propertyStatusRiskAdjustments[propertyData.status || 'off_plan'] || 20;
  factors.push({
    name: 'property_status',
    impact: statusAdjustment <= 10 ? 'positive' : statusAdjustment <= 25 ? 'neutral' : 'negative',
    score: statusAdjustment,
    description: `Property status: ${formatStatus(propertyData.status)}`,
  });
  baseScore += statusAdjustment;

  // Handover timeline risk
  if (propertyData.handoverDate) {
    const monthsUntilHandover = calculateMonthsUntilHandover(propertyData.handoverDate);
    if (monthsUntilHandover > 0) {
      const handoverRisk = calculateHandoverRisk(monthsUntilHandover);
      factors.push({
        name: 'handover_timeline',
        impact: handoverRisk <= 10 ? 'positive' : handoverRisk <= 20 ? 'neutral' : 'negative',
        score: handoverRisk,
        description: `Handover in approximately ${monthsUntilHandover} months`,
      });
      baseScore += handoverRisk * 0.5; // Weight down since status already accounts for this
    }
  } else if (propertyData.status === 'off_plan' || propertyData.status === 'under_construction') {
    factors.push({
      name: 'unknown_handover',
      impact: 'negative',
      score: 15,
      description: 'Handover date not specified',
    });
    baseScore += 15;
  }

  // Construction progress (if available)
  if (propertyData.constructionProgress !== undefined && propertyData.constructionProgress >= 0) {
    const progressBonus = propertyData.constructionProgress * defaultRiskConfig.constructionRules.progressBonus;
    factors.push({
      name: 'construction_progress',
      impact: propertyData.constructionProgress >= 50 ? 'positive' : 'neutral',
      score: -progressBonus,
      description: `Construction ${propertyData.constructionProgress}% complete`,
    });
    baseScore -= progressBonus;
  }

  const finalScore = clamp(Math.round(baseScore), 0, 100);

  return {
    score: finalScore,
    weight: defaultRiskConfig.weights.construction,
    factors,
    summary: generateConstructionSummary(finalScore, propertyData),
  };
}

/**
 * Calculate market/liquidity risk score
 */
function calculateMarketRisk(
  propertyData: PropertyData,
  locationData: LocationRiskData
): RiskCategoryScore {
  const factors: RiskFactor[] = [];
  let baseScore = 30; // Base market risk

  // Property type adjustment
  const typeAdjustment = propertyTypeRiskAdjustments[propertyData.propertyType || 'apartment'] || 0;
  if (typeAdjustment !== 0) {
    factors.push({
      name: 'property_type',
      impact: typeAdjustment < 0 ? 'positive' : typeAdjustment > 10 ? 'negative' : 'neutral',
      score: typeAdjustment,
      description: `Property type: ${formatPropertyType(propertyData.propertyType)}`,
    });
    baseScore += typeAdjustment;
  }

  // Price analysis
  if (propertyData.pricePerSqFt) {
    const priceRisk = calculatePriceRisk(propertyData.pricePerSqFt);
    if (priceRisk > 0) {
      factors.push({
        name: 'price_deviation',
        impact: priceRisk <= 10 ? 'neutral' : 'negative',
        score: priceRisk,
        description: 'Price deviates from market average',
      });
      baseScore += priceRisk * 0.5;
    }
  }

  // Use AI demand score for market assessment
  if (locationData.found && locationData.demandScore) {
    const demandImpact = locationData.demandScore >= 70 ? -10 :
                        locationData.demandScore >= 50 ? 0 : 10;
    factors.push({
      name: 'market_demand',
      impact: demandImpact < 0 ? 'positive' : demandImpact > 0 ? 'negative' : 'neutral',
      score: demandImpact,
      description: `Area demand score: ${locationData.demandScore}/100`,
    });
    baseScore += demandImpact;
  }

  // Bedroom configuration (affects liquidity)
  if (propertyData.bedrooms !== undefined) {
    if (propertyData.bedrooms === 1 || propertyData.bedrooms === 2) {
      factors.push({
        name: 'bedroom_config',
        impact: 'positive',
        score: -5,
        description: `${propertyData.bedrooms} bedroom - high liquidity`,
      });
      baseScore -= 5;
    } else if (propertyData.bedrooms >= 5) {
      factors.push({
        name: 'bedroom_config',
        impact: 'negative',
        score: 10,
        description: `${propertyData.bedrooms} bedrooms - niche market`,
      });
      baseScore += 10;
    }
  }

  const finalScore = clamp(Math.round(baseScore), 0, 100);

  return {
    score: finalScore,
    weight: defaultRiskConfig.weights.market,
    factors,
    summary: generateMarketSummary(finalScore, propertyData),
  };
}

/**
 * Calculate regulatory risk score
 */
function calculateRegulatoryRisk(
  propertyData: PropertyData,
  countryData: CountryRiskData
): RiskCategoryScore {
  const factors: RiskFactor[] = [];
  let baseScore = 40;

  if (!countryData.found) {
    factors.push({
      name: 'unknown_jurisdiction',
      impact: 'negative',
      score: 20,
      description: 'Limited regulatory information available',
    });
    baseScore = 50;
  } else {
    // Use AI risk score directly
    baseScore = countryData.riskScore;

    // Add main AI assessment
    factors.push({
      name: 'ai_regulatory_assessment',
      impact: countryData.riskScore <= 40 ? 'positive' : countryData.riskScore <= 60 ? 'neutral' : 'negative',
      score: countryData.riskScore,
      description: countryData.description,
    });

    // Add concerns
    countryData.concerns.forEach((concern, index) => {
      if (index < 3) {
        factors.push({
          name: `regulatory_concern_${index + 1}`,
          impact: 'negative',
          score: 0,
          description: concern,
        });
      }
    });

    // Add positives
    countryData.positives.forEach((positive, index) => {
      if (index < 3) {
        factors.push({
          name: `regulatory_positive_${index + 1}`,
          impact: 'positive',
          score: 0,
          description: positive,
        });
      }
    });
  }

  const finalScore = clamp(Math.round(baseScore), 0, 100);

  return {
    score: finalScore,
    weight: defaultRiskConfig.weights.regulatory,
    factors,
    summary: generateRegulatorySummary(finalScore, propertyData, countryData),
  };
}

/**
 * Fetch developer data using AI evaluation
 */
async function fetchDeveloperData(developerName?: string, country?: string, language?: string): Promise<DeveloperRiskData> {
  if (!developerName) {
    return {
      found: false,
      reputationScore: 50,
      riskScore: 50,
      projectsCompleted: 0,
      description: 'No developer specified',
      concerns: ['Developer not identified'],
      positives: [],
    };
  }

  try {
    // Use AI to evaluate the developer
    const aiEvaluation = await evaluateDeveloperWithAI(developerName, country, language);
    return aiEvaluation;
  } catch (error) {
    console.error('Error evaluating developer with AI:', error);
  }

  return {
    found: false,
    reputationScore: 50,
    riskScore: 50,
    projectsCompleted: 0,
    description: 'Evaluation failed',
    concerns: ['Unable to evaluate developer'],
    positives: [],
  };
}

/**
 * Fetch location data from database
 */
async function fetchLocationData(
  countryCode?: string,
  city?: string,
  area?: string,
  language?: string
): Promise<LocationRiskData> {
  if (!city) {
    return {
      found: false,
      demandScore: 50,
      infrastructureScore: 50,
      riskScore: 50,
      description: 'Location not specified',
      concerns: [],
      positives: [],
    };
  }

  try {
    // Use AI to evaluate the location
    const countryName = getCountryName(countryCode);
    const aiEvaluation = await evaluateLocationWithAI(city, area, countryName, language);
    return aiEvaluation;
  } catch (error) {
    console.error('Error evaluating location with AI:', error);
  }

  return {
    found: false,
    demandScore: 50,
    infrastructureScore: 50,
    riskScore: 50,
    description: 'Evaluation failed',
    concerns: [],
    positives: [],
  };
}

/**
 * Get country name from code
 */
function getCountryName(code?: string): string {
  const countries: Record<string, string> = {
    AE: 'United Arab Emirates',
    GB: 'United Kingdom',
    US: 'United States',
    UK: 'United Kingdom',
  };
  return countries[code || ''] || code || '';
}

/**
 * Fetch country risk data using AI
 */
async function fetchCountryData(countryCode?: string, language?: string): Promise<CountryRiskData> {
  const countryName = getCountryName(countryCode);

  if (!countryName) {
    return {
      found: false,
      regulatoryRisk: 50,
      legalSecurityScore: 50,
      riskScore: 50,
      description: 'Country not specified',
      concerns: [],
      positives: [],
    };
  }

  try {
    // Use AI to evaluate the country
    const aiEvaluation = await evaluateCountryWithAI(countryName, language);
    return aiEvaluation;
  } catch (error) {
    console.error('Error evaluating country with AI:', error);
  }

  return {
    found: false,
    regulatoryRisk: 50,
    legalSecurityScore: 50,
    riskScore: 50,
    description: 'Evaluation failed',
    concerns: [],
    positives: [],
  };
}

/**
 * Calculate months until handover date
 */
function calculateMonthsUntilHandover(handoverDate: string): number {
  const now = new Date();

  // Try to parse the date
  const monthYearMatch = handoverDate.match(/([A-Za-z]+)\s+(\d{4})/);
  if (monthYearMatch) {
    const months: Record<string, number> = {
      january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
      july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
    };
    const month = months[monthYearMatch[1].toLowerCase()] ?? 0;
    const year = parseInt(monthYearMatch[2], 10);
    const handover = new Date(year, month);
    return Math.max(0, Math.round((handover.getTime() - now.getTime()) / (1000 * 60 * 60 * 24 * 30)));
  }

  // Try year only
  const yearMatch = handoverDate.match(/\d{4}/);
  if (yearMatch) {
    const year = parseInt(yearMatch[0], 10);
    const handover = new Date(year, 6); // Assume mid-year
    return Math.max(0, Math.round((handover.getTime() - now.getTime()) / (1000 * 60 * 60 * 24 * 30)));
  }

  return 24; // Default to 2 years if can't parse
}

/**
 * Format property status for display
 */
function formatStatus(status?: string): string {
  const statusMap: Record<string, string> = {
    ready: 'Ready / Move-in',
    off_plan: 'Off-Plan',
    under_construction: 'Under Construction',
    pre_launch: 'Pre-Launch',
    resale: 'Resale',
  };
  return statusMap[status || ''] || 'Unknown';
}

/**
 * Format property type for display
 */
function formatPropertyType(type?: string): string {
  if (!type) return 'Unknown';
  return type.charAt(0).toUpperCase() + type.slice(1).replace(/_/g, ' ');
}

/**
 * Generate developer risk summary
 */
function generateDeveloperSummary(score: number, data: DeveloperRiskData): string {
  if (!data.found) {
    return 'Limited information available about this developer. Exercise additional caution and conduct independent research.';
  }

  // Use AI-generated description if available
  if (data.description && data.description !== 'No description available') {
    return data.description;
  }

  if (score <= 30) {
    return `Well-established developer with strong track record (${data.projectsCompleted > 0 ? `~${data.projectsCompleted} projects, ` : ''}${data.reputationScore}/100 reputation).`;
  }
  if (score <= 50) {
    return `Developer has moderate track record. Reputation score: ${data.reputationScore}/100.`;
  }
  return `Developer has limited track record or concerns identified. Recommend thorough due diligence.`;
}

/**
 * Generate location risk summary
 */
function generateLocationSummary(score: number, property: PropertyData, data: LocationRiskData): string {
  const location = [property.area, property.city, property.country].filter(Boolean).join(', ');

  if (!data.found) {
    return `Limited data available for ${location}. Consider local market research.`;
  }

  // Use AI-generated description if available
  if (data.description && data.description !== 'Evaluation failed') {
    return data.description;
  }

  if (score <= 30) {
    return `${location} is a high-demand area with strong infrastructure.`;
  }
  if (score <= 50) {
    return `${location} shows moderate demand and infrastructure.`;
  }
  return `${location} may face challenges. Consider exit strategy carefully.`;
}

/**
 * Generate construction risk summary
 */
function generateConstructionSummary(score: number, property: PropertyData): string {
  const status = formatStatus(property.status);
  if (score <= 20) {
    return `${status} property with minimal construction risk.`;
  }
  if (score <= 40) {
    return `${status} property. ${property.handoverDate ? `Expected handover: ${property.handoverDate}.` : ''} Standard construction risk for this category.`;
  }
  return `${status} property with extended timeline. Construction delays are possible. Consider escrow protection.`;
}

/**
 * Generate market risk summary
 */
function generateMarketSummary(score: number, property: PropertyData): string {
  const type = formatPropertyType(property.propertyType);
  if (score <= 30) {
    return `${type} in this segment typically has good liquidity and stable demand.`;
  }
  if (score <= 50) {
    return `${type} has moderate market risk. Resale may require competitive pricing.`;
  }
  return `${type} may face liquidity challenges. Consider longer holding period or rental strategy.`;
}

/**
 * Generate regulatory risk summary
 */
function generateRegulatorySummary(score: number, property: PropertyData, data: CountryRiskData): string {
  const country = property.country || 'this jurisdiction';

  if (!data.found) {
    return `Limited regulatory data for ${country}. Consult local legal experts.`;
  }

  // Use AI-generated description if available
  if (data.description && data.description !== 'Evaluation failed') {
    return data.description;
  }

  if (score <= 30) {
    return `${country} has stable regulatory environment with strong legal protections.`;
  }
  if (score <= 50) {
    return `${country} has moderate regulatory framework.`;
  }
  return `Higher regulatory risk in ${country}. Consider legal consultation.`;
}

export { getTrafficLight };
