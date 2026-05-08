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
      pos1_tread1: { type: Type.STRING, description: "Tire position 1 tread 1" },
      pos1_tread2: { type: Type.STRING, description: "Tire position 1 tread 2" },
      pos2: { type: Type.STRING, description: "Tire position 2 pressure" },
      pos2_tread1: { type: Type.STRING, description: "Tire position 2 tread 1" },
      pos2_tread2: { type: Type.STRING, description: "Tire position 2 tread 2" },
      pos3: { type: Type.STRING, description: "Tire position 3 pressure" },
      pos3_tread1: { type: Type.STRING, description: "Tire position 3 tread 1" },
      pos3_tread2: { type: Type.STRING, description: "Tire position 3 tread 2" },
      pos4: { type: Type.STRING, description: "Tire position 4 pressure" },
      pos4_tread1: { type: Type.STRING, description: "Tire position 4 tread 1" },
      pos4_tread2: { type: Type.STRING, description: "Tire position 4 tread 2" },
      pos5: { type: Type.STRING, description: "Tire position 5 pressure" },
      pos5_tread1: { type: Type.STRING, description: "Tire position 5 tread 1" },
      pos5_tread2: { type: Type.STRING, description: "Tire position 5 tread 2" },
      pos6: { type: Type.STRING, description: "Tire position 6 pressure" },
      pos6_tread1: { type: Type.STRING, description: "Tire position 6 tread 1" },
      pos6_tread2: { type: Type.STRING, description: "Tire position 6 tread 2" },
      pos7: { type: Type.STRING, description: "Tire position 7 pressure" },
      pos7_tread1: { type: Type.STRING, description: "Tire position 7 tread 1" },
      pos7_tread2: { type: Type.STRING, description: "Tire position 7 tread 2" },
      pos8: { type: Type.STRING, description: "Tire position 8 pressure" },
      pos8_tread1: { type: Type.STRING, description: "Tire position 8 tread 1" },
      pos8_tread2: { type: Type.STRING, description: "Tire position 8 tread 2" },
      pos9: { type: Type.STRING, description: "Tire position 9 pressure" },
      pos9_tread1: { type: Type.STRING, description: "Tire position 9 tread 1" },
      pos9_tread2: { type: Type.STRING, description: "Tire position 9 tread 2" },
      pos10: { type: Type.STRING, description: "Tire position 10 pressure" },
      pos10_tread1: { type: Type.STRING, description: "Tire position 10 tread 1" },
      pos10_tread2: { type: Type.STRING, description: "Tire position 10 tread 2" },
      pos11: { type: Type.STRING, description: "Tire position 11 pressure" },
      pos11_tread1: { type: Type.STRING, description: "Tire position 11 tread 1" },
      pos11_tread2: { type: Type.STRING, description: "Tire position 11 tread 2" },
      pos12: { type: Type.STRING, description: "Tire position 12 pressure" },
      pos12_tread1: { type: Type.STRING, description: "Tire position 12 tread 1" },
      pos12_tread2: { type: Type.STRING, description: "Tire position 12 tread 2" },
    },
    required: ["date", "unitId"],
  },
};

const SYSTEM_INSTRUCTION = `You are a world-class, highly flexible OCR data extraction AI for heavy equipment maintenance.
Task: Extract tire pressure and tread depth inspection data from the provided document (PDF/Image/Excel). 
CRITICAL: The document layouts, table structures, and languages will vary wildly. Some may be handwritten, some may be misaligned CSVs. Be extremely adaptive and infer the data logically even if standard labels are missing.

Guidelines:
1. Date: Find the inspection date anywhere in the document. Normalize to DD/MM/YYYY. If multiple dates exist, use the most recent inspection date.
2. Unit ID: Look for identifiers representing the truck/machine. It might be labeled 'Veh', 'Machine Number', 'Truck', 'Unit No', 'Equipment', or just be an alphanumeric code like 'RD3487', 'GR3351', 'DZ3335'. Remove all spaces from the Unit ID (e.g., 'RD 4324' must become 'RD4324').
3. SMU/Hours: Service Meter Unit (operating hours). Look for 'SMU', 'Veh Hours', 'Hour', 'HM', 'KM', 'Odo', or 'Vehicle Life'. Round the value to the nearest whole number (e.g., '234.7' becomes '235'). If you absolutely cannot find it, leave it empty.
4. Tires (Adaptive Mapping): Find the tire pressure readings. 
   - Look for the "Press. (PSI)" or "Pressure" section.
   - Extract the HANDWRITTEN pressure values for each tire position.
   - CRITICAL FOR IBO FORMS: Sometimes the 'Actual' column is left blank, and the mechanic writes the actual measured pressure under the 'Rec.' (Recommended) or 'Target' column by mistake. If you see handwritten numbers in the pressure section, EXTRACT THEM as the pressure values, regardless of whether they are under 'Actual' or 'Rec.'.
   - Extract the pressure values sequentially (Pos 1, Pos 2, Pos 3, up to Pos 12) based on reading order (top-to-bottom or left-to-right).
   - Ignore specific header numbering like "1, 10, 11, 12" and simply map the first pressure found to Pos 1, the second to Pos 2, etc.
   - For example: if the document shows pressures [120, 120, 120, 120], map them exactly as: Pos 1: 120, Pos 2: 120, Pos 3: 120, Pos 4: 120.
   - Strip out any units like 'psi' or 'bar' and return only the number.
5. Tread Depth: Find the tread depth readings (e.g., labeled "Tread Depth", "RTD/OTD").
   - There are usually two tread depth values for each tire position (Tread 1 and Tread 2). They might be written next to each other like "61 | 61" or "51 53".
   - Extract both values and assign them to the corresponding position (e.g., pos1_tread1, pos1_tread2).
   - If only one value is present, assign it to tread1 and leave tread2 empty.
   - If separated by lines, spaces, or slashes, parse them into the two separate fields.
6. Multiple Units: If the document contains multiple units/trucks on the same page or sheet, create a separate JSON object record for EACH unit. Scan the ENTIRE document thoroughly to ensure NO units are missed.
7. Noise Reduction: Ignore irrelevant data like Serial Numbers or Inspector Names. Focus ONLY on Date, Unit ID, SMU, tire pressures, and tread depths.

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
