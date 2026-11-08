import * as pdfjsLib from 'pdfjs-dist';

// Configure pdfjs worker to reliable CDN worker matching version
try {
  if (typeof window !== 'undefined') {
    // Set worker source URL
    const pdfVersion = pdfjsLib.version || '4.10.38';
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfVersion}/pdf.worker.min.mjs`;
  }
} catch (e) {
  console.warn('PDF.js worker initialization warning:', e);
}

export interface ExtractedPdfPage {
  pageNumber: number;
  dataUrl: string;
  isCoverPage: boolean;
  width: number;
  height: number;
}

export interface ParsedPdfResult {
  fileName: string;
  totalPages: number;
  coverPageDataUrl: string;
  pageImages: string[];
  pages: ExtractedPdfPage[];
  extractedTextSnippet?: string;
}

/**
 * Converts a multi-page PDF File or ArrayBuffer into sequential base64 image data URLs.
 * Page 1 is designated as the Cover Sheet (Candidate info, roll number, center code).
 * Pages 2+ are designated as Question Answer script pages.
 */
export async function convertPdfToPageImages(
  file: File | ArrayBuffer,
  fileName: string = 'document.pdf',
  scale: number = 1.2
): Promise<ParsedPdfResult> {
  let arrayBuffer: ArrayBuffer;
  if (file instanceof File) {
    arrayBuffer = await file.arrayBuffer();
  } else {
    arrayBuffer = file;
  }

  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(arrayBuffer),
    useSystemFonts: true,
  });

  const pdfDoc = await loadingTask.promise;
  const totalPages = pdfDoc.numPages;
  const pages: ExtractedPdfPage[] = [];
  const pageImages: string[] = [];
  let combinedTextSnippet = '';

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) {
      throw new Error(`Failed to initialize 2D canvas context for PDF Page ${pageNum}`);
    }

    // Fill white background before rendering
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const renderContext = {
      canvasContext: ctx,
      viewport: viewport,
      canvas: canvas as any,
    };

    await (page.render(renderContext as any) as any).promise;

    const dataUrl = canvas.toDataURL('image/jpeg', 0.72);
    pageImages.push(dataUrl);

    // Extract any embedded text snippets for fast roll number pre-check
    try {
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => item.str || '')
        .join(' ');
      if (pageNum === 1) {
        combinedTextSnippet = pageText;
      }
    } catch (_) {}

    pages.push({
      pageNumber: pageNum,
      dataUrl,
      isCoverPage: pageNum === 1,
      width: viewport.width,
      height: viewport.height,
    });
  }

  return {
    fileName,
    totalPages,
    coverPageDataUrl: pageImages[0] || '',
    pageImages,
    pages,
    extractedTextSnippet: combinedTextSnippet,
  };
}

/**
 * Compresses any image (PNG, JPEG, WebP) data URL to a JPEG at max width 1400px and 0.72 quality.
 * Paints on a white background canvas so transparency in PNGs does not turn black.
 */
export async function compressImageToJpeg(
  dataUrl: string,
  maxWidth: number = 1400,
  quality: number = 0.72
): Promise<string> {
  if (typeof window === 'undefined' || !dataUrl || !dataUrl.startsWith('data:image/')) {
    return dataUrl;
  }
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let width = img.width;
      let height = img.height;
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      const compressed = canvas.toDataURL('image/jpeg', quality);
      resolve(compressed);
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

/**
 * Heuristic fallback parser to extract Roll No, Student Name, Center Code from text snippets or OCR strings.
 */
export function extractCoverMetaFromText(rawText: string): {
  rollNumber?: string;
  candidateName?: string;
  centerCode?: string;
  subject?: string;
  setVersion?: string;
} {
  const result: {
    rollNumber?: string;
    candidateName?: string;
    centerCode?: string;
    subject?: string;
    setVersion?: string;
  } = {};

  if (!rawText) return result;

  // 1. Roll Number regex heuristics (e.g., Roll No: 696969, SEC-2026-101, 10042)
  const rollMatch =
    rawText.match(/roll\s*(?:no|number|#)?[:\-.\s]*([A-Z0-9\-]{3,15})/i) ||
    rawText.match(/\b(696969|\d{5,8}|SEC-\d{4}-\d{3,5})\b/i);
  if (rollMatch) {
    result.rollNumber = rollMatch[1].trim();
  }

  // 2. Candidate Name regex
  const nameMatch = rawText.match(
    /(?:candidate|student|name)\s*(?:name)?[:\-.\s]*([A-Za-z\s]{3,30})(?:\n|roll|center|subject|$)/i
  );
  if (nameMatch) {
    result.candidateName = nameMatch[1].trim();
  }

  // 3. Center Code
  const centerMatch = rawText.match(/(?:center|centre)\s*(?:code)?[:\-.\s]*([A-Z0-9\-]{3,10})/i);
  if (centerMatch) {
    result.centerCode = centerMatch[1].trim();
  }

  // 4. Subject
  const subjectMatch = rawText.match(
    /(?:subject|course)[:\-.\s]*([A-Za-z\s()]{3,25})(?:\n|paper|set|$)/i
  );
  if (subjectMatch) {
    result.subject = subjectMatch[1].trim();
  }

  // 5. Set/Version
  const setMatch = rawText.match(/(?:set|version|paper code)[:\-.\s]*([A-D0-9\-]{1,8})/i);
  if (setMatch) {
    result.setVersion = setMatch[1].trim();
  }

  return result;
}
