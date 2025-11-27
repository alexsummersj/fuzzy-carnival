import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { parsePropertyTextAsync } from '@/services/text-parser.service';
import { parsePDF, extractPropertyDataFromPDFAsync, mergePropertyData } from '@/services/pdf-parser.service';

/**
 * POST /api/analyses/parse
 * Parse input and return extracted data without creating analysis
 * Used for preview/editing before final submission
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
    const inputType = formData.get('inputType') as string;
    const textInput = formData.get('textInput') as string | null;

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

    // Parse based on input type
    const extractedDataList = [];
    const warnings: string[] = [];

    // Parse PDFs with AI extraction
    if (files.length > 0) {
      for (const file of files) {
        try {
          const parseResult = await parsePDF(file.buffer);
          const extracted = await extractPropertyDataFromPDFAsync(parseResult.text, file.originalName);
          extractedDataList.push(extracted);
        } catch (error) {
          warnings.push(`Failed to parse ${file.originalName}: ${(error as Error).message}`);
        }
      }
    }

    // Parse text with AI extraction
    let textData = null;
    if (textInput) {
      const parseResult = await parsePropertyTextAsync(textInput);
      textData = parseResult;
      if (parseResult.warnings.length > 0) {
        warnings.push(...parseResult.warnings);
      }
    }

    // Merge all PDF data
    let pdfMerged = null;
    if (extractedDataList.length > 0) {
      pdfMerged = mergePropertyData(extractedDataList);
    }

    // Combine PDF and text data
    let finalData = null;
    if (pdfMerged && textData) {
      // Merge both sources - text data takes priority
      finalData = {
        ...pdfMerged,
        ...textData.propertyData,
        confidence: Math.round((pdfMerged.confidence + textData.confidence) / 2),
        extractedFields: Array.from(new Set([...pdfMerged.extractedFields, ...textData.extractedFields])),
      };
    } else if (pdfMerged) {
      finalData = pdfMerged;
    } else if (textData) {
      finalData = {
        ...textData.propertyData,
        confidence: textData.confidence,
        extractedFields: textData.extractedFields,
      };
    }

    if (!finalData) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'No data could be extracted' } },
        { status: 400 }
      );
    }

    // Determine missing fields
    const requiredFields = ['developer', 'city', 'price', 'areaSqFt', 'propertyType'];
    const missingFields = requiredFields.filter(f => !finalData![f as keyof typeof finalData]);

    return NextResponse.json({
      success: true,
      data: {
        propertyData: finalData,
        confidence: finalData.confidence,
        extractedFields: finalData.extractedFields || [],
        missingFields,
        warnings,
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
