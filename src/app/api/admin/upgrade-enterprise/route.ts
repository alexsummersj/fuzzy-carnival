import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import prisma from '@/lib/prisma';

/**
 * POST /api/admin/upgrade-enterprise
 * Temporary endpoint to upgrade current user to Enterprise plan
 * DELETE THIS FILE AFTER USE
 */
// CHANGE THIS TO YOUR EMAIL
const ADMIN_EMAIL = 'your-email@example.com';

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Only allow specific admin email
    if (session.user.email !== ADMIN_EMAIL) {
      return NextResponse.json(
        { error: 'Forbidden - admin only' },
        { status: 403 }
      );
    }

    // Find or create Enterprise plan
    let plan = await prisma.plan.findFirst({
      where: { type: 'ENTERPRISE' }
    });

    if (!plan) {
      plan = await prisma.plan.create({
        data: {
          name: 'Enterprise',
          type: 'ENTERPRISE',
          monthlyAnalysisLimit: -1,
          maxPdfUploads: 100,
          maxTextLength: 100000,
          price: 0,
          features: ['Unlimited analyses', 'Priority support', 'API access', 'All features']
        }
      });
    }

    // Update or create subscription
    const existingSub = await prisma.subscription.findFirst({
      where: { userId: session.user.id }
    });

    if (existingSub) {
      await prisma.subscription.update({
        where: { id: existingSub.id },
        data: {
          planId: plan.id,
          status: 'ACTIVE',
          currentPeriodEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
        }
      });
    } else {
      await prisma.subscription.create({
        data: {
          userId: session.user.id,
          planId: plan.id,
          status: 'ACTIVE',
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
        }
      });
    }

    return NextResponse.json({
      success: true,
      message: 'Upgraded to Enterprise plan',
      planId: plan.id
    });
  } catch (error) {
    console.error('Upgrade error:', error);
    return NextResponse.json(
      { error: 'Failed to upgrade', details: String(error) },
      { status: 500 }
    );
  }
}
