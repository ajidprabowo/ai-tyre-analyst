import { GoogleGenAI, Type } from "@google/genai";
import { NextResponse } from "next/server";

export const maxDuration = 60;

const EXTRACTION_SCHEMA_ATI = {
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
      pos11: { type: Type.STRING, description: "Tire position 11 pressure" },
      pos12: { type: Type.STRING, description: "Tire position 12 pressure" },
    },
    required: ["date", "unitId"],
  },
};

const EXTRACTION_SCHEMA_WIS = {
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

const SYSTEM_INSTRUCTION_ATI = `You are a world-class, highly flexible OCR data extraction AI for heavy equipment maintenance.
Task: Extract tire pressure inspection data from the provided document (PDF/Image/Excel). 
CRITICAL: The document layouts, table structures, and languages will vary wildly. Some may be handwritten, some may be misaligned CSVs. Be extremely adaptive and infer the data logically even if standard labels are missing.

Guidelines:
1. Date: Find the inspection date anywhere in the document. Normalize to DD/MM/YYYY. If multiple dates exist, use the most recent inspection date.
2. Unit ID (EQUIPMENT NUMBER): Look for identifiers representing the truck/machine (e.g., 'Veh', 'Machine Number', 'Truck', 'Unit No', 'Equipment'). 
   DATABASE PREFIX UNIT: Gunakan library prefix 2-huruf ini sebagai acuan utama validasi unit number. Unit number selalu diawali dengan 2 huruf besar, diikuti oleh 2, 3, atau 4 angka:
   - AC, AS, BD, BL, BU, CB, CE, CO, CP, CR, CV, DL, DR, DU, DZ, EG, EP, ES, EX, FA, FL, FM, FT, GR, HO, IT, LO, LV, MI, PA, PP, PU, PV, RD, SA, SC, SE, SM, SN, SY, TA, TC, TH, TW, VA, VF, VT, VZ, WA, WD, WG, WO, ZZ.
   Contoh validasi: RD0051, AC6598, DZ0097, EX1255, GR1229, LO1125, LV5718, PU1008, VT0218, TW0006, WA1281.
   Pastikan tidak ada spasi antara prefix dan angka (Contoh: "RD 0051" menjadi "RD0051").
3. SMU/Hours: Service Meter Unit (operating hours). Look for 'SMU', 'Veh Hours', 'Hour', 'HM', 'KM', 'Odo', or 'Vehicle Life'. Round the value to the nearest whole number (e.g., '234.7' becomes '235'). If you absolutely cannot find it, leave it empty.
4. Tires (Adaptive Mapping): Find the tire pressure readings. 
   - CRITICAL RULE: YOU MUST ONLY EXTRACT HANDWRITTEN NUMBERS for tire pressure.
   - ABSOLUTELY IGNORE ALL MACHINE-PRINTED/TYPED NUMBERS in the pressure columns (such as historical or recommended printed values like "110" or "117").
   - If a tire position only has machine-printed numbers and NO handwritten numbers, YOU MUST LEAVE IT EMPTY.
   - Sometimes the mechanic writes the actual measured pressure under the 'Rec.' (Recommended) column by mistake. If it is HANDWRITTEN, extract it as the actual pressure.
   - Extract the HANDWRITTEN pressure values sequentially (Pos 1, Pos 2, Pos 3, up to Pos 12) based on reading order (top-to-bottom or left-to-right).
   - Ignore specific header numbering like "1, 10, 11, 12" and simply map the first handwritten pressure found to Pos 1, the second to Pos 2, etc.
   - Strip out any units like 'psi' or 'bar' and return only the number.
5. Multiple Units: If the document contains multiple units/trucks on the same page or sheet, create a separate JSON object record for EACH unit. Scan the ENTIRE document thoroughly to ensure NO units are missed.
6. Noise Reduction: Ignore irrelevant data like Serial Numbers, Inspector Names, or tread depth (e.g. RTD/OTD column with formats like "11.5/25=46%" or "11 | 12"). Do NOT mistake tread depth (small numbers) for tire pressure. Focus ONLY on Date, Unit ID, SMU, and the actual tire pressures in the pressure block.
7. ACCURACY & COMPLETENESS:
   - Extract ALL visible data. Do not skip any numbers that are written on the document.
   - If a field is truly blank or empty, leave it empty ("").
   - Your primary goal is to accurately reflect exactly what is on the page, nothing more, nothing less.

Return the data strictly according to the provided JSON schema. If a document is completely unreadable, return an empty array. 
CRITICAL RULES:
1. If there is a Unit ID but pressure columns are empty, you MUST still extract the Unit ID and SMU, and leave pressures empty.
2. If you find tire pressure data but cannot find a Unit ID or Date (e.g., continuation page), DO NOT return an empty array. Output "UNKNOWN" for the unitId and date, and extract the pressure data normally.
Do your absolute best to find and extract every piece of relevant data.`;

const SYSTEM_INSTRUCTION_WIS = `You are a world-class, highly flexible OCR data extraction AI for heavy equipment maintenance.
Task: Extract tire pressure and tread depth inspection data from the provided document (PDF/Image/Excel). 
CRITICAL: The document layouts, table structures, and languages will vary wildly. Some may be handwritten, some may be misaligned CSVs. Be extremely adaptive and infer the data logically even if standard labels are missing.

Guidelines:
1. Date: Find the inspection date anywhere in the document. Normalize to DD/MM/YYYY. If multiple dates exist, use the most recent inspection date.
2. Unit ID (EQUIPMENT NUMBER): Look for identifiers representing the truck/machine (e.g., 'Veh', 'Machine Number', 'Truck', 'Unit No', 'Equipment'). 
   DATABASE PREFIX UNIT: Gunakan library prefix 2-huruf ini sebagai acuan utama validasi unit number. Unit number selalu diawali dengan 2 huruf besar, diikuti oleh 2, 3, atau 4 angka:
   - AC, AS, BD, BL, BU, CB, CE, CO, CP, CR, CV, DL, DR, DU, DZ, EG, EP, ES, EX, FA, FL, FM, FT, GR, HO, IT, LO, LV, MI, PA, PP, PU, PV, RD, SA, SC, SE, SM, SN, SY, TA, TC, TH, TW, VA, VF, VT, VZ, WA, WD, WG, WO, ZZ.
   Contoh validasi: RD0051, AC6598, DZ0097, EX1255, GR1229, LO1125, LV5718, PU1008, VT0218, TW0006, WA1281.
   Pastikan tidak ada spasi antara prefix dan angka (Contoh: "RD 0051" menjadi "RD0051").
3. SMU/Hours: Service Meter Unit (operating hours). Look for 'SMU', 'Veh Hours', 'Hour', 'HM', 'KM', 'Odo', or 'Vehicle Life'. Round the value to the nearest whole number (e.g., '234.7' becomes '235'). If you absolutely cannot find it, leave it empty.
4. Tires (Adaptive Mapping): Find the tire pressure readings. 
   - CRITICAL RULE: YOU MUST ONLY EXTRACT HANDWRITTEN NUMBERS for tire pressure.
   - ABSOLUTELY IGNORE ALL MACHINE-PRINTED/TYPED NUMBERS in the pressure columns (like printed "110" or "117").
   - If a tire position only has machine-printed numbers and NO handwritten numbers, YOU MUST LEAVE IT EMPTY.
   - Sometimes the mechanic writes the actual measured pressure under the 'Rec.' column by mistake. If it is HANDWRITTEN, extract it as the actual pressure.
   - Extract the HANDWRITTEN pressure values sequentially (Pos 1, Pos 2, Pos 3, up to Pos 12).
5. Tread Depth: Find the tread depth readings (e.g., labeled "Tread Depth", "RTD/OTD").
   - CRITICAL RULE: YOU MUST ONLY EXTRACT HANDWRITTEN NUMBERS for tread depth.
   - ABSOLUTELY IGNORE ALL MACHINE-PRINTED/TYPED NUMBERS (e.g., printed "91/91" or "92/90"). If a position only has machine-printed tread numbers, YOU MUST LEAVE IT EMPTY.
   - There are usually two HANDWRITTEN tread depth values for each tire position (Tread 1 and Tread 2).
   - Extract both HANDWRITTEN values and assign them to the corresponding position (e.g., pos1_tread1, pos1_tread2).
   - If only one handwritten value is present, assign it to tread1 and leave tread2 empty.
6. Multiple Units: If the document contains multiple units/trucks on the same page or sheet, create a separate JSON object record for EACH unit. Scan the ENTIRE document thoroughly to ensure NO units are missed.
7. Noise Reduction: Ignore irrelevant data like Serial Numbers or Inspector Names. Focus ONLY on Date, Unit ID, SMU, tire pressures, and tread depths.
8. ACCURACY & COMPLETENESS:
   - Extract ALL visible data. Do not skip any numbers that are written on the document.
   - If a field is truly blank or empty, leave it empty ("").
   - Your primary goal is to accurately reflect exactly what is on the page, nothing more, nothing less.

Return the data strictly according to the provided JSON schema. If a document is completely unreadable, return an empty array. 
CRITICAL RULES:
1. If there is a Unit ID but pressure/tread columns are empty, you MUST still extract the Unit ID and SMU, and leave pressures/treads empty.
2. If you find tire pressure/tread data but cannot find a Unit ID or Date (e.g., continuation page), DO NOT return an empty array. Output "UNKNOWN" for the unitId and date, and extract the pressure/tread data normally.
Do your absolute best to find and extract every piece of relevant data.`;

export async function POST(req: Request) {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ error: "GEMINI_API_KEY is not configured on the server." }, { status: 500 });
    }

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const body = await req.json();
    
    const extractionType = body.extractionType || 'ATI';
    const schema = extractionType === 'WIS' ? EXTRACTION_SCHEMA_WIS : EXTRACTION_SCHEMA_ATI;
    const systemInstruction = extractionType === 'WIS' ? SYSTEM_INSTRUCTION_WIS : SYSTEM_INSTRUCTION_ATI;

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
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
        responseSchema: schema
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
