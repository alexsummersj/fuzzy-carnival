import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

/**
 * GET /api/plans
 * Get all available subscription plans
 */
export async function GET(request: NextRequest) {
  try {
    const plans = await prisma.plan.findMany({
      where: { isActive: true },
      orderBy: { priceMonthly: 'asc' },
    });

    return NextResponse.json({
      success: true,
      data: plans.map((plan) => ({
        id: plan.id,
        name: plan.name,
        type: plan.type,
        monthlyAnalysisLimit: plan.monthlyAnalysisLimit,
        maxPdfUploads: plan.maxPdfUploads,
        maxTextLength: plan.maxTextLength,
        priceMonthly: plan.priceMonthly,
        priceYearly: plan.priceYearly,
        features: plan.features,
      })),
    });
  } catch (error) {
    console.error('Get plans error:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch plans' } },
      { status: 500 }
    );
  }
}
