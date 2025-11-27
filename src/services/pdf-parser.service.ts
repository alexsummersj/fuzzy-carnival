/**
 * PDF Parsing Service
 * Extracts text and structured data from real estate PDF brochures/documents
 */

import pdf from 'pdf-parse';
import type { PropertyData, PropertyType, PropertyStatus, PaymentPlan } from '@/types';
import { extractNumber, normalizeString } from '@/lib/utils';

export interface PDFParseResult {
  text: string;
  numPages: number;
  metadata: Record<string, unknown>;
}

export interface ExtractedPropertyData extends Partial<PropertyData> {
  confidence: number;
  extractedFields: string[];
  missingFields: string[];
}

/**
 * Parse a PDF buffer and extract raw text
 */
export async function parsePDF(buffer: Buffer): Promise<PDFParseResult> {
  try {
    const data = await pdf(buffer);
    return {
      text: data.text,
      numPages: data.numpages,
      metadata: data.info || {},
    };
  } catch (error) {
    throw new Error(`Failed to parse PDF: ${(error as Error).message}`);
  }
}

/**
 * Extract structured property data from PDF text
 */
export function extractPropertyDataFromPDF(
  pdfText: string,
  filename?: string
): ExtractedPropertyData {
  const text = pdfText.toLowerCase();
  const extractedFields: string[] = [];
  const missingFields: string[] = [];

  const propertyData: Partial<PropertyData> = {
    sourceType: 'pdf',
    rawText: pdfText,
  };

  // Extract Developer Name
  const developerMatch = extractDeveloper(pdfText);
  if (developerMatch) {
    propertyData.developer = developerMatch;
    propertyData.developerNormalized = normalizeString(developerMatch);
    extractedFields.push('developer');
  } else {
    missingFields.push('developer');
  }

  // Extract Project/Property Name
  const propertyName = extractPropertyName(pdfText, filename);
  if (propertyName) {
    propertyData.name = propertyName;
    extractedFields.push('name');
  } else {
    missingFields.push('name');
  }

  // Extract Location
  const location = extractLocation(pdfText);
  if (location.city) {
    propertyData.city = location.city;
    propertyData.area = location.area;
    propertyData.country = location.country;
    propertyData.countryCode = location.countryCode;
    extractedFields.push('location');
  } else {
    missingFields.push('location');
  }

  // Extract Property Type
  const propertyType = extractPropertyType(text);
  if (propertyType) {
    propertyData.propertyType = propertyType;
    extractedFields.push('propertyType');
  } else {
    missingFields.push('propertyType');
  }

  // Extract Bedrooms
  const bedrooms = extractBedrooms(text);
  if (bedrooms !== null) {
    propertyData.bedrooms = bedrooms;
    extractedFields.push('bedrooms');
  } else {
    missingFields.push('bedrooms');
  }

  // Extract Bathrooms
  const bathrooms = extractBathrooms(text);
  if (bathrooms !== null) {
    propertyData.bathrooms = bathrooms;
    extractedFields.push('bathrooms');
  }

  // Extract Area
  const area = extractArea(pdfText);
  if (area.sqft || area.sqm) {
    propertyData.areaSqFt = area.sqft;
    propertyData.areaSqM = area.sqm;
    extractedFields.push('area');
  } else {
    missingFields.push('area');
  }

  // Extract Price
  const price = extractPrice(pdfText);
  if (price.amount) {
    propertyData.price = price.amount;
    propertyData.currency = price.currency;
    extractedFields.push('price');

    // Calculate price per sqft if we have area
    if (propertyData.areaSqFt) {
      propertyData.pricePerSqFt = Math.round(price.amount / propertyData.areaSqFt);
    }
  } else {
    missingFields.push('price');
  }

  // Extract Payment Plan
  const paymentPlan = extractPaymentPlan(pdfText);
  if (paymentPlan) {
    propertyData.paymentPlan = paymentPlan;
    extractedFields.push('paymentPlan');
  }

  // Extract Handover Date
  const handoverDate = extractHandoverDate(pdfText);
  if (handoverDate) {
    propertyData.handoverDate = handoverDate;
    extractedFields.push('handoverDate');
  }

  // Extract Property Status
  const status = extractPropertyStatus(text);
  if (status) {
    propertyData.status = status;
    extractedFields.push('status');
  }

  // Extract Floor
  const floor = extractFloor(text);
  if (floor !== null) {
    propertyData.floor = floor;
    extractedFields.push('floor');
  }

  // Extract Amenities
  const amenities = extractAmenities(pdfText);
  if (amenities.length > 0) {
    propertyData.amenities = amenities;
    extractedFields.push('amenities');
  }

  // Calculate confidence score based on extracted fields
  const requiredFields = ['developer', 'location', 'price', 'area', 'propertyType'];
  const requiredExtracted = requiredFields.filter(f => extractedFields.includes(f));
  const confidence = Math.round((requiredExtracted.length / requiredFields.length) * 100);

  return {
    ...propertyData,
    confidence,
    extractedFields,
    missingFields,
  };
}

/**
 * Extract developer name from text
 */
function extractDeveloper(text: string): string | null {
  const patterns = [
    /(?:developed by|developer|by)\s*[:\-]?\s*([A-Z][A-Za-z\s&]+(?:Properties|Realty|Developments?|Group|LLC|Inc)?)/i,
    /([A-Z][A-Za-z]+\s+(?:Properties|Realty|Developments?))/,
    /(?:EMAAR|DAMAC|Nakheel|Sobha|Meraas|Aldar|Azizi|Danube|Binghatti|Omniyat)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1]?.trim() || match[0].trim();
    }
  }
  return null;
}

/**
 * Extract property/project name
 */
function extractPropertyName(text: string, filename?: string): string | null {
  // Try to find project name in text
  const patterns = [
    /(?:project|property|tower|building|residence)\s*[:\-]?\s*([A-Z][A-Za-z0-9\s]+)/i,
    /^([A-Z][A-Za-z0-9\s]{3,30})\s*(?:by|at|in)/m,
    /([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)*(?:\s+Tower|\s+Residences?|\s+Heights?)?)/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const name = match[1].trim();
      if (name.length > 3 && name.length < 50) {
        return name;
      }
    }
  }

  // Fall back to filename
  if (filename) {
    const nameFromFile = filename.replace(/\.pdf$/i, '').replace(/[-_]/g, ' ');
    return nameFromFile;
  }

  return null;
}

/**
 * Extract location information
 */
function extractLocation(text: string): {
  country?: string;
  countryCode?: string;
  city?: string;
  area?: string;
} {
  const result: { country?: string; countryCode?: string; city?: string; area?: string } = {};

  // UAE Cities and Areas
  const uaeAreas: Record<string, string[]> = {
    Dubai: [
      'Downtown Dubai', 'Dubai Marina', 'Palm Jumeirah', 'JBR', 'Jumeirah Beach Residence',
      'Business Bay', 'DIFC', 'JVC', 'JVT', 'Jumeirah Village Circle', 'Jumeirah Village Triangle',
      'Dubai Hills', 'Dubai Hills Estate', 'Arabian Ranches', 'Emirates Hills',
      'Dubai Creek Harbour', 'MBR City', 'Mohammed Bin Rashid City', 'Sobha Hartland',
      'Meydan', 'Al Barsha', 'Jumeirah', 'Dubai Sports City', 'Motor City',
      'Dubai Silicon Oasis', 'Discovery Gardens', 'Dubai Land', 'Damac Hills',
    ],
    'Abu Dhabi': [
      'Saadiyat Island', 'Yas Island', 'Al Reem Island', 'Al Raha Beach',
      'Corniche', 'Al Maryah Island', 'Khalifa City', 'Al Reef',
    ],
  };

  const lowerText = text.toLowerCase();

  // Check for UAE locations
  for (const [city, areas] of Object.entries(uaeAreas)) {
    if (lowerText.includes(city.toLowerCase())) {
      result.country = 'United Arab Emirates';
      result.countryCode = 'AE';
      result.city = city;

      // Find specific area
      for (const area of areas) {
        if (lowerText.includes(area.toLowerCase())) {
          result.area = area;
          break;
        }
      }
      return result;
    }
  }

  // Check for other known locations
  const otherLocations: Record<string, { country: string; code: string }> = {
    london: { country: 'United Kingdom', code: 'GB' },
    'new york': { country: 'United States', code: 'US' },
    miami: { country: 'United States', code: 'US' },
    istanbul: { country: 'Turkey', code: 'TR' },
    riyadh: { country: 'Saudi Arabia', code: 'SA' },
    jeddah: { country: 'Saudi Arabia', code: 'SA' },
    cairo: { country: 'Egypt', code: 'EG' },
    doha: { country: 'Qatar', code: 'QA' },
    manama: { country: 'Bahrain', code: 'BH' },
  };

  for (const [city, info] of Object.entries(otherLocations)) {
    if (lowerText.includes(city)) {
      result.city = city.charAt(0).toUpperCase() + city.slice(1);
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
function extractPropertyType(text: string): PropertyType | null {
  const typeMap: Record<string, PropertyType> = {
    apartment: 'apartment',
    flat: 'apartment',
    studio: 'studio',
    villa: 'villa',
    townhouse: 'townhouse',
    penthouse: 'penthouse',
    duplex: 'duplex',
    loft: 'loft',
    'plot': 'land',
    'land': 'land',
    'commercial': 'commercial',
    'office': 'office',
    'retail': 'retail',
    'shop': 'retail',
    'warehouse': 'warehouse',
  };

  for (const [keyword, type] of Object.entries(typeMap)) {
    if (text.includes(keyword)) {
      return type;
    }
  }

  return null;
}

/**
 * Extract number of bedrooms
 */
function extractBedrooms(text: string): number | null {
  const patterns = [
    /(\d+)\s*(?:bed(?:room)?s?|br|bhk)/i,
    /(?:bed(?:room)?s?|br)\s*[:\-]?\s*(\d+)/i,
    /(\d+)\s*(?:bedroom|br)\s+(?:apartment|flat|unit)/i,
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

  // Check for studio
  if (text.includes('studio')) {
    return 0;
  }

  return null;
}

/**
 * Extract number of bathrooms
 */
function extractBathrooms(text: string): number | null {
  const patterns = [
    /(\d+)\s*(?:bath(?:room)?s?|ba)/i,
    /(?:bath(?:room)?s?|ba)\s*[:\-]?\s*(\d+)/i,
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
 * Extract property area
 */
function extractArea(text: string): { sqft?: number; sqm?: number } {
  const result: { sqft?: number; sqm?: number } = {};

  // Square feet patterns
  const sqftPatterns = [
    /([\d,]+)\s*(?:sq\.?\s*ft\.?|sqft|square\s*feet)/i,
    /(?:area|size)[:\s]*([\d,]+)\s*(?:sq\.?\s*ft\.?|sqft)/i,
    /(?:built[- ]up\s*area)[:\s]*([\d,]+)/i,
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

  // Square meter patterns
  const sqmPatterns = [
    /([\d,]+)\s*(?:sq\.?\s*m\.?|sqm|m²|square\s*meters?)/i,
    /(?:area|size)[:\s]*([\d,]+)\s*(?:sq\.?\s*m|m²)/i,
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

  // Convert if only one is available
  if (result.sqft && !result.sqm) {
    result.sqm = Math.round(result.sqft / 10.764);
  } else if (result.sqm && !result.sqft) {
    result.sqft = Math.round(result.sqm * 10.764);
  }

  return result;
}

/**
 * Extract price information
 */
function extractPrice(text: string): { amount?: number; currency?: string } {
  const result: { amount?: number; currency?: string } = {};

  // Currency patterns
  const currencyPatterns: Array<{ pattern: RegExp; currency: string }> = [
    { pattern: /AED\s*([\d,]+(?:\.\d{2})?(?:\s*(?:million|m|k))?)/i, currency: 'AED' },
    { pattern: /([\d,]+(?:\.\d{2})?)\s*AED/i, currency: 'AED' },
    { pattern: /(?:د\.?إ\.?|Dhs?\.?)\s*([\d,]+(?:\.\d{2})?(?:\s*(?:million|m|k))?)/i, currency: 'AED' },
    { pattern: /\$\s*([\d,]+(?:\.\d{2})?(?:\s*(?:million|m|k))?)/i, currency: 'USD' },
    { pattern: /USD\s*([\d,]+(?:\.\d{2})?(?:\s*(?:million|m|k))?)/i, currency: 'USD' },
    { pattern: /£\s*([\d,]+(?:\.\d{2})?(?:\s*(?:million|m|k))?)/i, currency: 'GBP' },
    { pattern: /€\s*([\d,]+(?:\.\d{2})?(?:\s*(?:million|m|k))?)/i, currency: 'EUR' },
    { pattern: /(?:price|starting\s*from|from)[:\s]*([\d,]+(?:\.\d{2})?)/i, currency: 'AED' },
  ];

  for (const { pattern, currency } of currencyPatterns) {
    const match = text.match(pattern);
    if (match) {
      let amount = extractNumber(match[1]);
      if (amount) {
        const amountText = match[1].toLowerCase();
        if (amountText.includes('million') || amountText.includes('m')) {
          amount *= 1000000;
        } else if (amountText.includes('k')) {
          amount *= 1000;
        }

        // Validate reasonable price range
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
 * Extract payment plan information
 */
function extractPaymentPlan(text: string): PaymentPlan | null {
  const plan: PaymentPlan = {};
  let found = false;

  // Down payment
  const downPaymentMatch = text.match(/(?:down\s*payment|booking|reservation)[:\s]*(\d+)%/i);
  if (downPaymentMatch) {
    plan.downPayment = parseInt(downPaymentMatch[1], 10);
    found = true;
  }

  // During construction
  const duringMatch = text.match(/(?:during\s*construction|construction\s*phase)[:\s]*(\d+)%/i);
  if (duringMatch) {
    plan.duringConstruction = parseInt(duringMatch[1], 10);
    found = true;
  }

  // On handover
  const handoverMatch = text.match(/(?:on\s*handover|upon\s*completion|at\s*handover)[:\s]*(\d+)%/i);
  if (handoverMatch) {
    plan.onHandover = parseInt(handoverMatch[1], 10);
    found = true;
  }

  // Post handover
  const postMatch = text.match(/(?:post\s*handover|after\s*handover)[:\s]*(\d+)%/i);
  if (postMatch) {
    plan.postHandover = parseInt(postMatch[1], 10);
    found = true;
  }

  // Payment plan pattern like "40/60", "20/80", etc.
  const splitMatch = text.match(/(\d{1,2})\/(\d{1,2})\s*(?:payment\s*plan)?/i);
  if (splitMatch && !found) {
    plan.downPayment = parseInt(splitMatch[1], 10);
    plan.onHandover = parseInt(splitMatch[2], 10);
    found = true;
  }

  return found ? plan : null;
}

/**
 * Extract handover date
 */
function extractHandoverDate(text: string): string | null {
  const patterns = [
    /(?:handover|completion|delivery|expected)[:\s]*(?:date)?[:\s]*([A-Z][a-z]+\s+\d{4})/i,
    /(?:handover|completion|delivery)[:\s]*(?:date)?[:\s]*(?:Q([1-4]))\s*(\d{4})/i,
    /(?:ready\s*by|expected\s*by)[:\s]*([A-Z][a-z]+\s+\d{4})/i,
    /(\d{4})\s*(?:handover|completion|delivery)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      // Handle quarter format
      if (match[1] && match[2] && match[1].length === 1) {
        const quarter = parseInt(match[1], 10);
        const year = match[2];
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
function extractPropertyStatus(text: string): PropertyStatus | null {
  if (text.includes('ready') && !text.includes('not ready')) {
    return 'ready';
  }
  if (text.includes('off-plan') || text.includes('off plan')) {
    return 'off_plan';
  }
  if (text.includes('under construction') || text.includes('under-construction')) {
    return 'under_construction';
  }
  if (text.includes('pre-launch') || text.includes('pre launch') || text.includes('coming soon')) {
    return 'pre_launch';
  }
  if (text.includes('resale') || text.includes('secondary')) {
    return 'resale';
  }
  return null;
}

/**
 * Extract floor number
 */
function extractFloor(text: string): number | null {
  const patterns = [
    /(?:floor|level)\s*[:\-]?\s*(\d+)/i,
    /(\d+)(?:st|nd|rd|th)\s*floor/i,
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
 * Extract amenities
 */
function extractAmenities(text: string): string[] {
  const amenityKeywords = [
    'swimming pool', 'pool', 'gym', 'fitness center', 'fitness centre',
    'parking', 'balcony', 'terrace', 'garden', 'playground',
    'spa', 'sauna', 'jacuzzi', 'concierge', '24/7 security', 'security',
    'tennis court', 'basketball court', 'squash court',
    'bbq area', 'barbecue', 'kids play area', 'children area',
    'retail', 'shopping', 'restaurant', 'cafe',
    'beach access', 'private beach', 'marina',
    'golf course', 'clubhouse', 'community center',
    'maid room', 'storage', 'study room', 'office',
    'smart home', 'home automation', 'central ac', 'air conditioning',
    'sea view', 'city view', 'garden view', 'pool view', 'golf view',
  ];

  const found: string[] = [];
  const lowerText = text.toLowerCase();

  for (const amenity of amenityKeywords) {
    if (lowerText.includes(amenity) && !found.includes(amenity)) {
      found.push(amenity);
    }
  }

  return found;
}

/**
 * Merge data from multiple PDFs
 */
export function mergePropertyData(
  dataList: ExtractedPropertyData[]
): ExtractedPropertyData {
  if (dataList.length === 0) {
    return {
      sourceType: 'pdf',
      confidence: 0,
      extractedFields: [],
      missingFields: [],
    };
  }

  if (dataList.length === 1) {
    return dataList[0];
  }

  // Merge by taking non-null values, preferring higher confidence sources
  const sorted = [...dataList].sort((a, b) => b.confidence - a.confidence);
  const merged: ExtractedPropertyData = {
    ...sorted[0],
    extractedFields: [],
    missingFields: [],
  };

  const allExtracted = new Set<string>();

  for (const data of sorted) {
    for (const field of data.extractedFields) {
      allExtracted.add(field);
    }

    // Merge specific fields if not already set
    if (!merged.developer && data.developer) merged.developer = data.developer;
    if (!merged.name && data.name) merged.name = data.name;
    if (!merged.city && data.city) merged.city = data.city;
    if (!merged.area && data.area) merged.area = data.area;
    if (!merged.propertyType && data.propertyType) merged.propertyType = data.propertyType;
    if (!merged.bedrooms && data.bedrooms) merged.bedrooms = data.bedrooms;
    if (!merged.bathrooms && data.bathrooms) merged.bathrooms = data.bathrooms;
    if (!merged.areaSqFt && data.areaSqFt) merged.areaSqFt = data.areaSqFt;
    if (!merged.areaSqM && data.areaSqM) merged.areaSqM = data.areaSqM;
    if (!merged.price && data.price) merged.price = data.price;
    if (!merged.currency && data.currency) merged.currency = data.currency;
    if (!merged.handoverDate && data.handoverDate) merged.handoverDate = data.handoverDate;
    if (!merged.status && data.status) merged.status = data.status;
    if (!merged.paymentPlan && data.paymentPlan) merged.paymentPlan = data.paymentPlan;

    // Merge amenities
    if (data.amenities) {
      merged.amenities = [...new Set([...(merged.amenities || []), ...data.amenities])];
    }
  }

  merged.extractedFields = Array.from(allExtracted);

  // Calculate average confidence
  merged.confidence = Math.round(
    dataList.reduce((sum, d) => sum + d.confidence, 0) / dataList.length
  );

  return merged;
}
