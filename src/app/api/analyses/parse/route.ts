import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { parsePDF } from '@/services/pdf-parser.service';
import { generateDocumentSummary } from '@/services/llm.service';

/**
 * POST /api/analyses/parse
 * Parse input and return AI-generated summary
 * User can add additional context in free form
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

    const formData = await request.formData();
    const textInput = formData.get('textInput') as string | null;
    const language = formData.get('language') as string || 'en';

    // Process files if any
    const files: Array<{ buffer: Buffer; originalName: string }> = [];
    const fileEntries = formData.getAll('files');

    for (const entry of fileEntries) {
      if (entry instanceof File) {
        const buffer = Buffer.from(await entry.arrayBuffer());
        files.push({
          buffer,
          originalName: entry.name,
        });
      }
    }

    // Collect all text content
    let allText = '';
    const fileNames: string[] = [];

    // Extract text from PDFs
    if (files.length > 0) {
      for (const file of files) {
        try {
          const parseResult = await parsePDF(file.buffer);
          allText += `\n--- ${file.originalName} ---\n${parseResult.text}\n`;
          fileNames.push(file.originalName);
        } catch (error) {
          console.error(`Failed to parse ${file.originalName}:`, error);
        }
      }
    }

    // Add text input
    if (textInput) {
      allText += `\n--- User Input ---\n${textInput}\n`;
    }

    if (!allText.trim()) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'No content to analyze' } },
        { status: 400 }
      );
    }

    // Generate AI summary
    const summary = await generateDocumentSummary(allText, language);

    return NextResponse.json({
      success: true,
      data: {
        summary,
        rawText: allText,
        fileNames,
      },
    });
  } catch (error) {
    console.error('Parse error:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to parse input' } },
      { status: 500 }
    );
  }
}
