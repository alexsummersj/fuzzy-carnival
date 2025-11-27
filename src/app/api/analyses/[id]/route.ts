import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getAnalysisById, updateAnalysisPropertyData } from '@/services/analysis.service';
import { prisma } from '@/lib/db';

/**
 * GET /api/analyses/[id]
 * Get a single analysis by ID
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Please sign in to continue' } },
        { status: 401 }
      );
    }

    const analysis = await getAnalysisById(params.id, session.user.id);

    if (!analysis) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Analysis not found' } },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: analysis,
    });
  } catch (error) {
    console.error('Get analysis error:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch analysis' } },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/analyses/[id]
 * Update property data and recalculate
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Please sign in to continue' } },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { propertyData } = body;

    if (!propertyData) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Property data is required' } },
        { status: 400 }
      );
    }

    const result = await updateAnalysisPropertyData(
      params.id,
      session.user.id,
      propertyData
    );

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Update analysis error:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: (error as Error).message || 'Failed to update analysis' } },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/analyses/[id]
 * Delete an analysis
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Please sign in to continue' } },
        { status: 401 }
      );
    }

    // Verify ownership
    const analysis = await prisma.analysis.findFirst({
      where: {
        id: params.id,
        userId: session.user.id,
      },
    });

    if (!analysis) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Analysis not found' } },
        { status: 404 }
      );
    }

    // Delete analysis (cascade will handle documents)
    await prisma.analysis.delete({
      where: { id: params.id },
    });

    // Log audit
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'analysis_deleted',
        entityType: 'analysis',
        entityId: params.id,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Analysis deleted successfully',
    });
  } catch (error) {
    console.error('Delete analysis error:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to delete analysis' } },
      { status: 500 }
    );
  }
}
