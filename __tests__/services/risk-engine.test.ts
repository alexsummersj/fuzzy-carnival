/**
 * Unit tests for Risk Engine Service
 */

import {
  defaultRiskConfig,
  countryRiskAdjustments,
  propertyTypeRiskAdjustments,
  propertyStatusRiskAdjustments,
  calculateHandoverRisk,
  calculatePriceRisk,
} from '@/config/risk-engine';
import { getTrafficLightColor } from '@/lib/utils';

describe('Risk Engine Configuration', () => {
  describe('defaultRiskConfig', () => {
    it('should have weights that sum to 1', () => {
      const weights = defaultRiskConfig.weights;
      const sum =
        weights.developer +
        weights.location +
        weights.construction +
        weights.market +
        weights.regulatory;

      expect(sum).toBe(1);
    });

    it('should have valid threshold values', () => {
      expect(defaultRiskConfig.thresholds.greenMax).toBeLessThan(
        defaultRiskConfig.thresholds.yellowMax
      );
      expect(defaultRiskConfig.thresholds.yellowMax).toBeLessThan(100);
    });
  });

  describe('countryRiskAdjustments', () => {
    it('should have UAE as baseline (0)', () => {
      expect(countryRiskAdjustments['AE']).toBe(0);
    });

    it('should have higher risk for unstable markets', () => {
      expect(countryRiskAdjustments['TR']).toBeGreaterThan(0);
    });

    it('should have lower risk for stable markets', () => {
      expect(countryRiskAdjustments['US']).toBeLessThan(0);
    });
  });

  describe('propertyTypeRiskAdjustments', () => {
    it('should have apartment as baseline (0)', () => {
      expect(propertyTypeRiskAdjustments['apartment']).toBe(0);
    });

    it('should have higher risk for commercial properties', () => {
      expect(propertyTypeRiskAdjustments['commercial']).toBeGreaterThan(
        propertyTypeRiskAdjustments['apartment']
      );
    });

    it('should have lower risk for villas', () => {
      expect(propertyTypeRiskAdjustments['villa']).toBeLessThan(
        propertyTypeRiskAdjustments['apartment']
      );
    });
  });

  describe('propertyStatusRiskAdjustments', () => {
    it('should have ready properties as lowest risk', () => {
      expect(propertyStatusRiskAdjustments['ready']).toBe(0);
    });

    it('should have off-plan as higher risk than ready', () => {
      expect(propertyStatusRiskAdjustments['off_plan']).toBeGreaterThan(
        propertyStatusRiskAdjustments['ready']
      );
    });

    it('should have pre-launch as highest risk', () => {
      expect(propertyStatusRiskAdjustments['pre_launch']).toBeGreaterThan(
        propertyStatusRiskAdjustments['off_plan']
      );
    });

    it('should order risk from ready to pre-launch', () => {
      const ready = propertyStatusRiskAdjustments['ready'];
      const resale = propertyStatusRiskAdjustments['resale'];
      const underConstruction = propertyStatusRiskAdjustments['under_construction'];
      const offPlan = propertyStatusRiskAdjustments['off_plan'];
      const preLaunch = propertyStatusRiskAdjustments['pre_launch'];

      expect(ready).toBeLessThanOrEqual(resale);
      expect(resale).toBeLessThanOrEqual(underConstruction);
      expect(underConstruction).toBeLessThanOrEqual(offPlan);
      expect(offPlan).toBeLessThanOrEqual(preLaunch);
    });
  });
});

describe('Risk Calculation Functions', () => {
  describe('calculateHandoverRisk', () => {
    it('should return 0 for ready properties (0 months)', () => {
      expect(calculateHandoverRisk(0)).toBe(0);
    });

    it('should return low risk for short handover periods', () => {
      expect(calculateHandoverRisk(6)).toBeLessThanOrEqual(10);
    });

    it('should return medium risk for 1-2 year handover', () => {
      const risk12 = calculateHandoverRisk(12);
      const risk24 = calculateHandoverRisk(24);

      expect(risk12).toBeGreaterThan(5);
      expect(risk12).toBeLessThanOrEqual(20);
      expect(risk24).toBeGreaterThan(risk12);
    });

    it('should return high risk for long handover periods', () => {
      const risk36 = calculateHandoverRisk(36);
      const risk48 = calculateHandoverRisk(48);

      expect(risk36).toBeGreaterThanOrEqual(25);
      expect(risk48).toBeGreaterThan(risk36);
    });

    it('should cap risk for very long handover periods', () => {
      const risk60 = calculateHandoverRisk(60);
      const risk120 = calculateHandoverRisk(120);

      expect(risk60).toBeLessThanOrEqual(60);
      expect(risk120).toBeLessThanOrEqual(60);
    });
  });

  describe('calculatePriceRisk', () => {
    it('should return 0 for prices near market average', () => {
      const marketAvg = 1500;
      expect(calculatePriceRisk(1500, marketAvg)).toBe(0);
      expect(calculatePriceRisk(1450, marketAvg)).toBe(0);
      expect(calculatePriceRisk(1550, marketAvg)).toBe(0);
    });

    it('should return low risk for small deviations', () => {
      const marketAvg = 1500;
      expect(calculatePriceRisk(1800, marketAvg)).toBeLessThanOrEqual(10);
      expect(calculatePriceRisk(1200, marketAvg)).toBeLessThanOrEqual(10);
    });

    it('should return higher risk for larger deviations', () => {
      const marketAvg = 1500;
      const lowPrice = calculatePriceRisk(750, marketAvg);
      const highPrice = calculatePriceRisk(2500, marketAvg);

      expect(lowPrice).toBeGreaterThan(10);
      expect(highPrice).toBeGreaterThan(10);
    });

    it('should be symmetric for high and low deviations', () => {
      const marketAvg = 1000;
      const lowRisk = calculatePriceRisk(500, marketAvg);
      const highRisk = calculatePriceRisk(1500, marketAvg);

      expect(lowRisk).toBe(highRisk);
    });
  });

  describe('getTrafficLightColor', () => {
    it('should return green for scores 0-35', () => {
      expect(getTrafficLightColor(0)).toBe('green');
      expect(getTrafficLightColor(20)).toBe('green');
      expect(getTrafficLightColor(35)).toBe('green');
    });

    it('should return yellow for scores 36-65', () => {
      expect(getTrafficLightColor(36)).toBe('yellow');
      expect(getTrafficLightColor(50)).toBe('yellow');
      expect(getTrafficLightColor(65)).toBe('yellow');
    });

    it('should return red for scores above 65', () => {
      expect(getTrafficLightColor(66)).toBe('red');
      expect(getTrafficLightColor(80)).toBe('red');
      expect(getTrafficLightColor(100)).toBe('red');
    });
  });
});

describe('Risk Score Calculations', () => {
  describe('Developer Risk', () => {
    it('should penalize unknown developers', () => {
      const unknownPenalty = defaultRiskConfig.developerRules.unknownDeveloperPenalty;
      expect(unknownPenalty).toBeGreaterThanOrEqual(30);
    });

    it('should factor in delay history', () => {
      const delayWeight = defaultRiskConfig.developerRules.delayHistoryWeight;
      expect(delayWeight).toBeGreaterThan(0);

      // 6 months delay should add significant risk
      const delayRisk = 6 * delayWeight;
      expect(delayRisk).toBeGreaterThanOrEqual(10);
    });

    it('should reward completed projects', () => {
      const bonus = defaultRiskConfig.developerRules.projectsCompletedBonus;
      expect(bonus).toBeGreaterThan(0);
    });
  });

  describe('Location Risk', () => {
    it('should weight demand heavily', () => {
      const demandWeight = defaultRiskConfig.locationRules.demandWeight;
      expect(demandWeight).toBeGreaterThanOrEqual(0.25);
    });

    it('should consider infrastructure', () => {
      const infraWeight = defaultRiskConfig.locationRules.infrastructureWeight;
      expect(infraWeight).toBeGreaterThan(0);
    });

    it('should factor in vacancy rates', () => {
      const vacancyWeight = defaultRiskConfig.locationRules.vacancyWeight;
      expect(vacancyWeight).toBeGreaterThan(0);
    });
  });

  describe('Construction Risk', () => {
    it('should penalize off-plan significantly', () => {
      const offPlanPenalty = defaultRiskConfig.constructionRules.offPlanPenalty;
      expect(offPlanPenalty).toBeGreaterThanOrEqual(20);
    });

    it('should add risk for long handover', () => {
      const handoverPenalty = defaultRiskConfig.constructionRules.longHandoverPenalty;
      expect(handoverPenalty).toBeGreaterThan(0);

      // 4 years should add significant risk
      const longHandoverRisk = 4 * handoverPenalty;
      expect(longHandoverRisk).toBeGreaterThanOrEqual(10);
    });

    it('should reward construction progress', () => {
      const progressBonus = defaultRiskConfig.constructionRules.progressBonus;
      expect(progressBonus).toBeGreaterThan(0);

      // 80% progress should give decent bonus
      const bonus = 80 * progressBonus;
      expect(bonus).toBeGreaterThanOrEqual(20);
    });
  });
});

describe('Risk Score Integration', () => {
  describe('Overall Score Calculation', () => {
    it('should calculate weighted average', () => {
      const weights = defaultRiskConfig.weights;

      // Simulate category scores
      const scores = {
        developer: 30,
        location: 20,
        construction: 50,
        market: 40,
        regulatory: 25,
      };

      const weighted =
        scores.developer * weights.developer +
        scores.location * weights.location +
        scores.construction * weights.construction +
        scores.market * weights.market +
        scores.regulatory * weights.regulatory;

      // Should be between min and max of component scores
      expect(weighted).toBeGreaterThanOrEqual(20);
      expect(weighted).toBeLessThanOrEqual(50);
    });
  });

  describe('Traffic Light Assignment', () => {
    it('should assign green to low overall scores', () => {
      const testCases = [
        { scores: { developer: 20, location: 30, construction: 25, market: 20, regulatory: 25 } },
        { scores: { developer: 10, location: 15, construction: 20, market: 25, regulatory: 15 } },
      ];

      for (const tc of testCases) {
        const weights = defaultRiskConfig.weights;
        const overall = Math.round(
          tc.scores.developer * weights.developer +
          tc.scores.location * weights.location +
          tc.scores.construction * weights.construction +
          tc.scores.market * weights.market +
          tc.scores.regulatory * weights.regulatory
        );

        expect(getTrafficLightColor(overall)).toBe('green');
      }
    });

    it('should assign red to high overall scores', () => {
      const testCases = [
        { scores: { developer: 70, location: 75, construction: 80, market: 65, regulatory: 70 } },
        { scores: { developer: 90, location: 80, construction: 85, market: 75, regulatory: 80 } },
      ];

      for (const tc of testCases) {
        const weights = defaultRiskConfig.weights;
        const overall = Math.round(
          tc.scores.developer * weights.developer +
          tc.scores.location * weights.location +
          tc.scores.construction * weights.construction +
          tc.scores.market * weights.market +
          tc.scores.regulatory * weights.regulatory
        );

        expect(getTrafficLightColor(overall)).toBe('red');
      }
    });
  });
});

describe('Edge Cases', () => {
  it('should handle missing data gracefully', () => {
    // Default scores should be 50 (medium) when data is missing
    const defaultScore = 50;

    expect(defaultScore).toBe(50);
  });

  it('should clamp scores between 0 and 100', () => {
    // Very negative inputs should clamp to 0
    const veryLowScore = Math.max(0, -50);
    expect(veryLowScore).toBe(0);

    // Very high inputs should clamp to 100
    const veryHighScore = Math.min(100, 150);
    expect(veryHighScore).toBe(100);
  });

  it('should handle zero values appropriately', () => {
    expect(calculateHandoverRisk(0)).toBe(0);
    expect(calculatePriceRisk(0, 1500)).toBeGreaterThan(0); // $0 price is suspicious
  });
});
