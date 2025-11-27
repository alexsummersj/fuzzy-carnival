/**
 * Unit tests for Text Parser Service
 */

import { parsePropertyText, normalizePropertyData, mergePropertySources } from '@/services/text-parser.service';

describe('Text Parser Service', () => {
  describe('parsePropertyText', () => {
    it('should extract developer name from broker message', () => {
      const text = `
        New listing from Emaar Properties!
        2BR apartment in Downtown Dubai
        Price: AED 2,500,000
        Size: 1,500 sq ft
      `;

      const result = parsePropertyText(text);

      expect(result.propertyData.developer).toBe('Emaar');
      expect(result.extractedFields).toContain('developer');
    });

    it('should extract location from text', () => {
      const text = `
        Beautiful apartment in Dubai Marina
        3 bedrooms, 2 bathrooms
        Price: 3.5M AED
      `;

      const result = parsePropertyText(text);

      expect(result.propertyData.city).toBe('Dubai');
      expect(result.propertyData.area).toBe('Marina');
      expect(result.extractedFields).toContain('location');
    });

    it('should extract bedrooms correctly', () => {
      const testCases = [
        { text: '2 bedroom apartment', expected: 2 },
        { text: '3BR villa', expected: 3 },
        { text: '1 bed flat', expected: 1 },
        { text: 'Studio apartment', expected: 0 },
        { text: '4 BHK luxury home', expected: 4 },
      ];

      for (const { text, expected } of testCases) {
        const result = parsePropertyText(text);
        expect(result.propertyData.bedrooms).toBe(expected);
      }
    });

    it('should extract price in various formats', () => {
      const testCases = [
        { text: 'Price: AED 2,500,000', expectedAmount: 2500000, expectedCurrency: 'AED' },
        { text: '1.5M AED', expectedAmount: 1500000, expectedCurrency: 'AED' },
        { text: '$500,000 USD', expectedAmount: 500000, expectedCurrency: 'USD' },
        { text: 'Starting from 3 million AED', expectedAmount: 3000000, expectedCurrency: 'AED' },
        { text: 'Dhs 750,000', expectedAmount: 750000, expectedCurrency: 'AED' },
      ];

      for (const { text, expectedAmount, expectedCurrency } of testCases) {
        const result = parsePropertyText(text);
        expect(result.propertyData.price).toBe(expectedAmount);
        expect(result.propertyData.currency).toBe(expectedCurrency);
      }
    });

    it('should extract area in square feet and square meters', () => {
      const testCases = [
        { text: '1,500 sq ft', expectedSqFt: 1500 },
        { text: 'Size: 2000 sqft', expectedSqFt: 2000 },
        { text: '150 sqm apartment', expectedSqM: 150 },
        { text: 'Built-up area: 1800 sq ft', expectedSqFt: 1800 },
      ];

      for (const { text, expectedSqFt, expectedSqM } of testCases) {
        const result = parsePropertyText(text);
        if (expectedSqFt) {
          expect(result.propertyData.areaSqFt).toBe(expectedSqFt);
        }
        if (expectedSqM) {
          expect(result.propertyData.areaSqM).toBe(expectedSqM);
        }
      }
    });

    it('should extract property type', () => {
      const testCases = [
        { text: 'Luxury villa for sale', expected: 'villa' },
        { text: '2BR apartment', expected: 'apartment' },
        { text: 'Penthouse with sea view', expected: 'penthouse' },
        { text: 'Studio in JBR', expected: 'studio' },
        { text: 'Townhouse in Arabian Ranches', expected: 'townhouse' },
      ];

      for (const { text, expected } of testCases) {
        const result = parsePropertyText(text);
        expect(result.propertyData.propertyType).toBe(expected);
      }
    });

    it('should extract property status', () => {
      const testCases = [
        { text: 'Ready to move apartment', expected: 'ready' },
        { text: 'Off-plan project by Emaar', expected: 'off_plan' },
        { text: 'Under construction, handover 2025', expected: 'under_construction' },
        { text: 'Pre-launch exclusive offer', expected: 'pre_launch' },
        { text: 'Resale property', expected: 'resale' },
      ];

      for (const { text, expected } of testCases) {
        const result = parsePropertyText(text);
        expect(result.propertyData.status).toBe(expected);
      }
    });

    it('should extract payment plan', () => {
      const text = `
        Payment plan: 20/80
        Down payment: 10%
        Post handover payment available
      `;

      const result = parsePropertyText(text);

      expect(result.propertyData.paymentPlan).toBeDefined();
      expect(result.propertyData.paymentPlan?.downPayment).toBe(20);
    });

    it('should extract handover date', () => {
      const testCases = [
        { text: 'Handover: December 2025', expected: 'December 2025' },
        { text: 'Completion Q4 2026', expected: 'December 2026' },
        { text: 'Ready by 2024', expected: '2024' },
      ];

      for (const { text, expected } of testCases) {
        const result = parsePropertyText(text);
        expect(result.propertyData.handoverDate).toBe(expected);
      }
    });

    it('should extract view type', () => {
      const testCases = [
        { text: 'Full sea view apartment', expected: 'Sea View' },
        { text: 'Burj Khalifa view', expected: 'Burj Khalifa View' },
        { text: 'Garden view unit', expected: 'Garden View' },
        { text: 'Marina view', expected: 'Marina View' },
      ];

      for (const { text, expected } of testCases) {
        const result = parsePropertyText(text);
        expect(result.propertyData.view).toBe(expected);
      }
    });

    it('should calculate confidence based on extracted fields', () => {
      const fullText = `
        Emaar Properties presents
        2BR apartment in Downtown Dubai
        Price: AED 2,500,000
        Size: 1,500 sq ft
        Ready property
      `;

      const partialText = 'Nice apartment for sale';

      const fullResult = parsePropertyText(fullText);
      const partialResult = parsePropertyText(partialText);

      expect(fullResult.confidence).toBeGreaterThan(partialResult.confidence);
      expect(fullResult.confidence).toBeGreaterThanOrEqual(60);
    });

    it('should handle WhatsApp-style messages', () => {
      const text = `
        Hi! Check out this deal:

        *DAMAC Hills 2*
        2BR + Maid
        1,800 sqft
        AED 1.2M

        Ready to move!

        Call me for viewing 🏠
      `;

      const result = parsePropertyText(text);

      expect(result.propertyData.developer).toBe('DAMAC');
      expect(result.propertyData.bedrooms).toBe(2);
      expect(result.propertyData.areaSqFt).toBe(1800);
      expect(result.propertyData.price).toBe(1200000);
      expect(result.propertyData.status).toBe('ready');
    });

    it('should extract amenities', () => {
      const text = `
        Features:
        - Swimming pool
        - Gym
        - Parking
        - 24/7 security
        - Kids play area
      `;

      const result = parsePropertyText(text);

      expect(result.propertyData.amenities).toBeDefined();
      expect(result.propertyData.amenities?.length).toBeGreaterThan(0);
      expect(result.propertyData.amenities).toContain('pool');
    });
  });

  describe('normalizePropertyData', () => {
    it('should convert sqm to sqft if only sqm provided', () => {
      const data = {
        sourceType: 'text' as const,
        areaSqM: 100,
      };

      const result = normalizePropertyData(data);

      expect(result.areaSqFt).toBe(1076); // ~10.764 sqft per sqm
    });

    it('should convert sqft to sqm if only sqft provided', () => {
      const data = {
        sourceType: 'text' as const,
        areaSqFt: 1076,
      };

      const result = normalizePropertyData(data);

      expect(result.areaSqM).toBe(100);
    });

    it('should calculate price per sqft', () => {
      const data = {
        sourceType: 'text' as const,
        price: 1500000,
        areaSqFt: 1000,
      };

      const result = normalizePropertyData(data);

      expect(result.pricePerSqFt).toBe(1500);
    });

    it('should normalize developer name', () => {
      const data = {
        sourceType: 'text' as const,
        developer: 'EMAAR PROPERTIES LLC',
      };

      const result = normalizePropertyData(data);

      expect(result.developerNormalized).toBe('emaar properties llc');
    });

    it('should set default currency', () => {
      const data = {
        sourceType: 'text' as const,
        price: 1000000,
      };

      const result = normalizePropertyData(data);

      expect(result.currency).toBe('AED');
    });
  });

  describe('mergePropertySources', () => {
    it('should merge PDF and text data with text taking priority', () => {
      const pdfData = {
        developer: 'Unknown Developer',
        city: 'Dubai',
        price: 1000000,
      };

      const textData = {
        developer: 'Emaar',
        bedrooms: 2,
      };

      const result = mergePropertySources(pdfData, textData, null);

      expect(result.developer).toBe('Emaar'); // Text takes priority
      expect(result.city).toBe('Dubai'); // From PDF
      expect(result.bedrooms).toBe(2); // From text
      expect(result.price).toBe(1000000); // From PDF
    });

    it('should merge amenities from all sources', () => {
      const pdfData = {
        amenities: ['pool', 'gym'],
      };

      const textData = {
        amenities: ['gym', 'parking'],
      };

      const result = mergePropertySources(pdfData, textData, null);

      expect(result.amenities).toContain('pool');
      expect(result.amenities).toContain('gym');
      expect(result.amenities).toContain('parking');
      expect(result.amenities?.length).toBe(3); // No duplicates
    });

    it('should give form data highest priority', () => {
      const pdfData = {
        price: 1000000,
      };

      const textData = {
        price: 1200000,
      };

      const formData = {
        price: 1500000,
      };

      const result = mergePropertySources(pdfData, textData, formData);

      expect(result.price).toBe(1500000); // Form data wins
    });
  });
});
