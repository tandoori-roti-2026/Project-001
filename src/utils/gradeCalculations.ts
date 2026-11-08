import { StudentRecord, ExamPaper, PaperStatus } from '../data/mockPapers';

export type FBISEGrade =
  | 'A++'
  | 'A+'
  | 'A'
  | 'B++'
  | 'B+'
  | 'B'
  | 'C'
  | 'D'
  | 'E'
  | 'U';

export interface FBISEGradeResult {
  grade: FBISEGrade;
  gpa: number; // 5.0 scale
  remarks: string;
  isPassed: boolean;
  percentage: number;
}

export interface SubjectResult {
  subject: string;
  maxMarks: number;
  marksObtained: number;
  percentage: number;
  grade: FBISEGrade;
  gpa: number;
  remarks: string;
  isPassed: boolean;
  creditHours?: number;
}

export interface StudentAcademicRecord {
  studentId: string;
  studentName: string;
  fatherName: string;
  rollNumber: string;
  registrationNumber: string;
  admissionNumber: string;
  institutionName: string;
  classGrade: string;
  section?: string;
  group: string;
  examSession: string;
  status: PaperStatus;
  dateSubmitted: string;
  remarks: string;
  subjects: SubjectResult[];
  totalMaxMarks: number;
  totalMarksObtained: number;
  overallPercentage: number;
  overallGrade: FBISEGrade;
  cgpa: number; // 5.0 scale
  isPassed: boolean;
  paperId: string;
  shift?: 'morning' | 'evening';
  certificateNumber?: string;
  issueDate?: string;
}

/**
 * Official Federal Board of Intermediate and Secondary Education (FBISE)
 * 10-Point Grading System (Implemented for SSC & HSSC).
 *
 * Benchmark Scale:
 * - A++ (Exceptional): 95% to 100% | GPA: 5.00
 * - A+  (Outstanding): 90% to 94.9% | GPA: 4.70
 * - A   (Excellent):   85% to 89.9% | GPA: 4.30
 * - B++ (Very Good):   80% to 84.9% | GPA: 4.00
 * - B+  (Good):        75% to 79.9% | GPA: 3.50
 * - B   (Fairly Good): 70% to 74.9% | GPA: 3.00
 * - C   (Above Avg):   60% to 69.9% | GPA: 2.00
 * - D   (Average):     50% to 59.9% | GPA: 1.00
 * - E   (Below Avg):   40% to 49.9% | GPA: 0.50 (Passing threshold: 40%)
 * - U   (Unsat/Fail):  Below 40%    | GPA: 0.00
 */
export function calculateGrade(percentage: number): {
  grade: FBISEGrade;
  gpa: number;
  remarks: string;
  isPassed: boolean;
} {
  return calculateFbiseGrade(percentage);
}

export function calculateFbiseGrade(percentage: number): FBISEGradeResult {
  const p = Math.round(percentage * 100) / 100;

  if (p >= 95) {
    return { grade: 'A++', gpa: 5.0, remarks: 'Exceptional', isPassed: true, percentage: p };
  }
  if (p >= 90) {
    return { grade: 'A+', gpa: 4.7, remarks: 'Outstanding', isPassed: true, percentage: p };
  }
  if (p >= 85) {
    return { grade: 'A', gpa: 4.3, remarks: 'Excellent', isPassed: true, percentage: p };
  }
  if (p >= 80) {
    return { grade: 'B++', gpa: 4.0, remarks: 'Very Good', isPassed: true, percentage: p };
  }
  if (p >= 75) {
    return { grade: 'B+', gpa: 3.5, remarks: 'Good', isPassed: true, percentage: p };
  }
  if (p >= 70) {
    return { grade: 'B', gpa: 3.0, remarks: 'Fairly Good', isPassed: true, percentage: p };
  }
  if (p >= 60) {
    return { grade: 'C', gpa: 2.0, remarks: 'Above Average', isPassed: true, percentage: p };
  }
  if (p >= 50) {
    return { grade: 'D', gpa: 1.0, remarks: 'Average', isPassed: true, percentage: p };
  }
  if (p >= 40) {
    return { grade: 'E', gpa: 0.5, remarks: 'Below Average / Pass', isPassed: true, percentage: p };
  }
  return { grade: 'U', gpa: 0.0, remarks: 'Unsatisfactory', isPassed: false, percentage: p };
}

/**
 * Calculates subject-level GPA based on percentage mark on FBISE 5.0 scale.
 */
export function calculateSubjectGPA(marksObtained: number, maxMarks: number): number {
  if (maxMarks <= 0) return 0;
  const percentage = (marksObtained / maxMarks) * 100;
  return calculateFbiseGrade(percentage).gpa;
}

/**
 * Formats academic transcripts with FBISE 10-point grades and 5.0 scale CGPA.
 */
export function formatAcademicRecords(
  students: StudentRecord[],
  papers: ExamPaper[]
): StudentAcademicRecord[] {
  // 1. First map students who exist in the database
  const studentRecords: StudentAcademicRecord[] = students.map((student) => {
    // Find associated papers for this student
    const studentPapers = papers.filter((p) => p.studentId === student.id);
    const primaryPaper = studentPapers[0];

    if (studentPapers.length > 0) {
      // Build subject results for all papers this student took
      const subjects: SubjectResult[] = studentPapers.map((paper) => {
        const totalMax = paper.questions.reduce((sum, q) => sum + (q.maxMarks || 0), 0) || 50;
        const totalObtained = paper.questions.reduce((sum, q) => sum + (q.examinerMark ?? q.aiSuggestedMark ?? 0), 0);
        const percentage = totalMax > 0 ? Math.round((totalObtained / totalMax) * 1000) / 10 : 0;
        const fbise = calculateFbiseGrade(percentage);

        return {
          subject: paper.subject,
          maxMarks: totalMax,
          marksObtained: totalObtained,
          percentage,
          grade: fbise.grade,
          gpa: fbise.gpa,
          remarks: fbise.remarks,
          isPassed: fbise.isPassed,
          creditHours: 4,
        };
      });

      const totalMaxMarks = subjects.reduce((sum, s) => sum + s.maxMarks, 0);
      const totalMarksObtained = subjects.reduce((sum, s) => sum + s.marksObtained, 0);
      const overallPercentage = totalMaxMarks > 0 ? Math.round((totalMarksObtained / totalMaxMarks) * 1000) / 10 : 0;
      const overallFbise = calculateFbiseGrade(overallPercentage);
      
      // Calculate weighted CGPA on 5.0 scale
      const totalGPA = subjects.reduce((sum, s) => sum + s.gpa, 0);
      const cgpa = subjects.length > 0 ? Math.round((totalGPA / subjects.length) * 100) / 100 : overallFbise.gpa;
      const allPassed = subjects.every((s) => s.isPassed);

      const certSeed = student.rollNumber ? student.rollNumber.replace(/[^0-9]/g, '').padEnd(5, '0') : '10041';

      return {
        studentId: student.id,
        studentName: student.fullName,
        fatherName: student.fatherName || 'Guardian',
        rollNumber: student.rollNumber,
        registrationNumber: student.registrationNumber || `REG-${student.rollNumber.replace(/[^0-9]/g, '') || '90214-FB'}`,
        admissionNumber: student.admissionNumber || `ADM-2024-${certSeed.slice(0, 4)}`,
        institutionName: student.institutionName || 'Federal Government Model College, Islamabad',
        classGrade: `${student.classGrade}-${student.section}`,
        section: student.section,
        group: student.group || 'Pre-Engineering',
        examSession: primaryPaper?.examSession || 'Annual Senior Examinations 2026',
        status: primaryPaper?.status || 'Pending Review',
        dateSubmitted: primaryPaper?.dateSubmitted || new Date().toISOString().split('T')[0],
        remarks: primaryPaper?.remarks || `Certified FBISE 10-Point Evaluation. GPA: ${cgpa.toFixed(2)}/5.00`,
        subjects,
        totalMaxMarks,
        totalMarksObtained,
        overallPercentage,
        overallGrade: overallFbise.grade,
        cgpa,
        isPassed: allPassed,
        paperId: primaryPaper?.id || `paper-${student.id}`,
        shift: primaryPaper?.shift || (student as any).shift || 'morning',
        certificateNumber: `FBISE-DMC-2026-${certSeed}`,
        issueDate: primaryPaper?.dateSubmitted || new Date().toISOString().split('T')[0],
      };
    } else {
      // Student admitted without evaluated paper yet
      const defaultSubject = student.subjectEnrolled || 'General Studies';
      return {
        studentId: student.id,
        studentName: student.fullName,
        fatherName: student.fatherName || 'Guardian',
        rollNumber: student.rollNumber,
        registrationNumber: student.registrationNumber || `REG-${student.rollNumber.replace(/[^0-9]/g, '') || '90214-FB'}`,
        admissionNumber: student.admissionNumber || 'ADM-2024-001',
        institutionName: student.institutionName || 'Federal Government Model College, Islamabad',
        classGrade: `${student.classGrade}-${student.section}`,
        section: student.section,
        group: student.group || 'Pre-Engineering',
        examSession: 'Annual Senior Examinations 2026',
        status: 'Pending Review',
        dateSubmitted: new Date().toISOString().split('T')[0],
        remarks: 'New admission enrolled; paper pending submission & examiner review.',
        subjects: [
          {
            subject: defaultSubject,
            maxMarks: 50,
            marksObtained: 0,
            percentage: 0,
            grade: 'U',
            gpa: 0.0,
            remarks: 'Pending Submission',
            isPassed: false,
          },
        ],
        totalMaxMarks: 50,
        totalMarksObtained: 0,
        overallPercentage: 0,
        overallGrade: 'U',
        cgpa: 0.0,
        isPassed: false,
        paperId: `new-${student.id}`,
        shift: (student as any).shift || 'morning',
        certificateNumber: `FBISE-DMC-2026-${Math.floor(10000 + Math.random() * 90000)}`,
        issueDate: new Date().toISOString().split('T')[0],
      };
    }
  });

  // 2. Also check if there are standalone papers evaluated for candidates not yet explicitly in students list
  const unassignedPapers = papers.filter(
    (p) => !p.studentId || !students.some((s) => s.id === p.studentId)
  );

  const unassignedRecords: StudentAcademicRecord[] = unassignedPapers.map((paper) => {
    const totalMax = paper.questions.reduce((sum, q) => sum + (q.maxMarks || 0), 0) || 50;
    const totalObtained = paper.questions.reduce((sum, q) => sum + (q.examinerMark ?? q.aiSuggestedMark ?? 0), 0);
    const percentage = totalMax > 0 ? Math.round((totalObtained / totalMax) * 1000) / 10 : 0;
    const fbise = calculateFbiseGrade(percentage);

    const idCheck = paper.aiGradingDetails?.identityCheck;
    const headerInfo = paper.aiGradingDetails?.transcription?.header;
    const resolvedName =
      idCheck?.selectedStudentName ||
      idCheck?.paperStudentName ||
      headerInfo?.studentName ||
      (paper.remarks?.match(/(?:candidate|assigned to)\s+([A-Za-z\s-]+)\s*\(/i)?.[1]?.trim()) ||
      'Unassigned';
    const resolvedRoll =
      idCheck?.selectedStudentRoll ||
      idCheck?.paperRollNumber ||
      headerInfo?.studentRoll ||
      (paper.remarks?.match(/\((?:roll\s*(?:no)?:?\s*)?([A-Za-z0-9-]+)\)/i)?.[1]?.trim()) ||
      'Unassigned';

    return {
      studentId: paper.studentId || `unassigned-${paper.id}`,
      studentName: resolvedName,
      fatherName: 'Guardian',
      rollNumber: resolvedRoll,
      registrationNumber: resolvedRoll !== 'Unassigned' ? `REG-${resolvedRoll.replace(/[^0-9]/g, '') || '90214-FB'}` : 'N/A',
      admissionNumber: resolvedRoll !== 'Unassigned' ? `ADM-2024-${resolvedRoll.replace(/[^0-9]/g, '').slice(-4) || '1041'}` : 'N/A',
      institutionName: 'Federal Government Model College, Islamabad',
      classGrade: 'Grade 11 (HSSC-I)',
      section: 'A',
      group: 'Pre-Engineering',
      examSession: paper.examSession || 'Annual Senior Examinations 2026',
      status: paper.status,
      dateSubmitted: paper.dateSubmitted,
      remarks: paper.remarks || 'Evaluated exam paper record.',
      subjects: [
        {
          subject: paper.subject,
          maxMarks: totalMax,
          marksObtained: totalObtained,
          percentage,
          grade: fbise.grade,
          gpa: fbise.gpa,
          remarks: fbise.remarks,
          isPassed: fbise.isPassed,
          creditHours: 4,
        },
      ],
      totalMaxMarks: totalMax,
      totalMarksObtained: totalObtained,
      overallPercentage: percentage,
      overallGrade: fbise.grade,
      cgpa: fbise.gpa,
      isPassed: fbise.isPassed,
      paperId: paper.id,
      shift: paper.shift || 'morning',
      certificateNumber: 'N/A',
      issueDate: paper.dateSubmitted,
    };
  });

  return [...studentRecords, ...unassignedRecords];
}
