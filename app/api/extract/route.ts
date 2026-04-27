import { NextRequest, NextResponse } from 'next/server';

const SYSTEM_INSTRUCTION = `You are a professional OCR data extraction expert for heavy equipment maintenance.
Task: Extract tire pressure inspection data from the provided document (PDF/Image).

Guidelines:
1. Date: Normalize to DD/MM/YYYY.
2. Unit ID: Look for labels like 'Veh', 'Machine Number', 'Truck', 'Unit No', 'Unit Number', or codes like 'RD3487', 'GR3351', 'FL####', 'LO####', 'DZ####'.
3. SMU/Hours: Service Meter Unit. Look for 'SMU', 'Veh Hours', 'Hour', or 'Vehicle Life' (in Excel files). Leave empty if missing or unreadable.
4. Tires (Sequential Mapping): Extract pressure values from left to right.
   - For Excel: Pressure values are often in a row labeled "Pressure" (or similar), under "Pos 1", "Pos 2", etc.
   - IMPORTANT: Some documents use non-sequential labels like "1, 10, 11, 12, 13, 14". 
   - IGNORE these specific labels and map the values sequentially: the first pressure value found must go to Pos 1, the second to Pos 2, the third to Pos 3, and so on, regardless of the header number in the PDF.
   - For example: if values are [42, 44, 52, 54, 52, 52], map them as:
     Pos 1: 42, Pos 2: 44, Pos 3: 52, Pos 4: 54, Pos 5: 52, Pos 6: 52.
5. Extract the "Actual" pressure (usually the top row if there are two rows like "Actual" and "Adjusted"). 
   - If a cell shows "110 | 108", take 110.
6. Create a separate record for EACH unit if multiple units are on the same page.
7. Ignore irrelevant data like Serial Numbers or Rim Branding.

Return ONLY a valid JSON array (no markdown, no extra text) with this structure:
[
  {
    "date": "DD/MM/YYYY",
    "unitId": "unit identifier",
    "smu": "hours or empty string",
    "pos1": "pressure or empty string",
    "pos2": "pressure or empty string",
    "pos3": "pressure or empty string",
    "pos4": "pressure or empty string",
    "pos5": "pressure or empty string",
    "pos6": "pressure or empty string",
    "pos7": "pressure or empty string",
    "pos8": "pressure or empty string",
    "pos9": "pressure or empty string",
    "pos10": "pressure or empty string"
  }
]`;

export async function POST(request: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'GEMINI_API_KEY not configured on server.' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { type, content, mimeType, fileName } = body;
    // type: 'text' (for spreadsheet CSV) or 'image' (for PDF/image base64)

    let parts: any[];

    if (type === 'text') {
      parts = [{ text: `Extract data from this spreadsheet content (CSV format from file: ${fileName}).\n\n${content}` }];
    } else {
      // PDF or image sent as base64
      parts = [
        { text: 'Extract tire pressure data from this document.' },
        { inline_data: { mime_type: mimeType, data: content } }
      ];
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-preview:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
          contents: [{ parts }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 8192,
            responseMimeType: 'application/json',
          },
        }),
      }
    );

    if (!response.ok) {
      const err = await response.text();
      console.error('Gemini API error:', err);
      return NextResponse.json({ error: `Gemini API error: ${response.status}` }, { status: 502 });
    }

    const geminiData = await response.json();
    const text = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || '[]';

    let parsed: any[];
    try {
      parsed = JSON.parse(text);
    } catch {
      const match = text.match(/\[[\s\S]*\]/);
      parsed = match ? JSON.parse(match[0]) : [];
    }

    return NextResponse.json({ data: parsed });
  } catch (error: any) {
    console.error('Route error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
