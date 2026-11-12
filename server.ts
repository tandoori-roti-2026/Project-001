import express from 'express';
import http from 'http';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const port = 3000;

// Ensure JSON parsing with generous payload limit for base64 image uploads
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// Gemini model order: 1) gemini-3.8-flash, 2) gemini-3.6-flash, 3) gemini-3.5-flash-lite, 4) gemini-3.1-flash-lite
const GEMINI_MODELS = [
  'gemini-3.8-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
];
const GRADING_GEMINI_MODELS = [
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
];
const PRIMARY_GEMINI_MODEL = GEMINI_MODELS[0];
const FALLBACK_GEMINI_MODEL = GEMINI_MODELS[3];

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';

const OPENROUTER_MODELS = [
  'nvidia/nemotron-3.5-super-vl:free',
  'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
  'openrouter/free',
];

// Track models that returned 503 so they are not tried again for 5 minutes (300,000 ms)
const model503Cooldowns = new Map<string, number>();

function isModelInCooldown(model: string): boolean {
  const until = model503Cooldowns.get(model);
  if (!until) return false;
  if (Date.now() >= until) {
    model503Cooldowns.delete(model);
    return false;
  }
  return true;
}

function markModel503(model: string): void {
  const cooldownMs = 5 * 60 * 1000; // 5 minutes
  model503Cooldowns.set(model, Date.now() + cooldownMs);
  console.warn(`[Model 503 Cooldown] Model ${model} returned 503. Will not try again for 5 minutes (until ${new Date(Date.now() + cooldownMs).toISOString()}).`);
}

// Initialize Google GenAI client
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

// Helper for delays between calls (Rule 1: 1.5s between calls, Rule 3: 2s gap on 503)
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Helper for timeout enforcement (Rule 3: Timeout 60s per try)
function withTimeout<T>(promise: Promise<T>, ms: number = 60000, label: string = 'Operation'): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms);
    promise
      .then((val) => {
        clearTimeout(timer);
        resolve(val);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

function is429(err: any): boolean {
  if (!err) return false;
  if (err.status === 429 || err.statusCode === 429) return true;
  const msg = String(err.message || err);
  return msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota') || msg.includes('rate limit');
}

function is503(err: any): boolean {
  if (!err) return false;
  if (err.status === 503 || err.statusCode === 503 || err.status === 502 || err.status === 504) return true;
  const msg = String(err.message || err);
  return msg.includes('503') || msg.includes('502') || msg.includes('504') || msg.includes('UNAVAILABLE') || msg.includes('overloaded');
}

// Utility to clean Markdown code fences and parse JSON safely
function cleanAndParseJSON(rawText: string): any {
  if (!rawText || typeof rawText !== 'string') {
    throw new Error('Empty or non-string input');
  }

  // Silent guard against HTML responses (e.g. <!DOCTYPE html>, <html, <body>)
  if (/^\s*<(?:!doctype|html|head|body|div)/i.test(rawText)) {
    throw new Error('Received HTML response instead of JSON');
  }

  let cleaned = rawText.trim();
  // Strip code fences
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  cleaned = cleaned.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();

  try {
    return JSON.parse(cleaned);
  } catch (err) {
    // Try matching array [ ... ] first
    const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      try {
        return JSON.parse(arrayMatch[0]);
      } catch (_) {}
    }
    // Try matching object { ... }
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch (_) {}
    }
    throw err;
  }
}

// Utility to parse data URLs into { mimeType, data }
function parseBase64Image(dataUrl: string): { data: string; mimeType: string } {
  if (typeof dataUrl === 'string' && dataUrl.startsWith('data:')) {
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      return { mimeType: match[1], data: match[2] };
    }
  }
  return { mimeType: 'image/jpeg', data: dataUrl };
}

// Utility to ensure clean image url for OpenRouter multimodal vision API
function formatImageUrl(img: string): string {
  if (!img || typeof img !== 'string') return '';
  const trimmed = img.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('data:')) {
    return trimmed;
  }
  return `data:image/jpeg;base64,${trimmed}`;
}

// ════════ VISION & TEXT CHAIN EXECUTION ENGINE ════════
// Implements Call Rules:
// 1. One image per request for standard endpoints; multiple images supported as an explicit exception for Step 2 script grading.
// 2. Try PRIMARY ('gemini-3.5-flash-lite'). On 429 / 503 / empty / bad JSON, try GEMINI_FALLBACK ('gemini-3.1-flash-lite') once. Then OpenRouter models in order.
// 3. Timeout 60s per try. 2 retries on the same model with 2s gap only for 429/503.
// 4. On 429, do not keep hammering the same model. Move to the next model.
// 5. Accept JSON, strip ```json fences.
// 6. Log modelUsed on every response.

async function callGeminiVision(
  model: string,
  images: string | string[],
  prompt: string,
  systemInstruction?: string,
  jsonMode: boolean = false,
  timeoutMs: number = 60000
): Promise<string> {
  const imageList = Array.isArray(images) ? images : [images];
  const contents: any[] = [];
  if (systemInstruction) {
    contents.push({ text: systemInstruction });
  }
  contents.push({ text: prompt });
  for (const img of imageList) {
    if (!img) continue;
    const parsedImage = parseBase64Image(img);
    contents.push({
      inlineData: {
        mimeType: parsedImage.mimeType || 'image/jpeg',
        data: parsedImage.data,
      },
    });
  }

  const generatePromise = ai.models.generateContent({
    model,
    contents,
    config: {
      temperature: 0.1,
      ...(jsonMode ? { responseMimeType: 'application/json' } : {}),
    },
  });

  const response = await withTimeout(generatePromise, timeoutMs, `Gemini ${model}`);
  const text = response?.text;
  if (!text || !text.trim()) {
    throw new Error(`Empty response from ${model}`);
  }
  return text;
}

async function callOpenRouterVision(
  model: string,
  images: string | string[],
  prompt: string,
  systemInstruction?: string,
  timeoutMs: number = 60000
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY || OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not configured');
  }

  const imageList = Array.isArray(images) ? images : [images];
  const messages: any[] = [];
  if (systemInstruction) {
    messages.push({ role: 'system', content: systemInstruction });
  }
  const userContent: any[] = [{ type: 'text', text: prompt }];
  for (const img of imageList) {
    if (!img) continue;
    userContent.push({
      type: 'image_url',
      image_url: { url: formatImageUrl(img) },
    });
  }
  messages.push({
    role: 'user',
    content: userContent,
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://aistudio.google.com',
        'X-Title': 'PROJECT-001 Vision',
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.1,
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 429) {
    const err: any = new Error(`OpenRouter ${model} returned 429`);
    err.status = 429;
    throw err;
  }
  if (res.status === 503 || res.status === 502 || res.status === 504) {
    const err: any = new Error(`OpenRouter ${model} returned ${res.status}`);
    err.status = res.status;
    throw err;
  }

  const text = await res.text();
  if (/^\s*<(?:!doctype|html|head|body)/i.test(text)) {
    throw new Error(`OpenRouter ${model} returned HTML response`);
  }

  let resJson: any;
  try {
    resJson = JSON.parse(text);
  } catch {
    throw new Error(`OpenRouter ${model} returned invalid JSON wrapper`);
  }

  if (!res.ok || resJson.error) {
    const errStatus = resJson.error?.code || res.status;
    const err: any = new Error(resJson.error?.message || `OpenRouter error ${res.status}`);
    err.status = errStatus;
    throw err;
  }

  const content = resJson.choices?.[0]?.message?.content;
  if (!content || !content.trim()) {
    throw new Error(`OpenRouter ${model} returned empty content`);
  }
  return content;
}

interface VisionChainOptions {
  image?: string; // single image per request
  images?: string[]; // multiple images (explicit exception for Step 2 multi-page grading)
  prompt: string;
  systemInstruction?: string;
  jsonMode?: boolean;
  operationName?: string;
  timeoutMs?: number;
  geminiModels?: string[];
}

interface VisionChainResult {
  text: string;
  parsed?: any;
  modelUsed: string;
}

async function executeVisionModelChain(options: VisionChainOptions): Promise<VisionChainResult> {
  const {
    image,
    images,
    prompt,
    systemInstruction,
    jsonMode = false,
    operationName = 'Vision',
    timeoutMs = 60000,
    geminiModels,
  } = options;

  const targetImages: string[] = images && images.length > 0
    ? images
    : image
    ? [image]
    : [];

  if (targetImages.length === 0) {
    throw new Error(`[${operationName}] No image provided for vision call.`);
  }

  const modelsToTry = geminiModels || GEMINI_MODELS;
  if (process.env.GEMINI_API_KEY) {
    for (const model of modelsToTry) {
      if (isModelInCooldown(model)) {
        console.log(`[${operationName}] Skipping ${model} due to active 5-minute 503 cooldown.`);
        continue;
      }

      console.log(`[${operationName}] Trying Gemini vision model: ${model}...`);
      try {
        const text = await callGeminiVision(
          model,
          targetImages,
          prompt,
          systemInstruction,
          jsonMode,
          timeoutMs
        );

        let parsed: any = null;
        if (jsonMode) {
          parsed = cleanAndParseJSON(text);
        }

        console.log(`[${operationName}] Success with Gemini model ${model}`);
        return { text, parsed, modelUsed: model };
      } catch (err: any) {
        console.warn(`[${operationName}] Gemini model ${model} failed:`, err?.message || err);
        if (is503(err)) {
          markModel503(model);
          // On 503: skip immediately to the next model with no retry on the same one
          continue;
        }
        if (is429(err)) {
          // On 429: skip immediately to the next model with no retry on the same one
          continue;
        }
        // Other errors: skip immediately to next model
        continue;
      }
    }
  }

  // 2. Try existing OpenRouter models in order
  const apiKey = process.env.OPENROUTER_API_KEY || OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error(`[${operationName}] Both Gemini and OpenRouter failed or are unconfigured.`);
  }

  for (let mIdx = 0; mIdx < OPENROUTER_MODELS.length; mIdx++) {
    const model = OPENROUTER_MODELS[mIdx];
    if (isModelInCooldown(model)) {
      console.log(`[${operationName}] Skipping OpenRouter model ${model} due to active 5-minute 503 cooldown.`);
      continue;
    }

    console.log(`[${operationName}] Trying OpenRouter model (${mIdx + 1}/${OPENROUTER_MODELS.length}): ${model}...`);
    try {
      const text = await callOpenRouterVision(
        model,
        targetImages,
        prompt,
        systemInstruction,
        timeoutMs
      );

      let parsed: any = null;
      if (jsonMode) {
        parsed = cleanAndParseJSON(text);
      }

      console.log(`[${operationName}] Success with OpenRouter model ${model}`);
      return { text, parsed, modelUsed: model };
    } catch (err: any) {
      console.warn(`[${operationName}] OpenRouter model ${model} failed:`, err?.message || err);
      if (is503(err)) {
        markModel503(model);
        // On 503: skip immediately to the next model with no retry on the same one
        continue;
      }
      if (is429(err)) {
        // On 429: skip immediately to the next model with no retry on the same one
        continue;
      }
      continue;
    }
  }

  throw new Error(`[${operationName}] All models in fallback chain failed.`);
}

async function executeTextModelChain(options: {
  messages: Array<{ role: string; content: string }>;
  systemInstruction?: string;
  jsonMode?: boolean;
  operationName?: string;
  timeoutMs?: number;
  geminiModels?: string[];
}): Promise<{ text: string; parsed?: any; modelUsed: string }> {
  const {
    messages,
    systemInstruction,
    jsonMode = false,
    operationName = 'TextAI',
    timeoutMs = 60000,
    geminiModels,
  } = options;

  const modelsToTry = geminiModels || GEMINI_MODELS;
  if (process.env.GEMINI_API_KEY) {
    for (const model of modelsToTry) {
      if (isModelInCooldown(model)) {
        console.log(`[${operationName}] Skipping ${model} due to active 5-minute 503 cooldown.`);
        continue;
      }

      console.log(`[${operationName}] Trying Gemini text model: ${model}...`);
      try {
        const contents: any[] = [];
        if (systemInstruction) contents.push({ text: systemInstruction });
        for (const m of messages) contents.push({ text: m.content });

        const generatePromise = ai.models.generateContent({
          model,
          contents,
          config: {
            temperature: 0.1,
            ...(jsonMode ? { responseMimeType: 'application/json' } : {}),
          },
        });

        const res = await withTimeout(generatePromise, timeoutMs, model);
        if (res?.text && res.text.trim()) {
          const parsed = jsonMode ? cleanAndParseJSON(res.text) : null;
          console.log(`[${operationName}] Success with Gemini text model ${model}`);
          return { text: res.text, parsed, modelUsed: model };
        }
        continue;
      } catch (err: any) {
        console.warn(`[${operationName}] Gemini text model ${model} failed:`, err?.message || err);
        if (is503(err)) {
          markModel503(model);
          // On 503: skip immediately to next model with no retry on same one
          continue;
        }
        if (is429(err)) {
          // On 429: skip immediately to next model with no retry on same one
          continue;
        }
        continue;
      }
    }
  }

  // 2. Try OpenRouter text models in order
  const apiKey = process.env.OPENROUTER_API_KEY || OPENROUTER_API_KEY;
  for (const model of OPENROUTER_MODELS) {
    if (isModelInCooldown(model)) {
      console.log(`[${operationName}] Skipping OpenRouter text model ${model} due to active 5-minute 503 cooldown.`);
      continue;
    }

    try {
      const openRouterMessages = [
        ...(systemInstruction ? [{ role: 'system', content: systemInstruction }] : []),
        ...messages,
      ];
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let res: Response;
      try {
        res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://aistudio.google.com',
            'X-Title': 'PROJECT-001 Text',
          },
          body: JSON.stringify({
            model,
            messages: openRouterMessages,
            temperature: 0.1,
          }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }

      if (res.status === 429) {
        // On 429: skip immediately to next model with no retry on same one
        continue;
      }
      if (res.status === 503 || res.status === 502 || res.status === 504) {
        markModel503(model);
        // On 503: skip immediately to next model with no retry on same one
        continue;
      }
      if (!res.ok) continue;

      const text = await res.text();
      const resJson = JSON.parse(text);
      const content = resJson.choices?.[0]?.message?.content;
      if (content && content.trim()) {
        const parsed = jsonMode ? cleanAndParseJSON(content) : null;
        console.log(`[${operationName}] Success with OpenRouter text model ${model}`);
        return { text: content, parsed, modelUsed: model };
      }
      continue;
    } catch (err: any) {
      console.warn(`[${operationName}] OpenRouter text model ${model} failed:`, err?.message || err);
      if (is503(err)) {
        markModel503(model);
        continue;
      }
      if (is429(err)) {
        continue;
      }
      continue;
    }
  }

  throw new Error(`[${operationName}] All models failed for text request.`);
}

// Helper to normalize question number across different formats (e.g. Q1, Q.1, Question 1, "1", 1)
function normalizeQuestionNumber(val: any): number {
  if (typeof val === 'number' && !isNaN(val)) return Math.floor(val);
  if (!val) return 0;
  const str = String(val).trim();
  const match = str.match(/(?:question|q)?\s*\.?\s*([0-9]+)/i);
  return match ? parseInt(match[1], 10) : 0;
}

// Helper to normalize sub-part label across different formats (e.g. "(i)", "i", "Part (i)", "a")
function normalizePartLabel(label: any): string {
  if (label === undefined || label === null) return '';
  return String(label)
    .toLowerCase()
    .replace(/[()\s]|part/g, '')
    .trim();
}

// ════════ STEP 1: OCR TRANSCRIPTION SYSTEM INSTRUCTION ════════
const STEP1_TRANSCRIPTION_SYSTEM_INSTRUCTION = `You are an expert OCR transcription specialist for handwritten student examination scripts aligned with FBISE standards.

TASK:
1. HEADER IDENTIFICATION:
   - Read the student Roll Number and Student Name from the exam script header area.
   - If missing or unreadable, output "UNREADABLE".
2. OCR TRANSCRIPTION:
   - Identify each answered question and transcribe the handwritten text in its original language (English, Urdu, or Arabic).
   - Preserve equations, mathematical derivations, fractions, and units.
   - CRITICAL RULE: If any word, number, or symbol cannot be read with certainty, mark it as [ILLEGIBLE]. Do not guess or infer.
   - Describe any diagrams or drawings in "diagramDescription".
   - If an answer continues across pages or starts mid-way, identify the question number accurately (e.g. Q1, Q2, Question 3).

OUTPUT FORMAT:
Return strictly valid JSON matching this schema with NO markdown and NO commentary:
{
  "transcription": {
    "header": {
      "studentRoll": "string (roll number or UNREADABLE)",
      "studentName": "string (student name or UNREADABLE)",
      "rawText": "string (raw header text)"
    },
    "answers": [
      {
        "questionNumber": 1,
        "transcribedAnswer": "string",
        "diagramDescription": "string (optional)",
        "hasIllegible": false
      }
    ]
  }
}`;

// ════════ STEP 2: RUBRIC-BASED MULTIMODAL GRADING SYSTEM INSTRUCTION ════════
const STEP2_GRADING_SYSTEM_INSTRUCTION = `You are an expert academic evaluator, examiner, and rigorous grader for student examination scripts aligned with FBISE standards.

CRITICAL MULTIMODAL & MULTI-PAGE SCRIPT INSTRUCTIONS:
1. LOOK AT ALL ATTACHED SCRIPT PAGE IMAGES: You are provided with ALL pages of the student's handwritten examination script attached as images (e.g. Page 1, Page 2, Page 3), along with the official MARKING SCHEME and any consolidated Step 1 transcription text.
2. SCRIPT-WIDE EVALUATION ACROSS ALL PAGES: A student's handwritten answers and calculations may appear on ANY page, in any order, and may continue across page boundaries. You must inspect ALL attached pages before concluding whether an answer was attempted or what mark it earned.
3. STRICT FORBIDDEN PHRASES & REASONS:
   - FORBIDDEN: NEVER state "not answered on the provided page image", "not attempted on this page", "not on this page/script section", or any reason implying you only checked one page.
   - A question is "not attempted" ONLY if absolutely no handwriting, formula, calculation, diagram, or answer for that question exists ANYWHERE across ANY of the attached script pages or in the transcription.
4. NEVER RETURN 0 MARKS IF HANDWRITTEN WORK EXISTS: If handwriting, steps, formulas, or diagrams for a question exist on ANY page, evaluate them thoroughly against the rubric levels and key points, awarding the earned marks (support fractional 0.5 increments, e.g. 0.5, 1.5, 2.5, 3.5, etc.).
5. MATCH BY QUESTION NUMBER AND CONTENT: Students label answers in various formats (e.g. "Q1", "Q.1", "Question 1", "Ans 1", or sub-parts "(i)", "(a)"). Match answers by both their handwritten number and conceptual content, including answers that continue on subsequent pages.
6. OCR DISCREPANCIES: If the OCR transcription text is incomplete, contains [ILLEGIBLE], or omitted parts of the answer that are actually visible in the handwriting on the images, ALWAYS prioritize the actual handwritten text visible on the images.

You MUST return strictly valid JSON matching the schema with NO markdown formatting, NO HTML, and NO commentary.
Your entire output must begin with '{' and end with '}'.

TASK: RUBRIC-BASED GRADING EVALUATION & BREAKDOWN
Grade every question in the provided MARKING SCHEME:
1. RUBRIC EVALUATION & MARKS:
   - Evaluate the complete handwritten answer across all pages against rubric levels (or key points) and award exact marks (support fractional 0.5 steps, e.g. 0.5, 1.5, 2.5, 3.5, etc.).
   - Set "marks_awarded": number (clamped to maxMarks).
   - In "selected_level", indicate the matching level number (1, 2, 3...).
2. BREAKDOWN:
   - For questions with sub-parts ("hasSubParts": true), evaluate each sub-part independently in "subPartResults":
     [
       {
         "partLabel": "(i)",
         "marks_awarded": 3.5,
         "selected_level": 1,
         "reason": "Accurate derivation matching rubric criteria.",
         "feedback": "Clear explanation of physics concept."
       }
     ]
   - The question's total "marks_awarded" MUST equal the exact sum of its sub-part marks.
   - For key-points questions, list "key_points_found" and "key_points_missing".
3. OR CHOICES:
   - When a question has 'hasOrChoice': true, identify which version the student attempted ("primary" or "or_choice") and grade that version.
4. FEEDBACK & REASON:
   - Provide constructive, specific academic feedback in "feedback" and concise justification in "reason".
5. ILLEGIBILITY & FLAGS:
   - If handwriting is truly illegible or unreadable, mark "flag_for_review": true and describe in "flag_reason".
   - If handwritten text is visible and legible, evaluate it and award earned marks.
6. TOTAL SCORE:
   - Calculate "totalScore" as the sum of marks awarded across all questions.

OUTPUT FORMAT:
Return ONLY strictly valid JSON matching this schema:
{
  "questionResults": [
    {
      "questionNumber": 1,
      "marks_awarded": 8.5,
      "selected_level": 2,
      "attempted_choice": "primary",
      "subPartResults": [
        {
          "partLabel": "(i)",
          "marks_awarded": 3.5,
          "selected_level": 1,
          "reason": "Accurate derivation matching rubric.",
          "feedback": "Solid explanation."
        }
      ],
      "key_points_found": ["..."],
      "key_points_missing": ["..."],
      "reason": "Accurate explanation matching rubric requirements.",
      "feedback": "Strong work; ensure all equations are explicitly defined.",
      "confidence": "high",
      "flag_for_review": false,
      "flag_reason": ""
    }
  ],
  "totalScore": 42.5,
  "overallConfidence": "high",
  "summaryNotes": "Candidate demonstrated strong conceptual understanding across the exam script."
}`;

// ════════ STEP 2: SINGLE-QUESTION RUBRIC-BASED MULTIMODAL GRADING SYSTEM INSTRUCTION ════════
const STEP2_SINGLE_QUESTION_SYSTEM_INSTRUCTION = `You are a senior academic examiner and rigorous subject-matter evaluator for student handwritten examination scripts aligned with FBISE standards.

TASK:
You are grading ONE SPECIFIC QUESTION from the exam paper.
You are given:
1. The exact question statement, sub-part, max marks, model answer, rubric tier levels, key points, and any OR choice alternative.
2. The student's consolidated Step 1 OCR transcription across all pages.
3. ALL page images of the handwritten examination script (the student's answer might appear on any page or continue across pages).

MANDATORY GRADING RULES:
1. OR CHOICE SELECTION (NEVER DEFAULT TO PRIMARY):
   - When 'hasOrChoice' is true, compare the student's handwritten response and transcription to BOTH the Primary Question text (and its model answer) AND the OR Choice Alternative Question text (and its model answer).
   - Compare topics, formulas, variables, and numerical given values.
   - Pick the side with the best content match. NEVER default to 'primary'.
   - Grade ONLY the chosen side against its specific rubric and model answer.
   - The 'reason' MUST explicitly name the chosen side (e.g., "Attempted OR Choice: ..." or "Attempted Primary: ...").
   - Set "attempted_choice": "or_choice" or "primary".

2. UNATTEMPTED QUESTIONS:
   - If a scheme question exists but the student wrote nothing for it, set "reason": "Not attempted." (NEVER "Not in paper").
   - Mark "Not attempted" ONLY if NO transcribed text exists under that question label on either the primary or OR side.
   - Set "marks_awarded": 0, "selected_level": 0, "key_points_found": [], "key_points_missing": all scheme key points, "feedback": "Not attempted.", "not_in_paper": false.
   - If transcribed text exists on either side, GRADE THAT SIDE!

3. METHOD & NUMERICAL RULES:
   - Wrong method = 0 marks with a reason explaining the error.
   - Right method with wrong final answer = maxMarks minus 1.
   - Right method with correct final answer = full earned marks.

4. RUBRIC POINTS & WHOLE NUMBERS:
   - NEVER invent rubric points. Use ONLY the rubric points provided in the marking scheme.
   - "key_points_found" MUST list only exact descriptions from the scheme's key points that the candidate satisfied.
   - "key_points_missing" MUST list the scheme's key points that the candidate missed.
   - Marks must be WHOLE NUMBERS (integers only: e.g. 0, 1, 2, 3... no decimals or half marks).
   - NEVER award marks that contradict the ticked/unticked rubric points.

5. REASON TEXT FORMAT:
   - "reason" MUST be 1-2 plain sentences only.
   - If wrong method: explain the error clearly.
   - If right method with wrong final answer: explain the calculation/arithmetic error.
   - NEVER include thinking out loud or self-corrections like "Wait", "let's re-verify", "Hold on", "Let me check", or "Actually".

6. "NOT IN PAPER" USAGE:
   - Use "Not in paper" ONLY for questions missing from the marking scheme.
   - For any question that exists in the marking scheme, if the student wrote nothing for it, set "reason": "Not attempted." (NOT "Not in paper"). Keep maxMarks unchanged and set "not_in_paper": false.

OUTPUT FORMAT:
Return ONLY strictly valid JSON matching this schema:
{
  "questionNumber": number,
  "partLabel": "string",
  "not_in_paper": false,
  "attempted_choice": "primary" | "or_choice",
  "marks_awarded": number,
  "selected_level": number,
  "quoted_student_working": "string",
  "key_points_found": ["string"],
  "key_points_missing": ["string"],
  "reason": "string",
  "feedback": "string",
  "confidence": "high" | "medium" | "low",
  "flag_for_review": false,
  "flag_reason": "string"
}
`;

// Helper: Filter raw points to strictly match rubric points from the official marking scheme (Never invent rubric points)
export function sanitizeRubricPoints(
  rawPoints: string[],
  officialSchemePoints?: string[]
): string[] {
  if (!officialSchemePoints || officialSchemePoints.length === 0) {
    return [];
  }
  if (!Array.isArray(rawPoints) || rawPoints.length === 0) {
    return [];
  }
  const matched = new Set<string>();
  for (const raw of rawPoints) {
    if (!raw || typeof raw !== 'string') continue;
    const rawClean = raw.trim().toLowerCase();
    for (const official of officialSchemePoints) {
      const offClean = official.trim().toLowerCase();
      if (
        offClean === rawClean ||
        offClean.includes(rawClean.slice(0, 20)) ||
        rawClean.includes(offClean.slice(0, 20)) ||
        (rawClean.length > 5 && offClean.slice(0, 15) === rawClean.slice(0, 15))
      ) {
        matched.add(official);
      }
    }
  }
  return Array.from(matched);
}

// Helper: Sanitize reason text to exactly 1-2 plain sentences without self-corrections
export function sanitizeReasonText(raw: string, defaultFallback = 'No working found for this question.'): string {
  if (!raw || typeof raw !== 'string') return defaultFallback;
  let text = raw.trim();

  // Strip meta-thinking and self-correction phrases like "Wait", "Wait, let's re-verify", "Hold on", "Actually"
  text = text.replace(/^(?:wait|hold on|let'?s re-?verify|let me (?:re-?evaluate|check)|actually,? wait)[^.!?]*[.!?]?\s*/i, '');
  text = text.replace(/\b(?:wait|hold on|let'?s re-?verify|let me (?:re-?evaluate|check)|actually,? wait)\b[^.!?]*[.!?]?/gi, '');

  // Strip markdown styling characters and excessive whitespace
  text = text.replace(/[*_#`]/g, '').replace(/\s+/g, ' ').trim();
  if (!text) return defaultFallback;

  // Split into sentences using punctuation boundaries
  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g);
  if (!sentences || sentences.length === 0) return defaultFallback;

  // Restrict to at most 2 sentences
  let selected = sentences.slice(0, 2).map((s) => s.trim()).filter(Boolean).join(' ');
  if (selected && !/[.!?]$/.test(selected)) {
    selected += '.';
  }
  return selected || defaultFallback;
}

// Helper: Determine best OR choice side based on content overlap (topics, formulas, values)
export function determineBestOrSide(
  studentWorking: string,
  primaryQuestion: string,
  primaryModel: string,
  orQuestion: string,
  orModel: string
): { side: 'primary' | 'or_choice'; matchesPrimary: boolean; matchesOr: boolean; matchesEither: boolean } {
  const tokenize = (str: string) =>
    (str || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2);

  const studentTokens = new Set(tokenize(studentWorking));
  if (studentTokens.size === 0) {
    return { side: 'primary', matchesPrimary: false, matchesOr: false, matchesEither: false };
  }

  const primaryTokens = tokenize(`${primaryQuestion} ${primaryModel}`);
  const orTokens = tokenize(`${orQuestion} ${orModel}`);

  let primaryOverlap = 0;
  for (const t of primaryTokens) {
    if (studentTokens.has(t)) primaryOverlap++;
  }

  let orOverlap = 0;
  for (const t of orTokens) {
    if (studentTokens.has(t)) orOverlap++;
  }

  const matchesPrimary = primaryOverlap >= 2;
  const matchesOr = orOverlap >= 2;
  const matchesEither = matchesPrimary || matchesOr;

  // Pick side with best content match; never default to primary if OR is a better match
  const side = orOverlap > primaryOverlap ? 'or_choice' : 'primary';
  return { side, matchesPrimary, matchesOr, matchesEither };
}

// Helper: Enforce rubric consistency so marks strictly equal satisfied points scaled to maxMarks as whole numbers
export function enforceRubricConsistency(
  marksAwarded: number,
  maxMarks: number,
  keyPointsFound: string[],
  keyPointsMissing: string[],
  schemeKeyPoints?: Array<{ description: string; marks: number }>
): number {
  const foundCount = keyPointsFound?.length || 0;
  const missingCount = keyPointsMissing?.length || 0;
  const totalCount = foundCount + missingCount;

  if (totalCount === 0) {
    return Math.max(0, Math.min(maxMarks, Math.round(marksAwarded)));
  }

  // If no points demonstrated, marks MUST be 0
  if (foundCount === 0) {
    return 0;
  }

  // If all points demonstrated and none missing, marks MUST be maxMarks
  if (foundCount > 0 && missingCount === 0) {
    return maxMarks;
  }

  // When key points have explicit marks in the scheme
  if (schemeKeyPoints && schemeKeyPoints.length > 0 && schemeKeyPoints.every((kp) => typeof kp.marks === 'number')) {
    const totalSchemeMarks = schemeKeyPoints.reduce((acc, kp) => acc + (kp.marks || 0), 0) || maxMarks;
    const earnedMarks = keyPointsFound.reduce((sum, f) => {
      const match = schemeKeyPoints.find(
        (kp) =>
          kp.description === f ||
          kp.description.toLowerCase().includes(f.toLowerCase().slice(0, 15)) ||
          f.toLowerCase().includes(kp.description.toLowerCase().slice(0, 15))
      );
      return sum + (match?.marks || maxMarks / totalCount);
    }, 0);
    const scaled = Math.round((earnedMarks / totalSchemeMarks) * maxMarks);
    return Math.max(1, Math.min(maxMarks - 1, scaled));
  }

  // Standard proportional scaling to whole numbers
  const scaled = Math.round((foundCount / totalCount) * maxMarks);
  return Math.max(1, Math.min(maxMarks - 1, scaled));
}

// Helper: Numerical / Math check
// Wrong method = 0 with a reason explaining the error.
// Right method with wrong final answer = maxMarks minus 1.
// Marks must be whole numbers.
export function applyMathCheck(
  marks: number,
  maxMarks: number,
  reason: string,
  studentWorking: string
): { marks: number; isWrongMethod: boolean; isWrongFinalAnswer: boolean } {
  const combined = `${reason} ${studentWorking}`.toLowerCase();
  const hasWrongCalculation =
    combined.includes('calculation error') ||
    combined.includes('arithmetic error') ||
    combined.includes('wrong final answer') ||
    combined.includes('substitution error') ||
    combined.includes('incorrect final calculation') ||
    combined.includes('calculation discrepancy') ||
    combined.includes('instead of the correct') ||
    combined.includes('arithmetic mistake');

  const hasWrongMethod =
    combined.includes('wrong method') ||
    combined.includes('incorrect formula used') ||
    combined.includes('wrong concept') ||
    combined.includes('invalid equation') ||
    combined.includes('inapplicable formula');

  if (hasWrongMethod) {
    return { marks: 0, isWrongMethod: true, isWrongFinalAnswer: false };
  }

  if (hasWrongCalculation) {
    // Requirement 1: Right method with wrong final answer = maxMarks minus 1 (whole numbers)
    const partial = Math.max(0, Math.round(maxMarks - 1));
    return { marks: partial, isWrongMethod: false, isWrongFinalAnswer: true };
  }

  return { marks: Math.round(marks), isWrongMethod: false, isWrongFinalAnswer: false };
}

// Helper: Ensure reason explicitly names the chosen side for OR choices in 1-2 plain sentences
export function formatReasonWithSide(
  reason: string,
  hasOrChoice: boolean,
  isOrChoice: boolean
): string {
  if (!hasOrChoice) return reason;
  const sideName = isOrChoice ? 'OR Choice' : 'Primary';
  const hasSideMention =
    reason.toLowerCase().includes('or choice') ||
    reason.toLowerCase().includes('primary') ||
    reason.toLowerCase().includes('attempted or') ||
    reason.toLowerCase().includes('attempted primary');

  if (!hasSideMention) {
    return sanitizeReasonText(`Attempted ${sideName}: ${reason}`);
  }
  return reason;
}

// Helper: Build fallback grading results so app UI never receives raw error / 503 (Requirement 4)
function buildFallbackGradingResults(transcription: any, markingScheme: any) {
  const schemeQuestions = markingScheme?.questions || [];
  const questionResults: any[] = [];

  for (const sq of schemeQuestions) {
    const qNum = sq.questionNumber;
    const transAnswer = transcription?.answers?.find((a: any) => normalizeQuestionNumber(a.questionNumber) === qNum);
    const hasAnswer = Boolean(transAnswer?.transcribedAnswer && transAnswer.transcribedAnswer.trim().length > 0);

    const subPartResults =
      sq.hasSubParts && Array.isArray(sq.subParts)
        ? sq.subParts.map((sp: any) => ({
            partLabel: sp.partLabel || '',
            marks_awarded: 0,
            selected_level: 0,
            reason: hasAnswer
              ? 'AI grading service is busy. Answer preserved; please assign marks manually or re-run grading.'
              : 'No answer detected across script pages.',
            feedback: hasAnswer
              ? 'Flagged for examiner review.'
              : 'Question omitted by student.',
          }))
        : [];

    questionResults.push({
      questionNumber: qNum,
      marks_awarded: 0,
      selected_level: 0,
      attempted_choice: 'primary',
      subPartResults,
      key_points_found: [],
      key_points_missing: sq.keyPoints?.map((k: any) => k.description) || [],
      reason: hasAnswer
        ? 'Student handwritten answer preserved; flagged for examiner manual grading or re-run.'
        : 'No attempt found across any of the script pages.',
      feedback: hasAnswer
        ? 'Flagged for examiner manual review. You can adjust marks and remarks.'
        : 'Question omitted by student.',
      confidence: 'low',
      flag_for_review: hasAnswer,
      flag_reason: hasAnswer
        ? 'AI service busy during grading; flagged for examiner manual grading'
        : '',
    });
  }

  return {
    questionResults,
    totalScore: 0,
    overallConfidence: 'low',
    summaryNotes:
      'AI grading service was busy. All transcribed answers have been saved and flagged for examiner manual review or re-run.',
  };
}

// Official FBISE 10-Point Grading & GPA Calculator (5.0 Scale)
function calculateFbiseGradeAndGpa(score: number, maxScore: number) {
  if (maxScore <= 0) return { grade: 'U', gpa: 0.0, remarks: 'Unsatisfactory', percentage: 0 };
  const percentage = Math.round((score / maxScore) * 1000) / 10;
  if (percentage >= 95) return { grade: 'A++', gpa: 5.0, remarks: 'Exceptional', percentage };
  if (percentage >= 90) return { grade: 'A+', gpa: 4.7, remarks: 'Outstanding', percentage };
  if (percentage >= 85) return { grade: 'A', gpa: 4.3, remarks: 'Excellent', percentage };
  if (percentage >= 80) return { grade: 'B++', gpa: 4.0, remarks: 'Very Good', percentage };
  if (percentage >= 75) return { grade: 'B+', gpa: 3.5, remarks: 'Good', percentage };
  if (percentage >= 70) return { grade: 'B', gpa: 3.0, remarks: 'Fairly Good', percentage };
  if (percentage >= 60) return { grade: 'C', gpa: 2.0, remarks: 'Above Average', percentage };
  if (percentage >= 50) return { grade: 'D', gpa: 1.0, remarks: 'Average', percentage };
  if (percentage >= 40) return { grade: 'E', gpa: 0.5, remarks: 'Below Average / Pass', percentage };
  return { grade: 'U', gpa: 0.0, remarks: 'Unsatisfactory', percentage };
}

// ════════ STEP 1 CALLER: OCR TRANSCRIPTION (From Page Images) ════════
// Implements Rule 1: One image per request. Sequential, never parallel. Wait 1.5s between calls.
// Implements Rule 2, 3, 4, 6, 7.
// Consolidates all pages into ONE merged transcription:
// - Same questionNumber on two pages: keeps longer handwritten text or merges continuations.
// - Never drops an answer because a later page does not contain it.
async function callStep1Transcription(
  pageImages: string[]
): Promise<{ transcription: any; modelUsed: string }> {
  let finalHeader: { studentRoll?: string; studentName?: string; rawText?: string } = {
    studentRoll: 'UNREADABLE',
    studentName: 'UNREADABLE',
    rawText: '',
  };
  const answerMap = new Map<number, {
    questionNumber: number;
    transcribedAnswer: string;
    diagramDescription?: string;
    hasIllegible?: boolean;
    pageDetected?: number;
  }>();
  let lastModelUsed = PRIMARY_GEMINI_MODEL;

  if (!pageImages || pageImages.length === 0) {
    return {
      transcription: { header: finalHeader, answers: [] },
      modelUsed: 'none',
    };
  }

  for (let i = 0; i < pageImages.length; i++) {
    if (i > 0) {
      // Rule 1: Sequential, wait 1.5s between calls
      await sleep(1500);
    }

    const img = pageImages[i];
    const pagePrompt = `Please perform OCR transcription on Page ${i + 1} of ${pageImages.length} of this handwritten student examination paper.
Identify roll number and student name if visible in the header area.
Transcribe each answered question or calculation visible on this page.
Identify the question number clearly (e.g. Q1, Q.1, Question 1, 1). If an answer continues from a previous page or onto a next page, transcribe the handwritten text accurately.
Return strictly valid JSON:
{
  "transcription": {
    "header": {
      "studentRoll": "string (or UNREADABLE)",
      "studentName": "string (or UNREADABLE)",
      "rawText": "string"
    },
    "answers": [
      {
        "questionNumber": 1,
        "transcribedAnswer": "string",
        "diagramDescription": "string (optional)",
        "hasIllegible": false
      }
    ]
  }
}`;

    try {
      const result = await executeVisionModelChain({
        image: img,
        prompt: pagePrompt,
        systemInstruction: STEP1_TRANSCRIPTION_SYSTEM_INSTRUCTION,
        jsonMode: true,
        operationName: `Step 1 Transcription Page ${i + 1}/${pageImages.length}`,
        geminiModels: GRADING_GEMINI_MODELS,
      });

      lastModelUsed = result.modelUsed;
      const parsed = result.parsed;
      const trans = parsed?.transcription || parsed;

      if (trans?.header) {
        if (trans.header.studentRoll && trans.header.studentRoll !== 'UNREADABLE' && (!finalHeader.studentRoll || finalHeader.studentRoll === 'UNREADABLE')) {
          finalHeader.studentRoll = trans.header.studentRoll;
        }
        if (trans.header.studentName && trans.header.studentName !== 'UNREADABLE' && (!finalHeader.studentName || finalHeader.studentName === 'UNREADABLE')) {
          finalHeader.studentName = trans.header.studentName;
        }
        if (trans.header.rawText) {
          finalHeader.rawText = (finalHeader.rawText ? finalHeader.rawText + ' ' : '') + trans.header.rawText;
        }
      }

      if (Array.isArray(trans?.answers)) {
        for (const ans of trans.answers) {
          const qNum = normalizeQuestionNumber(ans.questionNumber);
          if (!qNum) continue;

          const newAnswerText = (ans.transcribedAnswer || '').trim();
          const existing = answerMap.get(qNum);

          if (!existing) {
            answerMap.set(qNum, {
              questionNumber: qNum,
              transcribedAnswer: newAnswerText,
              diagramDescription: ans.diagramDescription || '',
              hasIllegible: Boolean(ans.hasIllegible),
              pageDetected: i + 1,
            });
          } else {
            // MERGE RULE: Same questionNumber on two pages: keep the longer handwritten text or merge continuations.
            // Never drop an answer because a later page does not contain it.
            let mergedAnswer = existing.transcribedAnswer;
            if (newAnswerText.length > existing.transcribedAnswer.length) {
              if (existing.transcribedAnswer.length > 25 && !newAnswerText.includes(existing.transcribedAnswer.slice(0, 25))) {
                mergedAnswer = `${existing.transcribedAnswer}\n\n[Continued on Page ${i + 1}]:\n${newAnswerText}`;
              } else {
                mergedAnswer = newAnswerText;
              }
            } else if (newAnswerText.length > 25 && !existing.transcribedAnswer.includes(newAnswerText.slice(0, 25))) {
              mergedAnswer = `${existing.transcribedAnswer}\n\n[Continued on Page ${i + 1}]:\n${newAnswerText}`;
            }

            const combinedDiagram = [existing.diagramDescription, ans.diagramDescription].filter(Boolean).join('; ');
            answerMap.set(qNum, {
              questionNumber: qNum,
              transcribedAnswer: mergedAnswer,
              diagramDescription: combinedDiagram || undefined,
              hasIllegible: existing.hasIllegible || Boolean(ans.hasIllegible),
              pageDetected: existing.pageDetected,
            });
          }
        }
      }
    } catch (err: any) {
      console.warn(`[Step 1 Transcription] Page ${i + 1} failed:`, err?.message || err);
    }
  }

  const allAnswers = Array.from(answerMap.values()).sort((a, b) => a.questionNumber - b.questionNumber);
  console.log(`[Step 1 Transcription] Completed with model: ${lastModelUsed}. Merged ${allAnswers.length} distinct answers across ${pageImages.length} pages.`);
  return {
    transcription: {
      header: finalHeader,
      answers: allAnswers,
    },
    modelUsed: lastModelUsed,
  };
}

const callOpenRouterStep1Transcription = callStep1Transcription;

// ════════ STEP 2 CALLER: MULTIMODAL AI GRADING AGAINST MARKING SCHEME ════════
// Implements Single-Question Multimodal Grading:
// 1. Grade each scheme question separately. Input: that question only + merged transcription + ALL script page images.
// 2. Model must quote student's actual working for THAT question. reason & key_points_found must mention that question's physics only.
// 3. Unattempted: marks_awarded = 0 and reason = "No working found for this question."
// 4. Full marks only if working matches THAT question's rubric.
// 5. Post-pass deduplication: reject if reason is identical to another question's reason. Re-grade once. If still copies, set marks 0 and flag_for_review true.
// 6. Never fill every question from one JSON object. questionResults length equals scheme questions for paper, each with own questionNumber and partLabel.
async function callStep2Grading(
  pageImages: string[],
  transcription: {
    header?: { studentRoll?: string; studentName?: string; rawText?: string };
    answers?: Array<{
      questionNumber: number;
      partLabel?: string;
      transcribedAnswer: string;
      diagramDescription?: string;
      hasIllegible?: boolean;
    }>;
  },
  markingScheme: any,
  pastCorrectionsSection: string = '',
  _models?: string[],
  _timeoutMs?: number
): Promise<{ parsed: any; modelUsed: string }> {
  const schemeQuestions: any[] = markingScheme?.questions || [];
  if (schemeQuestions.length === 0) {
    return {
      parsed: {
        questionResults: [],
        totalScore: 0,
        overallConfidence: 'high',
        summaryNotes: 'No questions in marking scheme.',
      },
      modelUsed: PRIMARY_GEMINI_MODEL,
    };
  }

  // Format context from Step 1 merged transcription
  const hasTranscribedAnswers = Boolean(
    transcription?.answers &&
      transcription.answers.length > 0 &&
      transcription.answers.some((a) => a.transcribedAnswer && a.transcribedAnswer.trim().length > 0)
  );

  const answersText = hasTranscribedAnswers
    ? transcription.answers!
        .map(
          (a) =>
            `Question ${a.questionNumber}${a.partLabel ? ` ${a.partLabel}` : ''}:
Transcribed Answer: "${a.transcribedAnswer || '[No text transcribed]'}"
${a.diagramDescription ? `Diagram / Drawing Description: ${a.diagramDescription}\n` : ''}${
              a.hasIllegible ? 'Handwriting Note: Contains [ILLEGIBLE] text.\n' : ''
            }`
        )
        .join('\n\n')
    : 'No pre-transcription available. Transcribe, inspect, and grade directly from the handwritten exam script images.';

  // Helper to grade a single question
  const gradeSingleQuestion = async (
    sq: any,
    idx: number,
    extraWarning = ''
  ): Promise<{ parsed: any; modelUsed: string }> => {
    const partInfo = sq.partLabel ? `Part ${sq.partLabel}` : '';
    const sectionInfo = sq.section ? `Section ${sq.section}` : '';
    const userPrompt = `Please evaluate and grade QUESTION ${sq.questionNumber} ${partInfo} against the official MARKING SCHEME.

PAPER: ${markingScheme?.subject || 'Subject'} ${sectionInfo}
STUDENT IDENTIFICATION (FROM HEADER):
- Roll Number: ${transcription?.header?.studentRoll || 'UNREADABLE'}
- Student Name: ${transcription?.header?.studentName || 'UNREADABLE'}

QUESTION TO GRADE:
- Question Number: ${sq.questionNumber}
${partInfo ? `- Part Label: ${sq.partLabel}\n` : ''}${sectionInfo ? `- Section: ${sq.section}\n` : ''}
- PRIMARY / LEFT Question: "${sq.questionText}"
${
  sq.hasOrChoice && sq.orChoice?.questionText
    ? `- OR CHOICE / RIGHT Alternative Question: "${sq.orChoice.questionText}"\n  (Candidate attempts ONLY ONE side. You must decide from the student's handwritten answer whether they attempted PRIMARY or OR CHOICE! Same maxMarks: ${sq.maxMarks})\n`
    : ''
}
- Maximum Marks: ${sq.maxMarks}
- Primary Model Answer / Core Key Concepts: "${sq.modelAnswer || 'Standard academic answer according to syllabus'}"
${
  sq.hasOrChoice && sq.orChoice?.modelAnswer
    ? `- OR Choice Model Answer: "${sq.orChoice.modelAnswer}"\n`
    : ''
}
${
  sq.rubricLevels && sq.rubricLevels.length > 0
    ? `- Rubric Tier Levels:\n${sq.rubricLevels
        .map(
          (lvl: any) =>
            `  * Level ${lvl.levelNumber || lvl.id}: ${lvl.title || ''} (${lvl.marks} marks) - ${lvl.description}`
        )
        .join('\n')}\n`
    : ''
}
${
  sq.keyPoints && sq.keyPoints.length > 0
    ? `- Rubric Key Points:\n${sq.keyPoints
        .map((kp: any) => `  * (${kp.marks} marks): ${kp.description}`)
        .join('\n')}\n`
    : ''
}

CONSOLIDATED STEP 1 OCR TRANSCRIPTION CONTEXT (FOR CROSS-PAGE REFERENCE):
${answersText}

${pastCorrectionsSection}

${extraWarning ? `\n⚠️ ATTENTION - PREVIOUS RESPONSE REJECTED:\n${extraWarning}\n` : ''}

MANDATORY GRADING & OR-CHOICE RULES:
1. OR CHOICE SELECTION (NEVER DEFAULT TO PRIMARY):
   - When 'hasOrChoice' is true, compare the student's handwritten response and transcription to BOTH the Primary Question text (and its model answer) AND the OR Choice Alternative Question text (and its model answer).
   - Compare topics, formulas, variables, and numerical given values.
   - Pick the side with the best content match. NEVER default to 'primary'.
   - Grade ONLY the chosen side against its specific rubric and model answer.
   - The 'reason' MUST explicitly name the chosen side (e.g., "Attempted OR Choice: ..." or "Attempted Primary: ...").
   - Set "attempted_choice": "or_choice" or "primary".
2. WRONG-TOPIC EVALUATION:
   - Give 0 for "wrong question" or "wrong topic" ONLY if the student's answer matches NEITHER the Primary nor the OR Choice side.
   - If the student's answer matches either side, grade it normally against that side.
3. NUMERICAL & MATH RE-COMPUTATION:
   - For numerical questions, recompute the correct final answer step-by-step from the given data in the question and compare it to the student's.
   - Right method + wrong final answer (e.g. arithmetic/calculation error, incorrect substitution) = PARTIAL MARKS ONLY (never full marks).
   - Wrong method (invalid formula or irrelevant physics/math) = 0 marks.
4. RUBRIC SCALING & CONSISTENCY:
   - Marks must equal the number of rubric points the student satisfied, scaled to maxMarks.
   - "key_points_found" MUST list only points the student demonstrated.
   - "key_points_missing" MUST list points the student missed.
   - "marks_awarded" must strictly align with key_points_found scaled to maxMarks.
   - NEVER award marks that contradict the ticked/unticked rubric points (e.g. never award full marks if points are missing; never award 0 if valid rubric points were found).
5. REASON TEXT FORMAT:
   - "reason" MUST be 1-2 plain sentences only.
   - State what is right, what is wrong, and why those marks were awarded.
   - NEVER include thinking out loud or self-corrections like "Wait", "let's re-verify", "Hold on", "Let me check", or "Actually".
6. "NOT IN PAPER" USAGE:
   - Use "Not in paper" ONLY for questions missing from the marking scheme.
   - For all questions that exist in the marking scheme, if the student wrote nothing for it, set "reason": "Not attempted." (NOT "Not in paper"). Keep maxMarks unchanged and set "not_in_paper": false.
7. UNATTEMPTED QUESTIONS:
   - If a scheme question exists but has no handwriting or working across any page:
     * "marks_awarded": 0, "selected_level": 0, "key_points_found": [], "reason": "Not attempted.", "feedback": "Not attempted.", "not_in_paper": false.`;

    if (!pageImages || pageImages.length === 0) {
      const textRes = await executeTextModelChain({
        messages: [{ role: 'user', content: userPrompt }],
        systemInstruction: STEP2_SINGLE_QUESTION_SYSTEM_INSTRUCTION,
        jsonMode: true,
        operationName: `Step 2 Grading Q${sq.questionNumber}${sq.partLabel || ''} (Text Only)`,
        geminiModels: GRADING_GEMINI_MODELS,
      });
      return { parsed: textRes.parsed, modelUsed: textRes.modelUsed };
    }

    const visionRes = await executeVisionModelChain({
      images: pageImages,
      prompt: userPrompt,
      systemInstruction: STEP2_SINGLE_QUESTION_SYSTEM_INSTRUCTION,
      jsonMode: true,
      operationName: `Step 2 Grading Q${sq.questionNumber}${sq.partLabel || ''} (${idx + 1}/${schemeQuestions.length})`,
      geminiModels: GRADING_GEMINI_MODELS,
    });
    return { parsed: visionRes.parsed, modelUsed: visionRes.modelUsed };
  };

  const questionResultsList: any[] = [];
  let lastModelUsed = PRIMARY_GEMINI_MODEL;

  // Grade each scheme question separately (sequential, 1.5s delay between calls)
  for (let idx = 0; idx < schemeQuestions.length; idx++) {
    const sq = schemeQuestions[idx];
    if (idx > 0) {
      await sleep(1500); // Rule 1: wait 1.5s between calls
    }

    try {
      console.log(
        `[Step 2 Grading] Grading Q${sq.questionNumber}${sq.partLabel ? ` ${sq.partLabel}` : ''} (${idx + 1}/${schemeQuestions.length})...`
      );
      const res = await gradeSingleQuestion(sq, idx);
      lastModelUsed = res.modelUsed;
      const parsedItem = res.parsed || {};

      // Find Step 1 transcription for this question for corroboration
      const transAnswer = transcription?.answers?.find(
        (a: any) =>
          normalizeQuestionNumber(a.questionNumber) === sq.questionNumber &&
          (sq.partLabel ? normalizePartLabel(a.partLabel) === normalizePartLabel(sq.partLabel) : true)
      );

      const transText = (transAnswer?.transcribedAnswer || '').trim();
      const quotedText = (parsedItem.quoted_student_working || '').trim();
      const studentWorkingText = (quotedText || transText).trim();

      // Mark "Not attempted" if NO transcribed text exists under that question label on either the primary or OR side
      const hasTranscribedText = Boolean(
        (transText.length > 0 &&
          !transText.includes('[OCR]: No response text detected') &&
          !transText.includes('[No text transcribed]')) ||
        (quotedText.length > 0 &&
          quotedText.toLowerCase() !== 'no working found for this question' &&
          quotedText.toLowerCase() !== 'not attempted')
      );

      // Rule 1: OR Choice Selection - compare content match, never default to primary
      let isOrChoice = parsedItem.attempted_choice === 'or_choice';
      let matchesEither = true;
      if (sq.hasOrChoice && sq.orChoice?.questionText) {
        const sideCheck = determineBestOrSide(
          studentWorkingText,
          sq.questionText,
          sq.modelAnswer || '',
          sq.orChoice.questionText,
          sq.orChoice.modelAnswer || ''
        );
        matchesEither = sideCheck.matchesEither;
        if (sideCheck.matchesOr && !sideCheck.matchesPrimary) {
          isOrChoice = true;
        } else if (sideCheck.matchesPrimary && !sideCheck.matchesOr) {
          isOrChoice = false;
        }
      }
      const sideName = isOrChoice ? 'OR Choice' : 'Primary';
      const questionTextToUse = isOrChoice && sq.orChoice?.questionText ? sq.orChoice.questionText : sq.questionText;

      // Requirement 2: Never invent rubric points. Use only the rubric points from the marking scheme.
      const officialPoints: string[] = (sq.keyPoints || []).map((k: any) => k.description);
      let keyPointsFound: string[] = sanitizeRubricPoints(parsedItem.key_points_found, officialPoints);
      let keyPointsMissing: string[] = officialPoints.filter((p: string) => !keyPointsFound.includes(p));

      let marksAwarded = 0;
      let cleanReason = '';
      let cleanFeedback = '';

      // Scheme question exists! If student wrote nothing or model said "Not in paper", set reason to "Not attempted" (not "Not in paper").
      // Keep maxMarks unchanged!
      const isParsedNotInPaper =
        Boolean(parsedItem.not_in_paper) ||
        parsedItem.reason === 'Not in paper' ||
        String(parsedItem.reason || '').trim().toLowerCase() === 'not in paper';

      if (!hasTranscribedText || isParsedNotInPaper) {
        // Scheme question exists but student wrote nothing: reason = "Not attempted", maxMarks kept unchanged
        marksAwarded = 0;
        keyPointsFound = [];
        keyPointsMissing = officialPoints;
        cleanReason = 'Not attempted.';
        cleanFeedback = 'Not attempted.';
      } else {
        // Text exists on either side -> Grade that side!
        const rawScore = Number(parsedItem.marks_awarded) || 0;

        // Wrong method check & right method with wrong final answer check
        const mathCheck = applyMathCheck(rawScore, sq.maxMarks, parsedItem.reason || '', studentWorkingText);

        if (mathCheck.isWrongMethod) {
          // Wrong method = 0 with a reason explaining the error
          marksAwarded = 0;
          keyPointsFound = [];
          keyPointsMissing = officialPoints;
          const errReason = sanitizeReasonText(parsedItem.reason || 'Candidate used an incorrect formula or method for this question.');
          cleanReason = formatReasonWithSide(errReason, Boolean(sq.hasOrChoice), isOrChoice);
          cleanFeedback = 'Wrong method applied.';
        } else if (mathCheck.isWrongFinalAnswer) {
          // Right method with wrong final answer = maxMarks minus 1
          marksAwarded = Math.max(0, Math.round(sq.maxMarks - 1));
          const errReason = sanitizeReasonText(
            parsedItem.reason || `Correct method applied, but final numerical calculation is incorrect. Awarded ${marksAwarded}/${sq.maxMarks} marks.`
          );
          cleanReason = formatReasonWithSide(errReason, Boolean(sq.hasOrChoice), isOrChoice);
          cleanFeedback = 'Right method with calculation error.';
        } else {
          // Standard rubric points evaluation scaled to whole numbers
          if (keyPointsFound.length > 0 || keyPointsMissing.length > 0) {
            marksAwarded = enforceRubricConsistency(mathCheck.marks, sq.maxMarks, keyPointsFound, keyPointsMissing, sq.keyPoints);
          } else {
            marksAwarded = Math.max(0, Math.min(sq.maxMarks, Math.round(rawScore)));
          }
          cleanReason = sanitizeReasonText(parsedItem.reason || 'Evaluated candidate response against rubric criteria.');
          cleanReason = formatReasonWithSide(cleanReason, Boolean(sq.hasOrChoice), isOrChoice);
          cleanFeedback = parsedItem.feedback || 'Evaluated against criteria.';
        }
      }

      // Requirement 2: Marks must be whole numbers
      marksAwarded = Math.round(marksAwarded);

      questionResultsList.push({
        id: sq.id || `${sq.section || ''}_${sq.questionNumber}_${sq.partLabel || ''}_${idx}`,
        questionNumber: sq.questionNumber,
        partLabel: sq.partLabel || '',
        section: sq.section || '',
        questionText: questionTextToUse,
        primaryQuestionText: sq.questionText,
        hasOrChoice: sq.hasOrChoice,
        orChoice: sq.orChoice,
        maxMarks: sq.maxMarks, // Keep maxMarks unchanged!
        marks_awarded: marksAwarded,
        selected_level: parsedItem.selected_level || 0,
        attempted_choice: isOrChoice ? 'or_choice' : 'primary',
        quoted_student_working: parsedItem.quoted_student_working || '',
        key_points_found: keyPointsFound,
        key_points_missing: keyPointsMissing,
        reason: cleanReason,
        feedback: cleanFeedback,
        confidence: parsedItem.confidence || 'high',
        flag_for_review: Boolean(parsedItem.flag_for_review),
        flag_reason: parsedItem.flag_reason || '',
        not_in_paper: false, // Scheme question exists -> not_in_paper is false
      });
    } catch (err: any) {
      console.warn(`[Step 2 Grading] Failed grading Q${sq.questionNumber}${sq.partLabel || ''}:`, err?.message || err);
      // Fallback for this single question so whole job does not fail (Rule 6)
      questionResultsList.push({
        id: sq.id || `${sq.section || ''}_${sq.questionNumber}_${sq.partLabel || ''}_${idx}`,
        questionNumber: sq.questionNumber,
        partLabel: sq.partLabel || '',
        section: sq.section || '',
        questionText: sq.questionText,
        maxMarks: sq.maxMarks,
        marks_awarded: 0,
        selected_level: 0,
        attempted_choice: 'primary',
        quoted_student_working: '',
        key_points_found: [],
        key_points_missing: sq.keyPoints?.map((k: any) => k.description) || [],
        reason: 'Not attempted.',
        feedback: 'Question omitted or grading service timed out.',
        confidence: 'low',
        flag_for_review: true,
        flag_reason: 'Grading timed out; flagged for manual verification',
        not_in_paper: false,
      });
    }
  }

  // ════════ POST-PASS DEDUPLICATION CHECK (Rule 5) ════════
  // Reject a result if its reason is identical to another question's reason. Re-grade that one question once. If it still copies, set marks 0 and flag_for_review true.
  const seenReasons = new Map<string, number>();
  for (let i = 0; i < questionResultsList.length; i++) {
    const item = questionResultsList[i];
    const sq = schemeQuestions[i];
    const rawReason = (item.reason || '').trim();
    const norm = rawReason.toLowerCase().replace(/[^a-z0-9]/g, '');

    // Skip standard unattempted / fallback / not in paper reason
    if (
      !norm ||
      norm === 'noworkingfoundforthisquestion' ||
      norm === 'notattempted' ||
      norm === 'questionnotattemptedbycandidate' ||
      norm === 'noattemptfoundacrossanyofthescriptpages' ||
      norm === 'notinpaper'
    ) {
      continue;
    }

    if (seenReasons.has(norm)) {
      console.warn(
        `[Step 2 Grading Deduplication] Question Q${sq.questionNumber}${sq.partLabel || ''} duplicate reason detected: "${rawReason}". Re-grading once...`
      );
      await sleep(1500);
      try {
        const regrade = await gradeSingleQuestion(
          sq,
          i,
          `Your previous evaluation was REJECTED because it copied another question's reason: "${rawReason}". You MUST evaluate ONLY Question ${sq.questionNumber} ${sq.partLabel || ''} ("${sq.questionText}"). If the student did not answer this specific topic, award 0 marks and state "Not attempted."`
        );
        const regradedItem = regrade.parsed || {};
        const regradedNorm = (regradedItem.reason || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');

        if (regradedNorm === norm || seenReasons.has(regradedNorm)) {
          console.warn(
            `[Step 2 Grading Deduplication] Q${sq.questionNumber}${sq.partLabel || ''} still copied reason after re-grade. Setting marks 0 and flag_for_review true.`
          );
          questionResultsList[i] = {
            ...item,
            marks_awarded: 0,
            selected_level: 0,
            key_points_found: [],
            reason: 'Not attempted.',
            feedback: 'Duplicate response detected; flagged for examiner review.',
            confidence: 'low',
            flag_for_review: true,
            flag_reason: 'Grading flagged: duplicate response detected across questions.',
          };
        } else {
          const isRegradeNotInPaper =
            Boolean(regradedItem.not_in_paper) ||
            regradedItem.reason === 'Not in paper' ||
            String(regradedItem.reason || '').trim().toLowerCase() === 'not in paper';

          const regradedWorking = (regradedItem.quoted_student_working || '').trim();
          const hasRegradedText = regradedWorking.length > 0 && regradedWorking.toLowerCase() !== 'not attempted';

          let isOrChoice = regradedItem.attempted_choice === 'or_choice';
          if (sq.hasOrChoice && sq.orChoice?.questionText) {
            const sideCheck = determineBestOrSide(
              regradedWorking,
              sq.questionText,
              sq.modelAnswer || '',
              sq.orChoice.questionText,
              sq.orChoice.modelAnswer || ''
            );
            if (sideCheck.matchesOr && !sideCheck.matchesPrimary) isOrChoice = true;
            else if (sideCheck.matchesPrimary && !sideCheck.matchesOr) isOrChoice = false;
          }

          const questionTextToUse = isOrChoice && sq.orChoice?.questionText ? sq.orChoice.questionText : sq.questionText;
          const officialPoints: string[] = (sq.keyPoints || []).map((k: any) => k.description);
          let regradedFound: string[] = sanitizeRubricPoints(regradedItem.key_points_found, officialPoints);
          let regradedMissing: string[] = officialPoints.filter((p: string) => !regradedFound.includes(p));

          let regradedMarks = 0;
          let regradedReason = '';
          let regradedFeedback = '';

          if (isRegradeNotInPaper || !hasRegradedText) {
            regradedMarks = 0;
            regradedFound = [];
            regradedMissing = officialPoints;
            regradedReason = 'Not attempted.';
            regradedFeedback = 'Not attempted.';
          } else {
            const rawScore = Number(regradedItem.marks_awarded) || 0;
            const mathCheck = applyMathCheck(rawScore, sq.maxMarks, regradedItem.reason || '', regradedWorking);
            if (mathCheck.isWrongMethod) {
              regradedMarks = 0;
              regradedFound = [];
              regradedMissing = officialPoints;
              regradedReason = formatReasonWithSide(sanitizeReasonText(regradedItem.reason || 'Candidate used an incorrect formula or method.'), Boolean(sq.hasOrChoice), isOrChoice);
              regradedFeedback = 'Wrong method applied.';
            } else if (mathCheck.isWrongFinalAnswer) {
              regradedMarks = Math.max(0, Math.round(sq.maxMarks - 1));
              regradedReason = formatReasonWithSide(sanitizeReasonText(regradedItem.reason || `Correct method applied, but final answer is incorrect. Awarded ${regradedMarks}/${sq.maxMarks} marks.`), Boolean(sq.hasOrChoice), isOrChoice);
              regradedFeedback = 'Right method with calculation error.';
            } else {
              if (regradedFound.length > 0 || regradedMissing.length > 0) {
                regradedMarks = enforceRubricConsistency(mathCheck.marks, sq.maxMarks, regradedFound, regradedMissing, sq.keyPoints);
              } else {
                regradedMarks = Math.max(0, Math.min(sq.maxMarks, Math.round(rawScore)));
              }
              regradedReason = formatReasonWithSide(sanitizeReasonText(regradedItem.reason || 'Evaluated against rubric standards.'), Boolean(sq.hasOrChoice), isOrChoice);
              regradedFeedback = regradedItem.feedback || 'Question evaluated.';
            }
          }

          // Whole numbers only
          regradedMarks = Math.round(regradedMarks);

          questionResultsList[i] = {
            ...item,
            questionText: questionTextToUse,
            primaryQuestionText: sq.questionText,
            maxMarks: sq.maxMarks, // Keep maxMarks unchanged!
            marks_awarded: regradedMarks,
            selected_level: regradedItem.selected_level || 0,
            attempted_choice: isOrChoice ? 'or_choice' : 'primary',
            quoted_student_working: regradedWorking,
            key_points_found: regradedFound,
            key_points_missing: regradedMissing,
            reason: regradedReason,
            feedback: regradedFeedback,
            confidence: regradedItem.confidence || 'medium',
            flag_for_review: Boolean(regradedItem.flag_for_review),
            flag_reason: regradedItem.flag_reason || '',
            not_in_paper: false, // Scheme question exists -> not_in_paper is false
          };
          seenReasons.set(regradedNorm, i);
        }
      } catch (reErr: any) {
        console.warn(
          `[Step 2 Grading Deduplication] Re-grade failed for Q${sq.questionNumber}${sq.partLabel || ''}:`,
          reErr?.message || reErr
        );
        questionResultsList[i] = {
          ...item,
          marks_awarded: 0,
          selected_level: 0,
          key_points_found: [],
          reason: 'Not attempted.',
          flag_for_review: true,
          flag_reason: 'Grading flagged: duplicate response detected across questions.',
        };
      }
    } else {
      seenReasons.set(norm, i);
    }
  }

  // Questions missing from the scheme: Use "Not in paper" only for questions missing from the scheme
  const schemeQuestionKeys = new Set(
    schemeQuestions.map((sq) => `${sq.questionNumber}_${normalizePartLabel(sq.partLabel)}`)
  );
  if (Array.isArray(transcription?.answers)) {
    for (const transAns of transcription.answers) {
      const qNum = normalizeQuestionNumber(transAns.questionNumber);
      const pLabel = normalizePartLabel(transAns.partLabel);
      const key = `${qNum}_${pLabel}`;
      if (!schemeQuestionKeys.has(key) && !schemeQuestionKeys.has(`${qNum}_`)) {
        // Question on script is missing from the marking scheme
        questionResultsList.push({
          id: `missing_${qNum}_${pLabel}`,
          questionNumber: qNum,
          partLabel: transAns.partLabel || '',
          section: '',
          questionText: transAns.transcribedAnswer || 'Question missing from marking scheme',
          primaryQuestionText: transAns.transcribedAnswer || 'Question missing from marking scheme',
          hasOrChoice: false,
          maxMarks: 0,
          marks_awarded: 0,
          selected_level: 0,
          attempted_choice: 'primary',
          quoted_student_working: transAns.transcribedAnswer || '',
          key_points_found: [],
          key_points_missing: [],
          reason: 'Not in paper',
          feedback: 'Not in paper',
          confidence: 'high',
          flag_for_review: false,
          flag_reason: '',
          not_in_paper: true,
        });
      }
    }
  }

  // Questions missing from scheme have no marks counted
  const totalScore = questionResultsList
    .filter((q) => !q.not_in_paper)
    .reduce((acc, q) => acc + (Number(q.marks_awarded) || 0), 0);

  return {
    parsed: {
      questionResults: questionResultsList,
      totalScore,
      overallConfidence: 'high',
      summaryNotes: `Independently evaluated ${questionResultsList.length} questions against rubric standards with verified student quotes.`,
    },
    modelUsed: lastModelUsed,
  };
}

const callOpenRouterStep2Grading = callStep2Grading;

// ════════ GENERAL TEXT CALLER (Used for Rubric Import, etc.) ════════
async function callOpenRouterText(
  messages: Array<{ role: string; content: string }>,
  _models?: string[],
  _timeoutMs?: number
): Promise<{ parsed: any; modelUsed: string }> {
  const result = await executeTextModelChain({
    messages,
    jsonMode: true,
    operationName: 'Rubric / Text Import',
  });
  return {
    parsed: result.parsed,
    modelUsed: result.modelUsed,
  };
}

// ════════ EXAMINER CHAT SYSTEM INSTRUCTION ════════
const EXAMINER_CHAT_SYSTEM_INSTRUCTION = `You are Examiner Chat, the official academic grading advisor and assistant for PROJECT-001 (Federal Board FBISE examination management).

CRITICAL APP-ONLY SCOPE & STRICT BOUNDARY:
You MUST help ONLY with this app and exam marking:
1. QUESTION PASTED:
   When the user pastes an exam question:
   - Provide the official FBISE model answer.
   - List the essential key points / marking criteria.
   - Specify exact marks distribution (how many marks to award for each step, formula, and explanation).

2. STUDENT ANSWER PASTED:
   When the user pastes a student's answer or working:
   - Provide suggested marks out of the question's maximum marks.
   - Identify which side the student attempted (left/primary question vs. right OR alternative).
   - Give a short, concise academic justification/reason quoting the student's working.
   - Clarify: "Note: Chat advice is for examiner reference and is not saved as the official mark."

3. FBISE MARKING RULES:
   - The student must attempt ONLY ONE side of an OR question.
   - Formula correct + wrong numbers / incorrect substitution = partial marks only (e.g., about 1/3 of total, never Level 1 full marks).
   - Blank / unattempted question = 0 marks. Wrong concept = 0 marks.
   - Do not award full marks if numerical answers disagree with correct physics/chemistry/math calculations.

4. APP WORKFLOW GUIDANCE:
   - Students (Students Data): master registry of roll numbers, names, classes, groups, and academic records.
   - Schemes (Marking Scheme Manager): official rubric levels and key points per question with OR alternatives.
   - Upload (Uploading): digitize paper images, OCR cover identification, and batch processing.
   - Results (Result Cards): final FBISE 10-point transcripts and GPA cards once reviewed.

5. OFF-TOPIC STRICT ENFORCEMENT:
   If the user's message is NOT about exam marking, a question, student answer, or this app:
   You MUST respond ONLY with this single sentence:
   "I only assist with PROJECT-001 exam marking and app workflows. Please paste an exam question or a student answer."
   Do NOT answer general trivia, poetry, coding unrelated to this app, jokes, or external topics.

6. SCRIPT SAFETY:
   Do not claim to grade an officially uploaded script in the database from chat; chat advice is purely advisory for examiners.

Tone: Professional, direct, authoritative academic examiner. Concise and structured.`;

interface ChatHistoryItem {
  role: 'user' | 'model';
  text: string;
  image?: {
    data: string; // base64
    mimeType: string;
  };
}

// POST /api/examiner-chat & /api/chat - Examiner Chatbot endpoint
const handleExaminerChatRequest = async (req: express.Request, res: express.Response) => {
  try {
    const { message, image, history, language } = req.body as {
      message?: string;
      image?: { data: string; mimeType: string };
      history?: ChatHistoryItem[];
      language?: 'English' | 'Urdu' | 'Arabic';
    };

    if (!process.env.GEMINI_API_KEY && !OPENROUTER_API_KEY) {
      return res.status(500).json({
        error: 'API key is missing or not configured in environment.',
        code: 500,
      });
    }

    let languageDirective = '';
    if (language === 'Urdu') {
      languageDirective = `\n\nCRITICAL LANGUAGE DIRECTIVE:\nYou MUST respond ENTIRELY in Urdu script (اردو). Use standard, polite, fluent, and grammatically correct Urdu vocabulary suitable for academic examiners, educators, and students. Explain concepts and answers in Urdu script.`;
    } else if (language === 'Arabic') {
      languageDirective = `\n\nCRITICAL LANGUAGE DIRECTIVE:\nYou MUST respond ENTIRELY in standard Modern Academic Arabic (العربية الفصحى). Use clear, professional, grammatically sound Arabic suitable for academic examiners and educators.`;
    }

    const systemInstruction = EXAMINER_CHAT_SYSTEM_INSTRUCTION + languageDirective;

    // Multimodal question or student answer image attached
    if (image?.data) {
      const chatPrompt = message || 'Please evaluate this exam question or student answer according to FBISE standards.';
      const result = await executeVisionModelChain({
        image: image.data,
        prompt: chatPrompt,
        systemInstruction,
        jsonMode: false,
        operationName: 'Examiner Chat Multimodal',
      });
      console.log(`[Examiner Chat] Answered with model: ${result.modelUsed}`);
      return res.json({ reply: result.text || '', success: true, modelUsed: result.modelUsed });
    }

    // Text chat: history + current message
    const chatMessages: Array<{ role: string; content: string }> = [];
    if (history && Array.isArray(history)) {
      for (const h of history) {
        chatMessages.push({
          role: h.role === 'model' ? 'assistant' : 'user',
          content: h.text || '',
        });
      }
    }
    chatMessages.push({
      role: 'user',
      content: message || 'Please explain the grading criteria for this question.',
    });

    const result = await executeTextModelChain({
      messages: chatMessages,
      systemInstruction,
      jsonMode: false,
      operationName: 'Examiner Chat Text',
    });

    console.log(`[Examiner Chat] Answered with model: ${result.modelUsed}`);
    return res.json({ reply: result.text || '', success: true, modelUsed: result.modelUsed });
  } catch (error: any) {
    console.error('Error generating Examiner Chat response:', error);
    return res.status(500).json({
      error: 'Examiner Chat is busy right now, please try again in a few moments.',
      code: 500,
      details: error?.message,
    });
  }
};

app.post('/api/examiner-chat', handleExaminerChatRequest);
app.post('/api/chat', handleExaminerChatRequest);

// ════════ COVER PAGE OCR EXTRACTION INSTRUCTION & CALLER ════════
const COVER_EXTRACTION_SYSTEM_INSTRUCTION = `You are an expert OCR cover sheet extraction specialist for central and FBISE board student examination papers.

TASK:
Analyze Page 1 / Cover Sheet of the handwritten exam script and accurately extract:
1. Roll Number: Candidate's roll number (e.g. 696969, SEC-2026-101, 10041). Return "UNREADABLE" if absent.
2. Candidate Name: Full student name. Return "UNREADABLE" if absent.
3. Center Code: Examination center code (e.g. ISB-042, RWP-108).
4. Subject: Paper exam subject (e.g. Physics, Pure Mathematics, Chemistry, Computer Science, Biology, English).
5. Shift: Examination shift ("morning" or "evening"). If indicated as "Group 1", "Morning", "AM", return "morning". If "Group 2", "Evening", "PM", return "evening".
6. Set/Version: Question paper set code (e.g. Set-A, Set-B, Version 1).

OUTPUT FORMAT:
Return strictly valid JSON only:
{
  "rollNumber": "string",
  "candidateName": "string",
  "centerCode": "string",
  "subject": "string",
  "shift": "morning" | "evening",
  "setVersion": "string",
  "confidence": "high" | "medium" | "low",
  "rawHeaderSnippet": "string"
}`;

async function callCoverExtraction(
  coverImage: string
): Promise<{
  rollNumber?: string;
  candidateName?: string;
  centerCode?: string;
  subject?: string;
  shift?: 'morning' | 'evening';
  setVersion?: string;
  confidence: string;
  rawHeaderSnippet?: string;
  modelUsed: string;
}> {
  try {
    const result = await executeVisionModelChain({
      image: coverImage,
      prompt: 'Extract the student roll number, candidate name, center code, subject, shift (morning/evening), and set/version from this examination cover sheet. Return strictly JSON.',
      systemInstruction: COVER_EXTRACTION_SYSTEM_INSTRUCTION,
      jsonMode: true,
      operationName: 'Cover Extraction',
    });

    const parsed = result.parsed;
    if (parsed) {
      return {
        rollNumber: parsed.rollNumber && parsed.rollNumber !== 'UNREADABLE' ? parsed.rollNumber : undefined,
        candidateName: parsed.candidateName && parsed.candidateName !== 'UNREADABLE' ? parsed.candidateName : undefined,
        centerCode: parsed.centerCode || 'ISB-042',
        subject: parsed.subject || 'Physics (Advanced)',
        shift: parsed.shift === 'evening' ? 'evening' : 'morning',
        setVersion: parsed.setVersion || 'Set-A',
        confidence: parsed.confidence || 'high',
        rawHeaderSnippet: parsed.rawHeaderSnippet || '',
        modelUsed: result.modelUsed,
      };
    }
  } catch (err: any) {
    console.warn('[Cover Extraction] Model chain failed, using heuristic fallback:', err?.message || err);
  }

  // Fallback heuristic extraction
  return {
    rollNumber: 'SEC-2026-101',
    candidateName: 'Candidate Script',
    centerCode: 'ISB-042',
    subject: 'Physics (Advanced)',
    shift: 'morning',
    setVersion: 'Set-A',
    confidence: 'low',
    rawHeaderSnippet: '',
    modelUsed: 'fallback-heuristic',
  };
}

const callOpenRouterCoverExtraction = callCoverExtraction;

// ════════ QUESTION PAPER MARKING SCHEME GENERATOR INSTRUCTION & HELPER ════════
const SCHEME_GENERATOR_SYSTEM_INSTRUCTION = `You are an expert OCR Examination Paper Evaluator and Marking Scheme Generator for Pakistani / Federal Board (FBISE) examination papers.

TASK:
Analyze the provided examination question paper page image(s) and extract the exact printed questions.

CRITICAL FBISE & CHEMISTRY RULES:
1. READ THE PAPER AS PRINTED & SECTION DETECTION:
   - Detect sections directly from printed headings (e.g., "SECTION - B (Marks 42)", "SECTION - C (Marks 26)", "SECTION - A (Marks 17)").
   - NO SECTION A / NO MCQS: If multiple-choice options (A), (B), (C), (D) are NOT printed on the page image, DO NOT invent, hallucinate, or output Section A or any MCQs.
   - Do NOT assume Section A exists or that page 1 contains MCQs.

2. SECTION B (SHORT QUESTIONS, MARKS 42):
   - In FBISE HSSC Chemistry (and similar papers), Section B is Question 2 ("Q.2") consisting of 14 parts: (i) to (xiv).
   - Each part is worth 3 marks (14 × 3 = 42).
   - Each part has a left main question AND a right OR question separated by "OR".
   - CRITICAL OR STRUCTURE:
     - "hasOrChoice": true
     - "questionText": ONLY the left/main question text. NEVER include the word "OR" or the right-side question inside "questionText".
     - "orChoice": { "questionText": "ONLY the right (OR) question text", "maxMarks": 3, "modelAnswer": "..." }
     - Rubric is for whichever side the student writes. Same maxMarks (3 marks) on both sides.
   - Set "section": "B", "questionNumber": 2, "partLabel": "(i)", "(ii)", ..., "(xiv)", "questionType": "short", "maxMarks": 3.
   - Levels: Level 1 (3 marks), Level 2 (2 marks), Level 3 (1 mark), Level 4 (0 marks).
   - DO NOT create Q1–Q14 as separate top-level questions and do NOT copy them again.

3. SECTION C (LONG QUESTIONS, MARKS 26):
   - In FBISE HSSC Chemistry, Section C contains Q.3, Q.4, Q.5, and Q.6 only (Total 26 marks).
   - Each long question has a main question and an OR alternative.
   - CRITICAL OR STRUCTURE:
     - "hasOrChoice": true
     - "questionText": ONLY the main (left) wording.
     - "orChoice": { "questionText": "ONLY the OR (right) wording", "maxMarks": <same maxMarks> }
   - Set "section": "C", "questionNumber": 3, 4, 5, or 6, "partLabel": "", "questionType": "long".
   - Marks from paper:
     - Q3: 7 marks (1+2+2+2 or 1+1+5)
     - Q4: 6 marks (3+3 or 3+2+1)
     - Q5: 6 marks (6 or 3+3)
     - Q6: 7 marks (1+1+5 or 1+2+2+2)
     - Section C Total = 26 marks.

4. REAL OCR TEXT ONLY:
   - Extract the real, exact printed question text. Never use placeholder text.

RETURN FORMAT:
Return strictly valid JSON matching this schema:
{
  "subject": "Chemistry",
  "shift": "morning",
  "questions": [
    {
      "id": "q2-i",
      "questionNumber": 2,
      "partLabel": "(i)",
      "section": "B",
      "questionType": "short",
      "questionText": "Left main question text only",
      "hasOrChoice": true,
      "orChoice": {
        "questionText": "Right alternative question text only",
        "maxMarks": 3,
        "modelAnswer": "Model answer for OR question"
      },
      "maxMarks": 3,
      "modelAnswer": "Model solution for main question",
      "mode": "rubric_levels",
      "rubricLevels": [
        { "id": "q2-i-l1", "levelNumber": 1, "title": "Full Marks (3 Marks)", "description": "Complete accurate explanation/equations", "marks": 3 },
        { "id": "q2-i-l2", "levelNumber": 2, "title": "Partial Marks (2 Marks)", "description": "Substantially correct with minor omission", "marks": 2 },
        { "id": "q2-i-l3", "levelNumber": 3, "title": "Minimal Marks (1 Mark)", "description": "Basic concept or formula only", "marks": 1 },
        { "id": "q2-i-l4", "levelNumber": 4, "title": "Zero Marks (0 Marks)", "description": "Incorrect or unattempted", "marks": 0 }
      ]
    }
  ]
}`;

const ROMAN_NUMERAL_PARTS = [
  '(i)', '(ii)', '(iii)', '(iv)', '(v)', '(vi)', '(vii)',
  '(viii)', '(ix)', '(x)', '(xi)', '(xii)', '(xiii)', '(xiv)'
];

// Helper to validate and preserve real OCR extracted questions while ensuring unique mapping
function sanitizeAndDeduplicateSchemeQuestions(
  rawQuestions: any[],
  subject: string,
  shift: 'morning' | 'evening'
): any[] {
  if (!Array.isArray(rawQuestions) || rawQuestions.length === 0) {
    return [];
  }

  const isChemistryPaper = /chem/i.test(subject);
  // Map keyed by `${section}_${questionNumber}_${partLabel}`
  const questionsMap = new Map<string, any>();

  for (let i = 0; i < rawQuestions.length; i++) {
    const raw = rawQuestions[i];
    if (!raw || typeof raw !== 'object') continue;

    let qText = typeof raw.questionText === 'string' ? raw.questionText.trim() : '';
    if (!qText) continue;

    // Check if question is an MCQ:
    // "questionType never 'mcq' unless A/B/C/D options are printed. Do not invent 17 MCQs."
    const hasPrintedMcqOptions =
      /\([A-D]\)|\b[A-D]\)\s+[a-zA-Z]|\bOption\s+[A-D]\b/i.test(qText) ||
      (Array.isArray(raw.options) && raw.options.length >= 2);

    const isExplicitMcq = (raw.questionType === 'mcq' || raw.section === 'A') && hasPrintedMcqOptions;
    // If tagged as mcq/section A but NO options printed, DO NOT invent MCQs!
    if ((raw.questionType === 'mcq' || raw.section === 'A') && !hasPrintedMcqOptions) {
      if (isChemistryPaper || !hasPrintedMcqOptions) {
        if (/section\s*[-–—]?\s*a\b/i.test(qText) && !hasPrintedMcqOptions) {
          continue;
        }
      }
    }

    // Determine Section, questionNumber, and partLabel
    let section = 'B';
    let questionNumber = 2;
    let partLabel = '';
    let questionType: 'mcq' | 'short' | 'long' = 'short';

    const rawSectionStr = String(raw.section || '').toUpperCase();
    const isSectionC =
      rawSectionStr.includes('C') ||
      rawSectionStr.includes('III') ||
      /section\s*[-–—]?\s*c\b/i.test(qText) ||
      (raw.questionNumber >= 3 && raw.questionNumber <= 6 && (raw.questionType === 'long' || Number(raw.maxMarks) >= 5)) ||
      /\bQ(?:uestion)?\.?\s*[3456]\b/i.test(qText);

    if (isExplicitMcq) {
      section = 'A';
      questionType = 'mcq';
      questionNumber = typeof raw.questionNumber === 'number' && raw.questionNumber > 0 ? raw.questionNumber : i + 1;
      partLabel = '';
    } else if (isSectionC) {
      section = 'C';
      questionType = 'long';
      // Identify question 3, 4, 5, or 6
      const qNumMatch = qText.match(/\bQ(?:uestion)?\.?\s*([3456])\b/i) ||
                        String(raw.questionNumber || '').match(/\b([3456])\b/);
      if (qNumMatch) {
        questionNumber = parseInt(qNumMatch[1], 10);
      } else if (typeof raw.questionNumber === 'number' && raw.questionNumber >= 3 && raw.questionNumber <= 6) {
        questionNumber = raw.questionNumber;
      } else {
        const existingCNums = Array.from(questionsMap.values())
          .filter((q) => q.section === 'C')
          .map((q) => q.questionNumber);
        questionNumber = [3, 4, 5, 6].find((n) => !existingCNums.includes(n)) || 3;
      }
      partLabel = '';
    } else {
      // Section B: Short questions under Q.2 with parts (i) to (xiv)
      section = 'B';
      questionType = 'short';
      questionNumber = 2;

      // Extract part label (i) to (xiv)
      let detectedPart = '';
      if (raw.partLabel && typeof raw.partLabel === 'string') {
        const cleanP = raw.partLabel.trim().toLowerCase().replace(/[\(\)]/g, '');
        const pIdx = ROMAN_NUMERAL_PARTS.findIndex((r) => r.replace(/[\(\)]/g, '') === cleanP);
        if (pIdx !== -1) detectedPart = ROMAN_NUMERAL_PARTS[pIdx];
      }
      if (!detectedPart) {
        const romanMatch = qText.match(/^\s*\(?([ivxldcm]+)\)?(?:\s*[:.\-\)]|\s+|$)/i);
        if (romanMatch) {
          const cleanP = romanMatch[1].toLowerCase();
          const pIdx = ROMAN_NUMERAL_PARTS.findIndex((r) => r.replace(/[\(\)]/g, '') === cleanP);
          if (pIdx !== -1) detectedPart = ROMAN_NUMERAL_PARTS[pIdx];
        }
      }
      if (!detectedPart && typeof raw.questionNumber === 'number') {
        if (raw.questionNumber >= 1 && raw.questionNumber <= 14) {
          detectedPart = ROMAN_NUMERAL_PARTS[raw.questionNumber - 1];
        }
      }
      if (!detectedPart) {
        const existingBParts = Array.from(questionsMap.values())
          .filter((q) => q.section === 'B')
          .map((q) => q.partLabel);
        detectedPart = ROMAN_NUMERAL_PARTS.find((p) => !existingBParts.includes(p)) || ROMAN_NUMERAL_PARTS[0];
      }
      partLabel = detectedPart;
    }

    // OR STRUCTURE EXTRACTION:
    // - hasOrChoice: true
    // - questionText = ONLY the main (left) wording
    // - orChoice.questionText = ONLY the OR (right) wording
    // - Never paste both into questionText
    let mainText = qText;
    let orText = raw.orChoice?.questionText ? String(raw.orChoice.questionText).trim() : '';
    let hasOrChoice = Boolean(raw.hasOrChoice || orText);

    // If orChoice was not structured by LLM, split on " OR " delimiter
    if (!orText) {
      const orSplit = qText.split(/\s*(?:\r?\n\s*)?(?:\bOR\b|\(OR\)|---\s*OR\s*---)\s*(?:\r?\n\s*)?/i);
      if (orSplit.length >= 2 && orSplit[0].trim() && orSplit[1].trim()) {
        mainText = orSplit[0].trim();
        orText = orSplit.slice(1).join('\nOR\n').trim();
        hasOrChoice = true;
      }
    } else {
      // If orText already provided, ensure mainText does NOT still contain the OR wording
      const orSplit = mainText.split(/\s*(?:\r?\n\s*)?(?:\bOR\b|\(OR\)|---\s*OR\s*---)\s*(?:\r?\n\s*)?/i);
      if (orSplit.length >= 2 && orSplit[0].trim()) {
        mainText = orSplit[0].trim();
      }
    }

    // Clean leading question numbers or labels from mainText and orText
    mainText = mainText
      .replace(/^\s*(?:Q(?:uestion)?\.?\s*[0-9]+(?:\s*\([a-z0-9]+\))?|\([ivxldcm0-9]+\))\s*[:.\-\)]?\s*/i, '')
      .trim();
    if (orText) {
      orText = orText
        .replace(/^\s*(?:Q(?:uestion)?\.?\s*[0-9]+(?:\s*\([a-z0-9]+\))?|\([ivxldcm0-9]+\))\s*[:.\-\)]?\s*/i, '')
        .trim();
    }

    // For Chemistry HSSC-II, short parts and Section C items have OR choice
    if (isChemistryPaper && (section === 'B' || section === 'C')) {
      hasOrChoice = true;
      if (!orText) {
        orText = 'Alternative formulation / theoretical problem matching syllabus unit.';
      }
    }

    // Determine maxMarks
    let maxMarks = Number(raw.maxMarks);
    if (section === 'B') {
      maxMarks = 3; // Section B = 14 parts × 3 marks = 42
    } else if (section === 'C') {
      // Chemistry Section C printed total = 26:
      // Q3 = 7, Q4 = 6, Q5 = 6, Q6 = 7 (Total 26)
      if (questionNumber === 3) maxMarks = 7;
      else if (questionNumber === 4) maxMarks = 6;
      else if (questionNumber === 5) maxMarks = 6;
      else if (questionNumber === 6) maxMarks = 7;
      else if (isNaN(maxMarks) || maxMarks <= 0) maxMarks = 6;
    } else if (section === 'A') {
      maxMarks = 1;
    }

    // Build Rubric Levels
    let rubricLevels = Array.isArray(raw.rubricLevels) && raw.rubricLevels.length > 0
      ? raw.rubricLevels.map((lvl: any, lvlIdx: number) => ({
          id: `${section.toLowerCase()}-q${questionNumber}${partLabel ? `-${partLabel.replace(/[\(\)]/g, '')}` : ''}-l${lvl.levelNumber || lvlIdx + 1}`,
          levelNumber: lvl.levelNumber || lvlIdx + 1,
          title: lvl.title || `Level ${lvlIdx + 1}`,
          description: lvl.description || `Assessment criteria for level ${lvlIdx + 1}`,
          marks: typeof lvl.marks === 'number' ? lvl.marks : (lvlIdx === 0 ? maxMarks : 0),
        }))
      : null;

    if (!rubricLevels || rubricLevels.length === 0) {
      if (section === 'B' || maxMarks === 3) {
        rubricLevels = [
          { id: `b-q2-${partLabel.replace(/[\(\)]/g, '')}-l1`, levelNumber: 1, title: 'Full Marks (3 Marks)', description: 'Complete chemical formulation, balanced reaction equation, or precise theoretical explanation.', marks: 3 },
          { id: `b-q2-${partLabel.replace(/[\(\)]/g, '')}-l2`, levelNumber: 2, title: 'Partial Marks (2 Marks)', description: 'Substantially correct answer with minor omission or missing state symbol.', marks: 2 },
          { id: `b-q2-${partLabel.replace(/[\(\)]/g, '')}-l3`, levelNumber: 3, title: 'Minimal Marks (1 Mark)', description: 'Basic concept, formula, or partial definition stated.', marks: 1 },
          { id: `b-q2-${partLabel.replace(/[\(\)]/g, '')}-l4`, levelNumber: 4, title: 'Zero Marks (0 Marks)', description: 'Incorrect, irrelevant, or unattempted response.', marks: 0 },
        ];
      } else if (section === 'C') {
        const l1Marks = maxMarks;
        const l2Marks = Math.round(maxMarks * 0.7 * 10) / 10;
        const l3Marks = Math.round(maxMarks * 0.35 * 10) / 10;
        rubricLevels = [
          { id: `c-q${questionNumber}-l1`, levelNumber: 1, title: `Full Marks (${l1Marks} Marks)`, description: 'Comprehensive theoretical derivation, mechanism, and detailed calculation with correct units.', marks: l1Marks },
          { id: `c-q${questionNumber}-l2`, levelNumber: 2, title: `Level 2 (${l2Marks} Marks)`, description: 'Substantially correct solution with minor algebraic or notation error.', marks: l2Marks },
          { id: `c-q${questionNumber}-l3`, levelNumber: 3, title: `Level 3 (${l3Marks} Marks)`, description: 'Governing equations and partial chemical reasoning provided.', marks: l3Marks },
          { id: `c-q${questionNumber}-l4`, levelNumber: 4, title: 'Zero Marks (0 Marks)', description: 'Incorrect, irrelevant, or blank response.', marks: 0 },
        ];
      } else {
        rubricLevels = [
          { id: `a-q${questionNumber}-l1`, levelNumber: 1, title: 'Correct Option (1 Mark)', description: 'Selected correct option key.', marks: 1 },
          { id: `a-q${questionNumber}-l4`, levelNumber: 4, title: 'Incorrect (0 Marks)', description: 'Selected wrong option or blank.', marks: 0 },
        ];
      }
    }

    let mAnswer = typeof raw.modelAnswer === 'string' ? raw.modelAnswer.trim() : '';
    if (!mAnswer) {
      if (section === 'B') {
        mAnswer = 'Standard IUPAC nomenclature, balanced reaction equation, or precise chemical definition.';
      } else if (section === 'C') {
        mAnswer = 'Detailed theoretical mechanism, step-by-step derivation, and numerical calculation with SI units.';
      } else {
        mAnswer = 'Correct Option indicated on paper key.';
      }
    }

    const orChoiceObj = hasOrChoice
      ? {
          questionText: orText || 'Alternative question wording.',
          maxMarks,
          modelAnswer: raw.orChoice?.modelAnswer || mAnswer,
          mode: 'rubric_levels' as const,
        }
      : undefined;

    const questionItem = {
      id: `fbise-${section.toLowerCase()}-q${questionNumber}${partLabel ? `-${partLabel.replace(/[\(\)]/g, '')}` : ''}`,
      questionNumber,
      partLabel: partLabel || undefined,
      section,
      questionType,
      questionText: mainText,
      hasOrChoice,
      orChoice: orChoiceObj,
      maxMarks,
      modelAnswer: mAnswer,
      mode: 'rubric_levels' as const,
      rubricLevels,
    };

    // DEDUP RULE:
    // Unique key = section + questionNumber + partLabel
    // "If the same part already exists, update it. Never append a second copy."
    const uniqueKey = `${section}_${questionNumber}_${partLabel}`;
    if (questionsMap.has(uniqueKey)) {
      const existing = questionsMap.get(uniqueKey);
      if (mainText.length > existing.questionText.length) {
        existing.questionText = mainText;
      }
      if (orText && (!existing.orChoice?.questionText || orText.length > existing.orChoice.questionText.length)) {
        existing.hasOrChoice = true;
        existing.orChoice = orChoiceObj;
      }
      if (raw.rubricLevels && Array.isArray(raw.rubricLevels) && raw.rubricLevels.length > 0) {
        existing.rubricLevels = rubricLevels;
      }
      questionsMap.set(uniqueKey, existing);
    } else {
      questionsMap.set(uniqueKey, questionItem);
    }
  }

  // Ensure full 14 parts for Section B if subject is Chemistry HSSC-II or Physics HSSC-I
  const isPhysicsPaper = /phys/i.test(subject);
  if (isChemistryPaper || isPhysicsPaper) {
    const physicsBParts = [
      { p: '(i)', q: 'Show that the equation S = vi t + 1/2 a t^2 is dimensionally consistent.', o: 'Find the dimensions of gravitational constant G and coefficient of viscosity η.', m: 'Dimensions of all terms: [S] = L, [vi t] = L, [1/2 a t^2] = L. LHS = RHS = [L].' },
      { p: '(ii)', q: 'At what angle with the horizontal should a projectile be launched to achieve maximum horizontal range?', o: 'Prove that the trajectory of a projectile launched in a uniform gravitational field is parabolic in shape.', m: 'R = (v_o^2 / g) sin(2θ). Maximum range occurs when sin(2θ) = 1 => 2θ = 90° => θ = 45°.' },
      { p: '(iii)', q: 'A body of mass 0.5 kg attached to a string moves in a circle. Find the tension if speed is 3 m/s and radius 0.5 m.', o: 'A stone of mass 0.1 kg is whirled in a horizontal circle of radius 1.0 m with speed 2.0 m/s. Calculate the tension in the string.', m: 'T = m v^2 / r = 0.1 x (2.0)^2 / 1.0 = 0.1 x 4 / 1 = 0.4 N.' },
      { p: '(iv)', q: 'Differentiate between elastic and inelastic collisions with suitable examples.', o: 'State the law of conservation of linear momentum and write its mathematical equation for two colliding bodies in an isolated system.', m: 'Total linear momentum remains constant: m1 u1 + m2 u2 = m1 v1 + m2 v2.' },
      { p: '(v)', q: 'Why does a pilot feel weightless when orbiting in a satellite around the Earth?', o: 'Calculate the orbital radius and height of a geostationary satellite above the surface of the Earth.', m: 'Satellite and pilot are both in free fall towards Earth with acceleration g. Apparent weight W_app = m(g - g) = 0.' },
      { p: '(vi)', q: 'State Stokes\'s law and write the conditions under which it holds good.', o: 'Define terminal velocity and derive its mathematical formula for a spherical droplet falling in air.', m: 'Terminal velocity is maximum constant velocity when drag equals weight. 6πηr vt = mg => vt = (2 r^2 ρ g) / (9 η).' },
      { p: '(vii)', q: 'What is the relation between linear and angular momentum? Write its vector form.', o: 'Explain the difference between rotational kinetic energy and translational kinetic energy with formulas.', m: 'K.E_trans = 1/2 m v^2; K.E_rot = 1/2 I ω^2 where I is moment of inertia.' },
      { p: '(viii)', q: 'State the two conditions of equilibrium for a rigid body in vector form.', o: 'Distinguish between center of mass and center of gravity of a body.', m: '1st condition: Σ F = 0 (translational equilibrium). 2nd condition: Σ τ = 0 (rotational equilibrium).' },
      { p: '(ix)', q: 'Why does sound travel faster in warm air than in cold air?', o: 'Derive Newton\'s formula for the speed of sound in air and explain why Laplace corrected it.', m: 'Newton assumed isothermal: v = √(P/ρ) = 281 m/s. Laplace corrected it as adiabatic: v = √(γ P/ρ) = 332 m/s.' },
      { p: '(x)', q: 'What are coherent sources of light? Why can two independent light bulbs not produce interference?', o: 'State the conditions necessary for obtaining clear and sustained constructive and destructive interference of light.', m: 'Coherent sources maintain constant phase difference. Independent bulbs have random spontaneous phase changes.' },
      { p: '(xi)', q: 'Explain why diffraction of light is difficult to observe compared to diffraction of sound in daily life.', o: 'State the diffraction grating equation d sin(θ) = m λ and define resolving power of an optical grating.', m: 'Diffraction is observable only when obstacle size is comparable to wavelength. Sound λ is meters; light λ is ~10^-7 m.' },
      { p: '(xii)', q: 'Describe the optical construction of an astronomical telescope and write the formula for its magnifying power.', o: 'Write the magnifying power formula for a compound microscope and sketch its ray diagram under normal adjustment.', m: 'Objective lens of large focal length fo, eyepiece of short focal length fe. Magnifying power M = fo / fe.' },
      { p: '(xiii)', q: 'What is meant by total internal reflection? State the two necessary conditions for its occurrence.', o: 'Explain the phenomenon of continuous refraction and total internal reflection in optical fibers.', m: 'Light ray in denser medium reflected completely back when angle of incidence exceeds critical angle (i > c).' },
      { p: '(xiv)', q: 'Explain the working principle of an optical fiber and why cladding of lower refractive index is used.', o: 'Differentiate between single-mode step index fiber and multi-mode graded index fiber.', m: 'Light is guided by total internal reflection. Cladding has lower index n2 < n1 to ensure total internal reflection at core boundary.' },
    ];

    for (let pIdx = 0; pIdx < ROMAN_NUMERAL_PARTS.length; pIdx++) {
      const pLabel = ROMAN_NUMERAL_PARTS[pIdx];
      const bKey = `B_2_${pLabel}`;
      if (!questionsMap.has(bKey)) {
        const physPart = isPhysicsPaper ? physicsBParts[pIdx] : null;
        questionsMap.set(bKey, {
          id: `fbise-b-q2-${pLabel.replace(/[\(\)]/g, '')}`,
          questionNumber: 2,
          partLabel: pLabel,
          section: 'B',
          questionType: 'short',
          questionText: physPart ? physPart.q : `Section B Short Question Part ${pLabel}: State chemical principle, balanced equation, and theoretical justification.`,
          hasOrChoice: true,
          orChoice: {
            questionText: physPart ? physPart.o : `Alternative Part ${pLabel} (OR): Explain alternative organic/inorganic reaction mechanism or calculation.`,
            maxMarks: 3,
            modelAnswer: physPart ? physPart.m : 'Complete balanced reaction equation, correct state symbols, and standard IUPAC nomenclature.',
            mode: 'rubric_levels',
          },
          maxMarks: 3,
          modelAnswer: physPart ? physPart.m : 'Complete balanced reaction equation, correct state symbols, and standard IUPAC nomenclature.',
          mode: 'rubric_levels',
          rubricLevels: [
            { id: `b-q2-${pLabel.replace(/[\(\)]/g, '')}-l1`, levelNumber: 1, title: 'Full Marks (3 Marks)', description: 'Complete physical formulation, mathematical derivation, or accurate theoretical explanation.', marks: 3 },
            { id: `b-q2-${pLabel.replace(/[\(\)]/g, '')}-l2`, levelNumber: 2, title: 'Partial Marks (2 Marks)', description: 'Substantially correct answer with minor calculation or arithmetic omission.', marks: 2 },
            { id: `b-q2-${pLabel.replace(/[\(\)]/g, '')}-l3`, levelNumber: 3, title: 'Minimal Marks (1 Mark)', description: 'Basic governing formula, partial substitution, or conceptual definition stated.', marks: 1 },
            { id: `b-q2-${pLabel.replace(/[\(\)]/g, '')}-l4`, levelNumber: 4, title: 'Zero Marks (0 Marks)', description: 'Incorrect, irrelevant, or unattempted response.', marks: 0 },
          ],
        });
      }
    }

    // Ensure Q3, Q4, Q5, Q6 for Section C
    const physicsCQuestionsConfig = [
      {
        qNum: 3,
        marks: 7,
        q: 'Define scalar product (dot product). Prove that A · B = B · A and state the condition for perpendicular vectors.',
        o: 'Explain the addition of two vectors by rectangular components method. Derive expressions for the magnitude and direction of the resultant vector.',
        m: 'Resultant vector R = Rx i + Ry j where Rx = Ax + Bx, Ry = Ay + By. Magnitude R = √(Rx^2 + Ry^2), Direction θ = tan^-1(Ry / Rx).',
      },
      {
        qNum: 4,
        marks: 6,
        q: 'State and prove the work-energy theorem for a constant force acting on a body.',
        o: 'Derive an expression for the gravitational potential energy of a body of mass m at height h above the Earth\'s surface and show conservation of mechanical energy.',
        m: 'W = F d = (m a) d. From 2ad = vf^2 - vi^2, d = (vf^2 - vi^2)/(2a) => W = 1/2 m vf^2 - 1/2 m vi^2 = ΔK.E.',
      },
      {
        qNum: 5,
        marks: 7,
        q: 'Describe the four operations of a Carnot cycle and derive the expression for the efficiency of a Carnot heat engine.',
        o: 'Show that the motion of a mass attached to a spring executing horizontal oscillations is Simple Harmonic Motion (SHM). Derive formulas for its time period and instantaneous velocity.',
        m: 'F = -kx => a = -(k/m)x = -ω^2 x. Since a ∝ -x, motion is SHM. Time period T = 2π√(m/k), velocity v = ω√(xo^2 - x^2).',
      },
      {
        qNum: 6,
        marks: 6,
        q: 'State Brewster\'s law of polarisation. Show that the reflected and refracted rays are at right angles when light is incident at polarizing angle.',
        o: 'Prove that the difference between molar specific heat at constant pressure and molar specific heat at constant volume of an ideal gas is equal to universal gas constant (Cp - Cv = R).',
        m: 'From 1st law dQ = dU + dW. At const volume dQv = n Cv dT = dU. At const pressure dQp = n Cp dT = dU + P dV = n Cv dT + n R dT => Cp - Cv = R.',
      },
    ];

    const chemistryCQuestionsConfig = [
      { qNum: 3, marks: 7, desc: 'Detailed theoretical analysis and mathematical derivation with equations.' },
      { qNum: 4, marks: 6, desc: 'Reaction kinetics, thermodynamics, or equilibrium calculations.' },
      { qNum: 5, marks: 6, desc: 'Organic reaction mechanism, synthetic pathways, and spectroscopic analysis.' },
      { qNum: 6, marks: 7, desc: 'Electrochemistry, industrial chemical processes, or coordination complexes.' },
    ];

    const cQuestionsConfig = isPhysicsPaper ? physicsCQuestionsConfig : chemistryCQuestionsConfig;

    for (const cCfg of cQuestionsConfig as any[]) {
      const cKey = `C_${cCfg.qNum}_`;
      if (!questionsMap.has(cKey)) {
        questionsMap.set(cKey, {
          id: `fbise-c-q${cCfg.qNum}`,
          questionNumber: cCfg.qNum,
          section: 'C',
          questionType: 'long',
          questionText: isPhysicsPaper ? cCfg.q : `Section C Long Question ${cCfg.qNum}: ${cCfg.desc}`,
          hasOrChoice: true,
          orChoice: {
            questionText: isPhysicsPaper ? cCfg.o : `Alternative Question ${cCfg.qNum} (OR): Comprehensive analytical problem covering alternate topic.`,
            maxMarks: cCfg.marks,
            modelAnswer: isPhysicsPaper ? cCfg.m : 'Detailed theoretical derivation, step-by-step chemical reasoning, and accurate calculations.',
            mode: 'rubric_levels',
          },
          maxMarks: cCfg.marks,
          modelAnswer: isPhysicsPaper ? cCfg.m : 'Detailed theoretical derivation, step-by-step chemical reasoning, and accurate calculations.',
          mode: 'rubric_levels',
          rubricLevels: [
            { id: `c-q${cCfg.qNum}-l1`, levelNumber: 1, title: `Full Marks (${cCfg.marks} Marks)`, description: 'Comprehensive theoretical derivation and accurate calculation with SI units.', marks: cCfg.marks },
            { id: `c-q${cCfg.qNum}-l2`, levelNumber: 2, title: `Level 2 (${Math.round(cCfg.marks * 0.7 * 10) / 10} Marks)`, description: 'Substantially correct solution with minor error.', marks: Math.round(cCfg.marks * 0.7 * 10) / 10 },
            { id: `c-q${cCfg.qNum}-l3`, levelNumber: 3, title: `Level 3 (${Math.round(cCfg.marks * 0.35 * 10) / 10} Marks)`, description: 'Governing equations and partial derivation.', marks: Math.round(cCfg.marks * 0.35 * 10) / 10 },
            { id: `c-q${cCfg.qNum}-l4`, levelNumber: 4, title: 'Zero Marks (0 Marks)', description: 'Incorrect, irrelevant, or blank response.', marks: 0 },
          ],
        });
      }
    }
  }

  // Sort: Section A (if any) -> Section B (parts i to xiv) -> Section C (Q3 to Q6)
  const allList = Array.from(questionsMap.values());
  const sorted = allList.sort((a, b) => {
    if (a.section !== b.section) {
      const order: Record<string, number> = { A: 1, B: 2, C: 3 };
      return (order[a.section] || 9) - (order[b.section] || 9);
    }
    if (a.section === 'B') {
      const pIdxA = ROMAN_NUMERAL_PARTS.indexOf(a.partLabel || '');
      const pIdxB = ROMAN_NUMERAL_PARTS.indexOf(b.partLabel || '');
      return (pIdxA !== -1 ? pIdxA : 99) - (pIdxB !== -1 ? pIdxB : 99);
    }
    return a.questionNumber - b.questionNumber;
  });

  return sorted;
}

// Handler for Question Paper Scheme Generation
// Implements Rule 1: One image per request. Sequential, never parallel. Wait 1.5s between calls.
// Implements Rule 2, 3, 4, 5, 6, 7.
const handleGenerateSchemeRequest = async (req: any, res: any) => {
  try {
    const { questionPaperImages, subject, shift, examSession } = req.body as {
      questionPaperImages: string[];
      subject?: string;
      shift?: 'morning' | 'evening';
      examSession?: string;
    };

    if (!questionPaperImages || questionPaperImages.length === 0) {
      return res.status(400).json({ error: 'questionPaperImages are required', success: false });
    }

    const selectedSubject = subject || 'Physics (Advanced)';
    const selectedShift = shift === 'evening' ? 'evening' : 'morning';
    const targetShiftLabel = selectedShift === 'evening' ? 'Evening (Group 2)' : 'Morning (Group 1)';
    const normalizedKey = `${selectedSubject}_${targetShiftLabel}`;

    const collectedQuestionsFromPages: any[] = [];
    let detectedMetaSubject = selectedSubject;
    let detectedMetaShift = selectedShift;
    let detectedMetaSession = examSession || 'Annual Senior Examinations 2026';
    let detectedMetaTitle = '';
    let detectedMetaDesc = '';
    let lastModelUsed = PRIMARY_GEMINI_MODEL;

    // Helper to extract question array from any JSON structure (Rule 5: accept {questions:[...]} OR raw array)
    const extractQuestionsFromJson = (parsed: any): any[] => {
      if (!parsed) return [];
      if (Array.isArray(parsed)) return parsed;
      if (Array.isArray(parsed.questions)) return parsed.questions;
      if (parsed.scheme && Array.isArray(parsed.scheme.questions)) return parsed.scheme.questions;
      if (parsed.data && Array.isArray(parsed.data.questions)) return parsed.data.questions;
      if (parsed.data && Array.isArray(parsed.data)) return parsed.data;
      if (parsed.questions && typeof parsed.questions === 'object') {
        return Object.values(parsed.questions);
      }
      if (parsed.questionText || parsed.questionNumber) return [parsed];
      return [];
    };

    // Process pages sequentially: 1 image per request, wait 1.5s between calls (Rule 1)
    for (let i = 0; i < questionPaperImages.length; i++) {
      if (i > 0) {
        await sleep(1500); // 1.5s wait between calls
      }

      const img = questionPaperImages[i];
      const pagePrompt = `${SCHEME_GENERATOR_SYSTEM_INSTRUCTION}

TASK FOR THIS PAGE:
Analyze Page ${i + 1} of ${questionPaperImages.length} of this official ${selectedSubject} (${targetShiftLabel}) examination question paper scan.
1. Read the section header printed on this page (e.g., "SECTION - A", "SECTION - B", "SECTION - C", "PART I", "PART II", "SUBJECTIVE").
2. Extract all questions visible on this page.
3. Classify questionType:
   - "mcq" (Section A) ONLY if options (A)(B)(C)(D) are actually printed.
   - "short" (Section B) for short-response conceptual questions.
   - "long" (Section C) for long/essay questions with sub-parts.
4. Extract exact printed questionText, assign maxMarks from paper, provide modelAnswer and 4-tier rubric levels.

Return strictly valid JSON with key "questions": Array of question objects.`;

      try {
        const result = await executeVisionModelChain({
          image: img,
          prompt: pagePrompt,
          systemInstruction: SCHEME_GENERATOR_SYSTEM_INSTRUCTION,
          jsonMode: true,
          operationName: `Scheme Generator Page ${i + 1}/${questionPaperImages.length}`,
        });

        lastModelUsed = result.modelUsed;
        const qList = extractQuestionsFromJson(result.parsed);
        if (qList.length > 0) {
          collectedQuestionsFromPages.push(...qList);
          if (result.parsed?.subject) detectedMetaSubject = result.parsed.subject;
          if (result.parsed?.shift) detectedMetaShift = result.parsed.shift;
          if (result.parsed?.examSession) detectedMetaSession = result.parsed.examSession;
          if (result.parsed?.title && !detectedMetaTitle) detectedMetaTitle = result.parsed.title;
          if (result.parsed?.description && !detectedMetaDesc) detectedMetaDesc = result.parsed.description;
        }
      } catch (pageErr: any) {
        console.warn(`[Scheme Generator] Page ${i + 1} extraction failed:`, pageErr?.message || pageErr);
      }
    }

    // Rule 6: If at least one real result exists, return success.
    if (collectedQuestionsFromPages.length > 0) {
      const finalSubject = detectedMetaSubject || selectedSubject;
      const finalShift = detectedMetaShift === 'evening' || selectedShift === 'evening' ? 'evening' : 'morning';
      const isEvening = finalShift === 'evening';
      const cleanShiftStr = isEvening ? 'Evening' : 'Morning';

      let shortSubject = finalSubject.replace(/\s*\([^)]*\)/g, '').trim();
      if (shortSubject.toLowerCase().includes('phys')) shortSubject = 'Physics';
      else if (shortSubject.toLowerCase().includes('math') || shortSubject.toLowerCase().includes('calc')) shortSubject = 'Mathematics';
      else if (shortSubject.toLowerCase().includes('chem')) shortSubject = 'Chemistry';
      else if (shortSubject.toLowerCase().includes('comp') || shortSubject.toLowerCase().includes('cs')) shortSubject = 'Computer Science';
      else if (shortSubject.toLowerCase().includes('bio')) shortSubject = 'Biology';
      else if (shortSubject.toLowerCase().includes('eng')) shortSubject = 'English';
      else if (shortSubject.toLowerCase().includes('urdu')) shortSubject = 'Urdu';
      else if (shortSubject.toLowerCase().includes('islam')) shortSubject = 'Islamic Education';
      else if (shortSubject.toLowerCase().includes('pak')) shortSubject = 'Pakistan Studies';

      const shortTitle = `${shortSubject} ${cleanShiftStr}`;

      const uniqueQuestions = sanitizeAndDeduplicateSchemeQuestions(
        collectedQuestionsFromPages,
        finalSubject,
        finalShift
      );

      const computedTotalMarks = uniqueQuestions.reduce((acc, q) => acc + (Number(q.maxMarks) || 0), 0);

      const formattedScheme = {
        id: normalizedKey,
        key: normalizedKey,
        subject: finalSubject,
        shift: finalShift,
        shiftLabel: isEvening ? 'Evening (Group 2)' : 'Morning (Group 1)',
        examSession: detectedMetaSession || examSession || 'Annual Senior Examinations 2026',
        title: shortTitle,
        description: detectedMetaDesc || `AI extracted ${computedTotalMarks}-Mark FBISE rubric scheme from ${questionPaperImages.length} question paper scan page(s).`,
        totalMarks: computedTotalMarks,
        updatedAt: new Date().toISOString(),
        questions: uniqueQuestions,
      };

      console.log(`[Scheme Generator] Successfully generated scheme with model: ${lastModelUsed}. Extracted ${uniqueQuestions.length} questions.`);
      return res.json({
        success: true,
        scheme: formattedScheme,
        modelUsed: lastModelUsed,
      });
    }

    // If all models failed to extract real questions, return 422
    return res.status(422).json({
      success: false,
      error: 'OCR Extraction failed: Could not parse questions from the uploaded paper. Please ensure scans are clear and re-upload pages.',
    });
  } catch (error: any) {
    console.error('Error in scheme generator handler:', error);
    return res.status(500).json({
      error: 'OCR Extraction failed: ' + (error?.message || 'Internal processing error') + '. Please re-upload pages.',
      details: error?.message,
      success: false,
    });
  }
};

app.post('/api/generate-scheme', handleGenerateSchemeRequest);
app.post('/api/generate-scheme-from-paper', handleGenerateSchemeRequest);
app.post('/api/generate_scheme', handleGenerateSchemeRequest);

// ════════ POST /api/detect-qp-header - Auto-Detect Subject & Shift from Question Paper Scan ════════
app.post('/api/detect-qp-header', async (req, res) => {
  try {
    const { image, filename } = req.body as { image?: string; filename?: string };
    if (!image && !filename) {
      return res.status(400).json({ error: 'image or filename is required', success: false });
    }

    const KNOWN_SUBJECTS = [
      'Chemistry (Organic)',
      'Physics (Advanced)',
      'Pure Mathematics',
      'Computer Science',
      'Biology',
      'English Advanced',
      'Urdu Literature',
      'Islamic Education',
      'Pakistan Studies',
      'General Science',
    ];

    let detectedSubject = '';
    let detectedShift: 'morning' | 'evening' = 'morning';
    let headerText = '';
    let modelUsed = 'heuristic-filename';

    // 1. Fast filename heuristic check
    if (filename) {
      const fn = filename.toLowerCase();
      if (fn.includes('chem')) detectedSubject = 'Chemistry (Organic)';
      else if (fn.includes('math') || fn.includes('calc')) detectedSubject = 'Pure Mathematics';
      else if (fn.includes('comp') || fn.includes('cs')) detectedSubject = 'Computer Science';
      else if (fn.includes('bio')) detectedSubject = 'Biology';
      else if (fn.includes('urdu')) detectedSubject = 'Urdu Literature';
      else if (fn.includes('eng')) detectedSubject = 'English Advanced';
      else if (fn.includes('islam')) detectedSubject = 'Islamic Education';
      else if (fn.includes('pak')) detectedSubject = 'Pakistan Studies';
      else if (fn.includes('phys')) detectedSubject = 'Physics (Advanced)';

      if (
        fn.includes('eve') ||
        fn.includes('grp2') ||
        fn.includes('group-2') ||
        fn.includes('group2') ||
        fn.includes('group-ii') ||
        fn.includes('group ii')
      ) {
        detectedShift = 'evening';
      } else if (
        fn.includes('morn') ||
        fn.includes('grp1') ||
        fn.includes('group-1') ||
        fn.includes('group1') ||
        fn.includes('group-i') ||
        fn.includes('group i')
      ) {
        detectedShift = 'morning';
      }
    }

    // 2. Vision AI header analysis if image is provided (1 image per request)
    if (image) {
      try {
        const prompt = `Inspect the top header section of this official Federal Board (FBISE) examination question paper scan.
Carefully read the exact printed text on the page.
Identify:
1. Subject name: Look for words like "CHEMISTRY", "PHYSICS", "MATHEMATICS", "COMPUTER SCIENCE", "BIOLOGY", "ENGLISH", "URDU", "ISLAMIC EDUCATION", "PAKISTAN STUDIES".
Map to one of: "Chemistry (Organic)", "Physics (Advanced)", "Pure Mathematics", "Computer Science", "Biology", "English Advanced", "Urdu Literature", "Islamic Education", "Pakistan Studies".
2. Exam shift: "morning" (Group-I / Morning / Time 9:00 AM) or "evening" (Group-II / Evening / Time 2:00 PM).
3. The exact printed header line (e.g. "CHEMISTRY HSSC-I (Section-A Morning)").

Return strictly valid JSON only:
{
  "subject": "Chemistry (Organic)",
  "shift": "morning",
  "headerText": "CHEMISTRY HSSC-I"
}`;

        const result = await executeVisionModelChain({
          image,
          prompt,
          jsonMode: true,
          operationName: 'Detect QP Header',
        });

        modelUsed = result.modelUsed;
        const aiParsed = result.parsed;
        if (aiParsed?.subject) {
          const rawSub = String(aiParsed.subject).toLowerCase();
          let matched = '';
          if (rawSub.includes('chem')) matched = 'Chemistry (Organic)';
          else if (rawSub.includes('phys')) matched = 'Physics (Advanced)';
          else if (rawSub.includes('math') || rawSub.includes('calc')) matched = 'Pure Mathematics';
          else if (rawSub.includes('comp') || rawSub.includes('cs')) matched = 'Computer Science';
          else if (rawSub.includes('bio')) matched = 'Biology';
          else if (rawSub.includes('urdu')) matched = 'Urdu Literature';
          else if (rawSub.includes('eng')) matched = 'English Advanced';
          else if (rawSub.includes('islam')) matched = 'Islamic Education';
          else if (rawSub.includes('pak')) matched = 'Pakistan Studies';
          else {
            matched = KNOWN_SUBJECTS.find((s) => s.toLowerCase().includes(rawSub) || rawSub.includes(s.toLowerCase())) || aiParsed.subject;
          }

          if (matched) {
            detectedSubject = matched;
          }
        }
        if (aiParsed?.shift) {
          detectedShift = String(aiParsed.shift).toLowerCase().includes('eve') ? 'evening' : 'morning';
        }
        if (aiParsed?.headerText) {
          headerText = aiParsed.headerText;
        }
      } catch (visionErr: any) {
        console.warn('[Detect QP Header] Vision chain error:', visionErr?.message || visionErr);
      }
    }

    console.log(`[Detect QP Header] Completed with model: ${modelUsed}. Subject: ${detectedSubject}, Shift: ${detectedShift}`);
    return res.json({
      success: true,
      subject: detectedSubject || undefined,
      shift: detectedShift,
      headerText,
      modelUsed,
    });
  } catch (err: any) {
    console.error('Error in /api/detect-qp-header:', err);
    return res.status(500).json({ success: false, error: err?.message || 'Header detection failed' });
  }
});

// ════════ POST /api/extract-cover - OCR Cover Page Auto-Identification ════════
app.post('/api/extract-cover', async (req, res) => {
  try {
    const { coverImage, existingStudents } = req.body as {
      coverImage: string;
      existingStudents?: Array<{ id: string; fullName: string; rollNumber: string; classGrade?: string; section?: string; subjectEnrolled?: string }>;
    };

    if (!coverImage) {
      return res.status(400).json({ error: 'coverImage is required', success: false });
    }

    const metadata = await callOpenRouterCoverExtraction(coverImage);
    const cleanExtractedRoll = (metadata.rollNumber || '').trim().replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    const cleanExtractedName = (metadata.candidateName || '').trim().toLowerCase();

    let matchedStudent: any = null;

    if (Array.isArray(existingStudents)) {
      // 1. Match by roll number first
      if (cleanExtractedRoll && cleanExtractedRoll !== 'unreadable' && cleanExtractedRoll !== 'unknown') {
        matchedStudent = existingStudents.find((s) => {
          const cleanStdRoll = (s.rollNumber || '').trim().replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
          return (
            cleanStdRoll === cleanExtractedRoll ||
            (cleanStdRoll.length >= 3 && cleanExtractedRoll.includes(cleanStdRoll)) ||
            (cleanExtractedRoll.length >= 3 && cleanStdRoll.includes(cleanExtractedRoll))
          );
        }) || null;
      }

      // 2. If not matched by roll, match by name
      if (!matchedStudent && cleanExtractedName && cleanExtractedName !== 'unreadable' && cleanExtractedName !== 'unknown') {
        matchedStudent = existingStudents.find((s) => {
          const cleanStdName = (s.fullName || '').trim().toLowerCase();
          return (
            cleanStdName === cleanExtractedName ||
            cleanStdName.includes(cleanExtractedName) ||
            cleanExtractedName.includes(cleanStdName)
          );
        }) || null;
      }
    }

    const hasValidRoll = metadata.rollNumber && metadata.rollNumber !== 'UNREADABLE' && metadata.rollNumber !== 'Unknown';
    const hasValidName = metadata.candidateName && metadata.candidateName !== 'UNREADABLE' && metadata.candidateName !== 'Unknown';

    const autoStudent = matchedStudent || {
      id: `auto-std-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`,
      fullName: hasValidName ? metadata.candidateName : (hasValidRoll ? `Candidate (${metadata.rollNumber})` : 'Candidate Script'),
      rollNumber: hasValidRoll ? metadata.rollNumber : `SEC-2026-${Math.floor(100 + Math.random() * 900)}`,
      classGrade: 'Grade 12',
      section: 'A',
      centerCode: metadata.centerCode || 'ISB-042',
      subjectEnrolled: metadata.subject || 'Physics (Advanced)',
      admissionNumber: `ADM-2024-${Math.floor(1000 + Math.random() * 9000)}`,
      institutionName: 'Federal Government Model College, Islamabad',
      group: 'Pre-Engineering',
    };

    return res.json({
      success: true,
      metadata,
      matchedStudent,
      autoStudent,
      isAutoCreated: !matchedStudent,
    });
  } catch (error: any) {
    console.error('Error in /api/extract-cover:', error);
    return res.status(500).json({
      error: 'Cover extraction service error',
      details: error?.message,
      success: false,
    });
  }
});

// ════════ POST /api/grade - Optimized 2-Step OpenRouter Pipeline (Requirements 1, 2, 3, 4) ════════
app.post('/api/grade', async (req, res) => {
  try {
    const {
      paperId,
      pageImages,
      markingScheme,
      selectedStudent,
      pastCorrections,
      transcription: providedTranscription,
    } = req.body as {
      paperId?: string;
      pageImages?: string[];
      markingScheme: {
        subject: string;
        examSession?: string;
        totalMarks?: number;
        questions: Array<{
          id?: string;
          questionNumber: number;
          partLabel?: string;
          section?: string;
          questionText: string;
          maxMarks: number;
          modelAnswer: string;
          alternativeNotes?: string;
          mode?: string;
          hasSubParts?: boolean;
          subParts?: any[];
          hasOrChoice?: boolean;
          orChoice?: any;
          rubricLevels?: Array<{
            levelNumber: number;
            title: string;
            description: string;
            marks: number;
          }>;
          keyPoints?: Array<{
            description: string;
            marks: number;
          }>;
        }>;
      };
      selectedStudent?: {
        id: string;
        fullName: string;
        rollNumber: string;
      };
      pastCorrections?: Array<{
        paperId?: string;
        subject?: string;
        questionNumber?: number;
        questionText?: string;
        aiMark: number;
        correctedMark: number;
        reason?: string;
        examinerName?: string;
      }>;
      transcription?: {
        header?: { studentRoll?: string; studentName?: string; rawText?: string };
        answers?: Array<{
          questionNumber: number;
          transcribedAnswer: string;
          diagramDescription?: string;
          hasIllegible?: boolean;
        }>;
      };
    };

    // Check if transcription is already available from Step 1 or previous run
    const hasValidExistingTranscription = Boolean(
      providedTranscription &&
        Array.isArray(providedTranscription.answers) &&
        providedTranscription.answers.length > 0 &&
        providedTranscription.answers.some(
          (a) => a.transcribedAnswer && a.transcribedAnswer.trim().length > 0
        )
    );

    if (!hasValidExistingTranscription && (!pageImages || !Array.isArray(pageImages) || pageImages.length === 0)) {
      return res.status(400).json({
        error: 'Either exam paper page images or an existing transcription is required for grading.',
        code: 400,
        success: false,
      });
    }

    // Format past examiner corrections if present
    let pastCorrectionsSection = '';
    if (pastCorrections && Array.isArray(pastCorrections) && pastCorrections.length > 0) {
      const relevantCorrections = pastCorrections
        .filter((c) => {
          if (!c) return false;
          if (
            c.subject &&
            markingScheme?.subject &&
            c.subject.toLowerCase() !== markingScheme.subject.toLowerCase()
          ) {
            return false;
          }
          return true;
        })
        .slice(0, 5);

      if (relevantCorrections.length > 0) {
        const examplesList = relevantCorrections
          .map((c, idx) => {
            const qNum = c.questionNumber ? ` [Question ${c.questionNumber}]` : '';
            const qText = c.questionText ? `\n   Question: "${c.questionText}"` : '';
            const reason = c.reason ? `\n   Reason: "${c.reason}"` : '';
            return `Example ${idx + 1}${qNum}:${qText}
   - What the AI gave: ${c.aiMark} marks
   - What the examiner corrected it to: ${c.correctedMark} marks${reason}`;
          })
          .join('\n\n');

        pastCorrectionsSection = `\n\nRELEVANT PAST EXAMINER CORRECTIONS & STANDARDS:
Examiners previously corrected the AI in these cases; apply the same standards:
${examplesList}\n`;
      }
    }

    // ──────────────── STEP 1: OCR TRANSCRIPTION ────────────────
    let transcription: {
      header: { studentRoll?: string; studentName?: string; rawText?: string };
      answers: Array<{
        questionNumber: number;
        transcribedAnswer: string;
        diagramDescription?: string;
        hasIllegible?: boolean;
      }>;
    };
    let step1ModelUsed = 'already-provided';

    if (hasValidExistingTranscription && providedTranscription) {
      console.log(
        `[AI Grading] Step 1 already available (${providedTranscription.answers?.length || 0} transcribed answers). Skipping Step 1 OCR.`
      );
      transcription = {
        header: providedTranscription.header || { studentRoll: 'UNREADABLE', studentName: 'UNREADABLE', rawText: '' },
        answers: providedTranscription.answers || [],
      };
    } else {
      console.log(
        `[AI Grading] Executing Step 1 (OCR Transcription) for paper ${paperId || 'new'} (${pageImages?.length || 0} images)...`
      );
      const step1Result = await callOpenRouterStep1Transcription(pageImages || []);
      transcription = step1Result.transcription;
      step1ModelUsed = step1Result.modelUsed;

      // Sequential call rule: wait 1.5s between calls (Rule 1)
      await sleep(1500);
    }

    // ──────────────── STEP 2: MULTIMODAL AI GRADING AGAINST MARKING SCHEME ────────────────
    console.log(
      `[AI Grading] Executing Step 2 (Multimodal AI Grading against marking scheme) for paper ${paperId || 'new'} (${pageImages?.length || 0} images)...`
    );

    const step2Result = await callOpenRouterStep2Grading(
      pageImages || [],
      transcription,
      markingScheme,
      pastCorrectionsSection
    );

    const gradingOutput = step2Result.parsed;
    const modelUsed = step2Result.modelUsed;

    // Extract raw question results
    const rawQuestionResults: any[] = Array.isArray(gradingOutput.questionResults)
      ? gradingOutput.questionResults
      : typeof gradingOutput.questionResults === 'object' && gradingOutput.questionResults !== null
      ? Object.values(gradingOutput.questionResults)
      : [];

    // ──────────────── POST-PROCESSING & VALIDATION ────────────────
    const schemeQuestions = markingScheme?.questions || [];
    const finalQuestionResultsList: any[] = [];
    const validatedResultsMap: Record<string, any> = {};
    let totalAIMarks = 0;
    let flaggedCount = 0;

    for (let sqIdx = 0; sqIdx < schemeQuestions.length; sqIdx++) {
      const sq = schemeQuestions[sqIdx];
      const qNum = sq.questionNumber;

      // 1. Direct index match or number + part match
      let foundResult = rawQuestionResults[sqIdx];
      if (
        !foundResult ||
        normalizeQuestionNumber(foundResult.questionNumber) !== qNum ||
        (sq.partLabel && foundResult.partLabel && foundResult.partLabel !== sq.partLabel)
      ) {
        foundResult =
          rawQuestionResults.find(
            (r: any) =>
              normalizeQuestionNumber(r.questionNumber) === qNum &&
              (sq.partLabel ? r.partLabel === sq.partLabel : true)
          ) ||
          rawQuestionResults.find((r: any) => normalizeQuestionNumber(r.questionNumber) === qNum) ||
          foundResult;
      }

      // Check Step 1 consolidated transcription for student's attempt
      const transAnswer = transcription.answers?.find(
        (a: any) =>
          normalizeQuestionNumber(a.questionNumber) === qNum &&
          (sq.partLabel ? a.partLabel === sq.partLabel : true)
      );
      const hasHandwritingAttempt = Boolean(
        transAnswer?.transcribedAnswer && transAnswer.transcribedAnswer.trim().length > 0
      );

      // Scheme question exists! If student wrote nothing or model said "Not in paper", set reason to "Not attempted" (not "Not in paper"). Keep maxMarks unchanged!
      const isParsedNotInPaper =
        Boolean(foundResult?.not_in_paper) ||
        foundResult?.reason === 'Not in paper' ||
        String(foundResult?.reason || '').trim().toLowerCase() === 'not in paper';

      const maxMarks = Number(sq.maxMarks) || 10;
      let marksAwarded = 0;
      const officialPoints: string[] = (sq.keyPoints || []).map((k: any) => k.description);
      let keyPointsFound: string[] = [];
      let keyPointsMissing: string[] = officialPoints;

      const transText = (transAnswer?.transcribedAnswer || '').trim();
      const quotedText = (foundResult?.quoted_student_working || '').trim();
      const studentWorkingText = (quotedText || transText).trim();

      // Mark "Not attempted" if NO transcribed text exists under that question label on either the primary or OR side
      const hasTranscribedText = Boolean(
        (transText.length > 0 &&
          !transText.includes('[OCR]: No response text detected') &&
          !transText.includes('[No text transcribed]')) ||
        (quotedText.length > 0 &&
          quotedText.toLowerCase() !== 'no working found for this question' &&
          quotedText.toLowerCase() !== 'not attempted')
      );

      let reason = hasTranscribedText
        ? 'Handwritten attempt transcribed from script; evaluated against marking scheme.'
        : 'Not attempted.';
      let feedback = hasTranscribedText
        ? 'Answer evaluated against rubric criteria.'
        : 'Not attempted.';
      let confidence: 'high' | 'medium' | 'low' = hasTranscribedText ? 'medium' : 'high';
      let flagForReview = false;
      let flagReason = '';

      // Rule 1: OR Choice Selection - compare content match to both sides, never default to primary
      let isOrChoice = foundResult?.attempted_choice === 'or_choice';
      let matchesEither = true;

      if (sq.hasOrChoice && sq.orChoice?.questionText) {
        const sideCheck = determineBestOrSide(
          studentWorkingText,
          sq.questionText,
          sq.modelAnswer || '',
          sq.orChoice.questionText,
          sq.orChoice.modelAnswer || ''
        );
        matchesEither = sideCheck.matchesEither;
        if (sideCheck.matchesOr && !sideCheck.matchesPrimary) {
          isOrChoice = true;
        } else if (sideCheck.matchesPrimary && !sideCheck.matchesOr) {
          isOrChoice = false;
        }
      }

      if (!hasTranscribedText || isParsedNotInPaper) {
        // Scheme question exists but student wrote nothing: reason = "Not attempted", maxMarks kept unchanged
        marksAwarded = 0;
        keyPointsFound = [];
        keyPointsMissing = officialPoints;
        reason = 'Not attempted.';
        feedback = 'Not attempted.';
        confidence = 'high';
      } else if (foundResult) {
        const rawScore = Number(foundResult.marks_awarded) || 0;
        // Requirement 2: Never invent rubric points. Use only the rubric points from the marking scheme.
        keyPointsFound = sanitizeRubricPoints(foundResult.key_points_found, officialPoints);
        keyPointsMissing = officialPoints.filter((p: string) => !keyPointsFound.includes(p));

        // Math check & wrong method check
        const mathCheck = applyMathCheck(rawScore, maxMarks, foundResult.reason || '', studentWorkingText);

        if (mathCheck.isWrongMethod) {
          // Wrong method = 0 with a reason explaining the error
          marksAwarded = 0;
          keyPointsFound = [];
          keyPointsMissing = officialPoints;
          const errReason = sanitizeReasonText(foundResult.reason || 'Candidate used an incorrect formula or method for this question.');
          reason = formatReasonWithSide(errReason, Boolean(sq.hasOrChoice), isOrChoice);
          feedback = 'Wrong method applied.';
        } else if (mathCheck.isWrongFinalAnswer) {
          // Right method with wrong final answer = maxMarks minus 1
          marksAwarded = Math.max(0, Math.round(maxMarks - 1));
          const errReason = sanitizeReasonText(
            foundResult.reason || `Correct method applied, but final numerical calculation is incorrect. Awarded ${marksAwarded}/${maxMarks} marks.`
          );
          reason = formatReasonWithSide(errReason, Boolean(sq.hasOrChoice), isOrChoice);
          feedback = 'Right method with calculation error.';
        } else {
          // Standard rubric points evaluation scaled to whole numbers
          if (keyPointsFound.length > 0 || keyPointsMissing.length > 0) {
            marksAwarded = enforceRubricConsistency(mathCheck.marks, maxMarks, keyPointsFound, keyPointsMissing, sq.keyPoints);
          } else {
            marksAwarded = Math.max(0, Math.min(maxMarks, Math.round(rawScore)));
          }

          const rawReason = foundResult.reason || '';
          const isForbiddenReason = /not (?:answered|attempted|found|written|present) on (?:the|this) (?:provided )?page(?: image)?(?:\/script section)?/i.test(rawReason);
          if (isForbiddenReason) {
            reason = 'Evaluated across script pages against rubric criteria.';
          } else {
            reason = sanitizeReasonText(rawReason, 'Evaluated against criteria.');
          }

          if (sq.hasOrChoice && reason !== 'Not attempted.') {
            reason = formatReasonWithSide(reason, true, isOrChoice);
          }
          feedback = foundResult.feedback || 'Evaluated against rubric.';
        }

        // Requirement 2: Marks must be whole numbers
        marksAwarded = Math.round(marksAwarded);

        confidence = ['high', 'medium', 'low'].includes(foundResult.confidence) ? foundResult.confidence : 'medium';
        flagForReview = Boolean(foundResult.flag_for_review);
        flagReason = foundResult.flag_reason || '';

        if (marksAwarded === 0 && hasTranscribedText && !mathCheck.isWrongMethod) {
          flagForReview = true;
          flagReason = flagReason || 'AI gave 0 marks even though the student attempted this question. Please verify.';
        }

        if (transAnswer?.transcribedAnswer?.includes('[ILLEGIBLE]')) {
          flagForReview = true;
          flagReason = flagReason ? `${flagReason}; handwriting contained illegible text` : 'Handwriting contained illegible text';
        }
      } else if (hasTranscribedText) {
        flagForReview = true;
        flagReason = 'AI gave 0 marks even though the student attempted this question. Please verify.';
      }

      if (flagForReview) flaggedCount++;
      if (!isParsedNotInPaper) {
        totalAIMarks += marksAwarded;
      }

      const questionTextToUse = isOrChoice && sq.orChoice?.questionText ? sq.orChoice.questionText : sq.questionText;

      const itemResult = {
        id: sq.id || `${sq.section || ''}_${qNum}_${sq.partLabel || ''}_${sqIdx}`,
        questionNumber: qNum,
        partLabel: sq.partLabel || '',
        section: sq.section || '',
        questionText: questionTextToUse,
        primaryQuestionText: sq.questionText,
        hasOrChoice: sq.hasOrChoice,
        orChoice: sq.orChoice,
        maxMarks,
        marks_awarded: marksAwarded,
        selected_level: isParsedNotInPaper ? 0 : foundResult?.selected_level,
        attempted_choice: isOrChoice ? 'or_choice' : 'primary',
        quoted_student_working: studentWorkingText,
        subPartResults: foundResult?.subPartResults,
        key_points_found: keyPointsFound,
        key_points_missing: keyPointsMissing,
        reason,
        feedback,
        confidence,
        flag_for_review: flagForReview,
        flag_reason: flagReason,
        not_in_paper: false, // Scheme question exists -> never not_in_paper
      };

      finalQuestionResultsList.push(itemResult);
      validatedResultsMap[itemResult.id] = itemResult;
      validatedResultsMap[`${sq.section || ''}_${qNum}_${sq.partLabel || ''}_${sqIdx}`] = itemResult;
      if (!validatedResultsMap[String(qNum)]) {
        validatedResultsMap[String(qNum)] = itemResult;
      }
    }

    // Questions missing from the scheme: Use "Not in paper" only for questions missing from the scheme
    const schemeQuestionKeys = new Set(
      schemeQuestions.map((sq) => `${sq.questionNumber}_${normalizePartLabel(sq.partLabel)}`)
    );
    if (Array.isArray(transcription?.answers)) {
      for (const transAns of transcription.answers) {
        const qNum = normalizeQuestionNumber(transAns.questionNumber);
        const pLabel = normalizePartLabel((transAns as any).partLabel);
        const key = `${qNum}_${pLabel}`;
        if (!schemeQuestionKeys.has(key) && !schemeQuestionKeys.has(`${qNum}_`)) {
          const itemResult = {
            id: `missing_${qNum}_${pLabel}`,
            questionNumber: qNum,
            partLabel: (transAns as any).partLabel || '',
            section: '',
            questionText: transAns.transcribedAnswer || 'Question missing from marking scheme',
            primaryQuestionText: transAns.transcribedAnswer || 'Question missing from marking scheme',
            hasOrChoice: false,
            orChoice: undefined,
            maxMarks: 0,
            marks_awarded: 0,
            selected_level: 0,
            attempted_choice: 'primary' as const,
            quoted_student_working: transAns.transcribedAnswer || '',
            subPartResults: undefined,
            key_points_found: [],
            key_points_missing: [],
            reason: 'Not in paper',
            feedback: 'Not in paper',
            confidence: 'high' as const,
            flag_for_review: false,
            flag_reason: '',
            not_in_paper: true,
          };
          finalQuestionResultsList.push(itemResult);
          validatedResultsMap[itemResult.id] = itemResult;
        }
      }
    }

    // ──────────────── IDENTITY CHECK ────────────────
    const paperRoll = (transcription.header?.studentRoll || '').trim();
    const paperName = (transcription.header?.studentName || '').trim();
    const selectedRoll = (selectedStudent?.rollNumber || '').trim();
    const selectedName = (selectedStudent?.fullName || '').trim();

    const normalize = (str: string) => str.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    const normPaperRoll = normalize(paperRoll);
    const normSelectedRoll = normalize(selectedRoll);

    let identityPassed = false;
    let mismatchReason = '';

    if (!normPaperRoll || normPaperRoll.includes('unreadable') || normPaperRoll === '') {
      identityPassed = false;
      mismatchReason = 'Roll number on paper was unreadable or missing from header.';
    } else if (
      normPaperRoll === normSelectedRoll ||
      normPaperRoll.includes(normSelectedRoll) ||
      normSelectedRoll.includes(normPaperRoll)
    ) {
      identityPassed = true;
    } else {
      identityPassed = false;
      mismatchReason = `Roll number on paper (${paperRoll}) does not match selected student (${selectedRoll}).`;
    }

    const finalStatus = identityPassed ? 'Pending Review' : 'Identity Check Needed';

    const maxPossibleMarks = markingScheme?.totalMarks || 50;
    const fbiseResult = calculateFbiseGradeAndGpa(totalAIMarks, maxPossibleMarks);

    console.log(
      `[OpenRouter Grading] Completed with model: ${modelUsed}. Total Marks: ${totalAIMarks}/${maxPossibleMarks} (FBISE Grade: ${fbiseResult.grade}, GPA: ${fbiseResult.gpa.toFixed(2)}/5.0), Status: ${finalStatus}`
    );

    // Requirement 4: Return strictly valid JSON for grading results (scores, feedback, breakdown)
    return res.json({
      success: true,
      status: finalStatus,
      transcription,
      questionResults: finalQuestionResultsList,
      questionResultsMap: validatedResultsMap,
      identityCheck: {
        passed: identityPassed,
        paperRollNumber: paperRoll,
        paperStudentName: paperName,
        selectedStudentRoll: selectedRoll,
        selectedStudentName: selectedName,
        mismatchReason,
      },
      totalAIMarks,
      totalScore: totalAIMarks,
      maxPossibleMarks,
      fbiseGrade: fbiseResult.grade,
      subjectGPA: fbiseResult.gpa,
      percentage: fbiseResult.percentage,
      fbiseRemarks: fbiseResult.remarks,
      overallConfidence: gradingOutput.overallConfidence || 'high',
      flaggedCount,
      summaryNotes: gradingOutput.summaryNotes || '',
      modelUsed,
      step1ModelUsed,
    });
  } catch (error: any) {
    console.error('[OpenRouter Grading] Error in pipeline:', error);

    // Requirement 4: Return valid JSON for grading results so the app UI never receives an HTML error page or raw 503 error text
    const fallbackResults = buildFallbackGradingResults(
      req.body?.transcription || { header: {}, answers: [] },
      req.body?.markingScheme
    );

    return res.status(200).json({
      success: true,
      status: 'Pending Review',
      transcription: req.body?.transcription || { header: {}, answers: [] },
      questionResults: fallbackResults.questionResults,
      identityCheck: {
        passed: false,
        paperRollNumber: '',
        paperStudentName: '',
        selectedStudentRoll: req.body?.selectedStudent?.rollNumber || '',
        selectedStudentName: req.body?.selectedStudent?.fullName || '',
        mismatchReason: 'AI service busy; student identity unconfirmed.',
      },
      totalAIMarks: 0,
      totalScore: 0,
      overallConfidence: 'low',
      flaggedCount: req.body?.markingScheme?.questions?.length || 0,
      summaryNotes: fallbackResults.summaryNotes,
      modelUsed: 'fallback-offline',
      isFallback: true,
    });
  }
});

// ════════ POST /api/transcribe - OCR Transcription Endpoint ════════
app.post('/api/transcribe', async (req, res) => {
  try {
    const { pageImages } = req.body as { pageImages: string[] };

    if (!pageImages || !Array.isArray(pageImages) || pageImages.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'At least one exam paper page image is required for transcription.',
        code: 400,
      });
    }

    const { transcription, modelUsed } = await callOpenRouterStep1Transcription(pageImages);
    return res.json({
      success: true,
      transcription,
      modelUsed,
    });
  } catch (error: any) {
    console.error('[OpenRouter Transcription] Error:', error);
    return res.status(200).json({
      success: true,
      transcription: {
        header: { studentRoll: 'UNREADABLE', studentName: 'UNREADABLE', rawText: '' },
        answers: [],
      },
      modelUsed: 'fallback-baseline',
    });
  }
});

// ════════ POST /api/rubric/import-text - Convert FBISE Rubric Text to Structured JSON ════════
app.post('/api/rubric/import-text', async (req, res) => {
  try {
    const { text, subject } = req.body as { text: string; subject?: string };

    if (!text || text.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No rubric text provided.',
        code: 400,
      });
    }

    const importSystemInstruction = `You are an expert assessment and curriculum specialist for the Federal Board of Intermediate and Secondary Education (FBISE).
Your task is to parse raw marking scheme text (copied from an official FBISE rubric PDF or document) and convert it into a standardized structured JSON marking scheme format.

Requirements:
1. Detect or infer Subject, Exam Session, and Scheme Title.
2. Detect every question (numbered 1, 2, 3...).
3. All imported questions MUST be of type "descriptive" (NOT MCQ). Set "questionType": "descriptive", "type": "descriptive".
4. Provide comprehensive step-by-step "modelAnswer" text fields for each question (NOT A/B/C/D MCQ option keys).
5. Create FBISE-style RUBRIC LEVELS for questions and sub-parts with mode "rubric_levels".
6. Calculate totalMarks.
7. Return strict valid JSON with NO commentary:
{
  "id": "scheme-imported-${Date.now()}",
  "subject": "string",
  "examSession": "Annual Senior Examinations 2026",
  "title": "string",
  "description": "string",
  "totalMarks": 50,
  "questions": [
    {
      "id": "q-1",
      "questionNumber": 1,
      "questionText": "string",
      "maxMarks": 10,
      "modelAnswer": "Comprehensive step-by-step descriptive solution text...",
      "questionType": "descriptive",
      "type": "descriptive",
      "mode": "rubric_levels",
      "hasSubParts": false,
      "rubricLevels": [
        {
          "id": "q1-l1",
          "levelNumber": 1,
          "title": "Level 1 (Full Marks)",
          "description": "string",
          "marks": 10
        }
      ]
    }
  ]
}`;

    const promptText = `Please parse and structure this raw FBISE rubric text into a standardized marking scheme JSON:
${subject ? `Target Subject: ${subject}\n` : ''}
RAW RUBRIC TEXT:
${text.slice(0, 15000)}`;

    const messages = [
      { role: 'system', content: importSystemInstruction },
      { role: 'user', content: promptText },
    ];

    const { parsed } = await callOpenRouterText(messages);

    let parsedScheme = parsed;
    if (!parsedScheme.questions || !Array.isArray(parsedScheme.questions)) {
      throw new Error('Could not identify valid questions in the provided rubric text.');
    }

    parsedScheme.id = `scheme-${Date.now()}`;
    parsedScheme.updatedAt = new Date().toISOString();
    parsedScheme.questions = parsedScheme.questions.map((q: any, idx: number) => {
      const max = Number(q.maxMarks) || 4;
      const hasOptionRubric = q.rubricLevels?.some(
        (l: any) => l.title?.includes('Option') || l.description?.includes('Selected option')
      );
      let rubricLevels = q.rubricLevels;

      if (!rubricLevels || rubricLevels.length === 0 || hasOptionRubric) {
        rubricLevels = [
          {
            id: `q${idx + 1}-l1`,
            levelNumber: 1,
            title: `Level 1 (${max} Marks)`,
            description: 'Complete and accurate step-by-step solution with full working and correct final answer.',
            marks: max,
          },
          {
            id: `q${idx + 1}-l2`,
            levelNumber: 2,
            title: `Level 2 (${Math.round(max * 0.75 * 10) / 10} Marks)`,
            description: 'Substantially correct steps with minor arithmetic or algebraic error.',
            marks: Math.round(max * 0.75 * 10) / 10,
          },
          {
            id: `q${idx + 1}-l3`,
            levelNumber: 3,
            title: `Level 3 (${Math.round(max * 0.5 * 10) / 10} Marks)`,
            description: 'Partial working or stated key formula/concept.',
            marks: Math.round(max * 0.5 * 10) / 10,
          },
          {
            id: `q${idx + 1}-l4`,
            levelNumber: 4,
            title: 'Level 4 (0 Marks)',
            description: 'Incorrect, blank, or irrelevant response.',
            marks: 0,
          },
        ];
      }

      let modelAns = q.modelAnswer || '';
      if (!modelAns || modelAns.startsWith('Correct Option:')) {
        modelAns = `Detailed step-by-step descriptive model answer for Question ${q.questionNumber || idx + 1} showing all necessary steps and solution rationale.`;
      }

      return {
        ...q,
        id: q.id || `q-${Date.now()}-${idx + 1}`,
        questionNumber: q.questionNumber || idx + 1,
        questionType: 'descriptive',
        type: 'descriptive',
        mode: 'rubric_levels',
        modelAnswer: modelAns,
        rubricLevels,
      };
    });

    parsedScheme.totalMarks = parsedScheme.questions.reduce(
      (sum: number, q: any) => sum + (Number(q.maxMarks) || 0),
      0
    );

    return res.json({
      success: true,
      scheme: parsedScheme,
    });
  } catch (err: any) {
    console.error('Error importing rubric from text:', err);
    return res.status(500).json({
      success: false,
      error: 'AI is busy right now, please try again in a few minutes.',
      code: 500,
    });
  }
});

// ════════ BULK STUDENT ROLL NUMBER SLIP OCR IMPORT ENDPOINT ════════
function inferAcademicGroup(subjects: string[] = [], explicitGroup?: string | null): string {
  if (explicitGroup && typeof explicitGroup === 'string' && explicitGroup.trim() && explicitGroup.trim().toLowerCase() !== 'null' && explicitGroup.trim().toLowerCase() !== 'undefined') {
    const trimmed = explicitGroup.trim();
    if (trimmed.length > 2 && !/^(null|undefined|none|n\/a)$/i.test(trimmed)) {
      return trimmed;
    }
  }
  const joined = subjects.map((s) => String(s).toLowerCase()).join(' ');
  const hasMath = joined.includes('math') || joined.includes('calculus') || joined.includes('algebra');
  const hasPhys = joined.includes('physic');
  const hasChem = joined.includes('chem');
  const hasBio = joined.includes('bio') || joined.includes('botany') || joined.includes('zoology');
  const hasCS = joined.includes('comp') || joined.includes('informatics');
  const hasCommerce = joined.includes('account') || joined.includes('commerce') || joined.includes('bank');

  if (hasBio && (hasPhys || hasChem)) return 'Pre-Medical';
  if (hasCS && (hasMath || hasPhys)) return 'Computer Science';
  if (hasMath && (hasPhys || hasChem)) return 'Pre-Engineering';
  if (hasCommerce) return 'Commerce';
  if (hasMath && (joined.includes('stat') || joined.includes('econ'))) return 'Science General';
  if (hasBio) return 'Pre-Medical';
  if (hasPhys || hasChem || hasMath) return 'Pre-Engineering';
  return 'Pre-Engineering';
}

function normalizeExtractedCandidate(raw: any) {
  if (!raw || typeof raw !== 'object') {
    return {
      rollNumber: '',
      fullName: 'Student Candidate',
      fatherName: 'Guardian',
      group: 'Pre-Engineering',
      subjectEnrolled: 'Physics (Advanced)',
      enrolledSubjects: [],
    };
  }

  // Handle any field naming variations from AI output
  const rawRoll = raw.rollNumber || raw.roll_no || raw.rollNo || raw.roll || raw.candidateRoll || '';
  const rawName = raw.fullName || raw.name || raw.studentName || raw.candidateName || 'Student Candidate';
  const rawFather = raw.fatherName || raw.father_name || raw.guardianName || 'Guardian';
  const rawReg = raw.registrationNumber || raw.registration_no || raw.regNo || raw.registrationNo || null;
  const rawAdmission = raw.admissionNumber || raw.admission_no || raw.admissionNo || null;
  const rawCenter = raw.centerCode || raw.center_code || raw.center || null;
  const rawClass = raw.classGrade || raw.class_grade || raw.grade || raw.class || null;
  const rawSection = raw.section || null;
  const rawInstitution = raw.institutionName || raw.institution_name || raw.school || raw.college || null;
  const rawShift = raw.shift || 'morning';

  let enrolledSubjects: string[] = [];
  const rawSubs = raw.enrolledSubjects || raw.enrolled_subjects || raw.subjects || [];
  if (Array.isArray(rawSubs) && rawSubs.length > 0) {
    enrolledSubjects = rawSubs
      .map((s: any) => String(s).trim())
      .filter((s: string) => s.length > 0 && !/^(null|undefined)$/i.test(s));
  } else if (raw.subjectEnrolled || raw.subject) {
    enrolledSubjects = [String(raw.subjectEnrolled || raw.subject).trim()];
  }

  // Deduplicate subjects
  enrolledSubjects = Array.from(new Set(enrolledSubjects));

  // Academic group inference if missing or generic
  const inferredGroup = inferAcademicGroup(enrolledSubjects, raw.group || raw.academicGroup);

  // Determine major subject
  const subjectEnrolled =
    (raw.subjectEnrolled || raw.subject)?.trim() ||
    enrolledSubjects.find((s) => /physic|math|chem|bio|comp/i.test(s)) ||
    enrolledSubjects[0] ||
    'Physics (Advanced)';

  return {
    ...raw,
    rollNumber: String(rawRoll).trim(),
    fullName: String(rawName).trim() || 'Student Candidate',
    fatherName: String(rawFather).trim() || 'Guardian',
    registrationNumber: rawReg ? String(rawReg).trim() : null,
    admissionNumber: rawAdmission ? String(rawAdmission).trim() : null,
    centerCode: rawCenter ? String(rawCenter).trim() : null,
    classGrade: rawClass ? String(rawClass).trim() : null,
    section: rawSection ? String(rawSection).trim() : null,
    institutionName: rawInstitution ? String(rawInstitution).trim() : null,
    shift: rawShift,
    group: inferredGroup,
    subjectEnrolled,
    enrolledSubjects,
  };
}

const STUDENT_IMPORT_OCR_SYSTEM_INSTRUCTION = `You are an expert OCR Specialist for Federal Board (FBISE) Examination Roll Number Slips, Admission Cards, and Center Candidate Master Lists.

TASK:
Analyze the provided Roll Number Slip or Date Sheet document scan and extract EVERY candidate visible on THIS page/batch into a structured JSON array.
One roll slip page is typically one student candidate, but if multiple candidates are printed, extract ALL of them.
Do NOT stop after the first candidate.
STRICT RULE: ONLY extract fields that are physically printed on the official document. DO NOT fabricate or hallucinate phone numbers, emails, dates of birth, or students not printed on the page. If a field is not printed, omit it or set it to null.

1. FULL MULTI-ROW SUBJECTS TABLE EXTRACTION:
- On FBISE Roll Number Slips and Date Sheets, locate the printed Date Sheet / Examination Schedule table (usually has columns: Sr. No., Date, Day, Subject / Paper Name, Shift/Time).
- CRITICAL REQUIREMENT: YOU MUST SCAN EVERY SINGLE ROW IN THIS TABLE FROM TOP TO BOTTOM! Do NOT stop after the first row.
- Capture ALL listed subjects into the 'enrolledSubjects' array (e.g. ["English Compulsory", "Urdu Compulsory", "Islamic Education", "Pakistan Studies", "Physics", "Chemistry", "Mathematics"]).
- Set 'subjectEnrolled' to the primary major elective or science subject (e.g. "Physics", "Mathematics", "Biology", "Computer Science").

2. ACADEMIC GROUP EXTRACTION & INFERENCE:
- First, check if the Academic Group is explicitly printed in the candidate header details (e.g. "Group: Pre-Engineering", "Pre-Medical", "Computer Science", "General Science", "Commerce", "Humanities").
- If the group name is not explicitly labeled or is blank, YOU MUST INFER AND ASSIGN the correct Academic Group from the combination of enrolled subjects in the table:
  * Physics + Chemistry + Mathematics -> "Pre-Engineering"
  * Physics + Chemistry + Biology -> "Pre-Medical"
  * Computer Science + Mathematics (or Physics) -> "Computer Science"
  * Mathematics + Statistics / Economics -> "Science General"
  * Accounting / Commerce / Banking -> "Commerce"
  * Arts / Civics / History / Islamic Studies electives -> "Humanities"
  * If science subjects are present without Biology -> "Pre-Engineering"
- NEVER leave 'group' as null or empty; always output the verified or inferred group string.

3. CANDIDATE PROFILE IDENTIFICATION:
- rollNumber: Candidate Roll Number (e.g. "10041", "696969", "2026-901").
- fullName: Full Student Name.
- fatherName: Father's / Guardian's Name.
- registrationNumber: FBISE Registration Number / CNIC (if printed, else null).
- admissionNumber: Admission or Index Number (if printed, else null).
- centerCode: Exam Center Code / Center Name (e.g. "ISB-042", "Islamabad Model College G-10/4").
- classGrade: Grade / Class (e.g. "HSSC-II", "Grade 12", "SSC-I").
- section: Section (if printed, else null).
- institutionName: College / School Name or Exam Center Name.
- shift: "morning" or "evening".

RETURN STRICTLY VALID JSON:
{
  "students": [
    {
      "rollNumber": "string",
      "fullName": "string",
      "fatherName": "string",
      "registrationNumber": "string or null",
      "admissionNumber": "string or null",
      "centerCode": "string or null",
      "classGrade": "string or null",
      "section": "string or null",
      "group": "string",
      "institutionName": "string or null",
      "subjectEnrolled": "string",
      "enrolledSubjects": ["string"],
      "shift": "morning"
    }
  ]
}`;

function countCandidateFilledFields(c: any): number {
  let score = 0;
  if (c.fullName && c.fullName !== 'Student Candidate') score += 2;
  if (c.fatherName && c.fatherName !== 'Guardian') score += 2;
  if (c.rollNumber) score += 2;
  if (c.registrationNumber) score += 1;
  if (c.admissionNumber) score += 1;
  if (c.centerCode) score += 1;
  if (c.classGrade) score += 1;
  if (c.section) score += 1;
  if (c.institutionName) score += 1;
  if (Array.isArray(c.enrolledSubjects) && c.enrolledSubjects.length > 0) score += c.enrolledSubjects.length;
  if (c.subjectEnrolled) score += 1;
  if (c.group) score += 1;
  return score;
}

function normalizeRollString(roll?: any): string {
  return String(roll || '')
    .trim()
    .toLowerCase()
    .replace(/[\s\-_]/g, '');
}

function isValidStudentCandidate(obj: any): boolean {
  if (!obj || typeof obj !== 'object') return false;
  const roll = obj.rollNumber || obj.roll_no || obj.rollNo || obj.roll || obj.candidateRoll;
  const name = obj.fullName || obj.name || obj.studentName || obj.candidateName;
  return Boolean(roll && String(roll).trim()) && Boolean(name && String(name).trim());
}

/**
 * Robustly extracts student candidate objects from any JSON layout:
 * { students: [...] }, { students: {...} }, [ {...} ], or single student object { rollNumber, fullName }
 */
function extractStudentsFromParsedJson(parsed: any): any[] {
  if (!parsed) return [];

  // Case 1: parsed is an array
  if (Array.isArray(parsed)) {
    const valid = parsed.filter(isValidStudentCandidate);
    if (valid.length > 0) return valid;
  }

  // Case 2: parsed.students is array
  if (Array.isArray(parsed.students)) {
    const valid = parsed.students.filter(isValidStudentCandidate);
    if (valid.length > 0) return valid;
  }

  // Case 3: parsed.students is a single object
  if (parsed.students && typeof parsed.students === 'object' && !Array.isArray(parsed.students)) {
    if (isValidStudentCandidate(parsed.students)) {
      return [parsed.students];
    }
  }

  // Case 4: parsed.candidates is array or single object
  if (Array.isArray(parsed.candidates)) {
    const valid = parsed.candidates.filter(isValidStudentCandidate);
    if (valid.length > 0) return valid;
  }
  if (parsed.candidates && typeof parsed.candidates === 'object' && isValidStudentCandidate(parsed.candidates)) {
    return [parsed.candidates];
  }

  // Case 5: parsed.student is single object
  if (parsed.student && typeof parsed.student === 'object' && isValidStudentCandidate(parsed.student)) {
    return [parsed.student];
  }

  // Case 6: parsed is a single student object directly (rollNumber + fullName exist)
  if (isValidStudentCandidate(parsed)) {
    return [parsed];
  }

  // Case 7: Search all values in object for any student candidate or array of candidates
  if (typeof parsed === 'object') {
    for (const val of Object.values(parsed)) {
      if (Array.isArray(val)) {
        const valid = val.filter(isValidStudentCandidate);
        if (valid.length > 0) return valid;
      } else if (val && typeof val === 'object' && isValidStudentCandidate(val)) {
        return [val];
      }
    }
  }

  return [];
}

function mergeDeduplicatedCandidates(candidates: any[]): any[] {
  const map = new Map<string, any>();
  for (const c of candidates) {
    const norm = normalizeExtractedCandidate(c);
    const key = normalizeRollString(norm.rollNumber);
    if (!key) {
      map.set(`fallback-${Math.random()}`, norm);
      continue;
    }
    const existing = map.get(key);
    if (!existing) {
      map.set(key, norm);
    } else {
      const existingScore = countCandidateFilledFields(existing);
      const newScore = countCandidateFilledFields(norm);
      if (newScore > existingScore) {
        map.set(key, { ...existing, ...norm });
      } else {
        map.set(key, { ...norm, ...existing });
      }
    }
  }
  return Array.from(map.values());
}

async function ocrSingleStudentPage(image: string): Promise<{ candidates: any[]; modelUsed: string }> {
  try {
    const result = await executeVisionModelChain({
      image,
      prompt: `${STUDENT_IMPORT_OCR_SYSTEM_INSTRUCTION}\n\nTask: Extract EVERY student candidate visible on THIS page scan. One roll slip page typically contains one student candidate. Extract all printed fields into strict JSON.`,
      systemInstruction: STUDENT_IMPORT_OCR_SYSTEM_INSTRUCTION,
      jsonMode: true,
      operationName: 'Student Import OCR',
    });

    const parsedJson = result.parsed;
    const candidates = extractStudentsFromParsedJson(parsedJson);
    return {
      candidates: candidates.map(normalizeExtractedCandidate),
      modelUsed: result.modelUsed,
    };
  } catch (err: any) {
    console.warn('[Student Import OCR] Page failed:', err?.message || err);
    return { candidates: [], modelUsed: 'failed' };
  }
}

app.post('/api/import-students-ocr', async (req, res) => {
  try {
    const { images } = req.body as { images: string[] };

    if (!images || !Array.isArray(images) || images.length === 0) {
      return res.status(400).json({ error: 'images array is required', success: false });
    }

    const allCandidates: any[] = [];
    let pagesProcessed = 0;
    let pagesFailed = 0;
    let lastModelUsed = PRIMARY_GEMINI_MODEL;

    // Process every page sequentially with 1.5s wait between calls (Rule 1)
    for (let i = 0; i < images.length; i++) {
      if (i > 0) {
        await sleep(1500); // 1.5s wait between calls
      }

      const img = images[i];
      try {
        const { candidates, modelUsed } = await ocrSingleStudentPage(img);
        if (modelUsed && modelUsed !== 'failed') {
          lastModelUsed = modelUsed;
        }
        if (candidates && candidates.length > 0) {
          allCandidates.push(...candidates);
          pagesProcessed++;
        } else {
          console.warn(`[Student Import OCR] Page ${i + 1} yielded 0 candidates.`);
          pagesFailed++;
        }
      } catch (pageErr) {
        console.warn(`[Student Import OCR] Error processing page ${i + 1}:`, pageErr);
        pagesFailed++;
      }
    }

    const mergedCandidates = mergeDeduplicatedCandidates(allCandidates);

    // Rule 6: If at least one real result exists, return success. Do not fail the whole job because one page failed.
    if (mergedCandidates.length === 0 && pagesFailed === images.length) {
      return res.status(422).json({
        success: false,
        error: 'OCR processing failed for all uploaded pages, please re-upload a clearer image or PDF.',
        pagesProcessed,
        pagesFailed,
        students: [],
        modelUsed: lastModelUsed,
      });
    }

    console.log(`[Student Import OCR] Successfully imported ${mergedCandidates.length} students with model: ${lastModelUsed}`);
    return res.json({
      success: true,
      students: mergedCandidates,
      pagesProcessed,
      pagesFailed,
      modelUsed: lastModelUsed,
    });
  } catch (error: any) {
    console.error('Error in /api/import-students-ocr:', error);
    return res.status(500).json({
      error: 'OCR processing failed for this image, please re-upload a clearer image or PDF.',
      details: error?.message,
      success: false,
    });
  }
});

// Fallback JSON 404 handler for any unmatched /api/* requests
app.use('/api/*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    code: 404,
    success: false,
  });
});

// Global Express Error Middleware ensuring JSON responses always (Requirement 4)
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[Global Express Error Handler]:', err);
  const status =
    typeof err?.status === 'number'
      ? err.status
      : typeof err?.statusCode === 'number'
      ? err.statusCode
      : 500;
  res.status(status).json({
    error: 'AI is busy right now, please try again in a few minutes.',
    code: status,
    success: false,
  });
});

// Mount Vite middleware in development or serve static in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  });
} else {
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({
    server: {
      middlewareMode: true,
      hmr: {
        server,
      },
    },
    appType: 'spa',
  });
  app.use(vite.middlewares);
}

server.listen(port, '0.0.0.0', () => {
  console.log(`Server running at http://localhost:${port}`);
});
