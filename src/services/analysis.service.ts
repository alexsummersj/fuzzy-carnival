/**
 * Analysis Service
 * Orchestrates the complete property analysis workflow
 */

import { prisma } from '@/lib/db';
import { parsePDF, extractPropertyDataFromPDFAsync, mergePropertyData } from './pdf-parser.service';
import { parsePropertyTextAsync, normalizePropertyData, mergePropertySources } from './text-parser.service';
import { calculateRiskScores } from './risk-engine.service';
import { getLLMProvider } from './llm.service';
import { uploadFiles, downloadFile } from './storage.service';
import type {
  PropertyData,
  RiskScores,
  AnalysisReport,
  ReportSummary,
  RiskBreakdownSection,
  TrafficLightColor,
} from '@/types';
import { formatCurrency, formatArea, getTrafficLightColor } from '@/lib/utils';

export interface CreateAnalysisInput {
  userId: string;
  inputType: 'pdf' | 'text' | 'mixed';
  textInput?: string;
  files?: Array<{
    buffer: Buffer;
    originalName: string;
    mimeType: string;
    size: number;
  }>;
  formData?: Partial<PropertyData>;
  language?: string;
}

export interface AnalysisOutput {
  id: string;
  propertyData: PropertyData;
  riskScores: RiskScores;
  report: AnalysisReport;
}

/**
 * Check if user can create new analysis based on plan limits
 */
export async function checkUserAnalysisLimit(userId: string): Promise<{
  canCreate: boolean;
  remaining: number;
  limit: number;
  message?: string;
}> {
  const subscription = await prisma.subscription.findUnique({
    where: { userId },
    include: { plan: true },
  });

  if (!subscription) {
    // Create free subscription if none exists
    const freePlan = await prisma.plan.findFirst({
      where: { type: 'FREE' },
    });

    if (!freePlan) {
      return {
        canCreate: false,
        remaining: 0,
        limit: 0,
        message: 'No subscription plan found. Please contact support.',
      };
    }

    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    await prisma.subscription.create({
      data: {
        userId,
        planId: freePlan.id,
        currentPeriodEnd: nextMonth,
        analysesUsedThisMonth: 0,
      },
    });

    return {
      canCreate: true,
      remaining: freePlan.monthlyAnalysisLimit,
      limit: freePlan.monthlyAnalysisLimit,
    };
  }

  // Check if we need to reset monthly counter
  const now = new Date();
  if (now > subscription.currentPeriodEnd) {
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        currentPeriodStart: now,
        currentPeriodEnd: nextMonth,
        analysesUsedThisMonth: 0,
      },
    });
    subscription.analysesUsedThisMonth = 0;
  }

  const limit = subscription.plan.monthlyAnalysisLimit;
  const used = subscription.analysesUsedThisMonth;

  // -1 means unlimited
  if (limit === -1) {
    return {
      canCreate: true,
      remaining: -1,
      limit: -1,
    };
  }

  const remaining = limit - used;
  const canCreate = remaining > 0;

  return {
    canCreate,
    remaining,
    limit,
    message: canCreate ? undefined : `You have reached your monthly limit of ${limit} analyses. Please upgrade your plan.`,
  };
}

/**
 * Create a new property analysis
 */
export async function createAnalysis(input: CreateAnalysisInput): Promise<AnalysisOutput> {
  const { userId, inputType, textInput, files, formData, language = 'en' } = input;

  // Check plan limits
  const limitCheck = await checkUserAnalysisLimit(userId);
  if (!limitCheck.canCreate) {
    throw new Error(limitCheck.message || 'Analysis limit reached');
  }

  // Create analysis record
  const analysis = await prisma.analysis.create({
    data: {
      userId,
      inputType: inputType === 'pdf' ? 'PDF' : inputType === 'text' ? 'TEXT' : 'MIXED',
      status: 'PROCESSING',
      rawTextInput: textInput,
      reportLanguage: language,
    },
  });

  try {
    // Process files if provided
    let pdfPropertyData: Partial<PropertyData> | null = null;
    if (files && files.length > 0) {
      const uploadedFiles = await uploadFiles(files);
      const extractedDataList = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const uploaded = uploadedFiles[i];

        // Parse PDF with AI extraction
        const parseResult = await parsePDF(file.buffer);
        const extractedData = await extractPropertyDataFromPDFAsync(parseResult.text, file.originalName);

        // Store document record
        await prisma.document.create({
          data: {
            analysisId: analysis.id,
            originalName: uploaded.originalName,
            storagePath: uploaded.storagePath,
            mimeType: uploaded.mimeType,
            fileSize: uploaded.size,
            extractedText: parseResult.text,
            metadata: {
              numPages: parseResult.numPages,
              confidence: extractedData.confidence,
              extractedFields: extractedData.extractedFields,
            },
          },
        });

        extractedDataList.push(extractedData);
      }

      // Merge data from multiple PDFs
      pdfPropertyData = mergePropertyData(extractedDataList);
    }

    // Process text input if provided with AI extraction
    let textPropertyData: Partial<PropertyData> | null = null;
    if (textInput) {
      const parseResult = await parsePropertyTextAsync(textInput);
      textPropertyData = parseResult.propertyData;
    }

    // Merge all sources (form data takes priority)
    const propertyData = mergePropertySources(pdfPropertyData, textPropertyData, formData || null);

    // Calculate risk scores
    const riskScores = await calculateRiskScores(propertyData);

    // Generate report
    const report = await generateReport(propertyData, riskScores, language);

    // Update analysis with results
    await prisma.analysis.update({
      where: { id: analysis.id },
      data: {
        status: 'COMPLETED',
        propertyData: propertyData as any,
        riskScores: riskScores as any,
        overallRiskScore: riskScores.overall,
        trafficLight: riskScores.trafficLight.toUpperCase() as any,
        reportContent: report as any,
        reportNarrative: report.narrative,
        propertyName: propertyData.name || propertyData.projectName || 'Unnamed Property',
        propertyLocation: [propertyData.area, propertyData.city, propertyData.country]
          .filter(Boolean)
          .join(', '),
      },
    });

    // Increment usage counter
    await prisma.subscription.update({
      where: { userId },
      data: {
        analysesUsedThisMonth: { increment: 1 },
      },
    });

    // Log audit
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'analysis_created',
        entityType: 'analysis',
        entityId: analysis.id,
        metadata: {
          inputType,
          riskScore: riskScores.overall,
          trafficLight: riskScores.trafficLight,
        },
      },
    });

    return {
      id: analysis.id,
      propertyData,
      riskScores,
      report,
    };
  } catch (error) {
    // Mark analysis as failed
    await prisma.analysis.update({
      where: { id: analysis.id },
      data: {
        status: 'FAILED',
      },
    });

    throw error;
  }
}

/**
 * Generate the analysis report
 */
async function generateReport(
  propertyData: PropertyData,
  riskScores: RiskScores,
  language: string
): Promise<AnalysisReport> {
  // Build structured report
  const summary = buildReportSummary(propertyData);
  const riskBreakdown = buildRiskBreakdown(riskScores);
  const recommendation = buildRecommendation(riskScores, language);

  // Generate narrative using LLM
  let narrative: string | undefined;
  try {
    const llm = getLLMProvider();
    narrative = await llm.generateReport(propertyData, riskScores, language);
  } catch (error) {
    console.error('Failed to generate LLM narrative:', error);
    // Continue without narrative
  }

  return {
    language,
    summary,
    riskBreakdown,
    recommendation,
    narrative,
  };
}

/**
 * Build report summary section
 */
function buildReportSummary(data: PropertyData): ReportSummary {
  return {
    propertyName: data.name || data.projectName || 'Not specified',
    location: [data.area, data.city, data.country].filter(Boolean).join(', ') || 'Not specified',
    developer: data.developer || 'Not specified',
    price: data.price
      ? formatCurrency(data.price, data.currency || 'AED')
      : 'Not specified',
    size: data.areaSqFt
      ? formatArea(data.areaSqFt, 'sqft')
      : 'Not specified',
    handoverDate: data.handoverDate || 'Not specified',
    propertyType: data.propertyType
      ? data.propertyType.charAt(0).toUpperCase() + data.propertyType.slice(1)
      : 'Not specified',
  };
}

/**
 * Build risk breakdown sections
 */
function buildRiskBreakdown(scores: RiskScores): RiskBreakdownSection[] {
  const categories: Array<{
    key: keyof Omit<RiskScores, 'overall' | 'trafficLight'>;
    label: string;
  }> = [
    { key: 'developer', label: 'Developer Risk' },
    { key: 'location', label: 'Location Risk' },
    { key: 'construction', label: 'Construction Risk' },
    { key: 'market', label: 'Market & Liquidity Risk' },
    { key: 'regulatory', label: 'Regulatory & Country Risk' },
  ];

  return categories.map((cat) => {
    const data = scores[cat.key];
    return {
      category: cat.label,
      score: data.score,
      color: getTrafficLightColor(data.score),
      explanation: data.summary,
      factors: data.factors.map((f) => f.description),
    };
  });
}

/**
 * Build recommendation section
 */
function buildRecommendation(
  scores: RiskScores,
  language: string
): {
  trafficLight: TrafficLightColor;
  headline: string;
  details: string;
  considerations: string[];
} {
  const recommendations = {
    en: {
      green: {
        headline: 'Low Risk Investment',
        details:
          'This property presents a favorable risk profile and is suitable for most investors. The combination of factors analyzed suggests a solid investment opportunity with manageable risks.',
        considerations: [
          'Standard due diligence recommended',
          'Review payment terms before signing',
          'Consider rental yield potential',
          'Verify developer registration with authorities',
        ],
      },
      yellow: {
        headline: 'Moderate Risk - Proceed with Caution',
        details:
          'This property shows moderate risk factors that warrant careful consideration. We recommend additional due diligence on the specific concerns identified in this report.',
        considerations: [
          'Conduct additional research on flagged risk areas',
          'Consider hiring a local real estate lawyer',
          'Verify all claims independently',
          'Understand your exit strategy options',
          'Review escrow and payment protection mechanisms',
        ],
      },
      red: {
        headline: 'High Risk - Not Recommended for Most Investors',
        details:
          'This property presents significant risk factors. Only suitable for investors with high risk tolerance who can afford potential losses.',
        considerations: [
          'Strongly recommend professional legal consultation',
          'Verify developer track record independently',
          'Consider alternative investment options',
          'If proceeding, ensure strong contractual protections',
          'Have a clear understanding of worst-case scenarios',
        ],
      },
    },
    ru: {
      green: {
        headline: 'Низкий риск',
        details:
          'Данный объект имеет благоприятный профиль риска и подходит для большинства инвесторов. Совокупность проанализированных факторов указывает на надежную инвестиционную возможность.',
        considerations: [
          'Рекомендуется стандартная проверка',
          'Изучите условия оплаты перед подписанием',
          'Оцените потенциал арендного дохода',
          'Проверьте регистрацию застройщика',
        ],
      },
      yellow: {
        headline: 'Умеренный риск - Требует внимания',
        details:
          'Данный объект имеет умеренные факторы риска, требующие тщательного рассмотрения. Рекомендуем дополнительную проверку выявленных проблем.',
        considerations: [
          'Проведите дополнительное исследование рисков',
          'Рассмотрите привлечение юриста',
          'Проверьте все заявления независимо',
          'Продумайте стратегию выхода',
          'Изучите механизмы защиты платежей',
        ],
      },
      red: {
        headline: 'Высокий риск - Не рекомендуется',
        details:
          'Данный объект имеет значительные факторы риска. Подходит только для инвесторов с высокой толерантностью к риску.',
        considerations: [
          'Настоятельно рекомендуем юридическую консультацию',
          'Проверьте историю застройщика независимо',
          'Рассмотрите альтернативные варианты',
          'Обеспечьте надежную договорную защиту',
          'Поймите наихудшие сценарии',
        ],
      },
    },
  };

  const langRecs = recommendations[language as keyof typeof recommendations] || recommendations.en;
  const rec = langRecs[scores.trafficLight];

  return {
    trafficLight: scores.trafficLight,
    ...rec,
  };
}

/**
 * Get user's analysis history
 */
export async function getUserAnalyses(
  userId: string,
  page: number = 1,
  pageSize: number = 10
): Promise<{
  items: Array<{
    id: string;
    propertyName: string;
    propertyLocation: string;
    overallRiskScore: number;
    trafficLight: string;
    createdAt: Date;
    status: string;
  }>;
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}> {
  const skip = (page - 1) * pageSize;

  const [analyses, total] = await Promise.all([
    prisma.analysis.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
      select: {
        id: true,
        propertyName: true,
        propertyLocation: true,
        overallRiskScore: true,
        trafficLight: true,
        createdAt: true,
        status: true,
      },
    }),
    prisma.analysis.count({ where: { userId } }),
  ]);

  return {
    items: analyses.map((a) => ({
      id: a.id,
      propertyName: a.propertyName || 'Unnamed Property',
      propertyLocation: a.propertyLocation || 'Unknown Location',
      overallRiskScore: a.overallRiskScore || 0,
      trafficLight: (a.trafficLight || 'YELLOW').toLowerCase(),
      createdAt: a.createdAt,
      status: a.status,
    })),
    total,
    page,
    pageSize,
    hasMore: skip + analyses.length < total,
  };
}

/**
 * Get single analysis by ID
 */
export async function getAnalysisById(
  analysisId: string,
  userId: string
): Promise<AnalysisOutput | null> {
  const analysis = await prisma.analysis.findFirst({
    where: {
      id: analysisId,
      userId,
    },
    include: {
      documents: true,
    },
  });

  if (!analysis) {
    return null;
  }

  return {
    id: analysis.id,
    propertyData: analysis.propertyData as unknown as PropertyData,
    riskScores: analysis.riskScores as unknown as RiskScores,
    report: analysis.reportContent as unknown as AnalysisReport,
  };
}

/**
 * Update property data and recalculate risk
 */
export async function updateAnalysisPropertyData(
  analysisId: string,
  userId: string,
  propertyData: Partial<PropertyData>
): Promise<AnalysisOutput> {
  const existing = await prisma.analysis.findFirst({
    where: { id: analysisId, userId },
  });

  if (!existing) {
    throw new Error('Analysis not found');
  }

  // Merge with existing data
  const existingData = existing.propertyData as unknown as PropertyData;
  const mergedData = normalizePropertyData({
    ...existingData,
    ...propertyData,
    sourceType: existingData?.sourceType || 'form',
  });

  // Recalculate scores
  const riskScores = await calculateRiskScores(mergedData);

  // Regenerate report
  const report = await generateReport(mergedData, riskScores, existing.reportLanguage);

  // Update record
  await prisma.analysis.update({
    where: { id: analysisId },
    data: {
      propertyData: mergedData as any,
      riskScores: riskScores as any,
      overallRiskScore: riskScores.overall,
      trafficLight: riskScores.trafficLight.toUpperCase() as any,
      reportContent: report as any,
      reportNarrative: report.narrative,
      propertyName: mergedData.name || mergedData.projectName || existing.propertyName,
      propertyLocation: [mergedData.area, mergedData.city, mergedData.country]
        .filter(Boolean)
        .join(', ') || existing.propertyLocation,
    },
  });

  return {
    id: analysisId,
    propertyData: mergedData,
    riskScores,
    report,
  };
}
