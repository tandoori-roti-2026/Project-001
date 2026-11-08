import { ExamPaper, StudentRecord } from '../data/mockPapers';
import { paperStorage } from './paperStorage';

/**
 * Normalizes subject names for matching.
 * e.g., "Physics (Advanced)", "Physics (Evening)", "Physics" -> "physics"
 */
export function normalizeSubjectName(subject: string): string {
  if (!subject) return '';
  return subject
    .replace(/\(.*?\)/g, '')
    .trim()
    .toLowerCase();
}

/**
 * Checks if a paper for the specified student and subject already exists in storage or active papers.
 * Match by roll number first, then name + subject. Morning/Evening on the same subject counts as duplicate.
 */
export function checkForDuplicatePaper(
  papers: ExamPaper[],
  students: StudentRecord[],
  studentRoll?: string | null,
  studentName?: string | null,
  studentId?: string | null,
  subjectName?: string | null
): { isDuplicate: boolean; errorMessage?: string; existingPaperId?: string } {
  if (!subjectName) return { isDuplicate: false };

  const targetSubNorm = normalizeSubjectName(subjectName);
  const targetRollNorm = studentRoll?.trim().toLowerCase() || '';
  const targetNameNorm = studentName?.trim().toLowerCase() || '';

  const storedPapers = paperStorage.loadInitialPapersSync();
  const allPapersMap = new Map<string, ExamPaper>();
  [...storedPapers, ...papers].forEach((p) => allPapersMap.set(p.id, p));
  const allPapers = Array.from(allPapersMap.values());

  const storedStudents = paperStorage.loadInitialStudentsSync();
  const allStudentsMap = new Map<string, StudentRecord>();
  [...storedStudents, ...students].forEach((s) => allStudentsMap.set(s.id, s));
  const allStudents = Array.from(allStudentsMap.values());

  for (const paper of allPapers) {
    const paperSubNorm = normalizeSubjectName(paper.subject);

    const subjectMatches =
      paperSubNorm === targetSubNorm ||
      (paperSubNorm.length > 2 &&
        targetSubNorm.length > 2 &&
        (paperSubNorm.includes(targetSubNorm) || targetSubNorm.includes(paperSubNorm)));

    if (!subjectMatches) continue;

    const studentForPaper = allStudents.find((s) => s.id === paper.studentId);

    const paperRoll = (
      studentForPaper?.rollNumber ||
      paper.aiGradingDetails?.identityCheck?.selectedStudentRoll ||
      paper.aiGradingDetails?.transcription?.header?.studentRoll ||
      ''
    )
      .trim()
      .toLowerCase();

    const paperName = (
      studentForPaper?.fullName ||
      paper.aiGradingDetails?.identityCheck?.selectedStudentName ||
      paper.aiGradingDetails?.transcription?.header?.studentName ||
      ''
    )
      .trim()
      .toLowerCase();

    let matchesStudent = false;

    // 1. Match by Roll Number first
    if (targetRollNorm && paperRoll && targetRollNorm === paperRoll) {
      matchesStudent = true;
    }
    // 2. Direct student ID link
    else if (studentId && paper.studentId && studentId === paper.studentId) {
      matchesStudent = true;
    }
    // 3. Match by candidate Name if roll number match didn't resolve
    else if (targetNameNorm && paperName && targetNameNorm === paperName) {
      matchesStudent = true;
    }

    if (matchesStudent) {
      const displaySubject = subjectName.replace(/\(.*?\)/g, '').trim() || subjectName;
      return {
        isDuplicate: true,
        errorMessage: `This student's ${displaySubject} paper is already checked.`,
        existingPaperId: paper.id,
      };
    }
  }

  return { isDuplicate: false };
}
