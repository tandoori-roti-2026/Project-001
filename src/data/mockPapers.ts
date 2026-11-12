import { generateSamplePaperSvg } from '../utils/samplePaperImages';

export interface ExaminerAuditEntry {
  originalAIMark: number;
  revisedExaminerMark: number;
  reasonCode: string;
  customRemark?: string;
  examinerId: string;
  examinerName: string;
  timestamp: string;
}

export interface CorrectionLog {
  id: string;
  paperId: string;
  paperStudentName: string;
  questionNumber: number;
  questionText: string;
  aiMark: number;
  correctedMark: number;
  examinerId?: string;
  examinerName: string;
  timestamp: string;
  reasonCode?: string;
  reason?: string;
  customRemark?: string;
}

export interface QuestionGradingResult {
  id?: string;
  questionNumber?: number;
  partLabel?: string;
  marks_awarded: number;
  key_points_found: string[];
  key_points_missing: string[];
  quoted_student_working?: string;
  reason: string;
  feedback?: string;
  confidence: 'high' | 'medium' | 'low';
  flag_for_review: boolean;
  flag_reason?: string;
  selected_level?: number;
  attempted_choice?: 'primary' | 'or_choice';
  subPartResults?: Array<{
    partLabel: string;
    marks_awarded: number;
    selected_level?: number;
    reason?: string;
  }>;
}

export interface QuestionTranscription {
  questionNumber: number;
  partLabel?: string;
  transcribedAnswer: string;
  diagramDescription?: string;
  hasIllegible: boolean;
}

export interface PaperTranscription {
  header: {
    studentRoll?: string;
    studentName?: string;
    rawText?: string;
  };
  answers: QuestionTranscription[];
}

export interface IdentityCheckResult {
  passed: boolean;
  paperRollNumber?: string;
  paperStudentName?: string;
  selectedStudentRoll?: string;
  selectedStudentName?: string;
  mismatchReason?: string;
}

export interface AIGradingDetails {
  transcription?: PaperTranscription;
  questionResults?: Record<string | number, QuestionGradingResult> | QuestionGradingResult[];
  identityCheck?: IdentityCheckResult;
  totalAIMarks?: number;
  overallConfidence?: 'high' | 'medium' | 'low';
  flaggedQuestionCount?: number;
  gradedAt?: string;
  error?: string;
  fbiseGrade?: string;
  subjectGPA?: number;
}

export interface ExamQuestion {
  id?: string;
  questionNumber: number;
  partLabel?: string;
  section?: string;
  hasOrChoice?: boolean;
  orChoice?: any;
  questionText: string;
  maxMarks: number;
  aiSuggestedMark: number;
  examinerMark: number;
  gradingResult?: QuestionGradingResult;
  transcription?: QuestionTranscription;
  auditTrail?: ExaminerAuditEntry;
}

export interface StudentRecord {
  id: string; // e.g. "student-001"
  fullName: string;
  fatherName: string;
  dateOfBirth?: string;
  rollNumber: string;
  registrationNumber?: string;
  admissionNumber?: string;
  classGrade?: string;
  section?: string;
  group?: string; // e.g. "Pre-Engineering", "Pre-Medical", "Computer Science"
  institutionName?: string;
  centerCode?: string;
  guardianPhone?: string;
  email?: string;
  enrollmentStatus?: 'Active' | 'Inactive';
  subjectEnrolled: string;
  enrolledSubjects?: string[];
}

export type PaperStatus =
  | 'Pending Review'
  | 'Reviewed'
  | 'Identity Check Needed'
  | 'AI Failed - Manual Grading';

export interface ExamPaper {
  id: string;
  studentId: string; // foreign key link to StudentRecord.id (or "" if unassigned / identity check needed)
  subject: string;
  examSession: string;
  shift?: 'morning' | 'evening';
  dateSubmitted: string;
  status: PaperStatus;
  remarks: string;
  questions: ExamQuestion[];
  pageImages?: string[];
  aiGradingDetails?: AIGradingDetails;
}

export const INITIAL_MOCK_STUDENTS: StudentRecord[] = [
  {
    id: 'student-physics-001',
    fullName: 'Muhammad Ali',
    fatherName: 'Tariq Mehmood',
    rollNumber: 'SEC-2026-101',
    admissionNumber: 'ADM-2024-1041',
    classGrade: 'Grade 11 (HSSC-I)',
    section: 'A',
    group: 'Pre-Engineering',
    institutionName: 'Federal Government Model College, Islamabad',
    centerCode: 'ISB-042',
    subjectEnrolled: 'Physics (Advanced)',
    enrollmentStatus: 'Active',
    enrolledSubjects: ['Physics (Advanced)', 'Pure Mathematics', 'Chemistry (Organic)', 'English Advanced', 'Urdu Literature', 'Islamic Education'],
  },
];

export const INITIAL_MOCK_PAPERS: ExamPaper[] = [];
