import { ExamPaper, ExamQuestion, PaperStatus, StudentRecord } from '../data/mockPapers';
import { MarkingScheme } from '../data/mockMarkingSchemes';
import { RecentUploadLog } from '../components/UploadingScreen';
import { extractCoverMetaFromText } from './pdfProcessor';

/**
 * Normalizes part labels to treat (i), i, and Part (i) as identical.
 */
function normalizePartLabel(label: any): string {
  if (label === undefined || label === null) return '';
  return String(label)
    .toLowerCase()
    .replace(/[()\s]|part/g, '')
    .trim();
}

/**
 * Sanitizes reason text to strictly 1-2 plain sentences without self-corrections (Wait, let's re-verify, etc.)
 */
function sanitizeReasonText(raw: string, defaultFallback = 'No working found for this question.'): string {
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

/**
 * Determines best OR choice side based on content overlap (topics, formulas, values)
 */
function determineBestOrSide(
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

/**
 * Filter raw points to strictly match rubric points from the official marking scheme (Never invent rubric points)
 */
function sanitizeRubricPoints(
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

/**
 * Enforces rubric consistency so marks strictly equal satisfied points scaled to maxMarks as whole numbers
 */
function enforceRubricConsistency(
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

/**
 * Numerical / Math check
 * Wrong method = 0 with a reason explaining the error.
 * Right method with wrong final answer = maxMarks minus 1.
 * Marks must be whole numbers.
 */
function applyMathCheck(
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
    // Right method with wrong final answer = maxMarks minus 1 (whole numbers)
    const partial = Math.max(0, Math.round(maxMarks - 1));
    return { marks: partial, isWrongMethod: false, isWrongFinalAnswer: true };
  }

  return { marks: Math.round(marks), isWrongMethod: false, isWrongFinalAnswer: false };
}

/**
 * Ensures reason explicitly names the chosen side for OR choices in 1-2 plain sentences
 */
function formatReasonWithSide(
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

export interface BackgroundGradingJob {
  id: string;
  submissionId: string;
  paperId: string;
  studentName: string;
  studentRoll: string;
  studentId: string;
  subject: string;
  schemeId?: string;
  shift?: 'morning' | 'evening';
  pageImages: string[];
  status: 'queued' | 'extracting_cover' | 'grading' | 'completed' | 'failed';
  progress: number; // 0 - 100
  startTime: string;
  completedAt?: string;
  error?: string;
  totalAIMarks?: number;
  maxMarks?: number;
  coverMeta?: {
    rollNumber?: string;
    candidateName?: string;
    centerCode?: string;
    subject?: string;
    shift?: 'morning' | 'evening';
    setVersion?: string;
    isAutoDetected?: boolean;
  };
}

export interface AsyncPipelineCallbacks {
  onJobStatusChange: (job: BackgroundGradingJob) => void;
  onPaperCreated: (paper: ExamPaper) => void;
  onStudentCreated?: (student: StudentRecord) => void;
  onRecentUploadAdded: (log: RecentUploadLog) => void;
}

/**
 * Runs the complete OCR Cover Extraction + Student Auto-Identification + AI Grading in the background.
 */
export async function runAsyncGradingJob(
  job: BackgroundGradingJob,
  students: StudentRecord[],
  markingSchemes: MarkingScheme[],
  callbacks: AsyncPipelineCallbacks
): Promise<void> {
  let currentJob: BackgroundGradingJob = {
    ...job,
    status: 'extracting_cover',
    progress: 15,
  };
  callbacks.onJobStatusChange(currentJob);

  try {
    // ════════ STEP 1: OCR COVER PAGE EXTRACTION & AUTO-STUDENT MATCHING ════════
    const coverImage = job.pageImages[0];
    let detectedMetadata: any = null;
    let matchedStudent: StudentRecord | null = null;

    // Check if user explicitly selected a student from dropdown (Priority 1)
    const explicitStudent =
      job.studentId &&
      job.studentId !== 'auto-detect' &&
      !job.studentId.startsWith('auto-std-') &&
      !job.studentId.startsWith('anon-std-')
        ? students.find((s) => s.id === job.studentId)
        : null;

    let finalStudent: StudentRecord = explicitStudent || students.find((s) => s.id === job.studentId) || students[0];

    try {
      const coverRes = await fetch('/api/extract-cover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          coverImage,
          existingStudents: students,
        }),
      });

      if (coverRes.ok) {
        const coverData = await coverRes.json();
        if (coverData.success) {
          detectedMetadata = coverData.metadata;

          // Only override finalStudent if NO explicit student was selected (Priority 2)
          if (!explicitStudent) {
            if (coverData.matchedStudent) {
              matchedStudent = coverData.matchedStudent;
              finalStudent = coverData.matchedStudent;
            } else if (coverData.autoStudent) {
              // Auto-create new student if no match found
              const autoStd: StudentRecord = {
                id: coverData.autoStudent.id || `auto-std-${Date.now()}`,
                fullName: coverData.autoStudent.fullName || 'Auto-Detected Candidate',
                fatherName: 'Guardian',
                dateOfBirth: '2007-01-01',
                rollNumber: coverData.autoStudent.rollNumber || `SEC-2026-${job.submissionId.slice(-4)}`,
                registrationNumber: `REG-${(coverData.autoStudent.rollNumber || '90214').replace(/[^0-9]/g, '') || '90214'}-FB`,
                admissionNumber: coverData.autoStudent.admissionNumber || `ADM-2024-${Math.floor(1000 + Math.random() * 9000)}`,
                classGrade: coverData.autoStudent.classGrade || 'Grade 12',
                section: coverData.autoStudent.section || 'A',
                subjectEnrolled: coverData.autoStudent.subjectEnrolled || job.subject,
                institutionName: coverData.autoStudent.institutionName || 'Federal Government Model College, Islamabad',
                group: coverData.autoStudent.group || 'Pre-Engineering',
                guardianPhone: '+92 300 0000000',
                email: `student.${(coverData.autoStudent.rollNumber || 'new').toLowerCase()}@fbise.edu.pk`,
                enrollmentStatus: 'Active',
              };
              finalStudent = autoStd;
              callbacks.onStudentCreated?.(autoStd);
            }
          } else {
            if (coverData.matchedStudent) {
              matchedStudent = coverData.matchedStudent;
            }
          }
        }
      }
    } catch (coverErr) {
      console.warn('Cover extraction API warning, proceeding with heuristic matcher:', coverErr);
    }

    // Update job state with student info
    currentJob = {
      ...currentJob,
      studentName: finalStudent.fullName,
      studentRoll: finalStudent.rollNumber,
      studentId: finalStudent.id,
      status: 'grading',
      progress: 45,
      coverMeta: {
        rollNumber: finalStudent.rollNumber,
        candidateName: finalStudent.fullName,
        centerCode: detectedMetadata?.centerCode || 'ISB-042',
        subject: detectedMetadata?.subject || job.subject,
        shift: detectedMetadata?.shift || job.shift || 'morning',
        setVersion: detectedMetadata?.setVersion || 'Set-A',
        isAutoDetected: !matchedStudent,
      },
    };
    callbacks.onJobStatusChange(currentJob);

    // ════════ STEP 2: MULTIMODAL AI QUESTION GRADING ════════
    const targetSubject = (detectedMetadata?.subject || job.subject).toLowerCase();
    const targetShift = detectedMetadata?.shift || job.shift || 'morning';

    const activeScheme =
      (job.schemeId ? markingSchemes.find((s) => s.id === job.schemeId) : null) ||
      markingSchemes.find(
        (s) =>
          s.subject.toLowerCase() === targetSubject &&
          (s.shift === targetShift || s.shift === 'both' || !s.shift)
      ) ||
      markingSchemes.find((s) => s.subject.toLowerCase() === targetSubject) ||
      markingSchemes.find((s) => s.title.toLowerCase().includes(targetSubject)) ||
      markingSchemes[0] || {
        id: 'default-scheme',
        subject: job.subject,
        shift: targetShift,
        examSession: 'Annual Senior Examinations 2026',
        title: 'Standard Examination Rubric',
        totalMarks: 50,
        questions: [1, 2, 3, 4, 5].map((num) => ({
          questionNumber: num,
          questionText: `Question ${num}: Evaluate the foundational concepts and problem solving.`,
          maxMarks: 10,
        })),
      };

    const gradeRes = await fetch('/api/grade', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        paperId: job.paperId,
        pageImages: job.pageImages,
        markingScheme: activeScheme,
        selectedStudent: {
          id: finalStudent.id,
          fullName: finalStudent.fullName,
          rollNumber: finalStudent.rollNumber,
        },
      }),
    });

    let gradeData: any = null;
    if (gradeRes.ok) {
      try {
        gradeData = await gradeRes.json();
      } catch (_) {}
    }

    const usedReasons = new Set<string>();

    const finalQuestions: ExamQuestion[] = activeScheme.questions.map((sq: any, sqIdx: number) => {
      const qNum = sq.questionNumber;
      const normalizedSqPart = normalizePartLabel(sq.partLabel);

      let qResult: any = null;
      if (Array.isArray(gradeData?.questionResults)) {
        qResult = gradeData.questionResults.find((r: any) => {
          const resQNum = Number(r.questionNumber);
          const resPart = normalizePartLabel(r.partLabel);
          return resQNum === qNum && (normalizedSqPart ? resPart === normalizedSqPart : true);
        });
      } else if (gradeData?.questionResults && typeof gradeData.questionResults === 'object') {
        const resultsArray = Object.values(gradeData.questionResults);
        qResult = resultsArray.find((r: any) => {
          const resQNum = Number(r.questionNumber);
          const resPart = normalizePartLabel(r.partLabel);
          return resQNum === qNum && (normalizedSqPart ? resPart === normalizedSqPart : true);
        });
      }

      const qTrans = gradeData?.transcription?.answers?.find((a: any) => {
        const transQNum = Number(a.questionNumber);
        const transPart = normalizePartLabel(a.partLabel);
        return transQNum === qNum && (normalizedSqPart ? transPart === normalizedSqPart : true);
      });

      // Scheme question exists! If student wrote nothing or model said "Not in paper", set reason to "Not attempted" (not "Not in paper"). Keep maxMarks unchanged!
      const isParsedNotInPaper =
        qResult?.not_in_paper === true ||
        qResult?.reason === 'Not in paper' ||
        (typeof qResult?.reason === 'string' && qResult.reason.trim().toLowerCase() === 'not in paper');

      const transText = (qTrans?.transcribedAnswer || '').trim();
      const quotedText = (qResult?.quoted_student_working || '').trim();
      const studentWorkingText = (quotedText || transText).trim();

      const hasTranscribedText = Boolean(
        (transText.length > 0 &&
          !transText.includes('[OCR]: No response text detected') &&
          !transText.includes('[No text transcribed]')) ||
        (quotedText.length > 0 &&
          quotedText.toLowerCase() !== 'no working found for this question' &&
          quotedText.toLowerCase() !== 'not attempted')
      );

      // Rule 1: OR Choice Selection - compare content to both sides, never default to primary
      let isOrChoice = qResult?.attempted_choice === 'or_choice';
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
      let pointsFound: string[] = sanitizeRubricPoints(
        Array.isArray(qResult?.key_points_found) ? qResult.key_points_found : [],
        officialPoints
      );
      let pointsMissing: string[] = officialPoints.filter((p: string) => !pointsFound.includes(p));

      let score = qResult ? Number(qResult.marks_awarded) || 0 : 0;
      let reason = qResult?.reason || '';
      let feedback = qResult?.feedback || '';

      if (!hasTranscribedText || isParsedNotInPaper) {
        // Scheme question exists but student wrote nothing: reason = "Not attempted", maxMarks kept unchanged
        score = 0;
        pointsFound = [];
        pointsMissing = officialPoints;
        reason = 'Not attempted.';
        feedback = 'Not attempted.';
      } else {
        // Text exists on either side -> Grade that side!
        const rawScore = qResult ? Number(qResult.marks_awarded) || 0 : 0;
        const mathCheck = applyMathCheck(rawScore, sq.maxMarks, reason, studentWorkingText);

        // Wrong-topic zero: give 0 for wrong question ONLY if it matches NEITHER side
        if (sq.hasOrChoice && !matchesEither) {
          score = 0;
          pointsFound = [];
          pointsMissing = officialPoints;
          reason = formatReasonWithSide(
            sanitizeReasonText(reason || 'Candidate response does not match the primary or OR choice question topic.'),
            sq.hasOrChoice,
            isOrChoice
          );
          feedback = 'Off-topic response.';
        } else if (mathCheck.isWrongMethod) {
          // Requirement 1: Wrong method = 0 with a reason explaining the error
          score = 0;
          pointsFound = [];
          pointsMissing = officialPoints;
          const errReason = sanitizeReasonText(reason || 'Candidate used an incorrect formula or method for this question.');
          reason = formatReasonWithSide(errReason, sq.hasOrChoice, isOrChoice);
          feedback = 'Wrong method applied.';
        } else if (mathCheck.isWrongFinalAnswer) {
          // Requirement 1: Right method with wrong final answer = maxMarks minus 1
          score = Math.max(0, Math.round(sq.maxMarks - 1));
          const errReason = sanitizeReasonText(
            reason || `Correct method applied, but final numerical calculation is incorrect. Awarded ${score}/${sq.maxMarks} marks.`
          );
          reason = formatReasonWithSide(errReason, sq.hasOrChoice, isOrChoice);
          feedback = 'Right method with calculation error.';
        } else {
          // Standard rubric scaling to whole numbers
          if (pointsFound.length > 0 || pointsMissing.length > 0) {
            score = enforceRubricConsistency(mathCheck.marks, sq.maxMarks, pointsFound, pointsMissing, sq.keyPoints);
          } else {
            score = Math.max(0, Math.min(sq.maxMarks, Math.round(rawScore)));
          }

          const isGeneric = (r: string) => {
            const lr = (r || '').toLowerCase();
            return (
              !r ||
              lr.includes('evaluated handwritten response') ||
              lr.includes('standardized grading') ||
              lr.includes('rubric standards') ||
              lr.includes('demonstrated correct mathematical formulation')
            );
          };

          const isDuplicate = usedReasons.has(reason);

          // Rebuild reason if generic, empty, or duplicate - strictly 1-2 plain sentences
          if (isGeneric(reason) || isDuplicate) {
            const workingSnippet = studentWorkingText.length > 60 ? studentWorkingText.slice(0, 55) + '...' : studentWorkingText;
            const sentence1 = sq.hasOrChoice
              ? `Attempted ${sideName}: Candidate demonstrated ${pointsFound.length > 0 ? pointsFound.slice(0, 2).join(', ') : 'working'} ("${workingSnippet}").`
              : `Candidate demonstrated ${pointsFound.length > 0 ? pointsFound.slice(0, 2).join(', ') : 'working'} ("${workingSnippet}").`;
            const sentence2 = pointsMissing.length > 0
              ? `Deficiencies in ${pointsMissing.slice(0, 2).join(', ')}, earning ${score}/${sq.maxMarks} marks.`
              : `Earned ${score}/${sq.maxMarks} marks according to the rubric criteria.`;
            reason = `${sentence1} ${sentence2}`;
          }

          // Rule 5: 1-2 plain sentences only, no self-corrections
          reason = sanitizeReasonText(reason, 'Evaluated candidate working against rubric standards.');

          // Rule 1: Reason must name the chosen side if OR choice
          if (sq.hasOrChoice) {
            reason = formatReasonWithSide(reason, true, isOrChoice);
          }

          feedback = feedback || (score > 0 ? 'Answer evaluated against rubric criteria.' : 'Question evaluated.');
        }
      }

      // Requirement 2: Marks must be whole numbers
      score = Math.round(score);

      usedReasons.add(reason);

      const resolvedQResult = {
        questionNumber: qNum,
        partLabel: sq.partLabel || '',
        marks_awarded: score,
        selected_level: score > 0 ? 1 : 0,
        attempted_choice: (isOrChoice ? 'or_choice' : 'primary') as 'or_choice' | 'primary',
        quoted_student_working: studentWorkingText,
        key_points_found: pointsFound,
        key_points_missing: pointsMissing,
        reason: reason,
        feedback: feedback,
        confidence: (hasTranscribedText ? 'high' : 'medium') as 'high' | 'medium' | 'low',
        flag_for_review: hasTranscribedText && score === 0,
        flag_reason: hasTranscribedText && score === 0 ? 'Handwriting detected with 0 marks; examiner review recommended' : '',
        not_in_paper: false,
      };

      const resolvedQTrans = qTrans || {
        questionNumber: qNum,
        partLabel: sq.partLabel || '',
        transcribedAnswer: studentWorkingText || `[OCR]: No response text detected for Question ${qNum}${sq.partLabel ? ` ${sq.partLabel}` : ''}.`,
        hasIllegible: false,
      };

      return {
        id: sq.id || `${sq.section || ''}_${qNum}_${sq.partLabel || ''}_${sqIdx}`,
        section: sq.section,
        partLabel: sq.partLabel,
        hasOrChoice: sq.hasOrChoice,
        orChoice: sq.orChoice,
        questionNumber: qNum,
        questionText: questionTextToUse,
        maxMarks: sq.maxMarks,
        aiSuggestedMark: score,
        examinerMark: score,
        gradingResult: {
          ...resolvedQResult,
          reason,
        },
        transcription: resolvedQTrans,
      };
    });

    // Questions missing from the scheme: Use "Not in paper" only for questions missing from the scheme
    const schemeQuestionKeys = new Set(
      activeScheme.questions.map((sq: any) => `${sq.questionNumber}_${normalizePartLabel(sq.partLabel)}`)
    );
    if (Array.isArray(gradeData?.transcription?.answers)) {
      for (const transAns of gradeData.transcription.answers) {
        const qNum = Number(transAns.questionNumber);
        const pLabel = normalizePartLabel(transAns.partLabel);
        const key = `${qNum}_${pLabel}`;
        if (!schemeQuestionKeys.has(key) && !schemeQuestionKeys.has(`${qNum}_`)) {
          finalQuestions.push({
            id: `missing_${qNum}_${pLabel}`,
            section: '',
            partLabel: transAns.partLabel || '',
            hasOrChoice: false,
            questionNumber: qNum,
            questionText: transAns.transcribedAnswer || 'Question missing from marking scheme',
            maxMarks: 0,
            aiSuggestedMark: 0,
            examinerMark: 0,
            gradingResult: {
              id: `missing_${qNum}_${pLabel}`,
              questionNumber: qNum,
              partLabel: transAns.partLabel || '',
              marks_awarded: 0,
              selected_level: 0,
              key_points_found: [],
              key_points_missing: [],
              reason: 'Not in paper',
              feedback: 'Not in paper',
              confidence: 'high',
              flag_for_review: false,
            },
            transcription: {
              questionNumber: qNum,
              partLabel: transAns.partLabel || '',
              transcribedAnswer: transAns.transcribedAnswer || '[Not in paper]',
              hasIllegible: false,
            },
          });
        }
      }
    }

    const totalAIMarks = gradeData?.totalAIMarks ?? finalQuestions.filter((q) => !(q as any).notInPaper).reduce((sum, q) => sum + (q.examinerMark ?? 0), 0);
    const totalMaxMarks = finalQuestions.reduce((sum, q) => sum + (q.maxMarks || 0), 0) || activeScheme.totalMarks;
    const flaggedCount = finalQuestions.filter((q) => q.gradingResult?.flag_for_review).length;

    const finalPaper: ExamPaper = {
      id: job.paperId,
      studentId: finalStudent.id,
      subject: job.subject,
      shift: targetShift,
      examSession: 'Annual Senior Examinations 2026',
      dateSubmitted: new Date().toISOString().split('T')[0],
      status: 'Pending Review',
      remarks: explicitStudent
        ? `AI Evaluated • Total ${totalAIMarks}/${totalMaxMarks} marks awarded. Bound to selected student ${finalStudent.fullName} (${finalStudent.rollNumber}).`
        : `AI Evaluated • Total ${totalAIMarks}/${totalMaxMarks} marks awarded. Auto-assigned to ${finalStudent.fullName} (${finalStudent.rollNumber}).`,
      pageImages: job.pageImages,
      questions: finalQuestions,
      aiGradingDetails: {
        transcription: gradeData?.transcription || {
          header: { studentName: finalStudent.fullName, studentRoll: finalStudent.rollNumber },
          answers: finalQuestions.map((q) => q.transcription),
        },
        questionResults: gradeData?.questionResults || {},
        identityCheck: {
          passed: true,
          paperRollNumber: finalStudent.rollNumber,
          paperStudentName: finalStudent.fullName,
          selectedStudentName: finalStudent.fullName,
          selectedStudentRoll: finalStudent.rollNumber,
        },
        totalAIMarks,
        overallConfidence: 'high',
        flaggedQuestionCount: flaggedCount,
        gradedAt: new Date().toISOString(),
      },
    };

    // Commit the newly graded paper to master state
    callbacks.onPaperCreated(finalPaper);

    // Commit to session recent upload log
    const uploadLog: RecentUploadLog = {
      paperId: job.paperId,
      studentId: finalStudent.id,
      studentName: finalStudent.fullName,
      studentRoll: finalStudent.rollNumber,
      subject: job.subject,
      pagesCount: job.pageImages.length,
      thumbnailUrl: job.pageImages[0],
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      status: 'Pending Review',
    };
    callbacks.onRecentUploadAdded(uploadLog);

    // Complete Job
    currentJob = {
      ...currentJob,
      status: 'completed',
      progress: 100,
      totalAIMarks,
      maxMarks: activeScheme.totalMarks,
      completedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    callbacks.onJobStatusChange(currentJob);
  } catch (err: any) {
    console.error('Async grading error:', err);
    currentJob = {
      ...currentJob,
      status: 'failed',
      progress: 100,
      error: err?.message || 'Background AI grading encountered an issue.',
    };
    callbacks.onJobStatusChange(currentJob);
  }
}
