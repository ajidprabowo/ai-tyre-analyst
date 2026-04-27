import { GoogleGenAI, Type } from "@google/genai";
import { NextResponse } from "next/server";

export const maxDuration = 60;

const EXTRACTION_SCHEMA = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      date: { type: Type.STRING, description: "Format: DD/MM/YYYY" },
      unitId: { type: Type.STRING, description: "Unit identification code" },
      smu: { type: Type.STRING, description: "Hours (SMU). Empty if not found." },
      pos1: { type: Type.STRING, description: "Tire position 1 pressure" },
      pos2: { type: Type.STRING, description: "Tire position 2 pressure" },
      pos3: { type: Type.STRING, description: "Tire position 3 pressure" },
      pos4: { type: Type.STRING, description: "Tire position 4 pressure" },
      pos5: { type: Type.STRING, description: "Tire position 5 pressure" },
      pos6: { type: Type.STRING, description: "Tire position 6 pressure" },
      pos7: { type: Type.STRING, description: "Tire position 7 pressure" },
      pos8: { type: Type.STRING, description: "Tire position 8 pressure" },
      pos9: { type: Type.STRING, description: "Tire position 9 pressure" },
      pos10: { type: Type.STRING, description: "Tire position 10 pressure" },
    },
    required: ["date", "unitId"],
  },
};

const SYSTEM_INSTRUCTION = `You are a world-class, highly flexible OCR data extraction AI for heavy equipment maintenance.
Task: Extract tire pressure inspection data from the provided document (PDF/Image/Excel). 
CRITICAL: The document layouts, table structures, and languages will vary wildly. Some may be handwritten, some may be misaligned CSVs. Be extremely adaptive and infer the data logically even if standard labels are missing.

Guidelines:
1. Date: Find the inspection date anywhere in the document. Normalize to DD/MM/YYYY. If multiple dates exist, use the most recent inspection date.
2. Unit ID: Look for identifiers representing the truck/machine. It might be labeled 'Veh', 'Machine Number', 'Truck', 'Unit No', 'Equipment', or just be an alphanumeric code like 'RD3487', 'GR3351', 'DZ3335'. Remove all spaces from the Unit ID (e.g., 'RD 4324' must become 'RD4324').
3. SMU/Hours: Service Meter Unit (operating hours). Look for 'SMU', 'Veh Hours', 'Hour', 'HM', 'KM', 'Odo', or 'Vehicle Life'. Round the value to the nearest whole number (e.g., '234.7' becomes '235'). If you absolutely cannot find it, leave it empty.
4. Tires (Adaptive Mapping): Find the tire pressure readings. 
   - Look for the "Press. (PSI)" or "Pressure" section.
   - Extract the HANDWRITTEN pressure values for each tire position.
   - CRITICAL FOR IBO FORMS: Sometimes the 'Actual' column is left blank, and the mechanic writes the actual measured pressure under the 'Rec.' (Recommended) or 'Target' column by mistake. If you see handwritten numbers in the pressure section, EXTRACT THEM as the pressure values, regardless of whether they are under 'Actual' or 'Rec.'.
   - Extract the pressure values sequentially (Pos 1, Pos 2, Pos 3, up to Pos 10) based on reading order (top-to-bottom or left-to-right).
   - Ignore specific header numbering like "1, 10, 11, 12" and simply map the first pressure found to Pos 1, the second to Pos 2, etc.
   - For example: if the document shows pressures [120, 120, 120, 120], map them exactly as: Pos 1: 120, Pos 2: 120, Pos 3: 120, Pos 4: 120.
   - Strip out any units like 'psi' or 'bar' and return only the number.
5. Multiple Units: If the document contains multiple units/trucks on the same page or sheet, create a separate JSON object record for EACH unit. Scan the ENTIRE document thoroughly to ensure NO units are missed.
6. Noise Reduction: Ignore irrelevant data like Serial Numbers, Inspector Names, or tread depth (e.g. RTD/OTD column with formats like "11.5/25=46%" or "11 | 12"). Do NOT mistake tread depth (small numbers) for tire pressure. Focus ONLY on Date, Unit ID, SMU, and the actual tire pressures in the pressure block.

Return the data strictly according to the provided JSON schema. If a document is completely unreadable or contains zero tire pressure data, return an empty array. Do your absolute best to find and extract every piece of relevant data.`;

export async function POST(req: Request) {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ error: "GEMINI_API_KEY is not configured on the server." }, { status: 500 });
    }

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const body = await req.json();

    let parts: any[] = [];

    if (body.type === "text") {
      parts = [{ text: `Extract data from this spreadsheet content (File: ${body.fileName}).\n\n${body.content}` }];
    } else if (body.type === "image" || body.type === "inlineData") {
      parts = [
        { text: `Extract data from this document (File: ${body.fileName}).` },
        { inlineData: { mimeType: body.mimeType, data: body.content || body.data } }
      ];
    } else {
      return NextResponse.json({ error: "Invalid payload type." }, { status: 400 });
    }

    const extractionResponse = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ parts }],
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: EXTRACTION_SCHEMA
      }
    });

    const text = extractionResponse.text;
    if (!text) {
      return NextResponse.json({ error: "No text returned from AI." }, { status: 500 });
    }

    const parsed = JSON.parse(text);

    // Post-processing to guarantee the exact format requested
    if (Array.isArray(parsed)) {
      parsed.forEach(item => {
        // Remove spaces from Unit ID (e.g., "RD 4324" -> "RD4324")
        if (item.unitId && typeof item.unitId === 'string') {
          item.unitId = item.unitId.replace(/\s+/g, '');
        }

        // Round SMU to nearest integer
        if (item.smu && typeof item.smu === 'string') {
          const smuFloat = parseFloat(item.smu.replace(',', '.'));
          if (!isNaN(smuFloat)) {
            item.smu = Math.round(smuFloat).toString();
          }
        }
      });
    }

    return NextResponse.json({ data: parsed });
  } catch (error: any) {
    console.error("API Error:", error);
    return NextResponse.json({ error: error.message || "Failed to process request." }, { status: 500 });
  }
}
