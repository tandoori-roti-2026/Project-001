import { StudentRecord } from '../data/mockPapers';
import { compressImageToJpeg } from './pdfProcessor';

export interface StudentImportBatchJob {
  id: string;
  batchTitle: string;
  filesCount: number;
  status: 'queued' | 'extracting' | 'completed' | 'failed';
  extractedCount: number;
  newStudentsCount: number;
  updatedStudentsCount: number;
  startTime: string;
  progressText?: string;
  pagesProcessed?: number;
  pagesFailed?: number;
  error?: string;
}

export interface StudentImportCallbacks {
  onJobStatusChange: (job: StudentImportBatchJob) => void;
  onStudentsImported: (importedStudents: StudentRecord[], newCount: number, updatedCount: number) => void;
}

/**
 * Normalizes roll number string by trimming, lowercasing, and stripping whitespace and hyphens.
 * E.g. "3305-538", " 3305538 " -> "3305538"
 */
export function normalizeRoll(roll?: string | null): string {
  return String(roll || '')
    .trim()
    .toLowerCase()
    .replace(/[\s\-_]/g, '');
}

/**
 * Re-export compressImageToJpeg as shrinkImageForOcr for backwards compatibility.
 */
export const shrinkImageForOcr = compressImageToJpeg;

/**
 * Extracts non-empty fields from a partial student record for safe merging.
 */
export function extractNonEmptyStudentFields(s: Partial<StudentRecord>): Partial<StudentRecord> {
  const result: Partial<StudentRecord> = {};
  if (s.fullName && s.fullName.trim() && s.fullName !== 'Student Candidate') {
    result.fullName = s.fullName.trim();
  }
  if (s.fatherName && s.fatherName.trim() && s.fatherName !== 'Guardian') {
    result.fatherName = s.fatherName.trim();
  }
  if (s.rollNumber && s.rollNumber.trim()) {
    result.rollNumber = s.rollNumber.trim();
  }
  if (s.registrationNumber && s.registrationNumber.trim()) {
    result.registrationNumber = s.registrationNumber.trim();
  }
  if (s.admissionNumber && s.admissionNumber.trim()) {
    result.admissionNumber = s.admissionNumber.trim();
  }
  if (s.classGrade && s.classGrade.trim()) {
    result.classGrade = s.classGrade.trim();
  }
  if (s.section && s.section.trim()) {
    result.section = s.section.trim();
  }
  if (s.group && s.group.trim()) {
    result.group = s.group.trim();
  }
  if (s.institutionName && s.institutionName.trim()) {
    result.institutionName = s.institutionName.trim();
  }
  if (s.centerCode && s.centerCode.trim()) {
    result.centerCode = s.centerCode.trim();
  }
  if (s.guardianPhone && s.guardianPhone.trim()) {
    result.guardianPhone = s.guardianPhone.trim();
  }
  if (s.email && s.email.trim()) {
    result.email = s.email.trim();
  }
  if (s.dateOfBirth && s.dateOfBirth.trim()) {
    result.dateOfBirth = s.dateOfBirth.trim();
  }
  if (s.enrollmentStatus) {
    result.enrollmentStatus = s.enrollmentStatus;
  }
  if (s.subjectEnrolled && s.subjectEnrolled.trim()) {
    result.subjectEnrolled = s.subjectEnrolled.trim();
  }
  if (Array.isArray(s.enrolledSubjects) && s.enrolledSubjects.length > 0) {
    result.enrolledSubjects = s.enrolledSubjects;
  }
  return result;
}

export function inferAcademicGroup(subjects: string[] = [], explicitGroup?: string | null): string {
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

function countRawCandidateFields(c: any): number {
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

/**
 * Asynchronously processes Roll Number Slips / Date Sheets images/PDFs in sequential page batches,
 * provides live per-page progress updates, deduplicates by normalized roll number,
 * accurately marks new vs updated against the existing registry, and merges non-empty fields.
 */
export async function runAsyncStudentImportJob(
  job: StudentImportBatchJob,
  images: string[],
  existingStudents: StudentRecord[],
  callbacks: StudentImportCallbacks
) {
  let currentJob: StudentImportBatchJob = {
    ...job,
    status: 'extracting',
    filesCount: images.length,
    extractedCount: 0,
    newStudentsCount: 0,
    updatedStudentsCount: 0,
    pagesProcessed: 0,
    pagesFailed: 0,
    progressText: `Starting import for ${images.length} page(s)...`,
  };
  callbacks.onJobStatusChange(currentJob);

  const runningCandidateMap = new Map<string, any>();
  let pagesProcessed = 0;
  let pagesFailed = 0;

  try {
    // Process pages sequentially in batches of 1 for reliability and live user feedback
    for (let i = 0; i < images.length; i++) {
      currentJob = {
        ...currentJob,
        status: 'extracting',
        extractedCount: runningCandidateMap.size,
        filesCount: images.length,
        pagesProcessed,
        pagesFailed,
        progressText: `Processing page ${i + 1} of ${images.length} — ${runningCandidateMap.size} candidate(s) so far`,
      };
      callbacks.onJobStatusChange(currentJob);

      let pageSuccess = false;
      let shrunkImage = images[i];
      try {
        shrunkImage = await shrinkImageForOcr(images[i], 1200, 0.7);
      } catch (_) {
        shrunkImage = images[i];
      }

      // Try up to 2 network attempts per page
      for (let clientTry = 1; clientTry <= 2 && !pageSuccess; clientTry++) {
        try {
          if (clientTry > 1) {
            await new Promise((r) => setTimeout(r, 1500));
          }

          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 75000); // 75s client timeout

          let res: Response;
          try {
            res = await fetch('/api/import-students-ocr', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ images: [shrunkImage] }),
              signal: controller.signal,
            });
          } finally {
            clearTimeout(timeoutId);
          }

          const data = await res.json().catch(() => null);

          if (res.ok && data && data.success && Array.isArray(data.students) && data.students.length > 0) {
            data.students.forEach((rawCand: any) => {
              const rawRoll = (rawCand.rollNumber ? String(rawCand.rollNumber) : '').trim();
              const normRoll = normalizeRoll(rawRoll);

              if (!normRoll) {
                const fallbackKey = `slip-page-${i}-${Date.now()}-${Math.random()}`;
                runningCandidateMap.set(fallbackKey, rawCand);
                return;
              }

              const existing = runningCandidateMap.get(normRoll);
              if (!existing) {
                runningCandidateMap.set(normRoll, rawCand);
              } else {
                // Deduplicate across pages by normalized roll number, keeping the candidate with more filled fields
                const existingScore = countRawCandidateFields(existing);
                const newScore = countRawCandidateFields(rawCand);
                if (newScore > existingScore) {
                  runningCandidateMap.set(normRoll, { ...existing, ...rawCand });
                } else {
                  runningCandidateMap.set(normRoll, { ...rawCand, ...existing });
                }
              }
            });
            pageSuccess = true;
            pagesProcessed++;
          }
        } catch (pageErr) {
          console.warn(`[Student Import Pipeline] Page ${i + 1} attempt ${clientTry} failed:`, pageErr);
        }
      }

      if (!pageSuccess) {
        console.warn(`[Student Import Pipeline] Page ${i + 1} produced no candidates after all retries.`);
        pagesFailed++;
      }
    }

    if (runningCandidateMap.size === 0 && pagesFailed === images.length) {
      throw new Error('OCR processing failed for all uploaded pages. Please re-upload clearer images or PDFs.');
    }

    const finalRecords: StudentRecord[] = [];
    let newCount = 0;
    let updatedCount = 0;

    Array.from(runningCandidateMap.values()).forEach((raw: any, index: number) => {
      const rollNumber = (raw.rollNumber ? String(raw.rollNumber) : `SEC-2026-${Math.floor(1000 + Math.random() * 9000)}`).trim();
      const normRoll = normalizeRoll(rollNumber);

      const existingMatch = existingStudents.find(
        (s) => normalizeRoll(s.rollNumber) === normRoll
      );

      // Support enrolled subjects list from slip / date sheet
      let enrolledSubjects: string[] = [];
      if (Array.isArray(raw.enrolledSubjects) && raw.enrolledSubjects.length > 0) {
        enrolledSubjects = raw.enrolledSubjects
          .map((s: any) => String(s).trim())
          .filter((s: string) => s.length > 0 && !/^(null|undefined)$/i.test(s));
      } else if (raw.subjectEnrolled) {
        enrolledSubjects = [String(raw.subjectEnrolled).trim()];
      }

      // Deduplicate subject names
      enrolledSubjects = Array.from(new Set(enrolledSubjects));

      // Infer academic group if not explicitly provided
      const inferredGroup = inferAcademicGroup(enrolledSubjects, raw.group);

      // Determine major elective subject
      const subjectEnrolled =
        raw.subjectEnrolled?.trim() ||
        enrolledSubjects.find((s) => /physic|math|chem|bio|comp/i.test(s)) ||
        enrolledSubjects[0] ||
        existingMatch?.subjectEnrolled ||
        'Physics (Advanced)';

      const record: StudentRecord = {
        id: existingMatch ? existingMatch.id : `std-import-${Date.now()}-${index}`,
        fullName: raw.fullName?.trim() && raw.fullName !== 'Student Candidate' ? raw.fullName.trim() : (existingMatch?.fullName || 'Student Candidate'),
        fatherName: raw.fatherName?.trim() && raw.fatherName !== 'Guardian' ? raw.fatherName.trim() : (existingMatch?.fatherName || 'Guardian'),
        rollNumber: rollNumber,
        registrationNumber: raw.registrationNumber?.trim() || existingMatch?.registrationNumber || undefined,
        admissionNumber: raw.admissionNumber?.trim() || existingMatch?.admissionNumber || undefined,
        classGrade: raw.classGrade?.trim() || existingMatch?.classGrade || undefined,
        section: raw.section?.trim() || existingMatch?.section || undefined,
        group: inferredGroup || existingMatch?.group || 'Pre-Engineering',
        institutionName: raw.institutionName?.trim() || existingMatch?.institutionName || undefined,
        centerCode: raw.centerCode?.trim() || existingMatch?.centerCode || undefined,
        enrollmentStatus: 'Active',
        subjectEnrolled,
        enrolledSubjects: enrolledSubjects.length > 0 ? enrolledSubjects : existingMatch?.enrolledSubjects,
        dateOfBirth: raw.dateOfBirth?.trim() || existingMatch?.dateOfBirth || undefined,
        guardianPhone: raw.guardianPhone?.trim() || existingMatch?.guardianPhone || undefined,
        email: raw.email?.trim() || existingMatch?.email || undefined,
      };

      if (existingMatch) {
        updatedCount++;
      } else {
        newCount++;
      }

      finalRecords.push(record);
    });

    currentJob = {
      ...currentJob,
      status: 'completed',
      extractedCount: finalRecords.length,
      filesCount: images.length,
      newStudentsCount: newCount,
      updatedStudentsCount: updatedCount,
      pagesProcessed,
      pagesFailed,
      progressText: `Completed — Extracted ${finalRecords.length} candidate(s) from ${images.length} page(s) (${newCount} new, ${updatedCount} updated${pagesFailed > 0 ? `, ${pagesFailed} failed pages` : ''})`,
    };
    callbacks.onJobStatusChange(currentJob);

    // Live Data Sync
    callbacks.onStudentsImported(finalRecords, newCount, updatedCount);
  } catch (err: any) {
    console.error('Student import background job error:', err);
    currentJob = {
      ...currentJob,
      status: 'failed',
      error: err?.message || 'Error processing Roll Number Slips OCR.',
      progressText: `Failed: ${err?.message || 'Error processing Roll Number Slips OCR.'}`,
    };
    callbacks.onJobStatusChange(currentJob);
  }
}
