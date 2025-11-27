import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createAnalysis, getUserAnalyses, checkUserAnalysisLimit } from '@/services/analysis.service';
import { parsePropertyText } from '@/services/text-parser.service';
import { parsePDF, extractPropertyDataFromPDF } from '@/services/pdf-parser.service';

/**
 * GET /api/analyses
 * List user's analyses with pagination
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Please sign in to continue' } },
        { status: 401 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') || '10', 10);

    const result = await getUserAnalyses(session.user.id, page, pageSize);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Get analyses error:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch analyses' } },
      { status: 500 }
    );
  }
}

/**
 * POST /api/analyses
 * Create a new analysis
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Please sign in to continue' } },
        { status: 401 }
      );
    }

    // Check limits first
    const limitCheck = await checkUserAnalysisLimit(session.user.id);
    if (!limitCheck.canCreate) {
      return NextResponse.json(
        {
          error: {
            code: 'LIMIT_REACHED',
            message: limitCheck.message || 'Analysis limit reached',
            details: { remaining: limitCheck.remaining, limit: limitCheck.limit }
          }
        },
        { status: 403 }
      );
    }

    // Parse form data
    const formData = await request.formData();
    const inputType = formData.get('inputType') as string;
    const textInput = formData.get('textInput') as string | null;
    const language = formData.get('language') as string || 'en';
    const propertyDataJson = formData.get('propertyData') as string | null;

    // Parse property data if provided
    let formPropertyData = null;
    if (propertyDataJson) {
      try {
        formPropertyData = JSON.parse(propertyDataJson);
      } catch {
        // Ignore parse errors
      }
    }

    // Process files
    const files: Array<{ buffer: Buffer; originalName: string; mimeType: string; size: number }> = [];
    const fileEntries = formData.getAll('files');

    for (const entry of fileEntries) {
      if (entry instanceof File) {
        const buffer = Buffer.from(await entry.arrayBuffer());
        files.push({
          buffer,
          originalName: entry.name,
          mimeType: entry.type,
          size: entry.size,
        });
      }
    }

    // Validate input
    if (!textInput && files.length === 0 && !formPropertyData) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Please provide text input or upload files' } },
        { status: 400 }
      );
    }

    // Create analysis
    const result = await createAnalysis({
      userId: session.user.id,
      inputType: files.length > 0 ? (textInput ? 'mixed' : 'pdf') : 'text',
      textInput: textInput || undefined,
      files: files.length > 0 ? files : undefined,
      formData: formPropertyData,
      language,
    });

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Create analysis error:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: (error as Error).message || 'Failed to create analysis' } },
      { status: 500 }
    );
  }
}
