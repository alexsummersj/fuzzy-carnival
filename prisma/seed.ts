import { PrismaClient, PlanType } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create Plans
  const freePlan = await prisma.plan.upsert({
    where: { type: PlanType.FREE },
    update: {},
    create: {
      name: 'Free',
      type: PlanType.FREE,
      monthlyAnalysisLimit: 3,
      maxPdfUploads: 2,
      maxTextLength: 5000,
      priceMonthly: 0,
      priceYearly: 0,
      features: [
        '3 property analyses per month',
        'Up to 2 PDF uploads per analysis',
        'Basic risk scoring',
        'Standard report generation',
        'Email support',
      ],
    },
  });

  const proPlan = await prisma.plan.upsert({
    where: { type: PlanType.PRO },
    update: {},
    create: {
      name: 'Professional',
      type: PlanType.PRO,
      monthlyAnalysisLimit: 50,
      maxPdfUploads: 5,
      maxTextLength: 20000,
      priceMonthly: 29,
      priceYearly: 290,
      features: [
        '50 property analyses per month',
        'Up to 5 PDF uploads per analysis',
        'Advanced risk scoring with detailed breakdown',
        'AI-powered narrative reports',
        'PDF report export',
        'Priority email support',
        'Analysis history & comparison',
      ],
    },
  });

  const enterprisePlan = await prisma.plan.upsert({
    where: { type: PlanType.ENTERPRISE },
    update: {},
    create: {
      name: 'Enterprise',
      type: PlanType.ENTERPRISE,
      monthlyAnalysisLimit: -1, // Unlimited
      maxPdfUploads: 10,
      maxTextLength: 50000,
      priceMonthly: 99,
      priceYearly: 990,
      features: [
        'Unlimited property analyses',
        'Up to 10 PDF uploads per analysis',
        'Premium AI-powered insights',
        'Custom risk parameters',
        'API access',
        'Dedicated support',
        'Team collaboration',
        'White-label reports',
      ],
    },
  });

  console.log('Plans created:', { freePlan, proPlan, enterprisePlan });

  // Create sample developer profiles
  const developers = [
    {
      name: 'Emaar Properties',
      normalizedName: 'emaar properties',
      country: 'AE',
      reputationScore: 92,
      projectsCompleted: 150,
      delayHistory: 2.5,
      qualityRating: 90,
      isVerified: true,
    },
    {
      name: 'DAMAC Properties',
      normalizedName: 'damac properties',
      country: 'AE',
      reputationScore: 78,
      projectsCompleted: 80,
      delayHistory: 6,
      qualityRating: 75,
      isVerified: true,
    },
    {
      name: 'Nakheel',
      normalizedName: 'nakheel',
      country: 'AE',
      reputationScore: 85,
      projectsCompleted: 60,
      delayHistory: 4,
      qualityRating: 82,
      isVerified: true,
    },
    {
      name: 'Sobha Realty',
      normalizedName: 'sobha realty',
      country: 'AE',
      reputationScore: 88,
      projectsCompleted: 45,
      delayHistory: 3,
      qualityRating: 92,
      isVerified: true,
    },
  ];

  for (const dev of developers) {
    await prisma.developerProfile.upsert({
      where: { normalizedName: dev.normalizedName },
      update: dev,
      create: dev,
    });
  }

  console.log('Developer profiles created');

  // Create sample location profiles
  const locations = [
    {
      country: 'AE',
      city: 'Dubai',
      area: 'Downtown Dubai',
      normalizedKey: 'ae-dubai-downtown',
      demandScore: 95,
      infrastructureScore: 98,
      vacancyRate: 5,
      priceGrowthYoY: 12,
      rentalYield: 5.5,
    },
    {
      country: 'AE',
      city: 'Dubai',
      area: 'Dubai Marina',
      normalizedKey: 'ae-dubai-marina',
      demandScore: 90,
      infrastructureScore: 95,
      vacancyRate: 7,
      priceGrowthYoY: 10,
      rentalYield: 6,
    },
    {
      country: 'AE',
      city: 'Dubai',
      area: 'JVC',
      normalizedKey: 'ae-dubai-jvc',
      demandScore: 75,
      infrastructureScore: 70,
      vacancyRate: 12,
      priceGrowthYoY: 8,
      rentalYield: 7.5,
    },
    {
      country: 'AE',
      city: 'Abu Dhabi',
      area: 'Saadiyat Island',
      normalizedKey: 'ae-abudhabi-saadiyat',
      demandScore: 80,
      infrastructureScore: 90,
      vacancyRate: 8,
      priceGrowthYoY: 6,
      rentalYield: 5,
    },
  ];

  for (const loc of locations) {
    await prisma.locationProfile.upsert({
      where: { normalizedKey: loc.normalizedKey },
      update: loc,
      create: loc,
    });
  }

  console.log('Location profiles created');

  // Create country risk profiles
  const countries = [
    {
      countryCode: 'AE',
      countryName: 'United Arab Emirates',
      regulatoryRisk: 25,
      legalSecurityScore: 85,
      geopoliticalRisk: 30,
      currencyRisk: 15,
      foreignOwnershipRules: {
        freehold: 'Allowed in designated freehold areas',
        restrictions: 'Some areas restricted to GCC nationals',
      },
    },
    {
      countryCode: 'US',
      countryName: 'United States',
      regulatoryRisk: 20,
      legalSecurityScore: 95,
      geopoliticalRisk: 20,
      currencyRisk: 10,
      foreignOwnershipRules: {
        freehold: 'Generally allowed with some state restrictions',
        restrictions: 'CFIUS review for certain properties',
      },
    },
    {
      countryCode: 'GB',
      countryName: 'United Kingdom',
      regulatoryRisk: 20,
      legalSecurityScore: 95,
      geopoliticalRisk: 15,
      currencyRisk: 25,
      foreignOwnershipRules: {
        freehold: 'Fully allowed',
        restrictions: 'Stamp duty surcharge for foreign buyers',
      },
    },
    {
      countryCode: 'TR',
      countryName: 'Turkey',
      regulatoryRisk: 45,
      legalSecurityScore: 60,
      geopoliticalRisk: 55,
      currencyRisk: 70,
      foreignOwnershipRules: {
        freehold: 'Allowed with reciprocity principle',
        restrictions: 'Military zones excluded',
      },
    },
  ];

  for (const country of countries) {
    await prisma.countryRiskProfile.upsert({
      where: { countryCode: country.countryCode },
      update: country,
      create: country,
    });
  }

  console.log('Country risk profiles created');

  console.log('Database seeding completed!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
