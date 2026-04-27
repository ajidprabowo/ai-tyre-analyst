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

Return the data strictly according to the provided JSON schema.`;

export async function POST(req: Request) {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ error: "GEMINI_API_KEY is not configured on the server." }, { status: 500 });
    }

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const body = await req.json();

    let parts = [];

    if (body.type === "text") {
      parts = [{ text: `Extract data from this spreadsheet content. The data is provided in CSV format from multiple sheets.\n\n${body.text}` }];
    } else if (body.type === "inlineData") {
      parts = [
        { text: "Extract data from this document." },
        { inlineData: { mimeType: body.mimeType, data: body.data } }
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

    return NextResponse.json({ data: JSON.parse(text) });
  } catch (error: any) {
    console.error("API Error:", error);
    return NextResponse.json({ error: error.message || "Failed to process request." }, { status: 500 });
  }
}
