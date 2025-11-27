/**
 * Text Parsing and Normalization Service
 * Parses free-text property descriptions from brokers, emails, WhatsApp messages, etc.
 * and extracts structured property data.
 */

import type { PropertyData, PropertyType, PropertyStatus, PaymentPlan } from '@/types';
import { extractNumber, normalizeString, sqmToSqft, sqftToSqm } from '@/lib/utils';
import { tryAIExtraction } from './llm.service';

export interface TextParseResult {
  propertyData: Partial<PropertyData>;
  confidence: number;
  extractedFields: string[];
  warnings: string[];
}

/**
 * Parse free-text input and extract structured property data
 */
export function parsePropertyText(text: string): TextParseResult {
  const cleanedText = preprocessText(text);
  const extractedFields: string[] = [];
  const warnings: string[] = [];

  const propertyData: Partial<PropertyData> = {
    sourceType: 'text',
    rawText: text,
  };

  // Extract all fields
  const developer = extractDeveloperFromText(cleanedText);
  if (developer) {
    propertyData.developer = developer;
    propertyData.developerNormalized = normalizeString(developer);
    extractedFields.push('developer');
  }

  const propertyName = extractPropertyNameFromText(cleanedText);
  if (propertyName) {
    propertyData.name = propertyName;
    extractedFields.push('name');
  }

  const location = extractLocationFromText(cleanedText);
  if (location.city) {
    propertyData.city = location.city;
    propertyData.area = location.area;
    propertyData.country = location.country;
    propertyData.countryCode = location.countryCode;
    propertyData.neighborhood = location.neighborhood;
    extractedFields.push('location');
  }

  const propertyType = extractPropertyTypeFromText(cleanedText);
  if (propertyType) {
    propertyData.propertyType = propertyType;
    extractedFields.push('propertyType');
  }

  const bedrooms = extractBedroomsFromText(cleanedText);
  if (bedrooms !== null) {
    propertyData.bedrooms = bedrooms;
    extractedFields.push('bedrooms');
  }

  const bathrooms = extractBathroomsFromText(cleanedText);
  if (bathrooms !== null) {
    propertyData.bathrooms = bathrooms;
    extractedFields.push('bathrooms');
  }

  const area = extractAreaFromText(cleanedText);
  if (area.sqft || area.sqm) {
    propertyData.areaSqFt = area.sqft;
    propertyData.areaSqM = area.sqm;
    extractedFields.push('area');
  }

  const price = extractPriceFromText(cleanedText);
  if (price.amount) {
    propertyData.price = price.amount;
    propertyData.currency = price.currency || 'AED';
    extractedFields.push('price');

    if (propertyData.areaSqFt && propertyData.price) {
      propertyData.pricePerSqFt = Math.round(propertyData.price / propertyData.areaSqFt);
    }
  }

  const paymentPlan = extractPaymentPlanFromText(cleanedText);
  if (paymentPlan) {
    propertyData.paymentPlan = paymentPlan;
    extractedFields.push('paymentPlan');
  }

  const handoverDate = extractHandoverFromText(cleanedText);
  if (handoverDate) {
    propertyData.handoverDate = handoverDate;
    extractedFields.push('handoverDate');
  }

  const status = extractStatusFromText(cleanedText);
  if (status) {
    propertyData.status = status;
    extractedFields.push('status');
  }

  const floor = extractFloorFromText(cleanedText);
  if (floor !== null) {
    propertyData.floor = floor;
    extractedFields.push('floor');
  }

  const view = extractViewFromText(cleanedText);
  if (view) {
    propertyData.view = view;
    extractedFields.push('view');
  }

  const amenities = extractAmenitiesFromText(cleanedText);
  if (amenities.length > 0) {
    propertyData.amenities = amenities;
    extractedFields.push('amenities');
  }

  const parking = extractParkingFromText(cleanedText);
  if (parking !== null) {
    propertyData.parkingSpaces = parking;
    extractedFields.push('parking');
  }

  // Validate and add warnings
  if (propertyData.price && propertyData.areaSqFt) {
    const ppsf = propertyData.price / propertyData.areaSqFt;
    if (ppsf < 100 || ppsf > 10000) {
      warnings.push('Price per square foot seems unusual - please verify');
    }
  }

  if (propertyData.bedrooms && propertyData.areaSqFt) {
    const avgSizePerBed = propertyData.areaSqFt / (propertyData.bedrooms || 1);
    if (avgSizePerBed < 200 || avgSizePerBed > 3000) {
      warnings.push('Area per bedroom seems unusual - please verify');
    }
  }

  // Calculate confidence
  const requiredFields = ['developer', 'location', 'price', 'area', 'propertyType'];
  const foundRequired = requiredFields.filter(f => extractedFields.includes(f));
  const confidence = Math.round((foundRequired.length / requiredFields.length) * 100);

  return {
    propertyData,
    confidence,
    extractedFields,
    warnings,
  };
}

/**
 * Preprocess text for better parsing
 */
function preprocessText(text: string): string {
  return text
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    // Normalize quotes
    .replace(/[""'']/g, '"')
    // Normalize dashes
    .replace(/[–—]/g, '-')
    // Remove common noise phrases
    .replace(/(?:for sale|available|hot deal|exclusive|limited time)/gi, '')
    .trim();
}

/**
 * Extract developer name
 */
function extractDeveloperFromText(text: string): string | null {
  // Known developers
  const knownDevelopers = [
    'Emaar', 'DAMAC', 'Nakheel', 'Sobha', 'Meraas', 'Aldar', 'Azizi',
    'Danube', 'Binghatti', 'Omniyat', 'Select Group', 'Ellington',
    'Dubai Properties', 'MAG', 'Samana', 'Tiger', 'Deyaar',
    'Reportage', 'Bloom', 'RAK Properties', 'Union Properties',
  ];

  const lowerText = text.toLowerCase();
  for (const dev of knownDevelopers) {
    if (lowerText.includes(dev.toLowerCase())) {
      return dev;
    }
  }

  // Pattern matching
  const patterns = [
    /(?:by|from|developer[:\s]*)\s*([A-Z][A-Za-z\s&]+(?:Properties|Realty|Developments?|Group)?)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const name = match[1].trim();
      if (name.length > 2 && name.length < 50) {
        return name;
      }
    }
  }

  return null;
}

/**
 * Extract property/project name
 */
function extractPropertyNameFromText(text: string): string | null {
  // Look for project names in common formats
  const patterns = [
    /(?:project|tower|building|residence|@)\s*[:\-]?\s*([A-Z][A-Za-z0-9\s]+)/i,
    /^([A-Z][A-Za-z0-9\s]{2,30})(?:\s+by|\s+in|\s+at|\s+-|\n)/m,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const name = match[1].trim();
      // Exclude common non-name words
      const excluded = ['hello', 'hi', 'dear', 'good', 'morning', 'evening', 'the'];
      if (!excluded.includes(name.toLowerCase()) && name.length > 2) {
        return name;
      }
    }
  }

  return null;
}

/**
 * Extract location information
 */
function extractLocationFromText(text: string): {
  country?: string;
  countryCode?: string;
  city?: string;
  area?: string;
  neighborhood?: string;
} {
  const result: {
    country?: string;
    countryCode?: string;
    city?: string;
    area?: string;
    neighborhood?: string;
  } = {};

  const lowerText = text.toLowerCase();

  // UAE locations database
  const uaeLocations: Record<string, { areas: string[]; city: string }> = {
    dubai: {
      city: 'Dubai',
      areas: [
        'downtown', 'marina', 'palm jumeirah', 'palm', 'jbr', 'jumeirah beach',
        'business bay', 'difc', 'jvc', 'jvt', 'jumeirah village',
        'dubai hills', 'arabian ranches', 'emirates hills', 'creek harbour',
        'mbr city', 'meydan', 'al barsha', 'jumeirah', 'sports city',
        'motor city', 'silicon oasis', 'discovery gardens', 'dubai land',
        'damac hills', 'sobha hartland', 'town square', 'al furjan',
        'production city', 'studio city', 'arjan', 'al jaddaf',
        'culture village', 'healthcare city', 'deira', 'bur dubai',
      ],
    },
    'abu dhabi': {
      city: 'Abu Dhabi',
      areas: [
        'saadiyat', 'yas island', 'yas', 'reem island', 'raha beach',
        'corniche', 'maryah island', 'khalifa city', 'al reef',
        'al raha', 'al ghadeer', 'masdar', 'hidd al saadiyat',
      ],
    },
    sharjah: {
      city: 'Sharjah',
      areas: ['al khan', 'al majaz', 'al nahda', 'muwaileh'],
    },
    ajman: {
      city: 'Ajman',
      areas: ['ajman downtown', 'al rashidiya', 'al nuaimiya'],
    },
    'ras al khaimah': {
      city: 'Ras Al Khaimah',
      areas: ['al hamra', 'mina al arab', 'al marjan'],
    },
  };

  // Check UAE
  for (const [cityKey, cityData] of Object.entries(uaeLocations)) {
    if (lowerText.includes(cityKey)) {
      result.country = 'United Arab Emirates';
      result.countryCode = 'AE';
      result.city = cityData.city;

      for (const area of cityData.areas) {
        if (lowerText.includes(area)) {
          result.area = area.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
          break;
        }
      }
      return result;
    }
  }

  // Other countries
  const otherCities: Record<string, { country: string; code: string }> = {
    'london': { country: 'United Kingdom', code: 'GB' },
    'manchester': { country: 'United Kingdom', code: 'GB' },
    'new york': { country: 'United States', code: 'US' },
    'miami': { country: 'United States', code: 'US' },
    'los angeles': { country: 'United States', code: 'US' },
    'istanbul': { country: 'Turkey', code: 'TR' },
    'antalya': { country: 'Turkey', code: 'TR' },
    'riyadh': { country: 'Saudi Arabia', code: 'SA' },
    'jeddah': { country: 'Saudi Arabia', code: 'SA' },
    'cairo': { country: 'Egypt', code: 'EG' },
    'doha': { country: 'Qatar', code: 'QA' },
    'manama': { country: 'Bahrain', code: 'BH' },
    'muscat': { country: 'Oman', code: 'OM' },
    'kuwait': { country: 'Kuwait', code: 'KW' },
  };

  for (const [city, info] of Object.entries(otherCities)) {
    if (lowerText.includes(city)) {
      result.city = city.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      result.country = info.country;
      result.countryCode = info.code;
      return result;
    }
  }

  return result;
}

/**
 * Extract property type
 */
function extractPropertyTypeFromText(text: string): PropertyType | null {
  const lowerText = text.toLowerCase();

  const typePatterns: Array<{ keywords: string[]; type: PropertyType }> = [
    { keywords: ['studio'], type: 'studio' },
    { keywords: ['penthouse', 'ph'], type: 'penthouse' },
    { keywords: ['villa', 'mansion'], type: 'villa' },
    { keywords: ['townhouse', 'town house', 'th'], type: 'townhouse' },
    { keywords: ['duplex'], type: 'duplex' },
    { keywords: ['loft'], type: 'loft' },
    { keywords: ['apartment', 'flat', 'apt', 'unit'], type: 'apartment' },
    { keywords: ['plot', 'land'], type: 'land' },
    { keywords: ['office'], type: 'office' },
    { keywords: ['retail', 'shop'], type: 'retail' },
    { keywords: ['warehouse'], type: 'warehouse' },
    { keywords: ['commercial'], type: 'commercial' },
  ];

  for (const { keywords, type } of typePatterns) {
    for (const keyword of keywords) {
      if (lowerText.includes(keyword)) {
        return type;
      }
    }
  }

  return null;
}

/**
 * Extract bedrooms
 */
function extractBedroomsFromText(text: string): number | null {
  const lowerText = text.toLowerCase();

  // Check for studio first
  if (lowerText.includes('studio')) {
    return 0;
  }

  const patterns = [
    /(\d+)\s*(?:bed(?:room)?s?|br|bhk)/i,
    /(\d+)\s*b(?:ed)?r?\s+(?:apartment|flat|unit|villa)/i,
    /(?:bedroom|br|bhk)\s*[:\-]?\s*(\d+)/i,
    /(\d+)\s*(?:bed|bedroom)\s*\+\s*(?:maid|study)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num >= 0 && num <= 20) {
        return num;
      }
    }
  }

  return null;
}

/**
 * Extract bathrooms
 */
function extractBathroomsFromText(text: string): number | null {
  const patterns = [
    /(\d+)\s*(?:bath(?:room)?s?|ba)/i,
    /(?:bath(?:room)?s?)\s*[:\-]?\s*(\d+)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num >= 1 && num <= 15) {
        return num;
      }
    }
  }

  return null;
}

/**
 * Extract area
 */
function extractAreaFromText(text: string): { sqft?: number; sqm?: number } {
  const result: { sqft?: number; sqm?: number } = {};

  // Square feet
  const sqftPatterns = [
    /([\d,]+)\s*(?:sq\.?\s*ft\.?|sqft|square\s*feet|sft)/i,
    /(?:size|area|built[- ]?up)[:\s]*([\d,]+)\s*(?:sq\.?\s*ft)?/i,
  ];

  for (const pattern of sqftPatterns) {
    const match = text.match(pattern);
    if (match) {
      const num = extractNumber(match[1]);
      if (num && num >= 100 && num <= 100000) {
        result.sqft = num;
        break;
      }
    }
  }

  // Square meters
  const sqmPatterns = [
    /([\d,]+)\s*(?:sq\.?\s*m\.?|sqm|m²|m2|square\s*meter)/i,
  ];

  for (const pattern of sqmPatterns) {
    const match = text.match(pattern);
    if (match) {
      const num = extractNumber(match[1]);
      if (num && num >= 10 && num <= 10000) {
        result.sqm = num;
        break;
      }
    }
  }

  // Convert if only one available
  if (result.sqft && !result.sqm) {
    result.sqm = sqftToSqm(result.sqft);
  } else if (result.sqm && !result.sqft) {
    result.sqft = sqmToSqft(result.sqm);
  }

  return result;
}

/**
 * Extract price
 */
function extractPriceFromText(text: string): { amount?: number; currency?: string } {
  const result: { amount?: number; currency?: string } = {};

  const patterns: Array<{ pattern: RegExp; currency: string }> = [
    { pattern: /AED\s*([\d,]+(?:\.\d+)?)\s*(million|m|k)?/i, currency: 'AED' },
    { pattern: /([\d,]+(?:\.\d+)?)\s*(million|m|k)?\s*AED/i, currency: 'AED' },
    { pattern: /(?:Dhs?|د\.?إ)\s*([\d,]+(?:\.\d+)?)\s*(million|m|k)?/i, currency: 'AED' },
    { pattern: /\$\s*([\d,]+(?:\.\d+)?)\s*(million|m|k)?/i, currency: 'USD' },
    { pattern: /USD\s*([\d,]+(?:\.\d+)?)\s*(million|m|k)?/i, currency: 'USD' },
    { pattern: /£\s*([\d,]+(?:\.\d+)?)\s*(million|m|k)?/i, currency: 'GBP' },
    { pattern: /€\s*([\d,]+(?:\.\d+)?)\s*(million|m|k)?/i, currency: 'EUR' },
    { pattern: /(?:price|starting|from)[:\s]*([\d,]+(?:\.\d+)?)\s*(million|m|k)?/i, currency: 'AED' },
  ];

  for (const { pattern, currency } of patterns) {
    const match = text.match(pattern);
    if (match) {
      let amount = extractNumber(match[1]);
      if (amount) {
        const multiplier = match[2]?.toLowerCase();
        if (multiplier === 'million' || multiplier === 'm') {
          amount *= 1000000;
        } else if (multiplier === 'k') {
          amount *= 1000;
        }

        if (amount >= 10000 && amount <= 1000000000) {
          result.amount = amount;
          result.currency = currency;
          break;
        }
      }
    }
  }

  return result;
}

/**
 * Extract payment plan
 */
function extractPaymentPlanFromText(text: string): PaymentPlan | null {
  const plan: PaymentPlan = {};
  let found = false;

  // Standard patterns
  const downMatch = text.match(/(?:down\s*payment|booking|dp)[:\s]*(\d+)%/i);
  if (downMatch) {
    plan.downPayment = parseInt(downMatch[1], 10);
    found = true;
  }

  const duringMatch = text.match(/(?:during\s*construction)[:\s]*(\d+)%/i);
  if (duringMatch) {
    plan.duringConstruction = parseInt(duringMatch[1], 10);
    found = true;
  }

  const handoverMatch = text.match(/(?:on\s*handover|completion)[:\s]*(\d+)%/i);
  if (handoverMatch) {
    plan.onHandover = parseInt(handoverMatch[1], 10);
    found = true;
  }

  const postMatch = text.match(/(?:post\s*handover)[:\s]*(\d+)%/i);
  if (postMatch) {
    plan.postHandover = parseInt(postMatch[1], 10);
    found = true;
  }

  // Split format: "20/80", "40/60"
  const splitMatch = text.match(/(\d{1,2})\/(\d{1,2})\s*(?:payment|plan)?/i);
  if (splitMatch && !found) {
    plan.downPayment = parseInt(splitMatch[1], 10);
    plan.onHandover = parseInt(splitMatch[2], 10);
    found = true;
  }

  // Installment format: "60 months post handover"
  const installmentMatch = text.match(/(\d+)\s*(?:months?|yrs?|years?)\s*(?:post|after)/i);
  if (installmentMatch) {
    const num = parseInt(installmentMatch[1], 10);
    if (num <= 120) {
      plan.installmentMonths = num;
      found = true;
    }
  }

  return found ? plan : null;
}

/**
 * Extract handover date
 */
function extractHandoverFromText(text: string): string | null {
  const patterns = [
    /(?:handover|completion|delivery|ready)[:\s]*(?:by|date)?[:\s]*([A-Z][a-z]+\s+\d{4})/i,
    /(?:handover|completion|delivery)[:\s]*Q([1-4])\s*(\d{4})/i,
    /(?:ready|handover)\s*(?:by|in|:)\s*(\d{4})/i,
    /(\d{4})\s*(?:handover|delivery|completion)/i,
    /(?:Q([1-4]))\s*['\-]?(\d{2,4})/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      // Quarter format
      if (match[1]?.length === 1 && match[2]) {
        const quarter = parseInt(match[1], 10);
        let year = match[2];
        if (year.length === 2) {
          year = '20' + year;
        }
        const months = ['March', 'June', 'September', 'December'];
        return `${months[quarter - 1]} ${year}`;
      }
      return match[1];
    }
  }

  return null;
}

/**
 * Extract property status
 */
function extractStatusFromText(text: string): PropertyStatus | null {
  const lowerText = text.toLowerCase();

  if (lowerText.includes('ready to move') || (lowerText.includes('ready') && !lowerText.includes('not ready'))) {
    return 'ready';
  }
  if (lowerText.includes('off-plan') || lowerText.includes('off plan')) {
    return 'off_plan';
  }
  if (lowerText.includes('under construction')) {
    return 'under_construction';
  }
  if (lowerText.includes('pre-launch') || lowerText.includes('pre launch') || lowerText.includes('coming soon')) {
    return 'pre_launch';
  }
  if (lowerText.includes('resale') || lowerText.includes('secondary market')) {
    return 'resale';
  }

  return null;
}

/**
 * Extract floor number
 */
function extractFloorFromText(text: string): number | null {
  const patterns = [
    /(?:floor|level)\s*[:\-]?\s*(\d+)/i,
    /(\d+)(?:st|nd|rd|th)\s*floor/i,
    /floor\s*(\d+)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const floor = parseInt(match[1], 10);
      if (floor >= 0 && floor <= 200) {
        return floor;
      }
    }
  }

  return null;
}

/**
 * Extract view type
 */
function extractViewFromText(text: string): string | null {
  const viewTypes = [
    'sea view', 'ocean view', 'water view', 'beach view',
    'city view', 'skyline view', 'burj khalifa view', 'burj view',
    'marina view', 'canal view', 'creek view',
    'garden view', 'park view', 'golf view', 'pool view',
    'palm view', 'island view', 'landmark view',
    'full sea', 'partial sea', 'open view', 'boulevard view',
  ];

  const lowerText = text.toLowerCase();
  for (const view of viewTypes) {
    if (lowerText.includes(view)) {
      return view.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    }
  }

  return null;
}

/**
 * Extract amenities
 */
function extractAmenitiesFromText(text: string): string[] {
  const amenities = [
    'swimming pool', 'pool', 'gym', 'fitness', 'sauna', 'spa',
    'parking', 'balcony', 'terrace', 'garden', 'playground',
    'concierge', 'security', '24/7', 'cctv',
    'tennis', 'basketball', 'squash', 'padel',
    'bbq', 'barbecue', 'kids area', 'children',
    'retail', 'shopping', 'restaurant', 'cafe',
    'beach', 'private beach', 'beach access',
    'golf', 'clubhouse', 'community',
    'maid room', 'maids room', 'storage', 'study',
    'smart home', 'home automation', 'central ac',
  ];

  const found: string[] = [];
  const lowerText = text.toLowerCase();

  for (const amenity of amenities) {
    if (lowerText.includes(amenity) && !found.includes(amenity)) {
      found.push(amenity);
    }
  }

  return found;
}

/**
 * Extract parking spaces
 */
function extractParkingFromText(text: string): number | null {
  const patterns = [
    /(\d+)\s*(?:parking|car\s*park)/i,
    /(?:parking|car\s*park)[:\s]*(\d+)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num >= 1 && num <= 10) {
        return num;
      }
    }
  }

  return null;
}

/**
 * Normalize and validate property data from any source
 */
export function normalizePropertyData(data: Partial<PropertyData>): PropertyData {
  const normalized: PropertyData = {
    sourceType: data.sourceType || 'text',
    ...data,
  };

  // Normalize developer name
  if (normalized.developer) {
    normalized.developerNormalized = normalizeString(normalized.developer);
  }

  // Ensure area conversions
  if (normalized.areaSqM && !normalized.areaSqFt) {
    normalized.areaSqFt = sqmToSqft(normalized.areaSqM);
  } else if (normalized.areaSqFt && !normalized.areaSqM) {
    normalized.areaSqM = sqftToSqm(normalized.areaSqFt);
  }

  // Calculate price per sqft
  if (normalized.price && normalized.areaSqFt && !normalized.pricePerSqFt) {
    normalized.pricePerSqFt = Math.round(normalized.price / normalized.areaSqFt);
  }

  // Set default currency
  if (normalized.price && !normalized.currency) {
    normalized.currency = 'AED';
  }

  // Infer status from handover date
  if (!normalized.status && normalized.handoverDate) {
    const handoverYear = parseInt(normalized.handoverDate.match(/\d{4}/)?.[0] || '0', 10);
    const currentYear = new Date().getFullYear();
    if (handoverYear > currentYear) {
      normalized.status = 'off_plan';
    } else if (handoverYear === currentYear) {
      normalized.status = 'under_construction';
    }
  }

  return normalized;
}

/**
 * Merge property data from multiple sources (PDF + text)
 */
export function mergePropertySources(
  pdfData: Partial<PropertyData> | null,
  textData: Partial<PropertyData> | null,
  formData: Partial<PropertyData> | null
): PropertyData {
  // Priority: form data > text data > pdf data
  const merged: Partial<PropertyData> = {
    sourceType: 'mixed',
  };

  const sources = [pdfData, textData, formData].filter(Boolean) as Partial<PropertyData>[];

  // Merge all non-null fields, later sources override earlier
  for (const source of sources) {
    for (const [key, value] of Object.entries(source)) {
      if (value !== undefined && value !== null && value !== '') {
        (merged as any)[key] = value;
      }
    }
  }

  // Merge amenities specially
  const allAmenities = new Set<string>();
  for (const source of sources) {
    if (source.amenities) {
      source.amenities.forEach(a => allAmenities.add(a));
    }
  }
  if (allAmenities.size > 0) {
    merged.amenities = Array.from(allAmenities);
  }

  return normalizePropertyData(merged);
}

/**
 * Async version of parsePropertyText that tries AI extraction first
 * Falls back to regex-based extraction if AI fails or returns poor results
 */
export async function parsePropertyTextAsync(text: string): Promise<TextParseResult> {
  const warnings: string[] = [];

  try {
    // Try AI extraction first
    const aiResult = await tryAIExtraction(text, 'text');

    if (aiResult && Object.keys(aiResult).length > 3) {
      // AI returned useful data - use it
      const propertyData: Partial<PropertyData> = {
        ...aiResult,
        sourceType: 'text',
        rawText: text,
      };

      // Calculate extracted fields
      const extractedFields: string[] = [];
      if (propertyData.developer) extractedFields.push('developer');
      if (propertyData.name) extractedFields.push('name');
      if (propertyData.city || propertyData.area) extractedFields.push('location');
      if (propertyData.propertyType) extractedFields.push('propertyType');
      if (propertyData.bedrooms !== undefined) extractedFields.push('bedrooms');
      if (propertyData.bathrooms !== undefined) extractedFields.push('bathrooms');
      if (propertyData.areaSqFt || propertyData.areaSqM) extractedFields.push('area');
      if (propertyData.price) extractedFields.push('price');
      if (propertyData.paymentPlan) extractedFields.push('paymentPlan');
      if (propertyData.handoverDate) extractedFields.push('handoverDate');
      if (propertyData.status) extractedFields.push('status');
      if (propertyData.floor) extractedFields.push('floor');
      if (propertyData.view) extractedFields.push('view');
      if (propertyData.amenities && propertyData.amenities.length > 0) extractedFields.push('amenities');
      if (propertyData.parkingSpaces) extractedFields.push('parking');

      // Calculate confidence based on required fields
      const requiredFields = ['developer', 'location', 'price', 'area', 'propertyType'];
      const foundRequired = requiredFields.filter(f => extractedFields.includes(f));
      const confidence = Math.round((foundRequired.length / requiredFields.length) * 100);

      // Ensure area conversions
      if (propertyData.areaSqM && !propertyData.areaSqFt) {
        propertyData.areaSqFt = sqmToSqft(propertyData.areaSqM);
      } else if (propertyData.areaSqFt && !propertyData.areaSqM) {
        propertyData.areaSqM = sqftToSqm(propertyData.areaSqFt);
      }

      // Calculate price per sqft
      if (propertyData.price && propertyData.areaSqFt && !propertyData.pricePerSqFt) {
        propertyData.pricePerSqFt = Math.round(propertyData.price / propertyData.areaSqFt);
      }

      return {
        propertyData,
        confidence,
        extractedFields,
        warnings,
      };
    }
  } catch (error) {
    console.error('AI extraction failed, falling back to regex:', error);
    warnings.push('AI extraction failed, using pattern matching');
  }

  // Fallback to regex-based extraction
  const regexResult = parsePropertyText(text);
  return {
    ...regexResult,
    warnings: [...warnings, ...regexResult.warnings],
  };
}
