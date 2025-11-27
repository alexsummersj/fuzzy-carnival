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
import { evaluateDeveloperWithAI } from '@/services/llm.service';

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
  vacancyRate: number | null;
  priceGrowthYoY: number | null;
}

interface CountryRiskData {
  found: boolean;
  regulatoryRisk: number;
  legalSecurityScore: number;
  geopoliticalRisk: number;
  currencyRisk: number;
}

/**
 * Main risk calculation function
 */
export async function calculateRiskScores(
  propertyData: PropertyData
): Promise<RiskScores> {
  // Fetch enrichment data
  const [developerData, locationData, countryData] = await Promise.all([
    fetchDeveloperData(propertyData.developerNormalized || propertyData.developer, propertyData.country),
    fetchLocationData(propertyData.countryCode, propertyData.city, propertyData.area),
    fetchCountryData(propertyData.countryCode),
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
      score: 30,
      description: 'Location is not in our database - limited data available',
    });
    baseScore = 60;
  } else {
    // Demand score
    const demandImpact = (100 - locationData.demandScore) * defaultRiskConfig.locationRules.demandWeight;
    factors.push({
      name: 'demand_score',
      impact: locationData.demandScore >= 70 ? 'positive' : locationData.demandScore >= 50 ? 'neutral' : 'negative',
      score: demandImpact,
      description: `Area demand rating: ${locationData.demandScore}/100`,
    });

    // Infrastructure score
    const infraImpact = (100 - locationData.infrastructureScore) * defaultRiskConfig.locationRules.infrastructureWeight;
    factors.push({
      name: 'infrastructure',
      impact: locationData.infrastructureScore >= 70 ? 'positive' : 'neutral',
      score: infraImpact,
      description: `Infrastructure score: ${locationData.infrastructureScore}/100`,
    });

    // Vacancy rate
    if (locationData.vacancyRate !== null) {
      const vacancyImpact = locationData.vacancyRate * defaultRiskConfig.locationRules.vacancyWeight;
      factors.push({
        name: 'vacancy_rate',
        impact: locationData.vacancyRate <= 5 ? 'positive' : locationData.vacancyRate <= 10 ? 'neutral' : 'negative',
        score: vacancyImpact,
        description: `Area vacancy rate: ${locationData.vacancyRate}%`,
      });
    }

    baseScore = demandImpact + infraImpact + (locationData.vacancyRate || 0) * 0.5;
  }

  // Country adjustment
  const countryAdjustment = countryRiskAdjustments[propertyData.countryCode || 'AE'] || 0;
  if (countryAdjustment !== 0) {
    factors.push({
      name: 'country_factor',
      impact: countryAdjustment < 0 ? 'positive' : 'negative',
      score: countryAdjustment,
      description: `Country-specific adjustment: ${countryAdjustment > 0 ? '+' : ''}${countryAdjustment}`,
    });
    baseScore += countryAdjustment;
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

  // Price growth trend
  if (locationData.found && locationData.priceGrowthYoY !== null) {
    const growthImpact = locationData.priceGrowthYoY > 5 ? -10 :
                        locationData.priceGrowthYoY > 0 ? -5 :
                        locationData.priceGrowthYoY > -5 ? 5 : 15;
    factors.push({
      name: 'price_trend',
      impact: growthImpact < 0 ? 'positive' : growthImpact > 5 ? 'negative' : 'neutral',
      score: growthImpact,
      description: `Area price growth: ${locationData.priceGrowthYoY}% YoY`,
    });
    baseScore += growthImpact;
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
  let baseScore = 30;

  if (!countryData.found) {
    factors.push({
      name: 'unknown_jurisdiction',
      impact: 'negative',
      score: 40,
      description: 'Jurisdiction not in our database',
    });
    baseScore = 60;
  } else {
    // Regulatory risk
    factors.push({
      name: 'regulatory_environment',
      impact: countryData.regulatoryRisk <= 30 ? 'positive' : countryData.regulatoryRisk <= 50 ? 'neutral' : 'negative',
      score: countryData.regulatoryRisk * 0.3,
      description: `Regulatory risk score: ${countryData.regulatoryRisk}/100`,
    });

    // Legal security
    const legalImpact = (100 - countryData.legalSecurityScore) * 0.3;
    factors.push({
      name: 'legal_security',
      impact: countryData.legalSecurityScore >= 70 ? 'positive' : 'neutral',
      score: legalImpact,
      description: `Legal security score: ${countryData.legalSecurityScore}/100`,
    });

    // Geopolitical risk
    factors.push({
      name: 'geopolitical',
      impact: countryData.geopoliticalRisk <= 30 ? 'positive' : countryData.geopoliticalRisk <= 50 ? 'neutral' : 'negative',
      score: countryData.geopoliticalRisk * 0.2,
      description: `Geopolitical stability: ${100 - countryData.geopoliticalRisk}/100`,
    });

    // Currency risk
    factors.push({
      name: 'currency',
      impact: countryData.currencyRisk <= 20 ? 'positive' : countryData.currencyRisk <= 40 ? 'neutral' : 'negative',
      score: countryData.currencyRisk * 0.2,
      description: `Currency stability: ${100 - countryData.currencyRisk}/100`,
    });

    baseScore = (countryData.regulatoryRisk * 0.3) +
                ((100 - countryData.legalSecurityScore) * 0.3) +
                (countryData.geopoliticalRisk * 0.2) +
                (countryData.currencyRisk * 0.2);
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
async function fetchDeveloperData(developerName?: string, country?: string): Promise<DeveloperRiskData> {
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
    const aiEvaluation = await evaluateDeveloperWithAI(developerName, country);
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
  area?: string
): Promise<LocationRiskData> {
  if (!city) {
    return {
      found: false,
      demandScore: 50,
      infrastructureScore: 50,
      vacancyRate: null,
      priceGrowthYoY: null,
    };
  }

  try {
    // Try to find exact area match first
    if (area) {
      const normalizedKey = `${(countryCode || 'ae').toLowerCase()}-${city.toLowerCase().replace(/\s+/g, '')}-${area.toLowerCase().replace(/\s+/g, '')}`;
      const location = await prisma.locationProfile.findUnique({
        where: { normalizedKey },
      });

      if (location) {
        return {
          found: true,
          demandScore: location.demandScore,
          infrastructureScore: location.infrastructureScore,
          vacancyRate: location.vacancyRate,
          priceGrowthYoY: location.priceGrowthYoY,
        };
      }
    }

    // Try city-level match
    const cityLocation = await prisma.locationProfile.findFirst({
      where: {
        city: { equals: city, mode: 'insensitive' },
        country: countryCode || 'AE',
      },
    });

    if (cityLocation) {
      return {
        found: true,
        demandScore: cityLocation.demandScore,
        infrastructureScore: cityLocation.infrastructureScore,
        vacancyRate: cityLocation.vacancyRate,
        priceGrowthYoY: cityLocation.priceGrowthYoY,
      };
    }
  } catch (error) {
    console.error('Error fetching location data:', error);
  }

  return {
    found: false,
    demandScore: 50,
    infrastructureScore: 50,
    vacancyRate: null,
    priceGrowthYoY: null,
  };
}

/**
 * Fetch country risk data from database
 */
async function fetchCountryData(countryCode?: string): Promise<CountryRiskData> {
  if (!countryCode) {
    return {
      found: false,
      regulatoryRisk: 50,
      legalSecurityScore: 50,
      geopoliticalRisk: 50,
      currencyRisk: 50,
    };
  }

  try {
    const country = await prisma.countryRiskProfile.findUnique({
      where: { countryCode },
    });

    if (country) {
      return {
        found: true,
        regulatoryRisk: country.regulatoryRisk,
        legalSecurityScore: country.legalSecurityScore,
        geopoliticalRisk: country.geopoliticalRisk,
        currencyRisk: country.currencyRisk,
      };
    }
  } catch (error) {
    console.error('Error fetching country data:', error);
  }

  return {
    found: false,
    regulatoryRisk: 50,
    legalSecurityScore: 50,
    geopoliticalRisk: 50,
    currencyRisk: 50,
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
  if (score <= 30) {
    return `${location} is a high-demand area with strong infrastructure and low vacancy.`;
  }
  if (score <= 50) {
    return `${location} shows moderate demand. Infrastructure is developing.`;
  }
  return `${location} may face higher vacancy or limited demand. Consider exit strategy carefully.`;
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
  if (score <= 30) {
    return `${country} has stable regulatory environment with strong legal protections for property owners.`;
  }
  if (score <= 50) {
    return `${country} has moderate regulatory framework. Ensure proper legal documentation.`;
  }
  return `Higher regulatory or currency risk in ${country}. Consider hedging strategies and legal consultation.`;
}

export { getTrafficLight };
