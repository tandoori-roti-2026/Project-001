import React, { useState, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft,
  Search,
  CheckCircle2,
  RotateCcw,
  Save,
  AlertTriangle,
  FileText,
  User,
  BookOpen,
  Calendar,
  HelpCircle,
  Hash,
  Cpu,
  Maximize2,
  X,
  Plus,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  ShieldAlert,
  Loader2,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Check,
  XCircle,
  Flag,
  History,
  Info,
  Clock,
  Trash2,
  AlertCircle,
} from 'lucide-react';
import {
  ExamPaper,
  StudentRecord,
  PaperStatus,
  ExamQuestion,
  CorrectionLog,
} from '../data/mockPapers';
import { UserAccount } from '../data/authUsers';
import { UserIdentityBadge } from './UserIdentityBadge';
import { MarkingScheme } from '../data/mockMarkingSchemes';
import { MarkingSchemeManager } from './MarkingSchemeManager';
import { generateSamplePaperSvg } from '../utils/samplePaperImages';
import { calculateFbiseGrade } from '../utils/gradeCalculations';
import { ShiftFilterType } from './GlobalShiftFilter';

export const EXAMINER_AUDIT_REASONS = [
  'Illegible Handwriting Clarified',
  'Alternative Formula Validated',
  'Partial Method Credit',
  'Step Missing',
  'Computational Error in AI Grading',
  'Curved-Arrow / Diagram Mechanism Validated',
  'Re-evaluation of Ambiguous Working',
  'Other Validated Academic Reason',
] as const;

interface EditingScreenProps {
  currentUser?: UserAccount | null;
  papers: ExamPaper[];
  students: StudentRecord[];
  markingSchemes: MarkingScheme[];
  shiftFilter?: ShiftFilterType;
  onShiftFilterChange?: (filter: ShiftFilterType) => void;
  onSaveMarkingSchemes: (updatedSchemes: MarkingScheme[]) => void;
  onDeleteMarkingScheme?: (schemeId: string) => void;
  onDeleteAllMarkingSchemes?: () => void;
  initialPaperId?: string | null;
  initialTab?: 'grading' | 'schemes';
  onUpdatePaper: (updatedPaper: ExamPaper) => void;
  onDeletePaper?: (paperId: string) => void;
  onBackToMenu: () => void;
  correctionLogs?: CorrectionLog[];
  onAddCorrectionLog?: (log: CorrectionLog) => void;
}

export const EditingScreen: React.FC<EditingScreenProps> = ({
  currentUser,
  papers,
  students,
  markingSchemes,
  onSaveMarkingSchemes,
  onDeleteMarkingScheme,
  onDeleteAllMarkingSchemes,
  initialPaperId,
  initialTab = 'grading',
  onUpdatePaper,
  onDeletePaper,
  onBackToMenu,
  correctionLogs = [],
  onAddCorrectionLog,
}) => {
  // Dedicated Tab State: 'grading' (Student Scripts Review) vs 'schemes' (Dedicated Marking Scheme Editor)
  const [activeStudioTab, setActiveStudioTab] = useState<'grading' | 'schemes'>(
    papers.length === 0 ? 'schemes' : initialTab
  );
  const [selectedSchemeId, setSelectedSchemeId] = useState<string>(markingSchemes[0]?.id || '');
  const [schemeSectionFilter, setSchemeSectionFilter] = useState<'all' | 'section-a' | 'section-b' | 'section-c'>('all');
  const [schemeSearch, setSchemeSearch] = useState<string>('');
  const [localSchemes, setLocalSchemes] = useState<MarkingScheme[]>(markingSchemes);
  const [questionSubTab, setQuestionSubTab] = useState<Record<string, 'left' | 'or'>>({});

  // Marking Scheme Deletion Confirmation Modal State
  const [deleteConfirmModal, setDeleteConfirmModal] = useState<{
    isOpen: boolean;
    type: 'single' | 'all';
    schemeId?: string;
    schemeTitle?: string;
    referencedCount?: number;
    schemesCount?: number;
  } | null>(null);

  const [paperDeleteConfirm, setPaperDeleteConfirm] = useState<{
    isOpen: boolean;
    paperId?: string;
    studentName?: string;
  } | null>(null);

  const [errorAlert, setErrorAlert] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
  } | null>(null);

  const handleDeletePaperConfirm = () => {
    if (paperDeleteConfirm?.paperId && onDeletePaper) {
      onDeletePaper(paperDeleteConfirm.paperId);
    }
    setPaperDeleteConfirm(null);
  };

  React.useEffect(() => {
    setLocalSchemes(markingSchemes);
    if (!selectedSchemeId && markingSchemes.length > 0) {
      setSelectedSchemeId(markingSchemes[0].id);
    }
  }, [markingSchemes]);

  const [selectedPaperId, setSelectedPaperId] = useState<string>(() => {
    if (initialPaperId && papers.some((p) => p.id === initialPaperId)) {
      return initialPaperId;
    }
    // Default to the first paper with issues or first paper
    const flaggedOrIdentityPaper = papers.find(
      (p) =>
        p.status === 'Identity Check Needed' ||
        p.questions.some((q) => q.gradingResult?.flag_for_review)
    );
    return flaggedOrIdentityPaper ? flaggedOrIdentityPaper.id : papers[0]?.id || '';
  });

  // Paper Viewer Image state
  const [activePageIndex, setActivePageIndex] = useState<number>(0);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [isImageLightboxOpen, setIsImageLightboxOpen] = useState(false);
  const imageContainerRef = useRef<HTMLDivElement | null>(null);

  // Filter & Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Flagged Only' | 'Pending Review' | 'Reviewed' | 'Needs Attention'>('All');
  const [showOnlyFlaggedQuestions, setShowOnlyFlaggedQuestions] = useState(false);

  // Feedback & Modal state
  const [saveSuccessToast, setSaveSuccessToast] = useState<string | null>(null);
  const [isMarkingSchemeOpen, setIsMarkingSchemeOpen] = useState(false);
  const [selectedSchemeIdForManager, setSelectedSchemeIdForManager] = useState<string | null>(null);
  const [isAuditLogOpen, setIsAuditLogOpen] = useState(false);

  // AI Pipeline retry state
  const [isRetryingAI, setIsRetryingAI] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [retryCooldown, setRetryCooldown] = useState<number>(0);
  const [selectedAssignStudentId, setSelectedAssignStudentId] = useState<string>(students[0]?.id || '');

  // Requirement 5: 15-second cooldown timer between manual retry attempts
  React.useEffect(() => {
    if (retryCooldown <= 0) return;
    const timer = setInterval(() => {
      setRetryCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [retryCooldown]);

  // Progress Popup state for Re-run AI Grading
  const [rerunProgress, setRerunProgress] = useState<{
    isOpen: boolean;
    step: 'idle' | 'transcribing' | 'grading' | 'success' | 'error';
    stepNumber: 1 | 2;
    step1Status: 'pending' | 'active' | 'saved' | 'completed';
    step2Status: 'pending' | 'active' | 'completed';
    statusMessage: string;
    errorMessage: string | null;
    paperTitle: string;
    subject: string;
    totalMarksAwarded?: number;
    maxMarks?: number;
  }>({
    isOpen: false,
    step: 'idle',
    stepNumber: 1,
    step1Status: 'pending',
    step2Status: 'pending',
    statusMessage: '',
    errorMessage: null,
    paperTitle: '',
    subject: '',
  });

  // Questions transcription drawer expanders
  const [expandedQuestions, setExpandedQuestions] = useState<Record<string | number, boolean>>({});

  // Flag confirmation tracking (keyed by `${paperId}-q-${questionNumber}`)
  const [confirmedFlags, setConfirmedFlags] = useState<Record<string, boolean>>({});

  // Optional correction reason input per question
  const [correctionReasons, setCorrectionReasons] = useState<Record<string | number, string>>({});

  // Selected paper record
  const currentPaper = useMemo(() => {
    return papers.find((p) => p.id === selectedPaperId) || papers[0] || null;
  }, [papers, selectedPaperId]);

  // Fallback real paper images if paper.pageImages is empty
  const activePaperImages = useMemo(() => {
    if (currentPaper?.pageImages && currentPaper.pageImages.length > 0) {
      return currentPaper.pageImages;
    }
    if (!currentPaper) return [];
    // Generate realistic multi-page handwritten SVG answers
    const student = students.find((s) => s.id === currentPaper.studentId);
    const roll = student?.rollNumber || currentPaper.aiGradingDetails?.identityCheck?.paperRollNumber || 'SEC-2026-041';
    const name = student?.fullName || currentPaper.aiGradingDetails?.identityCheck?.paperStudentName || 'Candidate';
    return [
      generateSamplePaperSvg(roll, name, currentPaper.subject, 1, 2, 'default'),
      generateSamplePaperSvg(roll, name, currentPaper.subject, 2, 2, 'default'),
    ];
  }, [currentPaper, students]);

  // Reset active page index and zoom when paper changes
  React.useEffect(() => {
    setActivePageIndex(0);
    setZoomLevel(1);
  }, [currentPaper?.id]);

  // Find marking scheme corresponding to current paper subject and shift
  const activeSubjectScheme = useMemo(() => {
    if (!currentPaper) return markingSchemes[0] || null;
    const paperSubject = currentPaper.subject.trim();
    const paperShift = currentPaper.shift || 'morning';
    const shiftLabel = paperShift.toLowerCase().includes('evening') || paperShift.toLowerCase().includes('group 2')
      ? 'Evening (Group 2)'
      : 'Morning (Group 1)';

    const normalizedKey = `${paperSubject}_${shiftLabel}`;

    // 1. Direct localStorage lookup for exact normalized key: ${targetSubject}_${targetShift}
    try {
      const storedDirect =
        localStorage.getItem(`project001_scheme_${normalizedKey}`) ||
        localStorage.getItem(normalizedKey) ||
        localStorage.getItem(`scheme_${normalizedKey}`) ||
        localStorage.getItem(`${paperSubject}_${paperShift}`);
      if (storedDirect) {
        const parsed = JSON.parse(storedDirect);
        if (parsed?.questions?.length > 0) return parsed;
      }
    } catch (_) {}

    // 2. Exact key match in markingSchemes array
    const idMatch = markingSchemes.find((s) => s.id === normalizedKey || (s as any).key === normalizedKey);
    if (idMatch) return idMatch;

    // 3. Exact subject & shift match
    const pSub = paperSubject.toLowerCase();
    const exactShiftMatch = markingSchemes.find((s) => {
      const sSub = s.subject.trim().toLowerCase();
      const sShift = (s.shift || 'morning').trim().toLowerCase();
      const isSubMatch = sSub === pSub || pSub.includes(sSub) || sSub.includes(pSub);
      const isShiftMatch =
        sShift === paperShift.toLowerCase() ||
        (paperShift.toLowerCase().includes('morning') && sShift.includes('morning')) ||
        (paperShift.toLowerCase().includes('evening') && sShift.includes('evening'));
      return isSubMatch && isShiftMatch;
    });
    if (exactShiftMatch) return exactShiftMatch;

    const subjectMatch = markingSchemes.find((s) => {
      const sSub = s.subject.trim().toLowerCase();
      return sSub === pSub || pSub.includes(sSub) || sSub.includes(pSub);
    });
    if (subjectMatch) return subjectMatch;

    return markingSchemes[0] || null;
  }, [markingSchemes, currentPaper]);

  // ════════ STANDALONE SCHEME EDITOR STATE & HELPERS ════════
  const selectedStandaloneScheme = useMemo(() => {
    return (
      localSchemes.find((s) => s.id === selectedSchemeId) ||
      localSchemes[0] ||
      null
    );
  }, [localSchemes, selectedSchemeId]);

  const filteredStandaloneSchemes = useMemo(() => {
    const q = schemeSearch.toLowerCase().trim();
    if (!q) return localSchemes;
    return localSchemes.filter(
      (s) =>
        s.subject.toLowerCase().includes(q) ||
        s.title.toLowerCase().includes(q) ||
        (s.shift || '').toLowerCase().includes(q)
    );
  }, [localSchemes, schemeSearch]);

  // Dynamic section counts & mark sums based on actual questions present in scheme
  const sectionCounts = useMemo(() => {
    if (!selectedStandaloneScheme || !Array.isArray(selectedStandaloneScheme.questions)) {
      return { a: 0, b: 0, c: 0, all: 0, aMarks: 0, bMarks: 0, cMarks: 0, totalMarks: 0 };
    }
    const qs = selectedStandaloneScheme.questions;
    let a = 0, b = 0, c = 0;
    let aMarks = 0, bMarks = 0, cMarks = 0;

    qs.forEach((q) => {
      const qMax = Number(q.maxMarks) || 0;
      const isMcq = q.section === 'A' || q.questionType === 'mcq' || (q as any).type === 'mcq';
      const isLong = q.section === 'C' || q.questionType === 'long' || (q.section !== 'A' && q.maxMarks >= 6);

      if (isMcq) {
        a++;
        aMarks += qMax;
      } else if (isLong) {
        c++;
        cMarks += qMax;
      } else {
        b++;
        bMarks += qMax;
      }
    });

    const totalMarks = aMarks + bMarks + cMarks;

    return { a, b, c, all: qs.length, aMarks, bMarks, cMarks, totalMarks };
  }, [selectedStandaloneScheme]);

  // Section buttons strictly filter the in-memory questions list without mutating, calling generate, or duplicating
  const filteredStandaloneQuestions = useMemo(() => {
    if (!selectedStandaloneScheme || !Array.isArray(selectedStandaloneScheme.questions)) return [];
    if (schemeSectionFilter === 'section-a') {
      return selectedStandaloneScheme.questions.filter(
        (q) => q.section === 'A' || q.questionType === 'mcq' || (q as any).type === 'mcq'
      );
    }
    if (schemeSectionFilter === 'section-b') {
      return selectedStandaloneScheme.questions.filter(
        (q) => q.section === 'B' || (q.section !== 'A' && q.section !== 'C' && (q.questionType === 'short' || q.maxMarks === 3))
      );
    }
    if (schemeSectionFilter === 'section-c') {
      return selectedStandaloneScheme.questions.filter(
        (q) => q.section === 'C' || q.questionType === 'long' || (q.section !== 'A' && q.maxMarks >= 6)
      );
    }
    return selectedStandaloneScheme.questions;
  }, [selectedStandaloneScheme, schemeSectionFilter]);

  // Header totalMarks = exact sum of unique questions
  const schemeTotalMarks = useMemo(() => {
    if (!selectedStandaloneScheme?.questions) return 0;
    return selectedStandaloneScheme.questions.reduce(
      (sum, q) => sum + (Number(q.maxMarks) || 0),
      0
    );
  }, [selectedStandaloneScheme]);

  const getMcqSelectedOption = (q: any): string => {
    const str = `${q.modelAnswer || ''} ${q.questionText || ''}`;
    const m = str.match(/(?:correct\s*option|option|choice|answer|ans)?\s*[:\-\s]*\(?([A-D])\)?(?:\s*[:.\-\)]|\s+[A-Za-z]|$)/i);
    if (m) return m[1].toUpperCase();
    if (q.rubricLevels?.[0]?.description) {
      const rm = q.rubricLevels[0].description.match(/\(?([A-D])\)?/);
      if (rm) return rm[1].toUpperCase();
    }
    return ['A', 'B', 'C', 'D'][(q.questionNumber - 1) % 4];
  };

  const handleSaveDedicatedScheme = (schemeToSave: MarkingScheme) => {
    const targetSubject = schemeToSave.subject.trim();
    const rawShift = schemeToSave.shift || 'morning';
    const targetShiftLabel =
      rawShift.toLowerCase().includes('evening') || rawShift.toLowerCase().includes('group 2')
        ? 'Evening (Group 2)'
        : 'Morning (Group 1)';
    const normalizedKey = `${targetSubject}_${targetShiftLabel}`;
    const totalMarks = schemeToSave.questions.reduce((sum, q) => sum + (Number(q.maxMarks) || 0), 0);

    const normalizedScheme: MarkingScheme = {
      ...schemeToSave,
      id: normalizedKey,
      subject: targetSubject,
      shift: rawShift.toLowerCase().includes('evening') ? 'evening' : 'morning',
      totalMarks,
      updatedAt: new Date().toISOString(),
    };

    try {
      localStorage.setItem(`project001_scheme_${normalizedKey}`, JSON.stringify(normalizedScheme));
      localStorage.setItem(normalizedKey, JSON.stringify(normalizedScheme));
      localStorage.setItem(`scheme_${normalizedKey}`, JSON.stringify(normalizedScheme));
    } catch (_) {}

    const updatedList = localSchemes.map((s) =>
      s.id === schemeToSave.id || s.id === normalizedKey ? normalizedScheme : s
    );
    if (!updatedList.some((s) => s.id === normalizedScheme.id)) {
      updatedList.unshift(normalizedScheme);
    }

    setLocalSchemes(updatedList);
    onSaveMarkingSchemes(updatedList);
    showToast(`Marking Scheme for "${targetSubject} (${targetShiftLabel})" saved!`);
  };

  // Open single scheme delete confirmation modal
  const openDeleteSchemeConfirm = (schemeId: string, title?: string) => {
    const target = localSchemes.find((s) => s.id === schemeId || (s as any).key === schemeId);
    const displayTitle = target?.title || target?.subject || title || 'this scheme';

    const referencedCount = papers.filter((p) => {
      if (!p.subject) return false;
      const pSub = p.subject.toLowerCase().trim();
      const sSub = (target?.subject || '').toLowerCase().trim();
      const sTitle = (target?.title || '').toLowerCase().trim();
      return (
        (sSub && (pSub === sSub || sSub.includes(pSub) || pSub.includes(sSub))) ||
        (sTitle && (pSub === sTitle || sTitle.includes(pSub) || pSub.includes(sTitle)))
      );
    }).length;

    setDeleteConfirmModal({
      isOpen: true,
      type: 'single',
      schemeId,
      schemeTitle: displayTitle,
      referencedCount,
    });
  };



  // Execute confirmed deletion
  const handleConfirmExecuteDelete = () => {
    if (!deleteConfirmModal) return;

    if (deleteConfirmModal.type === 'single' && deleteConfirmModal.schemeId) {
      const schemeId = deleteConfirmModal.schemeId;
      const title = deleteConfirmModal.schemeTitle || 'Selected';
      const target = localSchemes.find((s) => s.id === schemeId || (s as any).key === schemeId);
      const updated = localSchemes.filter((s) => s.id !== schemeId && (s as any).key !== schemeId);

      setLocalSchemes(updated);
      onSaveMarkingSchemes(updated);

      if (onDeleteMarkingScheme) {
        onDeleteMarkingScheme(schemeId);
      }

      try {
        localStorage.setItem('project001_marking_schemes_v2', JSON.stringify(updated));
        localStorage.setItem('project001_marking_schemes', JSON.stringify(updated));
        if (target) {
          const sSub = target.subject.trim();
          const sShift = (target.shift || 'morning').trim().toLowerCase().includes('eve')
            ? 'Evening (Group 2)'
            : 'Morning (Group 1)';
          const normKey = `${sSub}_${sShift}`;
          localStorage.removeItem(normKey);
          localStorage.removeItem(`scheme_${normKey}`);
          localStorage.removeItem(`project001_scheme_${normKey}`);
          if (target.id) {
            localStorage.removeItem(target.id);
            localStorage.removeItem(`scheme_${target.id}`);
            localStorage.removeItem(`project001_scheme_${target.id}`);
          }
        }
        localStorage.removeItem(schemeId);
        localStorage.removeItem(`scheme_${schemeId}`);
        localStorage.removeItem(`project001_scheme_${schemeId}`);
      } catch (_) {}

      if (selectedSchemeId === schemeId) {
        setSelectedSchemeId(updated[0]?.id || '');
      }

      setDeleteConfirmModal(null);
      showToast(`Marking scheme "${title}" deleted.`);
    } else if (deleteConfirmModal.type === 'all') {
      const count = localSchemes.length;
      setLocalSchemes([]);
      setSelectedSchemeId('');
      onSaveMarkingSchemes([]);

      if (onDeleteAllMarkingSchemes) {
        onDeleteAllMarkingSchemes();
      }

      try {
        localStorage.setItem('project001_marking_schemes_v2', JSON.stringify([]));
        localStorage.setItem('project001_marking_schemes', JSON.stringify([]));
        localSchemes.forEach((sch) => {
          localStorage.removeItem(sch.id);
          localStorage.removeItem(`scheme_${sch.id}`);
          localStorage.removeItem(`project001_scheme_${sch.id}`);
        });
      } catch (_) {}

      setDeleteConfirmModal(null);
      showToast(`All ${count} marking schemes deleted. System reset to clean state.`);
    }
  };

  const handleUpdateMcqOption = (scheme: MarkingScheme, qKey: string, newOption: string) => {
    const updated = localSchemes.map((s) => {
      if (s.id !== scheme.id) return s;
      const updatedQuestions = s.questions.map((q, idx) => {
        const itemKey = q.id || `${q.section || ''}_${q.questionNumber}_${q.partLabel || ''}_${idx}`;
        if (itemKey !== qKey && q.id !== qKey) return q;
        return {
          ...q,
          modelAnswer: `Correct Option: (${newOption}). Statement verified.`,
          rubricLevels: [
            {
              id: `${q.id || q.questionNumber}-l1`,
              levelNumber: 1,
              title: `Correct Option (${newOption}) - 1 Mark`,
              description: `Selected option (${newOption}) correctly.`,
              marks: 1,
            },
            {
              id: `${q.id || q.questionNumber}-l4`,
              levelNumber: 4,
              title: 'Incorrect Option (0 Marks)',
              description: 'Selected wrong option or left blank.',
              marks: 0,
            },
          ],
        };
      });
      return {
        ...s,
        questions: updatedQuestions,
        updatedAt: new Date().toISOString(),
      };
    });

    setLocalSchemes(updated);
    const updatedScheme = updated.find((s) => s.id === scheme.id);
    if (updatedScheme) {
      handleSaveDedicatedScheme(updatedScheme);
    }
  };

  const handleUpdateQuestionField = (
    scheme: MarkingScheme,
    qKey: string,
    field: 'questionText' | 'modelAnswer' | 'maxMarks',
    val: any
  ) => {
    const updated = localSchemes.map((s) => {
      if (s.id !== scheme.id) return s;
      const updatedQuestions = s.questions.map((q, idx) => {
        const itemKey = q.id || `${q.section || ''}_${q.questionNumber}_${q.partLabel || ''}_${idx}`;
        if (itemKey !== qKey && q.id !== qKey) return q;
        const newMax = field === 'maxMarks' ? Number(val) || 0 : q.maxMarks;

        let updatedLevels = q.rubricLevels;
        if (field === 'maxMarks' && updatedLevels && updatedLevels.length > 0) {
          updatedLevels = updatedLevels.map((lvl, lIdx) => {
            if (lIdx === 0) return { ...lvl, marks: newMax };
            return { ...lvl, marks: Math.min(newMax, lvl.marks) };
          });
        }

        let updatedOr = q.orChoice;
        if (field === 'maxMarks' && updatedOr) {
          let updatedOrLevels = updatedOr.rubricLevels;
          if (updatedOrLevels && updatedOrLevels.length > 0) {
            updatedOrLevels = updatedOrLevels.map((lvl, lIdx) => {
              if (lIdx === 0) return { ...lvl, marks: newMax };
              return { ...lvl, marks: Math.min(newMax, lvl.marks) };
            });
          }
          updatedOr = {
            ...updatedOr,
            maxMarks: newMax,
            rubricLevels: updatedOrLevels,
          };
        }

        return {
          ...q,
          [field]: field === 'maxMarks' ? newMax : val,
          rubricLevels: updatedLevels,
          orChoice: updatedOr,
        };
      });
      return {
        ...s,
        questions: updatedQuestions,
        totalMarks: updatedQuestions.reduce((sum, q) => sum + (Number(q.maxMarks) || 0), 0),
        updatedAt: new Date().toISOString(),
      };
    });
    setLocalSchemes(updated);
  };

  const handleUpdateOrChoiceField = (
    scheme: MarkingScheme,
    qKey: string,
    field: 'questionText' | 'modelAnswer',
    val: string
  ) => {
    const updated = localSchemes.map((s) => {
      if (s.id !== scheme.id) return s;
      const updatedQuestions = s.questions.map((q, idx) => {
        const itemKey = q.id || `${q.section || ''}_${q.questionNumber}_${q.partLabel || ''}_${idx}`;
        if (itemKey !== qKey && q.id !== qKey) return q;
        const existingOr = q.orChoice || {
          questionText: '',
          maxMarks: q.maxMarks,
          modelAnswer: '',
          mode: 'rubric_levels' as const,
        };
        return {
          ...q,
          hasOrChoice: true,
          orChoice: {
            ...existingOr,
            questionText: field === 'questionText' ? val : (existingOr.questionText || ''),
            maxMarks: q.maxMarks,
            modelAnswer: field === 'modelAnswer' ? val : (existingOr.modelAnswer || ''),
            mode: 'rubric_levels' as const,
          },
        };
      });
      return {
        ...s,
        questions: updatedQuestions,
        updatedAt: new Date().toISOString(),
      };
    });
    setLocalSchemes(updated);
  };

  const handleUpdateOrRubricLevelDesc = (
    scheme: MarkingScheme,
    qKey: string,
    levelId: string,
    newDesc: string
  ) => {
    const updated = localSchemes.map((s) => {
      if (s.id !== scheme.id) return s;
      const updatedQuestions = s.questions.map((q, idx) => {
        const itemKey = q.id || `${q.section || ''}_${q.questionNumber}_${q.partLabel || ''}_${idx}`;
        if (itemKey !== qKey && q.id !== qKey) return q;
        const existingOr = q.orChoice;
        if (!existingOr) return q;
        const updatedLevels = (existingOr.rubricLevels || []).map((lvl) => {
          if (lvl.id !== levelId) return lvl;
          return { ...lvl, description: newDesc };
        });
        return {
          ...q,
          orChoice: {
            ...existingOr,
            rubricLevels: updatedLevels,
          },
        };
      });
      return {
        ...s,
        questions: updatedQuestions,
        updatedAt: new Date().toISOString(),
      };
    });
    setLocalSchemes(updated);
  };

  const handleUpdateOrRubricLevelMark = (
    scheme: MarkingScheme,
    qKey: string,
    levelId: string,
    newMark: number
  ) => {
    const updated = localSchemes.map((s) => {
      if (s.id !== scheme.id) return s;
      const updatedQuestions = s.questions.map((q, idx) => {
        const itemKey = q.id || `${q.section || ''}_${q.questionNumber}_${q.partLabel || ''}_${idx}`;
        if (itemKey !== qKey && q.id !== qKey) return q;
        const existingOr = q.orChoice;
        if (!existingOr) return q;
        const maxForQ = Number(q.maxMarks) || 3;
        const validMark = Math.min(maxForQ, Math.max(0, newMark));
        const updatedLevels = (existingOr.rubricLevels || []).map((lvl) => {
          if (lvl.id !== levelId) return lvl;
          return { ...lvl, marks: validMark };
        });
        return {
          ...q,
          orChoice: {
            ...existingOr,
            rubricLevels: updatedLevels,
          },
        };
      });
      return {
        ...s,
        questions: updatedQuestions,
        updatedAt: new Date().toISOString(),
      };
    });
    setLocalSchemes(updated);
  };

  const handleUpdateRubricLevelDesc = (
    scheme: MarkingScheme,
    qKey: string,
    levelId: string,
    newDesc: string
  ) => {
    const updated = localSchemes.map((s) => {
      if (s.id !== scheme.id) return s;
      const updatedQuestions = s.questions.map((q, idx) => {
        const itemKey = q.id || `${q.section || ''}_${q.questionNumber}_${q.partLabel || ''}_${idx}`;
        if (itemKey !== qKey && q.id !== qKey) return q;
        const updatedLevels = (q.rubricLevels || []).map((lvl) => {
          if (lvl.id !== levelId) return lvl;
          return { ...lvl, description: newDesc };
        });
        return {
          ...q,
          rubricLevels: updatedLevels,
        };
      });
      return {
        ...s,
        questions: updatedQuestions,
        updatedAt: new Date().toISOString(),
      };
    });
    setLocalSchemes(updated);
  };

  const handleUpdateRubricLevelMark = (
    scheme: MarkingScheme,
    qKey: string,
    levelId: string,
    newMark: number
  ) => {
    const updated = localSchemes.map((s) => {
      if (s.id !== scheme.id) return s;
      const updatedQuestions = s.questions.map((q, idx) => {
        const itemKey = q.id || `${q.section || ''}_${q.questionNumber}_${q.partLabel || ''}_${idx}`;
        if (itemKey !== qKey && q.id !== qKey) return q;
        const maxForQ = Number(q.maxMarks) || 3;
        const validMark = Math.min(maxForQ, Math.max(0, newMark));
        const updatedLevels = (q.rubricLevels || []).map((lvl) => {
          if (lvl.id !== levelId) return lvl;
          return { ...lvl, marks: validMark };
        });
        return {
          ...q,
          rubricLevels: updatedLevels,
        };
      });
      return {
        ...s,
        questions: updatedQuestions,
        updatedAt: new Date().toISOString(),
      };
    });
    setLocalSchemes(updated);
  };

  const handleCreateNewDedicatedScheme = () => {
    const newId = `scheme-${Date.now()}`;
    const newScheme: MarkingScheme = {
      id: newId,
      subject: 'New Subject',
      shift: 'morning',
      examSession: 'Annual Senior Examinations 2026',
      title: 'Official Evaluation Marking Rubric',
      description: 'Standardized grading blueprint with Section A MCQs, Section B Short Qs, and Section C Long Qs.',
      totalMarks: 80,
      updatedAt: new Date().toISOString(),
      questions: [
        ...Array.from({ length: 17 }, (_, i) => ({
          id: `mcq-${i + 1}`,
          questionNumber: i + 1,
          questionText: `Section A MCQ ${i + 1}: Select correct option statement.`,
          maxMarks: 1,
          modelAnswer: `Correct Option: (${['A', 'B', 'C', 'D'][i % 4]}). Verified concept.`,
          mode: 'rubric_levels' as const,
          rubricLevels: [
            { id: `mcq-${i + 1}-l1`, levelNumber: 1, title: 'Correct Option (1 Mark)', description: `Selected option (${['A', 'B', 'C', 'D'][i % 4]}) correctly.`, marks: 1 },
            { id: `mcq-${i + 1}-l4`, levelNumber: 4, title: 'Incorrect (0 Marks)', description: 'Selected wrong option.', marks: 0 },
          ],
        })),
        ...Array.from({ length: 13 }, (_, i) => ({
          id: `short-${18 + i}`,
          questionNumber: 18 + i,
          questionText: `Section B Short Question ${i + 1}: State governing principle, formula, and explanation.`,
          maxMarks: 3,
          modelAnswer: '1. Principle (1 Mark). 2. Formula (1 Mark). 3. Explanation (1 Mark).',
          mode: 'rubric_levels' as const,
          rubricLevels: [
            { id: `s-${18 + i}-1`, levelNumber: 1, title: 'Full (3 Marks)', description: 'Principle stated, correct formula, complete reason.', marks: 3 },
            { id: `s-${18 + i}-2`, levelNumber: 2, title: 'Substantial (2 Marks)', description: 'Principle and formula correct; reason brief.', marks: 2 },
            { id: `s-${18 + i}-3`, levelNumber: 3, title: 'Minimal (1 Mark)', description: 'Correct formula or definition stated only.', marks: 1 },
            { id: `s-${18 + i}-4`, levelNumber: 4, title: 'Zero (0 Marks)', description: 'Incorrect or unreadable answer.', marks: 0 },
          ],
        })),
        ...Array.from({ length: 3 }, (_, i) => ({
          id: `long-${31 + i}`,
          questionNumber: 31 + i,
          questionText: `Section C Long Question ${i + 1}: Comprehensive analytical derivation or problem solving.`,
          maxMarks: 8,
          modelAnswer: 'Complete vector derivation from first principles, state boundary conditions, and verify critical limits.',
          mode: 'rubric_levels' as const,
          rubricLevels: [
            { id: `l-${31 + i}-1`, levelNumber: 1, title: 'Level 1 (8 Marks)', description: 'Flawless derivation from first principles and clear vector diagrams.', marks: 8 },
            { id: `l-${31 + i}-2`, levelNumber: 2, title: 'Level 2 (6 Marks)', description: 'Substantially correct; minor algebraic mistake.', marks: 6 },
            { id: `l-${31 + i}-3`, levelNumber: 3, title: 'Level 3 (3 Marks)', description: 'Governing equations stated; partial derivation.', marks: 3 },
            { id: `l-${31 + i}-4`, levelNumber: 4, title: 'Level 4 (0 Marks)', description: 'Irrelevant response.', marks: 0 },
          ],
        })),
      ],
    };

    const updated = [newScheme, ...localSchemes];
    setLocalSchemes(updated);
    onSaveMarkingSchemes(updated);
    setSelectedSchemeId(newId);
    showToast(`Created new 80-mark marking scheme for "${newScheme.subject}"`);
  };

  // Helper to get student identity for a paper
  const getStudentForPaper = (paper: ExamPaper): { name: string; roll: string; class: string } => {
    const student = students.find((s) => s.id === paper.studentId);
    if (student) {
      return {
        name: student.fullName,
        roll: student.rollNumber,
        class: `${student.classGrade}-${student.section}`,
      };
    }
    if (paper.aiGradingDetails?.identityCheck) {
      const idCheck = paper.aiGradingDetails.identityCheck;
      return {
        name:
          idCheck.paperStudentName && idCheck.paperStudentName !== 'UNREADABLE'
            ? `${idCheck.paperStudentName} (Unverified)`
            : idCheck.selectedStudentName
            ? `${idCheck.selectedStudentName} (Unassigned)`
            : 'Unassigned Student',
        roll: idCheck.paperRollNumber || idCheck.selectedStudentRoll || 'Unreadable',
        class: 'Identity Check Needed',
      };
    }
    return {
      name: 'Unassigned Student',
      roll: 'N/A',
      class: 'N/A',
    };
  };

  const currentStudentMeta = useMemo(() => {
    if (!currentPaper) return { name: '', roll: '', class: '' };
    return getStudentForPaper(currentPaper);
  }, [currentPaper, students]);

  const [activeShiftTab, setActiveShiftTab] = useState<'morning' | 'evening' | 'all'>('morning');

  // Helper to generate a collision-free unique key for any exam question
  const getQuestionKey = (q: ExamQuestion, idx: number): string => {
    return q.id || `${q.section || ''}_${q.questionNumber}_${q.partLabel || ''}_${idx}`;
  };

  // Local draft state for current paper's marks, remarks, and mandated audit reason codes
  const [draftMarks, setDraftMarks] = useState<Record<string, number>>({});
  const [draftRemarks, setDraftRemarks] = useState('');
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [auditReasonCodes, setAuditReasonCodes] = useState<Record<string, string>>({});
  const [auditCustomRemarks, setAuditCustomRemarks] = useState<Record<string, string>>({});

  // Sync draft when selected paper changes
  React.useEffect(() => {
    if (currentPaper) {
      const marksMap: Record<string, number> = {};
      const reasonsMap: Record<string, string> = {};
      const customRemarksMap: Record<string, string> = {};
      currentPaper.questions.forEach((q, idx) => {
        const key = getQuestionKey(q, idx);
        marksMap[key] = q.examinerMark;
        marksMap[String(q.questionNumber)] = q.examinerMark;
        if (q.auditTrail?.reasonCode) {
          reasonsMap[key] = q.auditTrail.reasonCode;
          reasonsMap[String(q.questionNumber)] = q.auditTrail.reasonCode;
        }
        if (q.auditTrail?.customRemark) {
          customRemarksMap[key] = q.auditTrail.customRemark;
          customRemarksMap[String(q.questionNumber)] = q.auditTrail.customRemark;
        }
      });
      setDraftMarks(marksMap);
      setAuditReasonCodes(reasonsMap);
      setAuditCustomRemarks(customRemarksMap);
      setDraftRemarks(currentPaper.remarks || '');
      setValidationErrors({});
    }
  }, [currentPaper?.id]);

  // Calculate shift statistics
  const morningPapersCount = useMemo(() => {
    return papers.filter((p) => (p.shift || 'morning') === 'morning').length;
  }, [papers]);

  const eveningPapersCount = useMemo(() => {
    return papers.filter((p) => p.shift === 'evening').length;
  }, [papers]);

  // Filter & SORT papers so flagged ones or "Identity Check Needed" appear FIRST
  const sortedAndFilteredPapers = useMemo(() => {
    const filtered = papers.filter((paper) => {
      const studentMeta = getStudentForPaper(paper);
      const matchesSearch =
        studentMeta.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        paper.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
        studentMeta.roll.toLowerCase().includes(searchQuery.toLowerCase());

      const paperShift = paper.shift || 'morning';
      let matchesShift = true;
      if (activeShiftTab === 'morning') matchesShift = paperShift === 'morning';
      else if (activeShiftTab === 'evening') matchesShift = paperShift === 'evening';

      const hasFlags = paper.questions.some((q) => q.gradingResult?.flag_for_review);

      let matchesStatus = true;
      if (statusFilter === 'Flagged Only') {
        matchesStatus = hasFlags || paper.status === 'Identity Check Needed';
      } else if (statusFilter === 'Needs Attention') {
        matchesStatus =
          paper.status === 'Identity Check Needed' ||
          paper.status === 'AI Failed - Manual Grading' ||
          hasFlags;
      } else if (statusFilter !== 'All') {
        matchesStatus = paper.status === statusFilter;
      }

      return matchesSearch && matchesShift && matchesStatus;
    });

    // Requirement 3: Sort papers so ones with flags or "Identity Check Needed" appear FIRST
    return filtered.sort((a, b) => {
      const getPriority = (p: ExamPaper) => {
        if (p.status === 'Identity Check Needed') return 4;
        if (p.questions.some((q) => q.gradingResult?.flag_for_review)) return 3;
        if (p.status === 'AI Failed - Manual Grading') return 2;
        if (p.status === 'Pending Review') return 1;
        return 0;
      };

      const diff = getPriority(b) - getPriority(a);
      if (diff !== 0) return diff;
      return a.id.localeCompare(b.id);
    });
  }, [papers, searchQuery, statusFilter, students]);

  // Compute live running totals
  const { currentTotal, maxTotal } = useMemo(() => {
    if (!currentPaper) return { currentTotal: 0, maxTotal: 0 };
    let current = 0;
    let max = 0;
    currentPaper.questions.forEach((q, idx) => {
      const key = getQuestionKey(q, idx);
      const mark = draftMarks[key] ?? draftMarks[String(q.questionNumber)] ?? q.examinerMark;
      current += mark;
      max += q.maxMarks;
    });
    return { currentTotal: current, maxTotal: max };
  }, [currentPaper, draftMarks]);

  // Live FBISE Grade and GPA computation on 5.0 scale
  const livePercentage = useMemo(() => {
    return maxTotal > 0 ? Math.round((currentTotal / maxTotal) * 1000) / 10 : 0;
  }, [currentTotal, maxTotal]);

  const liveFbise = useMemo(() => {
    return calculateFbiseGrade(livePercentage);
  }, [livePercentage]);

  // Helper to check if a flagged question is resolved
  const isQuestionFlagResolved = (q: ExamQuestion, idx: number): boolean => {
    if (!currentPaper || !q.gradingResult?.flag_for_review) return true;
    const key = getQuestionKey(q, idx);
    const flagKey = `${currentPaper.id}-${key}`;
    // Explicitly confirmed by examiner button
    if (confirmedFlags[flagKey]) return true;
    // OR mark was edited by examiner away from AI suggestion
    const currentMark = draftMarks[key] ?? draftMarks[String(q.questionNumber)] ?? q.examinerMark;
    if (currentMark !== q.aiSuggestedMark) return true;
    return false;
  };

  // Requirement 4: Count unconfirmed flagged questions
  const unconfirmedFlaggedQuestions = useMemo(() => {
    if (!currentPaper) return [];
    return currentPaper.questions.filter(
      (q, idx) => q.gradingResult?.flag_for_review && !isQuestionFlagResolved(q, idx)
    );
  }, [currentPaper, draftMarks, confirmedFlags]);

  // Toggle flag confirmation
  const handleToggleFlagConfirm = (q: ExamQuestion, idx: number) => {
    if (!currentPaper) return;
    const key = getQuestionKey(q, idx);
    const flagKey = `${currentPaper.id}-${key}`;
    setConfirmedFlags((prev) => {
      const nextState = !prev[flagKey];
      showToast(
        nextState
          ? `Question ${q.questionNumber}${q.partLabel ? ` ${q.partLabel}` : ''} flag marked as confirmed.`
          : `Question ${q.questionNumber}${q.partLabel ? ` ${q.partLabel}` : ''} flag unconfirmed.`
      );
      return { ...prev, [flagKey]: nextState };
    });
  };

  // Handle Mark Change with validation and logging
  const handleMarkChange = (key: string, rawValue: string, maxMarks: number) => {
    if (rawValue === '') {
      setDraftMarks((prev) => ({ ...prev, [key]: 0 }));
      setValidationErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      return;
    }

    const numValue = Number(rawValue);

    if (isNaN(numValue)) return;

    if (numValue < 0) {
      setValidationErrors((prev) => ({
        ...prev,
        [key]: 'Mark cannot be negative',
      }));
      return;
    }

    if (numValue > maxMarks) {
      setValidationErrors((prev) => ({
        ...prev,
        [key]: `Cannot exceed max (${maxMarks})`,
      }));
      setDraftMarks((prev) => ({ ...prev, [key]: maxMarks }));
      return;
    }

    // Valid mark
    setValidationErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setDraftMarks((prev) => ({ ...prev, [key]: numValue }));
  };

  // Mandated Audit Logging with reason code
  const handleCommitMarkCorrectionWithAudit = (
    q: ExamQuestion,
    newMark: number,
    reasonCode: string,
    customRemark?: string
  ) => {
    if (!currentPaper) return;
    if (newMark === q.aiSuggestedMark) return;

    const examinerName = currentUser?.name || currentUser?.username || 'Staff Examiner';
    const examinerId = currentUser?.username || 'exam-001';

    const isOrChoiceAttempted = q.gradingResult?.attempted_choice === 'or_choice';
    const activeQuestionText = isOrChoiceAttempted && q.orChoice?.questionText ? q.orChoice.questionText : q.questionText;

    const logEntry: CorrectionLog = {
      id: `corr-${Date.now()}-${q.questionNumber}`,
      paperId: currentPaper.id,
      paperStudentName: currentStudentMeta.name,
      questionNumber: q.questionNumber,
      questionText: activeQuestionText,
      aiMark: q.aiSuggestedMark,
      correctedMark: newMark,
      examinerId,
      examinerName,
      timestamp: new Date().toISOString(),
      reasonCode,
      reason: reasonCode + (customRemark?.trim() ? `: ${customRemark.trim()}` : ''),
      customRemark,
    };

    onAddCorrectionLog?.(logEntry);
  };

  // Re-run AI grading pipeline for current paper
  const handleReRunAIGrading = async (paper: ExamPaper) => {
    if (retryCooldown > 0 || isRetryingAI) {
      return;
    }

    const imagesToGrade = paper.pageImages && paper.pageImages.length > 0 ? paper.pageImages : activePaperImages;
    if (!imagesToGrade || imagesToGrade.length === 0) {
      setErrorAlert({
        isOpen: true,
        title: 'No Images Found',
        message: 'This paper does not contain any scanned page images to grade.',
      });
      return;
    }

    // Requirement 5: 15-second cooldown on manual retry click
    setRetryCooldown(15);

    // Requirement 6: Always grade against the CURRENT saved marking scheme for that subject, never a copy stored on the paper
    const savedSchemes: MarkingScheme[] = (() => {
      try {
        const raw =
          localStorage.getItem('project001_marking_schemes_v2') ||
          localStorage.getItem('project001_marking_schemes');
        if (raw) return JSON.parse(raw) as MarkingScheme[];
      } catch (_) {}
      return markingSchemes;
    })();

    const currentScheme =
      savedSchemes.find(
        (s) => s.subject.toLowerCase() === paper.subject.toLowerCase()
      ) ||
      markingSchemes.find(
        (s) => s.subject.toLowerCase() === paper.subject.toLowerCase()
      ) ||
      markingSchemes[0];

    const studentRecord = students.find((s) => s.id === paper.studentId);
    const candidateName =
      studentRecord?.fullName ||
      paper.aiGradingDetails?.identityCheck?.paperStudentName ||
      'Candidate';

    const selectedStudentPayload = studentRecord
      ? {
          id: studentRecord.id,
          fullName: studentRecord.fullName,
          rollNumber: studentRecord.rollNumber,
        }
      : paper.aiGradingDetails?.identityCheck
      ? {
          id: '',
          fullName: paper.aiGradingDetails.identityCheck.selectedStudentName || '',
          rollNumber: paper.aiGradingDetails.identityCheck.selectedStudentRoll || '',
        }
      : undefined;

    setIsRetryingAI(true);
    setRetryError(null);

    // Initialize progress popup (Unified 1-call transcription & grading)
    setRerunProgress({
      isOpen: true,
      step: 'grading',
      stepNumber: 1,
      step1Status: 'active',
      step2Status: 'active',
      statusMessage: `Grading against current ${currentScheme.subject} marking scheme...`,
      errorMessage: null,
      paperTitle: candidateName,
      subject: paper.subject,
    });

    try {
      // Requirement 4: Single Gemini call per paper that returns both transcription and grading in one JSON result
      console.log(
        `[Re-run AI Grading] Running unified grading pipeline against current marking scheme (${currentScheme.subject}, ${currentScheme.questions.length} questions)...`
      );

      let gradeData: any;
      let gradeRes: Response;

      try {
        gradeRes = await fetch('/api/grade', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            paperId: paper.id,
            pageImages: imagesToGrade,
            markingScheme: currentScheme,
            selectedStudent: selectedStudentPayload,
            pastCorrections: correctionLogs,
            transcription: paper.aiGradingDetails?.transcription,
          }),
        });

        // Requirement 3: Safe JSON parse. If response is not valid JSON, show "AI is busy right now, please try again in a few minutes"
        const rawText = await gradeRes.text();
        try {
          gradeData = JSON.parse(rawText);
        } catch {
          throw new Error('AI is busy right now, please try again in a few minutes.');
        }
      } catch (netErr: any) {
        throw new Error(
          netErr?.message?.includes('AI is busy')
            ? 'AI is busy right now, please try again in a few minutes.'
            : netErr?.message || 'AI is busy right now, please try again in a few minutes.'
        );
      }

      if (!gradeRes.ok || !gradeData || !gradeData.success) {
        const isBusy =
          gradeRes.status === 503 ||
          gradeRes.status === 429 ||
          gradeData?.error?.includes('AI is busy') ||
          gradeData?.error?.includes('503') ||
          gradeData?.error?.includes('429');
        const errMsg = isBusy
          ? 'AI is busy right now, please try again in a few minutes.'
          : gradeData?.error || 'AI is busy right now, please try again in a few minutes.';
        throw new Error(errMsg);
      }

      // Map questions directly from the CURRENT marking scheme
      const updatedQuestions: ExamQuestion[] = currentScheme.questions.map((sq, sqIdx) => {
        let qResult: any = null;
        if (Array.isArray(gradeData.questionResults)) {
          qResult =
            gradeData.questionResults.find(
              (r: any) =>
                Number(r.questionNumber) === sq.questionNumber &&
                (sq.partLabel ? r.partLabel === sq.partLabel : true)
            ) || gradeData.questionResults[sqIdx];
        } else if (gradeData.questionResults && typeof gradeData.questionResults === 'object') {
          const key = sq.id || `${sq.section || ''}_${sq.questionNumber}_${sq.partLabel || ''}_${sqIdx}`;
          qResult = gradeData.questionResults[key] || gradeData.questionResults[sq.questionNumber];
        }

        const qTrans =
          gradeData.transcription?.answers?.find(
            (a: any) =>
              Number(a.questionNumber) === sq.questionNumber &&
              (sq.partLabel ? a.partLabel === sq.partLabel : true)
          ) ||
          gradeData.transcription?.answers?.find(
            (a: any) => Number(a.questionNumber) === sq.questionNumber
          );

        const isOrAttempted = qResult?.attempted_choice === 'or_choice';
        const activeQText = isOrAttempted && sq.orChoice?.questionText ? sq.orChoice.questionText : sq.questionText;

        const rawScore = qResult ? Number(qResult.marks_awarded) || 0 : 0;
        const validMax = sq.maxMarks;
        const wholeAIMark = Math.min(validMax, Math.max(0, Math.round(rawScore)));

        return {
          id: sq.id || `${sq.section || ''}_${sq.questionNumber}_${sq.partLabel || ''}_${sqIdx}`,
          section: sq.section,
          partLabel: sq.partLabel,
          hasOrChoice: sq.hasOrChoice,
          orChoice: sq.orChoice,
          questionNumber: sq.questionNumber,
          questionText: activeQText,
          maxMarks: validMax,
          aiSuggestedMark: wholeAIMark,
          examinerMark: wholeAIMark, // Requirement 3: Set final mark = new AI mark, never exceed maxMarks
          auditTrail: undefined, // Clear old audit codes / trail
          gradingResult: qResult,
          transcription: qTrans,
        };
      });

      // Requirement 4: Still save the transcription on the paper record
      const updatedPaper: ExamPaper = {
        ...paper,
        pageImages: imagesToGrade,
        status: gradeData.status,
        remarks: gradeData.identityCheck?.passed
          ? `AI Graded: Total ${gradeData.totalAIMarks}/${currentScheme.totalMarks} marks awarded across ${updatedQuestions.length} questions.`
          : `Identity Alert: ${gradeData.identityCheck?.mismatchReason || 'Roll number mismatch'}. Manual verification required.`,
        questions: updatedQuestions,
        aiGradingDetails: {
          transcription: gradeData.transcription,
          questionResults: gradeData.questionResults,
          identityCheck: gradeData.identityCheck,
          totalAIMarks: gradeData.totalAIMarks,
          overallConfidence: gradeData.overallConfidence,
          flaggedQuestionCount: gradeData.flaggedCount,
          gradedAt: new Date().toISOString(),
        },
      };

      onUpdatePaper(updatedPaper);

      // Requirement 3: Clear old final marks, flag confirmations, and audit codes
      const freshDraftMarks: Record<string, number> = {};
      updatedQuestions.forEach((q, idx) => {
        const key = getQuestionKey(q, idx);
        freshDraftMarks[key] = q.examinerMark;
        freshDraftMarks[String(q.questionNumber)] = q.examinerMark;
      });
      setDraftMarks(freshDraftMarks);
      setConfirmedFlags({});
      setAuditReasonCodes({});
      setAuditCustomRemarks({});
      setValidationErrors({});

      setRerunProgress({
        isOpen: true,
        step: 'success',
        stepNumber: 2,
        step1Status: 'completed',
        step2Status: 'completed',
        statusMessage: `Grading complete! ${gradeData.totalAIMarks}/${currentScheme.totalMarks} marks awarded.`,
        errorMessage: null,
        paperTitle: candidateName,
        subject: paper.subject,
        totalMarksAwarded: gradeData.totalAIMarks,
        maxMarks: currentScheme.totalMarks,
      });

      showToast('AI grading pipeline completed! Final marks reset to new AI marks.');
    } catch (err: any) {
      console.error('[Re-run AI Grading error]', err);
      const msg = err.message || '';
      const isBusy =
        msg.includes('AI is busy right now') ||
        msg.includes('503') ||
        msg.includes('429') ||
        msg.includes('UNAVAILABLE') ||
        msg.includes('high demand') ||
        msg.includes('RESOURCE_EXHAUSTED');
      const userError = isBusy
        ? 'AI is busy right now, please try again in a few minutes.'
        : msg || 'AI is busy right now, please try again in a few minutes.';

      setRetryError(userError);
      setRerunProgress((prev) => ({
        ...prev,
        isOpen: true,
        step: 'error',
        errorMessage: userError,
        statusMessage: 'AI Grading encountered an issue.',
      }));
    } finally {
      setIsRetryingAI(false);
    }
  };

  // Requirement 5: Confirm Match for Identity Check Needed
  const handleConfirmIdentityMatch = () => {
    if (!currentPaper) return;
    const updatedPaper: ExamPaper = {
      ...currentPaper,
      status: 'Pending Review',
      remarks: `Student identity confirmed by examiner as matching ${currentStudentMeta.name} (${currentStudentMeta.roll}).`,
    };
    onUpdatePaper(updatedPaper);
    showToast(`Identity match confirmed for ${currentStudentMeta.name}. Moved to Pending Review.`);
  };

  // Requirement 5: Reassign to Another Student for Identity Check Needed
  const handleReassignStudent = (targetStudentId: string) => {
    if (!currentPaper) return;
    const targetStudent = students.find((s) => s.id === targetStudentId);
    if (!targetStudent) return;

    const updatedPaper: ExamPaper = {
      ...currentPaper,
      studentId: targetStudent.id,
      status: 'Pending Review',
      remarks: `Paper reassigned by examiner to ${targetStudent.fullName} (${targetStudent.rollNumber}).`,
    };
    onUpdatePaper(updatedPaper);
    showToast(`Paper successfully reassigned to ${targetStudent.fullName} and moved to Pending Review.`);
  };

  // Revert all marks to original AI suggestion (Requirement 3)
  const handleResetToAI = () => {
    if (!currentPaper) return;
    const resetMarks: Record<string, number> = {};
    const updatedQuestions = currentPaper.questions.map((q, idx) => {
      const validMax = q.maxMarks;
      const wholeAIMark = Math.min(validMax, Math.max(0, Math.round(Number(q.aiSuggestedMark) || 0)));
      const key = getQuestionKey(q, idx);
      resetMarks[key] = wholeAIMark;
      resetMarks[String(q.questionNumber)] = wholeAIMark;
      return {
        ...q,
        examinerMark: wholeAIMark, // Set final mark = new AI mark, never exceed maxMarks
        auditTrail: undefined, // Clear old audit trail / codes
      };
    });

    setDraftMarks(resetMarks);
    setConfirmedFlags({}); // Clear flag confirmations
    setAuditReasonCodes({}); // Clear audit codes
    setAuditCustomRemarks({});
    setValidationErrors({});

    const updatedPaper: ExamPaper = {
      ...currentPaper,
      questions: updatedQuestions,
    };
    onUpdatePaper(updatedPaper);
    showToast('Reset AI: cleared old final marks, flags, and audit codes');
  };

  // Save and mark as Reviewed (enforces Requirement 4)
  const handleSaveReviewed = () => {
    if (!currentPaper) return;

    // Check validation errors
    if (Object.keys(validationErrors).length > 0) {
      showToast('Please correct validation warnings before saving');
      return;
    }

    // Requirement 4: Cannot mark "Reviewed" until every flagged question is explicitly confirmed or edited
    if (unconfirmedFlaggedQuestions.length > 0) {
      const qNums = unconfirmedFlaggedQuestions
        .map((q) => `Q${q.questionNumber}${q.partLabel ? ` ${q.partLabel}` : ''}`)
        .join(', ');
      showToast(
        `Cannot mark as Reviewed: Question(s) ${qNums} have unresolved flags. Confirm or adjust marks to proceed.`
      );
      return;
    }

    // Requirement 2: Enforce mandated Reason Code for any modified marks
    const missingAuditQuestions = currentPaper.questions.filter((q, idx) => {
      const key = getQuestionKey(q, idx);
      const finalMark = draftMarks[key] ?? draftMarks[String(q.questionNumber)] ?? q.examinerMark;
      const isModified = finalMark !== q.aiSuggestedMark;
      return isModified && !auditReasonCodes[key] && !auditReasonCodes[String(q.questionNumber)];
    });

    if (missingAuditQuestions.length > 0) {
      const qNums = missingAuditQuestions
        .map((q) => `Q${q.questionNumber}${q.partLabel ? ` ${q.partLabel}` : ''}`)
        .join(', ');
      showToast(
        `Audit Compliance: Please select an Audit Reason Code for Question(s) ${qNums} before marking as Reviewed.`
      );
      return;
    }

    // Log any changed marks with their audit reason
    currentPaper.questions.forEach((q, idx) => {
      const key = getQuestionKey(q, idx);
      const finalMark = draftMarks[key] ?? draftMarks[String(q.questionNumber)] ?? q.examinerMark;
      if (finalMark !== q.aiSuggestedMark) {
        handleCommitMarkCorrectionWithAudit(
          q,
          finalMark,
          auditReasonCodes[key] || auditReasonCodes[String(q.questionNumber)] || 'Other Validated Academic Reason',
          auditCustomRemarks[key] || auditCustomRemarks[String(q.questionNumber)]
        );
      }
    });

    const updatedQuestions = currentPaper.questions.map((q, idx) => {
      const key = getQuestionKey(q, idx);
      const finalMark = draftMarks[key] ?? draftMarks[String(q.questionNumber)] ?? q.examinerMark;
      const isModified = finalMark !== q.aiSuggestedMark;
      return {
        ...q,
        examinerMark: finalMark,
        auditTrail: isModified
          ? {
              originalAIMark: q.aiSuggestedMark,
              revisedExaminerMark: finalMark,
              reasonCode:
                auditReasonCodes[key] ||
                auditReasonCodes[String(q.questionNumber)] ||
                'Other Validated Academic Reason',
              customRemark: auditCustomRemarks[key] || auditCustomRemarks[String(q.questionNumber)] || '',
              examinerId: currentUser?.username || 'exam-001',
              examinerName: currentUser?.name || 'Lead Examiner',
              timestamp: new Date().toISOString(),
            }
          : q.auditTrail,
      };
    });

    const updatedPaper: ExamPaper = {
      ...currentPaper,
      status: 'Reviewed',
      remarks: draftRemarks,
      questions: updatedQuestions,
    };

    onUpdatePaper(updatedPaper);
    showToast(`Saved & Marked as Reviewed: ${currentStudentMeta.name} (FBISE Grade: ${liveFbise.grade}, GPA: ${liveFbise.gpa.toFixed(2)})`);
  };

  const showToast = (msg: string) => {
    setSaveSuccessToast(msg);
    setTimeout(() => {
      setSaveSuccessToast((cur) => (cur === msg ? null : cur));
    }, 3500);
  };

  // Zoom controls
  const handleZoomIn = () => setZoomLevel((prev) => Math.min(Number((prev + 0.25).toFixed(2)), 3.0));
  const handleZoomOut = () => setZoomLevel((prev) => Math.max(Number((prev - 0.25).toFixed(2)), 0.5));
  const handleResetZoom = () => setZoomLevel(1);

  // Active page image URL
  const currentImageSrc = activePaperImages[Math.min(activePageIndex, activePaperImages.length - 1)];

  return (
    <div className="relative w-full min-h-screen bg-slate-50 text-slate-800 flex flex-col justify-between">
      {/* ════════ TOP BANNER ════════ */}
      <header className="relative w-full z-20 shrink-0">
        <div
          className="w-full h-auto py-3 sm:py-4 md:h-28 md:py-0 rounded-b-[24px] sm:rounded-b-[32px] md:rounded-b-[40px] flex flex-col md:flex-row items-center justify-between px-4 sm:px-8 shadow-md relative overflow-hidden gap-3 md:gap-0"
          style={{
            background: 'linear-gradient(90deg, #4DD9E8 0%, #0047AB 100%)',
          }}
        >
          {/* Subtle Top Gloss Accent */}
          <div className="absolute inset-x-0 top-0 h-1/3 bg-white/10 pointer-events-none" />

          {/* Left / Row 1: Back to Menu & User Mode Badge */}
          <div className="flex items-center justify-between w-full md:w-auto gap-3 z-10">
            <button
              onClick={onBackToMenu}
              className="flex items-center gap-2 text-xs sm:text-sm font-rounded font-semibold text-white bg-white/15 hover:bg-white/30 backdrop-blur-xs px-3 sm:px-4 py-2 rounded-full transition-all cursor-pointer shadow-xs active:scale-95 shrink-0"
              title="Return to Main Menu"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Back to Menu</span>
              <span className="sm:hidden">Menu</span>
            </button>
            {currentUser && <UserIdentityBadge user={currentUser} compactOnMobile={true} />}
          </div>

          {/* Center / Row 2: Branding Title */}
          <div className="static md:absolute md:left-1/2 md:-translate-x-1/2 md:top-1/2 md:-translate-y-1/2 flex flex-col items-center text-center z-10 pointer-events-none">
            <h1 className="font-rounded font-bold text-xl sm:text-2xl md:text-3xl text-white tracking-widest uppercase drop-shadow-md">
              PROJECT-001
            </h1>
            <span className="text-[11px] sm:text-xs font-rounded text-white/90 font-medium tracking-wide">
              AI Verification & Grading Studio
            </span>
          </div>

          {/* Right / Row 3: Dedicated Mode Switcher Tabs */}
          <div className="flex items-center justify-center w-full md:w-auto gap-2 sm:gap-3 z-10">
            <div className="flex items-center justify-center w-full md:w-auto bg-black/25 p-1 rounded-full border border-white/20 backdrop-blur-xs shadow-xs">
              <button
                type="button"
                onClick={() => setActiveStudioTab('grading')}
                className={`flex-1 md:flex-initial flex items-center justify-center gap-1.5 px-3 sm:px-3.5 py-1.5 rounded-full text-xs font-rounded font-bold transition-all cursor-pointer ${
                  activeStudioTab === 'grading'
                    ? 'bg-white text-[#0047AB] shadow-md'
                    : 'text-white/90 hover:text-white hover:bg-white/10'
                }`}
              >
                <FileText className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden sm:inline">Answer Scripts</span>
                <span>({papers.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveStudioTab('schemes')}
                className={`flex-1 md:flex-initial flex items-center justify-center gap-1.5 px-3 sm:px-3.5 py-1.5 rounded-full text-xs font-rounded font-bold transition-all cursor-pointer ${
                  activeStudioTab === 'schemes'
                    ? 'bg-white text-[#0047AB] shadow-md'
                    : 'text-white/90 hover:text-white hover:bg-white/10'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden sm:inline">View/Edit Marking Schemes</span>
                <span className="sm:hidden">Schemes</span>
                <span>({localSchemes.length})</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* ════════ MAIN WORKSPACE (SIDEBAR + SIDE-BY-SIDE SPLIT VIEW OR SCHEME EDITOR) ════════ */}
      <main className="flex-1 flex flex-col lg:flex-row gap-5 p-3 sm:p-5 lg:p-6 pb-24 md:pb-6 max-w-[1920px] w-full mx-auto">
        {activeStudioTab === 'schemes' ? (
          /* ──────── DEDICATED MARKING SCHEME EDITOR TAB ──────── */
          <div className="w-full flex flex-col lg:flex-row gap-5">
            {/* Scheme Selector Sidebar */}
            <aside className="w-full lg:w-[320px] xl:w-[350px] shrink-0 flex flex-col gap-4">
              <div className="bg-white rounded-[24px] p-4 shadow-sm border border-slate-200/80 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <BookOpen className="w-5 h-5 text-[#0047AB]" />
                    <h2 className="font-rounded font-bold text-base text-slate-800">
                      Marking Schemes
                    </h2>
                  </div>
                  <span className="text-xs font-rounded font-semibold text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-full">
                    {filteredStandaloneSchemes.length} schemes
                  </span>
                </div>

                {/* Top Action Buttons */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCreateNewDedicatedScheme}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-blue-50 hover:bg-blue-100 text-[#0047AB] font-rounded font-bold text-xs border border-blue-200 transition-all cursor-pointer shadow-2xs active:scale-95"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>New Scheme</span>
                  </button>
                  {/* Delete All button removed */}
                  {papers.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setActiveStudioTab('grading')}
                      className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-rounded font-semibold text-xs transition-all cursor-pointer"
                      title="Switch to Answer Scripts Review"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>Scripts ({papers.length})</span>
                    </button>
                  )}
                </div>

                {/* Search Schemes Input */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search subject or shift..."
                    value={schemeSearch}
                    onChange={(e) => setSchemeSearch(e.target.value)}
                    className="w-full bg-slate-50 text-slate-800 font-rounded text-xs rounded-xl pl-8 pr-3 py-2 outline-none border border-slate-200 focus:border-[#4DD9E8] transition-all"
                  />
                </div>

                {/* Stored Schemes List */}
                <div className="flex flex-col gap-2 max-h-[calc(100vh-320px)] overflow-y-auto pr-1">
                  {filteredStandaloneSchemes.length === 0 ? (
                    <div className="text-center py-8 text-xs text-slate-400 font-rounded">
                      No matching marking schemes found.
                    </div>
                  ) : (
                    filteredStandaloneSchemes.map((scheme) => {
                      const isSelected = scheme.id === selectedStandaloneScheme?.id;
                      const isEve = (scheme.shift || '').toLowerCase().includes('eve');
                      return (
                        <div
                          key={scheme.id}
                          onClick={() => setSelectedSchemeId(scheme.id)}
                          className={`p-3 rounded-2xl border text-left transition-all cursor-pointer group ${
                            isSelected
                              ? 'bg-blue-50/90 border-[#0047AB] shadow-xs'
                              : 'bg-slate-50/60 hover:bg-slate-100/80 border-slate-200/80'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1 mb-1">
                            <span className="font-rounded font-bold text-xs text-slate-900 truncate">
                              {scheme.subject}
                            </span>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                  isEve
                                    ? 'bg-indigo-100 text-indigo-800'
                                    : 'bg-amber-100 text-amber-800'
                                }`}
                              >
                                {isEve ? 'Evening' : 'Morning'}
                              </span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openDeleteSchemeConfirm(scheme.id, scheme.title || scheme.subject);
                                }}
                                className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                title="Delete Marking Scheme"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                          <p className="text-[11px] text-slate-500 font-rounded truncate mb-1.5">
                            {scheme.title}
                          </p>
                          <div className="flex items-center justify-between text-[10px] font-mono text-slate-500">
                            <span>{scheme.questions.length} Questions</span>
                            <span className="font-bold text-[#0047AB] bg-white px-1.5 py-0.2 rounded border border-blue-100">
                              {scheme.totalMarks || 80} Marks
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </aside>

            {/* Main Scheme Content Workspace */}
            <section className="flex-1 flex flex-col gap-4">
              {selectedStandaloneScheme ? (
                <>
                  {/* Scheme Header Card */}
                  <div className="bg-white rounded-[24px] p-5 shadow-sm border border-slate-200/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2 mb-1.5">
                        <h2 className="font-rounded font-bold text-xl sm:text-2xl text-slate-900">
                          {selectedStandaloneScheme.subject}
                        </h2>
                        <span
                          className={`text-xs font-rounded font-bold px-3 py-1 rounded-full ${
                            (selectedStandaloneScheme.shift || '').toLowerCase().includes('eve')
                              ? 'bg-indigo-100 text-indigo-800 border border-indigo-200'
                              : 'bg-amber-100 text-amber-800 border border-amber-200'
                          }`}
                        >
                          {(selectedStandaloneScheme.shift || '').toLowerCase().includes('eve')
                            ? 'Evening Shift (Group 2)'
                            : 'Morning Shift (Group 1)'}
                        </span>
                        <span className="text-xs font-mono font-bold bg-blue-50 text-[#0047AB] border border-blue-200 px-3 py-1 rounded-full">
                          {schemeTotalMarks} Total Marks
                        </span>
                      </div>
                      <p className="text-xs font-rounded text-slate-500">
                        {selectedStandaloneScheme.title} • {selectedStandaloneScheme.examSession}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center flex-wrap">
                      <button
                        type="button"
                        onClick={() => openDeleteSchemeConfirm(selectedStandaloneScheme.id, selectedStandaloneScheme.title || selectedStandaloneScheme.subject)}
                        className="px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 font-rounded font-bold text-xs border border-rose-200 transition-all cursor-pointer flex items-center gap-1.5"
                        title="Delete this marking scheme"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                        <span className="hidden sm:inline">Delete Scheme</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedSchemeIdForManager(selectedStandaloneScheme.id);
                          setIsMarkingSchemeOpen(true);
                        }}
                        className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-rounded font-bold text-xs transition-all cursor-pointer flex items-center gap-1.5"
                      >
                        <Cpu className="w-3.5 h-3.5 text-cyan-600" />
                        <span>Advanced Tools</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSaveDedicatedScheme(selectedStandaloneScheme)}
                        className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-rounded font-bold text-xs shadow-md transition-all cursor-pointer flex items-center gap-1.5 active:scale-95"
                      >
                        <Save className="w-3.5 h-3.5" />
                        <span>Save Scheme Changes</span>
                      </button>
                    </div>
                  </div>

                  {/* Section Filter Pills */}
                  <div className="flex items-center gap-2 bg-slate-100 p-1.5 rounded-2xl w-fit border border-slate-200/80 flex-wrap">
                    <button
                      type="button"
                      onClick={() => setSchemeSectionFilter('all')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-rounded font-bold transition-all cursor-pointer ${
                        schemeSectionFilter === 'all'
                          ? 'bg-white text-[#0047AB] shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      All Questions ({sectionCounts.all} • {sectionCounts.totalMarks} Marks)
                    </button>
                    <button
                      type="button"
                      onClick={() => setSchemeSectionFilter('section-a')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-rounded font-bold transition-all cursor-pointer ${
                        schemeSectionFilter === 'section-a'
                          ? 'bg-white text-[#0047AB] shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Section A: MCQs ({sectionCounts.a} • {sectionCounts.aMarks} Marks)
                    </button>
                    <button
                      type="button"
                      onClick={() => setSchemeSectionFilter('section-b')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-rounded font-bold transition-all cursor-pointer ${
                        schemeSectionFilter === 'section-b'
                          ? 'bg-white text-[#0047AB] shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Section B: Short Qs ({sectionCounts.b} • {sectionCounts.bMarks} Marks)
                    </button>
                    <button
                      type="button"
                      onClick={() => setSchemeSectionFilter('section-c')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-rounded font-bold transition-all cursor-pointer ${
                        schemeSectionFilter === 'section-c'
                          ? 'bg-white text-[#0047AB] shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Section C: Long Qs ({sectionCounts.c} • {sectionCounts.cMarks} Marks)
                    </button>
                  </div>

                  {/* Questions List */}
                  <div className="flex flex-col gap-4 overflow-y-auto max-h-[calc(100vh-280px)] pr-1">
                    {filteredStandaloneQuestions.length === 0 ? (
                      <div className="bg-white rounded-[24px] p-12 text-center border border-slate-200/80 flex flex-col items-center justify-center gap-2">
                        <FileText className="w-10 h-10 text-slate-300" />
                        <h3 className="font-rounded font-bold text-base text-slate-700">
                          No questions in this section
                        </h3>
                        <p className="text-xs text-slate-400 font-rounded max-w-sm">
                          This examination paper does not contain any questions for {schemeSectionFilter === 'section-a' ? 'Section A' : schemeSectionFilter === 'section-b' ? 'Section B' : 'Section C'}.
                        </p>
                      </div>
                    ) : (
                      filteredStandaloneQuestions.map((q, idx) => {
                        const qKey = q.id || `${q.section || ''}_${q.questionNumber}_${q.partLabel || ''}_${idx}`;
                        const isMcq = q.section === 'A' || q.questionType === 'mcq' || (q as any).type === 'mcq';
                        const isShort = q.section === 'B' || q.questionType === 'short' || q.maxMarks === 3;
                        const isLong = q.section === 'C' || q.questionType === 'long' || q.maxMarks >= 6;
                        const currentOption = getMcqSelectedOption(q);
                        const displayTitle = q.section === 'B'
                          ? `Q2 ${q.partLabel || `(${idx + 1})`}`
                          : `Q${q.questionNumber}`;

                        return (
                          <div
                            key={qKey}
                            className="bg-white rounded-[24px] p-5 border border-slate-200/80 shadow-xs flex flex-col gap-3.5"
                          >
                            {/* Question Header */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-mono font-bold text-sm bg-slate-100 text-slate-800 px-2.5 py-1 rounded-lg">
                                  {displayTitle}
                                </span>
                                <span className="text-xs font-rounded font-bold text-[#0047AB]">
                                  {isMcq
                                    ? 'Section A • Multiple Choice'
                                    : isShort
                                    ? `Section B • Short Answer ${q.partLabel ? `Part ${q.partLabel}` : ''}`
                                    : `Section C • Long Question ${q.questionNumber}`}
                                </span>
                                {q.hasOrChoice && (
                                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-200">
                                    OR Choice
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center gap-2">
                                <div className="flex items-center gap-1.5 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-lg">
                                  <span className="font-mono font-bold text-xs text-[#0047AB]">Max:</span>
                                  <input
                                    type="number"
                                    step="0.5"
                                    min="0.5"
                                    max="100"
                                    value={q.maxMarks}
                                    onChange={(e) =>
                                      handleUpdateQuestionField(
                                        selectedStandaloneScheme,
                                        qKey,
                                        'maxMarks',
                                        e.target.value
                                      )
                                    }
                                    className="w-14 text-center font-mono font-bold text-xs text-[#0047AB] bg-white border border-blue-300 rounded px-1 py-0.5 outline-none focus:ring-1 focus:ring-[#0047AB]"
                                  />
                                  <span className="font-mono font-bold text-xs text-[#0047AB]">
                                    Mark{q.maxMarks !== 1 ? 's' : ''}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Left vs OR Tab Switcher if question has OR choice */}
                            {q.hasOrChoice && (
                              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
                                <button
                                  type="button"
                                  onClick={() => setQuestionSubTab((prev) => ({ ...prev, [qKey]: 'left' }))}
                                  className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-rounded font-bold transition-all cursor-pointer ${
                                    (questionSubTab[qKey] || 'left') === 'left'
                                      ? 'bg-white text-[#0047AB] shadow-xs border border-blue-200'
                                      : 'text-slate-600 hover:text-slate-900'
                                  }`}
                                >
                                  Left Question Rubric
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setQuestionSubTab((prev) => ({ ...prev, [qKey]: 'or' }))}
                                  className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-rounded font-bold transition-all cursor-pointer ${
                                    questionSubTab[qKey] === 'or'
                                      ? 'bg-purple-600 text-white shadow-xs'
                                      : 'text-purple-700 hover:text-purple-900'
                                  }`}
                                >
                                  OR Alternative Rubric
                                </button>
                              </div>
                            )}

                            {/* Render active side (Left vs OR) */}
                            {q.hasOrChoice && questionSubTab[qKey] === 'or' ? (
                              /* ── OR ALTERNATIVE CHOICE RUBRIC ── */
                              <>
                                <div>
                                  <div className="flex items-center justify-between mb-1">
                                    <label className="text-[11px] font-rounded font-bold uppercase text-purple-800">
                                      OR Alternative Question Statement (Right Choice)
                                    </label>
                                    <span className="text-[10px] font-rounded text-purple-600">
                                      Right choice wording only
                                    </span>
                                  </div>
                                  <textarea
                                    rows={2}
                                    value={q.orChoice?.questionText || ''}
                                    onChange={(e) =>
                                      handleUpdateOrChoiceField(
                                        selectedStandaloneScheme,
                                        qKey,
                                        'questionText',
                                        e.target.value
                                      )
                                    }
                                    placeholder="Enter OR alternative question statement..."
                                    className="w-full bg-purple-50/50 border border-purple-200 text-slate-800 font-rounded text-xs rounded-xl p-3 outline-none focus:border-purple-400"
                                  />
                                </div>

                                <div>
                                  <label className="block text-[11px] font-rounded font-bold uppercase text-purple-800 mb-1">
                                    {isMcq ? 'OR Option Rationale' : 'OR Model Answer & Key Concepts'}
                                  </label>
                                  <textarea
                                    rows={2}
                                    value={q.orChoice?.modelAnswer || ''}
                                    onChange={(e) =>
                                      handleUpdateOrChoiceField(
                                        selectedStandaloneScheme,
                                        qKey,
                                        'modelAnswer',
                                        e.target.value
                                      )
                                    }
                                    placeholder="Enter model answer for OR choice..."
                                    className="w-full bg-purple-50/50 border border-purple-200 text-slate-800 font-rounded text-xs rounded-xl p-3 outline-none focus:border-purple-400"
                                  />
                                </div>

                                {!isMcq && (
                                  <div className="pt-2 border-t border-purple-100">
                                    <span className="block text-[11px] font-rounded font-bold uppercase text-purple-800 mb-2">
                                      OR Rubric Tier Levels (Independent Rubric)
                                    </span>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                      {(q.orChoice?.rubricLevels || [
                                        { id: `${qKey}-or-l1`, levelNumber: 1, title: `Full (${q.maxMarks} Marks)`, description: 'Complete & correct answer to OR question.', marks: q.maxMarks },
                                        { id: `${qKey}-or-l2`, levelNumber: 2, title: `Substantial (${Math.max(1, Math.round(q.maxMarks * 0.67))} Marks)`, description: 'Substantially correct answer to OR question.', marks: Math.max(1, Math.round(q.maxMarks * 0.67)) },
                                        { id: `${qKey}-or-l3`, levelNumber: 3, title: `Minimal (${Math.max(1, Math.round(q.maxMarks * 0.33))} Marks)`, description: 'Partial or minimal steps for OR question.', marks: Math.max(1, Math.round(q.maxMarks * 0.33)) },
                                        { id: `${qKey}-or-l4`, levelNumber: 4, title: 'Zero (0 Marks)', description: 'Incorrect or unreadable answer to OR question.', marks: 0 },
                                      ]).map((lvl, lIdx) => (
                                        <div
                                          key={lvl.id || lIdx}
                                          className="p-2.5 rounded-xl border border-purple-200 bg-purple-50/40 flex flex-col gap-1 text-xs"
                                        >
                                          <div className="flex items-center justify-between">
                                            <span className="font-bold text-purple-950 text-[11px]">
                                              {lvl.title || `Level ${lvl.levelNumber}`}
                                            </span>
                                            <div className="flex items-center gap-1 bg-purple-100 border border-purple-300 px-1.5 py-0.5 rounded">
                                              <input
                                                type="number"
                                                step="0.5"
                                                min="0"
                                                max={q.maxMarks}
                                                value={lvl.marks}
                                                onChange={(e) => {
                                                  const val = parseFloat(e.target.value) || 0;
                                                  handleUpdateOrRubricLevelMark(
                                                    selectedStandaloneScheme,
                                                    qKey,
                                                    lvl.id,
                                                    val
                                                  );
                                                }}
                                                className="w-12 text-center font-mono font-bold text-xs text-purple-900 bg-white border border-purple-300 rounded outline-none"
                                              />
                                              <span className="font-mono font-bold text-purple-900 text-[10px]">
                                                Mark{lvl.marks !== 1 ? 's' : ''}
                                              </span>
                                            </div>
                                          </div>
                                          <input
                                            type="text"
                                            value={lvl.description}
                                            onChange={(e) =>
                                              handleUpdateOrRubricLevelDesc(
                                                selectedStandaloneScheme,
                                                qKey,
                                                lvl.id,
                                                e.target.value
                                              )
                                            }
                                            className="bg-white border border-purple-200 rounded-lg p-1.5 text-[11px] text-slate-700 outline-none focus:border-purple-400"
                                          />
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </>
                            ) : (
                              /* ── LEFT MAIN QUESTION RUBRIC ── */
                              <>
                                <div>
                                  <div className="flex items-center justify-between mb-1">
                                    <label className="text-[11px] font-rounded font-bold uppercase text-slate-500">
                                      {q.hasOrChoice ? 'Main Question Statement (Left Choice)' : 'Question Statement'}
                                    </label>
                                    {q.hasOrChoice && (
                                      <span className="text-[10px] font-rounded text-slate-400">
                                        Left question wording only
                                      </span>
                                    )}
                                  </div>
                                  <textarea
                                    rows={2}
                                    value={q.questionText}
                                    onChange={(e) =>
                                      handleUpdateQuestionField(
                                        selectedStandaloneScheme,
                                        qKey,
                                        'questionText',
                                        e.target.value
                                      )
                                    }
                                    className="w-full bg-slate-50 border border-slate-200 text-slate-800 font-rounded text-xs rounded-xl p-3 outline-none focus:border-[#4DD9E8]"
                                  />
                                </div>

                                {/* Section A: MCQ Correct Option Selector Buttons */}
                                {isMcq && (
                                  <div className="bg-emerald-50/70 border border-emerald-200 p-3.5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                    <div className="flex items-center gap-2">
                                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                                      <div>
                                        <span className="text-xs font-rounded font-bold text-emerald-950 block">
                                          Official Correct Option Key:
                                        </span>
                                        <span className="text-[11px] text-emerald-700">
                                          Click option below to set answer key for AI validation
                                        </span>
                                      </div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                      {(['A', 'B', 'C', 'D'] as const).map((opt) => {
                                        const isChosen = currentOption === opt;
                                        return (
                                          <button
                                            key={opt}
                                            type="button"
                                            onClick={() =>
                                              handleUpdateMcqOption(
                                                selectedStandaloneScheme,
                                                qKey,
                                                opt
                                              )
                                            }
                                            className={`w-9 h-9 rounded-xl font-mono font-black text-sm flex items-center justify-center transition-all cursor-pointer ${
                                              isChosen
                                                ? 'bg-emerald-600 text-white shadow-md scale-105 border border-emerald-700'
                                                : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-100 hover:border-emerald-400'
                                            }`}
                                          >
                                            {opt}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}

                                {/* Model Answer / Description */}
                                <div>
                                  <label className="block text-[11px] font-rounded font-bold uppercase text-slate-500 mb-1">
                                    {isMcq ? 'Answer Key Rationale / Law' : 'Model Answer & Key Concepts'}
                                  </label>
                                  <textarea
                                    rows={2}
                                    value={q.modelAnswer || ''}
                                    onChange={(e) =>
                                      handleUpdateQuestionField(
                                        selectedStandaloneScheme,
                                        qKey,
                                        'modelAnswer',
                                        e.target.value
                                      )
                                    }
                                    className="w-full bg-slate-50 border border-slate-200 text-slate-800 font-rounded text-xs rounded-xl p-3 outline-none focus:border-[#4DD9E8]"
                                  />
                                </div>

                                {/* Rubric Levels for Short / Long Questions */}
                                {!isMcq && q.rubricLevels && q.rubricLevels.length > 0 && (
                                  <div className="pt-2 border-t border-slate-100">
                                    <span className="block text-[11px] font-rounded font-bold uppercase text-slate-500 mb-2">
                                      Grading Rubric Tier Levels (FBISE Standard)
                                    </span>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                      {q.rubricLevels.map((lvl, lIdx) => (
                                        <div
                                          key={lvl.id || lIdx}
                                          className="p-2.5 rounded-xl border border-slate-200 bg-slate-50 flex flex-col gap-1 text-xs"
                                        >
                                          <div className="flex items-center justify-between">
                                            <span className="font-bold text-slate-800 text-[11px]">
                                              {lvl.title || `Level ${lvl.levelNumber}`}
                                            </span>
                                            <div className="flex items-center gap-1 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded">
                                              <input
                                                type="number"
                                                step="0.5"
                                                min="0"
                                                max={q.maxMarks}
                                                value={lvl.marks}
                                                onChange={(e) => {
                                                  const val = parseFloat(e.target.value) || 0;
                                                  handleUpdateRubricLevelMark(
                                                    selectedStandaloneScheme,
                                                    qKey,
                                                    lvl.id,
                                                    val
                                                  );
                                                }}
                                                className="w-12 text-center font-mono font-bold text-xs text-[#0047AB] bg-white border border-blue-300 rounded outline-none"
                                              />
                                              <span className="font-mono font-bold text-[#0047AB] text-[10px]">
                                                Mark{lvl.marks !== 1 ? 's' : ''}
                                              </span>
                                            </div>
                                          </div>
                                          <input
                                            type="text"
                                            value={lvl.description}
                                            onChange={(e) =>
                                              handleUpdateRubricLevelDesc(
                                                selectedStandaloneScheme,
                                                qKey,
                                                lvl.id,
                                                e.target.value
                                              )
                                            }
                                            className="bg-white border border-slate-200 rounded-lg p-1.5 text-[11px] text-slate-700 outline-none"
                                          />
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </>
              ) : (
                <div className="bg-white rounded-[24px] p-12 text-center border border-slate-200/80 flex flex-col items-center justify-center gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-blue-50 border border-blue-100 text-[#0047AB] flex items-center justify-center">
                    <BookOpen className="w-8 h-8" />
                  </div>
                  <div>
                    <h3 className="font-rounded font-bold text-lg text-slate-800">
                      {localSchemes.length === 0 ? 'No Marking Schemes Available' : 'No Marking Scheme Selected'}
                    </h3>
                    <p className="text-xs text-slate-500 max-w-md font-rounded mt-1">
                      {localSchemes.length === 0
                        ? 'No Marking Schemes Available. Upload a Question Paper to create one.'
                        : 'Select a scheme from the left panel or click "+ New Scheme" to create an official examination marking rubric.'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <button
                      type="button"
                      onClick={handleCreateNewDedicatedScheme}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0047AB] hover:bg-[#003882] text-white font-rounded font-bold text-xs shadow-md transition-all cursor-pointer active:scale-95"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Create Scheme Manually</span>
                    </button>
                    <button
                      type="button"
                      onClick={onBackToMenu}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-rounded font-bold text-xs transition-all cursor-pointer"
                    >
                      <span>Back to Upload Desk</span>
                    </button>
                  </div>
                </div>
              )}
            </section>
          </div>
        ) : (
          /* ──────── STUDENT ANSWER SCRIPTS GRADING WORKSPACE ──────── */
          <>
            {/* ──────── LEFT SIDEBAR: PAPERS LIST (SORTED: FLAGGED & IDENTITY FIRST) ──────── */}
            <aside className="w-full lg:w-[320px] xl:w-[350px] shrink-0 flex flex-col gap-4">
              <div className="bg-white rounded-[24px] p-4 shadow-sm border border-slate-200/80 flex flex-col gap-3">
                {/* Dedicated Marking Scheme Toggle Button in Sidebar */}
                <button
                  type="button"
                  onClick={() => setActiveStudioTab('schemes')}
                  className="w-full flex items-center justify-between p-3 rounded-2xl border border-blue-200/80 bg-blue-50/70 hover:bg-blue-100/70 text-xs font-rounded font-bold text-[#0047AB] transition-all cursor-pointer shadow-2xs"
                >
                  <div className="flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-[#0047AB]" />
                    <span>View/Edit Marking Schemes</span>
                  </div>
                  <span className="bg-[#0047AB] text-white text-[10px] px-2 py-0.5 rounded-full font-mono font-bold">
                    {localSchemes.length} Schemes
                  </span>
                </button>

                <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                  <div className="flex items-center gap-2">
                    <FileText className="w-5 h-5 text-[#0047AB]" />
                    <h2 className="font-rounded font-bold text-base text-slate-800">
                      Exam Papers
                    </h2>
                  </div>
                  <span className="text-xs font-rounded font-semibold text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-full">
                    {sortedAndFilteredPapers.length} scripts
                  </span>
                </div>

            {/* ──────── SHIFT CATEGORIZATION TABS (Morning Group 1 vs Evening Group 2) ──────── */}
            <div className="flex items-center p-1 bg-slate-100 rounded-2xl text-xs font-rounded font-bold border border-slate-200/60">
              <button
                onClick={() => setActiveShiftTab('morning')}
                className={`flex-1 py-1.5 px-2.5 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  activeShiftTab === 'morning'
                    ? 'bg-amber-500 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>Morning (Group 1)</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${activeShiftTab === 'morning' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'}`}>
                  {morningPapersCount}
                </span>
              </button>
              <button
                onClick={() => setActiveShiftTab('evening')}
                className={`flex-1 py-1.5 px-2.5 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  activeShiftTab === 'evening'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>Evening (Group 2)</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${activeShiftTab === 'evening' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'}`}>
                  {eveningPapersCount}
                </span>
              </button>
              <button
                onClick={() => setActiveShiftTab('all')}
                className={`py-1.5 px-2 rounded-xl transition-all text-center cursor-pointer ${
                  activeShiftTab === 'all'
                    ? 'bg-slate-800 text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
                title="View all shifts"
              >
                All
              </button>
            </div>

            {/* Search Input */}
            <div className="relative w-full">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search candidate, roll, subject..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-100 focus:bg-white text-slate-800 font-rounded text-xs rounded-full pl-9 pr-3 py-2 outline-none border border-transparent focus:border-[#4DD9E8] transition-all placeholder:text-slate-400"
              />
            </div>

            {/* Status Filter Tabs (includes "Flagged Only") */}
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl text-[11px] font-rounded font-semibold overflow-x-auto">
              {(['All', 'Flagged Only', 'Pending Review', 'Reviewed'] as const).map((filter) => (
                <button
                  key={filter}
                  onClick={() => setStatusFilter(filter)}
                  className={`flex-1 py-1 px-2 rounded-lg transition-all text-center whitespace-nowrap cursor-pointer ${
                    statusFilter === filter
                      ? 'bg-white text-[#0047AB] shadow-xs font-bold'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {filter}
                </button>
              ))}
            </div>

            {/* List of Clickable Paper Rows */}
            <div className="flex flex-col gap-2 max-h-[calc(100vh-280px)] overflow-y-auto pr-1">
              {sortedAndFilteredPapers.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-xs font-rounded">
                  No exam papers match your filter.
                </div>
              ) : (
                sortedAndFilteredPapers.map((paper) => {
                  const isSelected = paper.id === currentPaper?.id;
                  const studentMeta = getStudentForPaper(paper);
                  const flaggedCount = paper.questions.filter(
                    (q) => q.gradingResult?.flag_for_review
                  ).length;
                  const isIdentityIssue = paper.status === 'Identity Check Needed';

                  return (
                    <motion.div
                      key={paper.id}
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                      onClick={() => setSelectedPaperId(paper.id)}
                      className={`p-3 rounded-2xl cursor-pointer transition-all border text-left relative ${
                        isSelected
                          ? 'bg-gradient-to-r from-teal-50/90 to-blue-50/90 border-[#4DD9E8] shadow-sm ring-2 ring-[#4DD9E8]/30'
                          : 'bg-white hover:bg-slate-50 border-slate-200/80 shadow-2xs'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-1.5 mb-1">
                        <span className="font-rounded font-bold text-sm text-slate-900 line-clamp-1">
                          {studentMeta.name}
                        </span>
                        {/* Status Badge */}
                        <span
                          className={`text-[9px] font-rounded font-bold px-1.5 py-0.5 rounded-full shrink-0 border ${
                            paper.status === 'Reviewed'
                              ? 'bg-emerald-100 text-emerald-800 border-emerald-300/60'
                              : isIdentityIssue
                              ? 'bg-orange-100 text-orange-800 border-orange-300 animate-pulse'
                              : paper.status === 'AI Failed - Manual Grading'
                              ? 'bg-rose-100 text-rose-800 border-rose-300'
                              : 'bg-amber-100 text-amber-800 border-amber-300'
                          }`}
                        >
                          {paper.status}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 text-xs font-rounded text-slate-500 mb-1">
                        <BookOpen className="w-3 h-3 text-slate-400 shrink-0" />
                        <span className="line-clamp-1">{paper.subject}</span>
                      </div>

                      <div className="flex items-center justify-between text-[11px] font-rounded text-slate-400">
                        <span className="font-mono text-[10px]">{studentMeta.roll}</span>
                        <div className="flex items-center gap-1.5">
                          {flaggedCount > 0 && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200">
                              <AlertTriangle className="w-2.5 h-2.5 text-amber-600" />
                              <span>{flaggedCount} flag</span>
                            </span>
                          )}
                          <span>
                            Score:{' '}
                            <strong className="text-slate-700">
                              {paper.questions.reduce((sum, q) => sum + q.examinerMark, 0)}/
                              {paper.questions.reduce((sum, q) => sum + q.maxMarks, 0)}
                            </strong>
                          </span>
                          {onDeletePaper && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                 setPaperDeleteConfirm({ 
                                   isOpen: true, 
                                   paperId: paper.id, 
                                   studentName: studentMeta.name 
                                 });
                              }}
                              className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors ml-1 cursor-pointer"
                              title="Delete this paper"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  );
                })
              )}
            </div>
          </div>
        </aside>

        {/* ──────── DETAIL AREA: SIDE-BY-SIDE SPLIT VIEW (IMAGE VIEWER + GRADING TABLE) ──────── */}
        <section className="flex-1 flex flex-col gap-4">
          {currentPaper ? (
            <>
              {/* Paper Top Header & Action Controls Bar */}
              <div className="bg-white rounded-[24px] p-4 sm:p-5 shadow-sm border border-slate-200/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2.5 mb-1">
                    <h2 className="font-rounded font-bold text-xl sm:text-2xl text-slate-900">
                      {currentStudentMeta.name}
                    </h2>
                    <span
                      className={`text-xs font-rounded font-bold px-2.5 py-0.5 rounded-full border ${
                        currentPaper.status === 'Reviewed'
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                          : currentPaper.status === 'Identity Check Needed'
                          ? 'bg-orange-100 text-orange-800 border-orange-300'
                          : currentPaper.status === 'AI Failed - Manual Grading'
                          ? 'bg-rose-100 text-rose-800 border-rose-300'
                          : 'bg-amber-100 text-amber-800 border-amber-300'
                      }`}
                    >
                      {currentPaper.status}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-rounded text-slate-500">
                    <span className="flex items-center gap-1">
                      <Hash className="w-3.5 h-3.5 text-slate-400" />
                      <span className="font-mono">{currentStudentMeta.roll}</span>
                    </span>
                    <span className="flex items-center gap-1">
                      <BookOpen className="w-3.5 h-3.5 text-slate-400" />
                      <span>{currentPaper.subject}</span>
                    </span>
                    <span className="flex items-center gap-1">
                      <User className="w-3.5 h-3.5 text-slate-400" />
                      <span>{currentStudentMeta.class}</span>
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      <span>Date: {currentPaper.dateSubmitted}</span>
                    </span>
                  </div>
                </div>

                {/* Score & Re-run AI Grading Action */}
                <div className="flex items-center gap-3 self-end sm:self-center">
                  {/* Requirement 6: Re-run AI Grading button */}
                  <button
                    type="button"
                    onClick={() => handleReRunAIGrading(currentPaper)}
                    disabled={isRetryingAI || retryCooldown > 0}
                    className="flex items-center gap-1.5 text-xs font-rounded font-bold text-white bg-gradient-to-r from-[#4DD9E8] to-[#0047AB] hover:opacity-90 px-4 py-2 rounded-full transition-all cursor-pointer shadow-sm active:scale-95 disabled:opacity-50"
                    title="Re-run AI Transcription & Grading pipeline on this paper"
                  >
                    {isRetryingAI ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Grading...</span>
                      </>
                    ) : retryCooldown > 0 ? (
                      <>
                        <Clock className="w-3.5 h-3.5" />
                        <span>Retry in {retryCooldown}s</span>
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 text-cyan-200" />
                        <span>Re-run AI Grading</span>
                      </>
                    )}
                  </button>

                  {/* Running Total & FBISE 10-Point GPA Badge */}
                  <div
                    className="rounded-2xl p-3 text-white text-right shrink-0 shadow-sm min-w-[155px]"
                    style={{
                      background: 'linear-gradient(135deg, #4DD9E8 0%, #0047AB 100%)',
                    }}
                  >
                    <div className="flex items-center justify-between text-[10px] uppercase tracking-wider font-rounded font-semibold text-white/90">
                      <span>FBISE {liveFbise.grade}</span>
                      <span>GPA {liveFbise.gpa.toFixed(2)}</span>
                    </div>
                    <div className="font-rounded font-bold text-xl text-white leading-tight mt-0.5">
                      {currentTotal}{' '}
                      <span className="text-xs font-normal text-white/80">/ {maxTotal}</span>
                      <span className="text-[11px] font-medium text-white/90 ml-1.5">
                        ({liveFbise.percentage}%)
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* ──────── REQUIREMENT 5: IDENTITY CHECK NEEDED BANNER ──────── */}
              {currentPaper.status === 'Identity Check Needed' && (
                <div className="bg-amber-50 border-2 border-amber-300 rounded-[24px] p-5 shadow-sm flex flex-col gap-3">
                  <div className="flex items-start gap-3">
                    <ShieldAlert className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="font-rounded font-bold text-base text-amber-950">
                          Identity Check Needed — Roll Number Discrepancy
                        </h4>
                        <span className="text-[11px] font-rounded font-bold bg-amber-200 text-amber-900 px-2 py-0.5 rounded-full">
                          Action Required
                        </span>
                      </div>
                      <p className="text-xs font-rounded text-amber-800 mt-1">
                        {currentPaper.aiGradingDetails?.identityCheck?.mismatchReason ||
                          'The candidate roll number read from the paper header does not match the student record selected during upload.'}
                      </p>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3 p-3 bg-white/80 rounded-xl border border-amber-200 text-xs font-rounded">
                        <div>
                          <span className="text-slate-500 block text-[11px] font-semibold">
                            Roll Number Read on Paper Script:
                          </span>
                          <span className="font-mono text-base font-bold text-amber-900">
                            {currentPaper.aiGradingDetails?.identityCheck?.paperRollNumber || 'Unreadable'}
                          </span>
                          {currentPaper.aiGradingDetails?.identityCheck?.paperStudentName && (
                            <span className="text-slate-600 block text-[11px]">
                              Candidate Header Name: {currentPaper.aiGradingDetails.identityCheck.paperStudentName}
                            </span>
                          )}
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[11px] font-semibold">
                            Selected Student in Batch:
                          </span>
                          <span className="font-bold text-slate-800 text-sm">
                            {currentPaper.aiGradingDetails?.identityCheck?.selectedStudentName || currentStudentMeta.name}{' '}
                            <span className="font-mono text-slate-500">
                              ({currentPaper.aiGradingDetails?.identityCheck?.selectedStudentRoll || currentStudentMeta.roll})
                            </span>
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Actions: Confirm Match OR Reassign to Another Student */}
                  <div className="pt-3 border-t border-amber-200 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleConfirmIdentityMatch}
                        className="flex items-center gap-1.5 text-xs font-rounded font-bold text-white bg-emerald-600 hover:bg-emerald-700 px-4 py-2 rounded-full transition-all cursor-pointer shadow-xs active:scale-95"
                      >
                        <ShieldCheck className="w-3.5 h-3.5" />
                        <span>Confirm Match (Override Warning)</span>
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs font-rounded font-semibold text-amber-950">
                        Or Reassign to:
                      </span>
                      <select
                        value={selectedAssignStudentId}
                        onChange={(e) => setSelectedAssignStudentId(e.target.value)}
                        className="text-xs font-rounded bg-white border border-amber-300 rounded-xl px-3 py-1.5 text-slate-800 outline-none"
                      >
                        {students.map((st) => (
                          <option key={st.id} value={st.id}>
                            {st.fullName} ({st.rollNumber})
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => handleReassignStudent(selectedAssignStudentId)}
                        className="flex items-center gap-1.5 text-xs font-rounded font-bold text-white bg-amber-600 hover:bg-amber-700 px-4 py-2 rounded-full transition-all cursor-pointer shadow-xs active:scale-95"
                      >
                        <span>Reassign Student</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* ──────── AI FAILED BANNER ──────── */}
              {currentPaper.status === 'AI Failed - Manual Grading' && (
                <div className="bg-rose-50 border border-rose-200 rounded-[24px] p-4 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-rounded font-bold text-sm text-rose-900">
                        AI Grading Interrupted — Manual Grading Mode
                      </h4>
                      <p className="text-xs font-rounded text-rose-700 mt-0.5">
                        {currentPaper.aiGradingDetails?.error ||
                          'Automated scoring could not complete. You can enter marks manually or re-run grading.'}
                      </p>
                      {retryError && (
                        <p className="text-xs font-rounded font-semibold text-rose-800 mt-1">
                          Retry failed: {retryError}
                        </p>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleReRunAIGrading(currentPaper)}
                    disabled={isRetryingAI || retryCooldown > 0}
                    className="flex items-center gap-1.5 text-xs font-rounded font-bold text-white bg-rose-600 hover:bg-rose-700 px-4 py-2 rounded-full transition-all cursor-pointer shadow-xs active:scale-95 disabled:opacity-50 shrink-0"
                  >
                    {retryCooldown > 0 ? (
                      <>
                        <Clock className="w-3.5 h-3.5" />
                        <span>Retry in {retryCooldown}s</span>
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Retry AI Pipeline</span>
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* ════════ REQUIREMENT 1: SIDE-BY-SIDE SPLIT VIEW ════════ */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                {/* ──────── LEFT SIDE: REAL UPLOADED PAGE IMAGES WITH ZOOM & PAGE NAV ──────── */}
                <div className="lg:col-span-6 xl:col-span-5 bg-white rounded-[24px] p-4 shadow-sm border border-slate-200/80 flex flex-col gap-3 lg:sticky lg:top-4">
                  {/* Viewer Controls Toolbar */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100">
                    <div className="flex items-center gap-1.5">
                      <FileText className="w-4 h-4 text-[#0047AB]" />
                      <span className="font-rounded font-bold text-xs sm:text-sm text-slate-800">
                        Answer Script Viewer
                      </span>
                    </div>

                    {/* Zoom & Inspection Controls */}
                    <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
                      <button
                        type="button"
                        onClick={handleZoomOut}
                        className="w-7 h-7 rounded-lg bg-white hover:bg-slate-200 text-slate-700 flex items-center justify-center transition-all cursor-pointer shadow-2xs"
                        title="Zoom Out"
                      >
                        <ZoomOut className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={handleResetZoom}
                        className="px-2 h-7 rounded-lg bg-white hover:bg-slate-200 text-[11px] font-rounded font-bold text-slate-700 flex items-center justify-center transition-all cursor-pointer shadow-2xs"
                        title="Reset to 100%"
                      >
                        {Math.round(zoomLevel * 100)}%
                      </button>
                      <button
                        type="button"
                        onClick={handleZoomIn}
                        className="w-7 h-7 rounded-lg bg-white hover:bg-slate-200 text-slate-700 flex items-center justify-center transition-all cursor-pointer shadow-2xs"
                        title="Zoom In"
                      >
                        <ZoomIn className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsImageLightboxOpen(true)}
                        className="w-7 h-7 rounded-lg bg-white hover:bg-slate-200 text-[#0047AB] flex items-center justify-center transition-all cursor-pointer shadow-2xs ml-0.5"
                        title="Expand Fullscreen Lightbox"
                      >
                        <Maximize2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Multi-page Navigation Bar */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
                      {activePaperImages.map((_, idx) => (
                        <button
                          key={`script-page-tab-${currentPaper?.id || 'paper'}-${idx}`}
                          type="button"
                          onClick={() => setActivePageIndex(idx)}
                          className={`px-3 py-1 rounded-xl text-xs font-rounded font-bold transition-all cursor-pointer ${
                            activePageIndex === idx
                              ? 'bg-gradient-to-r from-[#4DD9E8] to-[#0047AB] text-white shadow-xs'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          Page {idx + 1}
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={activePageIndex === 0}
                        onClick={() => setActivePageIndex((prev) => Math.max(prev - 1, 0))}
                        className="p-1 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-30 cursor-pointer"
                        title="Previous Page"
                      >
                        <ChevronLeft className="w-4 h-4 text-slate-700" />
                      </button>
                      <span className="text-[11px] font-rounded font-semibold text-slate-500 px-1">
                        {activePageIndex + 1} / {activePaperImages.length}
                      </span>
                      <button
                        type="button"
                        disabled={activePageIndex >= activePaperImages.length - 1}
                        onClick={() =>
                          setActivePageIndex((prev) =>
                            Math.min(prev + 1, activePaperImages.length - 1)
                          )
                        }
                        className="p-1 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-30 cursor-pointer"
                        title="Next Page"
                      >
                        <ChevronRight className="w-4 h-4 text-slate-700" />
                      </button>
                    </div>
                  </div>

                  {/* Pannable & Zoomable Image Viewport Container */}
                  <div
                    ref={imageContainerRef}
                    className="relative w-full h-[580px] xl:h-[680px] bg-slate-900 rounded-2xl overflow-auto border border-slate-200 shadow-inner flex items-start justify-center p-3 cursor-grab active:cursor-grabbing"
                    style={{
                      scrollbarWidth: 'thin',
                    }}
                  >
                    <div
                      style={{
                        transform: `scale(${zoomLevel})`,
                        transformOrigin: 'top center',
                        transition: 'transform 0.15s ease-out',
                      }}
                      className="inline-block shrink-0 shadow-2xl rounded-lg overflow-hidden bg-white"
                    >
                      <img
                        src={currentImageSrc}
                        alt={`Candidate handwritten script page ${activePageIndex + 1}`}
                        className="max-w-[700px] w-full h-auto object-contain block select-none pointer-events-none"
                        draggable={false}
                      />
                    </div>

                    {/* Bottom overlay info pill */}
                    <div className="absolute bottom-3 left-3 bg-black/75 backdrop-blur-xs text-white text-[11px] font-rounded px-3 py-1 rounded-full pointer-events-none">
                      {currentStudentMeta.name} — Page {activePageIndex + 1} of {activePaperImages.length} ({Math.round(zoomLevel * 100)}%)
                    </div>
                  </div>
                </div>

                {/* ──────── RIGHT SIDE: GRADING TABLE & EXAMINER VERIFICATION CONTROLS ──────── */}
                <div className="lg:col-span-6 xl:col-span-7 flex flex-col gap-4">
                  {/* Table Control Header */}
                  <div className="bg-white rounded-[24px] p-5 shadow-sm border border-slate-200/80">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                      <div>
                        <h3 className="font-rounded font-bold text-lg text-slate-800 flex items-center gap-2">
                          <span>Question Scoring & Verification</span>
                          {unconfirmedFlaggedQuestions.length > 0 && (
                            <span className="text-[11px] font-bold text-amber-800 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-full">
                              {unconfirmedFlaggedQuestions.length} Flagged Pending
                            </span>
                          )}
                        </h3>
                        <p className="text-xs font-rounded text-slate-400">
                          Cross-check candidate handwritten answers against rubric key points and AI marks.
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        {/* Filter only flagged questions toggle */}
                        <button
                          type="button"
                          onClick={() => setShowOnlyFlaggedQuestions((prev) => !prev)}
                          className={`flex items-center gap-1.5 text-xs font-rounded font-semibold px-3 py-1.5 rounded-full transition-all cursor-pointer border ${
                            showOnlyFlaggedQuestions
                              ? 'bg-amber-100 text-amber-900 border-amber-300 font-bold'
                              : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                          }`}
                        >
                          <Flag className="w-3.5 h-3.5 text-amber-600" />
                          <span>Show Flagged Only</span>
                        </button>

                        <button
                          type="button"
                          onClick={handleResetToAI}
                          className="flex items-center gap-1 text-xs font-rounded font-semibold text-slate-600 hover:text-[#0047AB] bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-full transition-all cursor-pointer"
                          title="Reset marks to original AI suggestions"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Reset AI</span>
                        </button>
                      </div>
                    </div>

                    {/* Question Scoring Cards List */}
                    <div className="flex flex-col gap-3">
                      {currentPaper.questions
                        .map((q, qIndex) => ({ q, qIndex }))
                        .filter(({ q }) => {
                          if (!showOnlyFlaggedQuestions) return true;
                          return q.gradingResult?.flag_for_review;
                        })
                        .map(({ q, qIndex }) => {
                          const qKey = getQuestionKey(q, qIndex);
                          const cardKey = `${currentPaper.id}-${qKey}-${qIndex}`;
                          const currentMark =
                            draftMarks[qKey] ?? draftMarks[String(q.questionNumber)] ?? q.examinerMark;
                          const error = validationErrors[qKey] ?? validationErrors[String(q.questionNumber)];
                          const isDiffFromAI = currentMark !== q.aiSuggestedMark;
                          const isFlagged = Boolean(q.gradingResult?.flag_for_review);
                          const isResolved = isQuestionFlagResolved(q, qIndex);
                          const isExpanded = Boolean(
                            expandedQuestions[qKey] ?? expandedQuestions[String(q.questionNumber)]
                          );
                          const displayNum =
                            q.section === 'B' || q.partLabel
                              ? `Q${q.questionNumber} ${q.partLabel || ''}`
                              : `Q${q.questionNumber}`;

                          const isOrAttempted = q.gradingResult?.attempted_choice === 'or_choice';
                          const displayQuestionText = isOrAttempted && q.orChoice?.questionText
                            ? q.orChoice.questionText
                            : q.questionText;

                          return (
                            <div
                              key={cardKey}
                              className={`p-4 rounded-2xl border transition-all ${
                                isFlagged && !isResolved
                                  ? 'bg-amber-50/60 border-amber-300 ring-2 ring-amber-300/40'
                                  : isDiffFromAI
                                  ? 'bg-blue-50/40 border-[#4DD9E8]/70 shadow-2xs'
                                  : 'bg-white border-slate-200/90 shadow-2xs'
                              }`}
                            >
                              {/* Row Header: Q#, Question Text, Confidence Badge, Mark Input */}
                              <div className="flex flex-col sm:flex-row items-start justify-between gap-3">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                                    <span className="font-rounded font-bold text-sm text-[#0047AB] bg-blue-100/70 px-2 py-0.5 rounded-lg">
                                      {displayNum}
                                    </span>

                                    {/* Requirement 2: Confidence Badge (Green high, Amber medium, Red low) */}
                                    {q.gradingResult && (
                                      <span
                                        className={`inline-flex items-center gap-1 text-[10px] font-rounded font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider ${
                                          q.gradingResult.confidence === 'high'
                                            ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                            : q.gradingResult.confidence === 'medium'
                                            ? 'bg-amber-50 text-amber-800 border-amber-300'
                                            : 'bg-rose-50 text-rose-800 border-rose-300'
                                        }`}
                                      >
                                        <span>AI: {q.gradingResult.confidence} confidence</span>
                                      </span>
                                    )}

                                    {/* Rubric Level Badge if present */}
                                    {q.gradingResult?.selected_level && (
                                      <span className="inline-flex items-center gap-1 text-[10px] font-rounded font-bold bg-blue-100 text-[#0047AB] border border-blue-200 px-2 py-0.5 rounded-full">
                                        Level {q.gradingResult.selected_level} Picked
                                      </span>
                                    )}

                                    {/* Attempted Choice Badge if OR choice was used */}
                                    {isOrAttempted ? (
                                      <span className="inline-flex items-center gap-1 text-[10px] font-rounded font-bold bg-purple-100 text-purple-900 border border-purple-200 px-2 py-0.5 rounded-full">
                                        OR Choice Attempted
                                      </span>
                                    ) : q.hasOrChoice ? (
                                      <span className="inline-flex items-center gap-1 text-[10px] font-rounded font-medium bg-slate-100 text-slate-700 border border-slate-200 px-2 py-0.5 rounded-full">
                                        Main (Left) Attempted
                                      </span>
                                    ) : null}

                                    {/* Requirement 3: Flagged Warning Icon and Reason */}
                                    {isFlagged && (
                                      <span className="inline-flex items-center gap-1 text-[11px] font-rounded font-bold bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 rounded-full">
                                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                                        <span>Flagged: {q.gradingResult?.flag_reason || 'Requires manual examiner verification'}</span>
                                      </span>
                                    )}
                                  </div>

                                  <h4 className="font-rounded font-bold text-sm text-slate-800 leading-snug">
                                    {isOrAttempted && (
                                      <span className="text-purple-700 font-extrabold mr-1.5">[OR Alternative]:</span>
                                    )}
                                    {displayQuestionText}
                                  </h4>
                                  {isOrAttempted && q.questionText && q.questionText !== displayQuestionText && (
                                    <p className="text-[11px] text-slate-400 mt-0.5 italic">
                                      Main (Left) Option: {q.questionText}
                                    </p>
                                  )}

                                  {/* Sub-part evaluations breakdown if present */}
                                  {q.gradingResult?.subPartResults && q.gradingResult.subPartResults.length > 0 && (
                                    <div className="mt-2 flex flex-wrap gap-2">
                                      {q.gradingResult.subPartResults.map((sp, idx) => (
                                        <div
                                          key={`subpart-${sp.partLabel || ''}-${idx}`}
                                          className="text-[11px] font-rounded bg-slate-100 border border-slate-200 rounded-lg px-2.5 py-1 text-slate-700 flex items-center gap-1.5"
                                        >
                                          <span className="font-bold text-[#0047AB]">{sp.partLabel}</span>
                                          {sp.selected_level && (
                                            <span className="bg-blue-50 text-blue-800 px-1 rounded text-[10px] font-bold">
                                              L{sp.selected_level}
                                            </span>
                                          )}
                                          <span className="font-semibold text-slate-900">
                                            {sp.marks_awarded} marks
                                          </span>
                                          {sp.reason && (
                                            <span className="text-slate-500 italic text-[10px] max-w-xs truncate">
                                              ({sp.reason})
                                            </span>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>

                                {/* Marks Display & Input */}
                                <div className="flex items-center gap-3 shrink-0 self-end sm:self-start">
                                  {/* AI Marks Pill */}
                                  <div className="text-right">
                                    <span className="text-[10px] font-rounded text-slate-400 block font-semibold">
                                      AI Suggested
                                    </span>
                                    <span className="inline-block bg-teal-50 text-[#0047AB] border border-teal-200 px-2.5 py-0.5 rounded-full text-xs font-bold">
                                      {q.aiSuggestedMark} / {q.maxMarks}
                                    </span>
                                  </div>

                                  {/* Examiner Mark Input */}
                                  <div className="text-right">
                                    <span className="text-[10px] font-rounded text-slate-500 block font-semibold">
                                      Final Mark
                                    </span>
                                    <div className="flex items-center gap-1">
                                      <input
                                        type="number"
                                        step="0.5"
                                        min={0}
                                        max={q.maxMarks}
                                        value={currentMark}
                                        onChange={(e) =>
                                          handleMarkChange(
                                            qKey,
                                            e.target.value,
                                            q.maxMarks
                                          )
                                        }
                                        onBlur={() => {
                                          const auditCode =
                                            auditReasonCodes[qKey] || auditReasonCodes[String(q.questionNumber)];
                                          const auditRemark =
                                            auditCustomRemarks[qKey] || auditCustomRemarks[String(q.questionNumber)];
                                          if (auditCode) {
                                            handleCommitMarkCorrectionWithAudit(
                                              q,
                                              currentMark,
                                              auditCode,
                                              auditRemark
                                            );
                                          }
                                        }}
                                        className={`w-16 text-center font-rounded font-bold text-sm py-1 px-1.5 rounded-xl outline-none transition-all shadow-inner ${
                                          error
                                            ? 'bg-rose-50 text-rose-700 border-2 border-rose-500 ring-1 ring-rose-200'
                                            : isDiffFromAI
                                            ? 'bg-blue-50 text-[#0047AB] border-2 border-[#4DD9E8]'
                                            : 'bg-slate-100 text-slate-800 border border-slate-200 focus:border-[#4DD9E8] focus:bg-white'
                                        }`}
                                      />
                                      <span className="text-xs font-rounded font-semibold text-slate-400">
                                        / {q.maxMarks}
                                      </span>
                                    </div>
                                    {error && (
                                      <span className="text-[10px] text-rose-600 font-bold block mt-0.5">
                                        {error}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* Requirement 2: Key Points Found (Green Ticks) and Missing (Red Crosses) */}
                              {q.gradingResult && (
                                <div className="mt-3 pt-2.5 border-t border-slate-100 flex flex-col gap-1.5">
                                  <div className="flex items-center justify-between text-[11px] font-rounded font-bold text-slate-500 uppercase tracking-wider">
                                    <span>Rubric Key Points</span>
                                  </div>

                                  <div className="flex flex-wrap gap-1.5">
                                    {/* Green Ticks for Found Key Points */}
                                    {q.gradingResult.key_points_found?.map((kp, idx) => (
                                      <span
                                        key={`found-${qKey}-${idx}`}
                                        className="inline-flex items-center gap-1 text-[11px] font-rounded font-medium bg-emerald-50 text-emerald-900 border border-emerald-200 px-2 py-0.5 rounded-lg"
                                      >
                                        <Check className="w-3 h-3 text-emerald-600 stroke-[3]" />
                                        <span>{kp}</span>
                                      </span>
                                    ))}

                                    {/* Red Crosses for Missing Key Points */}
                                    {q.gradingResult.key_points_missing?.map((kp, idx) => (
                                      <span
                                        key={`missing-${qKey}-${idx}`}
                                        className="inline-flex items-center gap-1 text-[11px] font-rounded font-medium bg-rose-50 text-rose-900 border border-rose-200 px-2 py-0.5 rounded-lg"
                                      >
                                        <X className="w-3 h-3 text-rose-500 stroke-[3]" />
                                        <span>{kp}</span>
                                      </span>
                                    ))}
                                  </div>

                                  {/* Quoted Student Handwritten Working (if available) */}
                                  {q.gradingResult.quoted_student_working && (
                                    <div className="mt-1 text-[11px] font-mono text-slate-600 bg-slate-50/80 px-2.5 py-1.5 rounded-lg border border-slate-200 flex items-start gap-1.5">
                                      <span className="font-bold text-slate-500 uppercase text-[10px]">Student Script Quote:</span>
                                      <span className="italic">"{q.gradingResult.quoted_student_working}"</span>
                                    </div>
                                  )}

                                  {/* AI One-line Reason */}
                                  <div className="mt-1 text-xs font-rounded text-slate-600 bg-slate-50 p-2 rounded-xl border border-slate-200 flex items-start gap-1.5">
                                    <FileText className="w-3.5 h-3.5 text-[#0047AB] shrink-0 mt-0.5" />
                                    <div>
                                      <strong className="text-slate-700">AI Reason: </strong>
                                      <span>"{q.gradingResult.reason}"</span>
                                    </div>
                                  </div>
                                </div>
                              )}

                              {/* Requirement 2: Mandated Examiner Audit Reason Dropdown when score is modified */}
                              {isDiffFromAI && (
                                <div
                                  className={`mt-2.5 p-3 rounded-2xl border transition-all ${
                                    !auditReasonCodes[qKey] && !auditReasonCodes[String(q.questionNumber)]
                                      ? 'bg-amber-50/90 border-amber-300 ring-2 ring-amber-200'
                                      : 'bg-blue-50/80 border-blue-200 shadow-2xs'
                                  }`}
                                >
                                  <div className="flex items-center justify-between gap-2 mb-2">
                                    <div className="flex items-center gap-1.5">
                                      <ShieldAlert
                                        className={`w-4 h-4 ${
                                          !auditReasonCodes[qKey] && !auditReasonCodes[String(q.questionNumber)]
                                            ? 'text-amber-600 animate-pulse'
                                            : 'text-[#0047AB]'
                                        }`}
                                      />
                                      <span className="text-xs font-rounded font-bold text-slate-900">
                                        Audit Reason Code (Mandatory):
                                      </span>
                                    </div>
                                    {!auditReasonCodes[qKey] && !auditReasonCodes[String(q.questionNumber)] ? (
                                      <span className="text-[10px] font-rounded font-bold uppercase tracking-wider text-amber-800 bg-amber-200/80 px-2.5 py-0.5 rounded-full">
                                        Reason Code Required
                                      </span>
                                    ) : (
                                      <span className="text-[10px] font-rounded font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                                        <Check className="w-3 h-3 text-emerald-600" />
                                        <span>Audit Logged</span>
                                      </span>
                                    )}
                                  </div>

                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    {/* Mandated Reason Code Dropdown */}
                                    <select
                                      value={auditReasonCodes[qKey] || auditReasonCodes[String(q.questionNumber)] || ''}
                                      onChange={(e) => {
                                        const code = e.target.value;
                                        setAuditReasonCodes((prev) => ({
                                          ...prev,
                                          [qKey]: code,
                                        }));
                                        if (code) {
                                          handleCommitMarkCorrectionWithAudit(
                                            q,
                                            currentMark,
                                            code,
                                            auditCustomRemarks[qKey] || auditCustomRemarks[String(q.questionNumber)]
                                          );
                                        }
                                      }}
                                      className={`w-full bg-white text-xs font-rounded font-semibold px-3 py-2 rounded-xl border outline-none cursor-pointer transition-all ${
                                        !auditReasonCodes[qKey] && !auditReasonCodes[String(q.questionNumber)]
                                          ? 'border-amber-400 text-amber-900 focus:ring-2 focus:ring-amber-300'
                                          : 'border-slate-300 text-slate-800 focus:border-[#4DD9E8]'
                                      }`}
                                    >
                                      <option value="">-- Select Audit Reason Code --</option>
                                      {EXAMINER_AUDIT_REASONS.map((reason) => (
                                        <option key={reason} value={reason}>
                                          {reason}
                                        </option>
                                      ))}
                                    </select>

                                    {/* Optional Specific Remarks Input */}
                                    <input
                                      type="text"
                                      placeholder="Specific academic justification / details..."
                                      value={auditCustomRemarks[qKey] || auditCustomRemarks[String(q.questionNumber)] || ''}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        setAuditCustomRemarks((prev) => ({
                                          ...prev,
                                          [qKey]: val,
                                        }));
                                      }}
                                      onBlur={() => {
                                        const code =
                                          auditReasonCodes[qKey] || auditReasonCodes[String(q.questionNumber)];
                                        if (code) {
                                          handleCommitMarkCorrectionWithAudit(
                                            q,
                                            currentMark,
                                            code,
                                            auditCustomRemarks[qKey] || auditCustomRemarks[String(q.questionNumber)]
                                          );
                                        }
                                      }}
                                      className="w-full bg-white text-xs font-rounded px-3 py-2 rounded-xl border border-slate-300 outline-none text-slate-800 placeholder:text-slate-400 focus:border-[#4DD9E8] transition-all"
                                    />
                                  </div>
                                </div>
                              )}

                              {/* Bottom Action Bar: Expandable "See transcription" & Flag Confirmation Action */}
                              <div className="mt-3 pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                                {/* Requirement 4: Explicit Confirmation Checkbox / Button per flagged question */}
                                {isFlagged ? (
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => handleToggleFlagConfirm(q, qIndex)}
                                      className={`flex items-center gap-1.5 text-xs font-rounded font-bold px-3 py-1.5 rounded-full transition-all cursor-pointer border ${
                                        isResolved
                                          ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                          : 'bg-amber-500 hover:bg-amber-600 text-white border-amber-600 shadow-xs active:scale-95'
                                      }`}
                                    >
                                      {isResolved ? (
                                        <>
                                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                          <span>✓ Flag Confirmed by Examiner</span>
                                        </>
                                      ) : (
                                        <>
                                          <AlertTriangle className="w-3.5 h-3.5" />
                                          <span>Confirm Flagged Question</span>
                                        </>
                                      )}
                                    </button>
                                    {!isResolved && (
                                      <span className="text-[11px] font-rounded text-amber-700 italic">
                                        (Confirm or adjust mark to allow finalizing)
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <div />
                                )}

                                {/* Requirement 2: Expandable "See transcription" toggle */}
                                <button
                                  type="button"
                                  onClick={() =>
                                    setExpandedQuestions((prev) => ({
                                      ...prev,
                                      [qKey]: !prev[qKey],
                                    }))
                                  }
                                  className="inline-flex items-center gap-1 text-xs font-rounded font-bold text-[#0047AB] hover:underline cursor-pointer ml-auto"
                                >
                                  <span>
                                    {isExpanded
                                      ? 'Hide transcription'
                                      : 'See transcription'}
                                  </span>
                                  {isExpanded ? (
                                    <ChevronUp className="w-3.5 h-3.5" />
                                  ) : (
                                    <ChevronDown className="w-3.5 h-3.5" />
                                  )}
                                </button>
                              </div>

                              {/* Requirement 2: Expanded Transcription Drawer with [ILLEGIBLE] Highlighted */}
                              {isExpanded && (
                                <motion.div
                                  initial={{ opacity: 0, height: 0 }}
                                  animate={{ opacity: 1, height: 'auto' }}
                                  exit={{ opacity: 0, height: 0 }}
                                  className="mt-3 p-3 bg-slate-50 border border-slate-200 rounded-xl flex flex-col gap-2"
                                >
                                  <div className="flex items-center justify-between text-[11px] font-rounded font-bold text-slate-500 uppercase tracking-wider">
                                    <span>Transcribed Student Script (OCR)</span>
                                    {q.transcription?.hasIllegible && (
                                      <span className="text-amber-800 bg-amber-200/90 px-2 py-0.5 rounded font-bold">
                                        Contains Illegible Sections
                                      </span>
                                    )}
                                  </div>

                                  <div className="text-xs font-rounded text-slate-800 bg-white p-3 rounded-lg border border-slate-200 whitespace-pre-wrap leading-relaxed">
                                    {q.transcription?.transcribedAnswer ? (
                                      q.transcription.transcribedAnswer
                                        .split('[ILLEGIBLE]')
                                        .map((part, idx, arr) => (
                                          <React.Fragment key={`trans-part-${qKey}-${idx}`}>
                                            {part}
                                            {idx < arr.length - 1 && (
                                              <span className="inline-block bg-amber-300 text-amber-950 font-bold px-1.5 py-0.5 rounded text-[10px] mx-0.5 border border-amber-400 shadow-2xs">
                                                [ILLEGIBLE]
                                              </span>
                                            )}
                                          </React.Fragment>
                                        ))
                                    ) : (
                                      <span className="italic text-slate-400">
                                        No transcription record available for this question.
                                      </span>
                                    )}
                                  </div>

                                  {q.transcription?.diagramDescription && (
                                    <div className="text-[11px] font-rounded text-cyan-900 bg-cyan-50 border border-cyan-200 p-2 rounded-lg">
                                      <strong>Diagram on paper: </strong>
                                      <span>{q.transcription.diagramDescription}</span>
                                    </div>
                                  )}
                                </motion.div>
                              )}
                            </div>
                          );
                        })}
                    </div>

                    {/* Table Footer Running Total Bar */}
                    <div className="mt-4 pt-3 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-50/80 p-3.5 rounded-2xl">
                      <div className="flex items-center gap-2 text-xs font-rounded text-slate-500">
                        <HelpCircle className="w-4 h-4 text-slate-400 shrink-0" />
                        <span>
                          Marks update live. Changes are logged to the audit history.
                        </span>
                      </div>

                      <div className="flex items-center gap-3 font-rounded">
                        <span className="text-xs font-semibold text-slate-600">
                          Total Score:
                        </span>
                        <span className="text-xl font-bold text-[#0047AB]">
                          {currentTotal} / {maxTotal}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* ──────── EXAMINER REMARKS & FINALIZE ACTION BAR ──────── */}
                  <div className="bg-white rounded-[24px] p-5 shadow-sm border border-slate-200/80 flex flex-col gap-3">
                    <div>
                      <label
                        htmlFor="examiner-remarks"
                        className="block font-rounded font-bold text-sm text-slate-800 mb-1"
                      >
                        Examiner Remarks (Optional)
                      </label>
                      <textarea
                        id="examiner-remarks"
                        rows={2}
                        placeholder="Add notes or remarks regarding student steps, handwriting, or grace marks..."
                        value={draftRemarks}
                        onChange={(e) => setDraftRemarks(e.target.value)}
                        className="w-full bg-slate-50 focus:bg-white border border-slate-200 focus:border-[#4DD9E8] rounded-xl p-3 font-rounded text-xs text-slate-800 outline-none transition-all placeholder:text-slate-400"
                      />
                    </div>

                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
                      <div className="text-xs font-rounded text-slate-500">
                        {unconfirmedFlaggedQuestions.length > 0 ? (
                          <span className="font-bold text-amber-700 bg-amber-100 px-2.5 py-1 rounded-full border border-amber-300 inline-flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3 text-amber-600" />
                            <span>{unconfirmedFlaggedQuestions.length} flagged question(s) must be confirmed first</span>
                          </span>
                        ) : (
                          <span>
                            Status will be updated to{' '}
                            <strong className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                              Reviewed
                            </strong>
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2.5 w-full sm:w-auto">
                        <button
                          type="button"
                          onClick={handleResetToAI}
                          className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-rounded font-semibold text-xs py-2.5 px-4 rounded-full transition-all cursor-pointer"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Reset</span>
                        </button>

                        {/* Requirement 4: Enforce all flagged questions confirmed or edited */}
                        <button
                          type="button"
                          onClick={handleSaveReviewed}
                          disabled={unconfirmedFlaggedQuestions.length > 0}
                          className={`flex-1 sm:flex-none flex items-center justify-center gap-2 font-rounded font-bold text-sm py-2.5 px-6 rounded-full shadow-md transition-all cursor-pointer ${
                            unconfirmedFlaggedQuestions.length > 0
                              ? 'bg-slate-300 text-slate-500 cursor-not-allowed opacity-75'
                              : 'bg-gradient-to-r from-[#4DD9E8] to-[#0047AB] hover:opacity-95 text-white active:scale-95 shadow-lg'
                          }`}
                          title={
                            unconfirmedFlaggedQuestions.length > 0
                              ? 'Resolve all flagged questions before marking as Reviewed'
                              : 'Finalize and mark paper as Reviewed'
                          }
                        >
                          <Save className="w-4 h-4" />
                          <span>
                            {unconfirmedFlaggedQuestions.length > 0
                              ? 'Resolve Flags to Finalize'
                              : 'Save & Mark as Reviewed'}
                          </span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="bg-white rounded-[24px] p-12 text-center border border-slate-200/80 flex flex-col items-center justify-center gap-3">
              <FileText className="w-12 h-12 text-slate-300" />
              <h3 className="font-rounded font-bold text-lg text-slate-800">
                No Student Answer Scripts Uploaded Yet
              </h3>
              <p className="text-xs text-slate-500 max-w-md font-rounded">
                You can upload answer scripts in the Upload Screen, or switch to the Marking Scheme Editor tab to configure official answer keys and grading rubrics beforehand.
              </p>
              <div className="flex items-center gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => setActiveStudioTab('schemes')}
                  className="px-4 py-2 rounded-xl bg-[#0047AB] hover:bg-blue-800 text-white font-rounded font-bold text-xs shadow-md transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>Open Marking Scheme Editor</span>
                </button>
                <button
                  type="button"
                  onClick={onBackToMenu}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-rounded font-bold text-xs transition-all cursor-pointer"
                >
                  Back to Main Menu
                </button>
              </div>
            </div>
          )}
        </section>
        </>
        )}
      </main>

      {/* ════════ FULLSCREEN LIGHTBOX MODAL ════════ */}
      <AnimatePresence>
        {deleteConfirmModal && deleteConfirmModal.isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
            onClick={() => setDeleteConfirmModal(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              transition={{ duration: 0.18 }}
              className="bg-white rounded-[28px] max-w-md w-full p-6 shadow-2xl border border-slate-200 flex flex-col gap-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0 shadow-inner">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-rounded font-bold text-base sm:text-lg text-slate-900 leading-tight">
                    {deleteConfirmModal.type === 'all'
                      ? 'Delete All Marking Schemes'
                      : 'Delete Marking Scheme'}
                  </h3>
                  <p className="text-xs font-rounded text-slate-500">
                    Confirm scheme removal
                  </p>
                </div>
              </div>

              <div className="text-sm font-rounded text-slate-700 leading-relaxed">
                {deleteConfirmModal.type === 'all' ? (
                  <p>
                    Are you sure you want to delete all{' '}
                    <strong className="text-slate-900 font-bold">
                      {deleteConfirmModal.schemesCount}
                    </strong>{' '}
                    marking schemes? This cannot be undone.
                  </p>
                ) : (
                  <p>
                    Are you sure you want to delete &lsquo;
                    <strong className="text-slate-900 font-bold">
                      {deleteConfirmModal.schemeTitle}
                    </strong>
                    &rsquo;? This cannot be undone.
                  </p>
                )}
              </div>

              {deleteConfirmModal.referencedCount && deleteConfirmModal.referencedCount > 0 ? (
                <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-2.5 text-xs font-rounded text-amber-900">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold block">Paper Dependency Warning</span>
                    <span>
                      This scheme is used by {deleteConfirmModal.referencedCount} existing paper(s). Deleting it may affect their grading.
                    </span>
                  </div>
                </div>
              ) : null}

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setDeleteConfirmModal(null)}
                  className="px-4 py-2 rounded-xl text-xs font-rounded font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmExecuteDelete}
                  className="px-4 py-2 rounded-xl text-xs font-rounded font-bold text-white bg-rose-600 hover:bg-rose-700 active:scale-95 transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>
                    {deleteConfirmModal.type === 'all'
                      ? 'Delete All Schemes'
                      : 'Delete'}
                  </span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ════════ ERROR ALERT MODAL ════════ */}
      <AnimatePresence>
        {errorAlert && errorAlert.isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
            onClick={() => setErrorAlert(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              className="bg-white rounded-[28px] max-w-md w-full p-6 shadow-2xl border border-slate-200 flex flex-col gap-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center shrink-0 shadow-inner">
                  <AlertCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-rounded font-bold text-base sm:text-lg text-slate-900 leading-tight">
                    {errorAlert.title}
                  </h3>
                  <p className="text-xs font-rounded text-slate-500">
                    Action required
                  </p>
                </div>
              </div>

              <div className="text-sm font-rounded text-slate-700 leading-relaxed">
                <p>{errorAlert.message}</p>
              </div>

              <div className="flex items-center justify-end pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setErrorAlert(null)}
                  className="px-6 py-2 rounded-xl text-xs font-rounded font-bold text-white bg-[#0047AB] hover:bg-[#003d96] active:scale-95 transition-all shadow-xs cursor-pointer"
                >
                  Understood
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ════════ PAPER DELETE CONFIRMATION MODAL ════════ */}
      <AnimatePresence>
        {paperDeleteConfirm && paperDeleteConfirm.isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
            onClick={() => setPaperDeleteConfirm(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              transition={{ duration: 0.18 }}
              className="bg-white rounded-[28px] max-w-md w-full p-6 shadow-2xl border border-slate-200 flex flex-col gap-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0 shadow-inner">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-rounded font-bold text-base sm:text-lg text-slate-900 leading-tight">
                    Delete Student Paper
                  </h3>
                  <p className="text-xs font-rounded text-slate-500">
                    Confirm paper deletion
                  </p>
                </div>
              </div>

              <div className="text-sm font-rounded text-slate-700 leading-relaxed">
                <p>
                  Are you sure you want to delete the paper for <strong>{paperDeleteConfirm.studentName}</strong>? This action will permanently remove the paper results and marks from the system and cannot be undone.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setPaperDeleteConfirm(null)}
                  className="px-4 py-2 rounded-xl text-xs font-rounded font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeletePaperConfirm}
                  className="px-4 py-2 rounded-xl text-xs font-rounded font-bold text-white bg-rose-600 hover:bg-rose-700 active:scale-95 transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Paper</span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ════════ FULLSCREEN LIGHTBOX MODAL ════════ */}
      <AnimatePresence>
        {isImageLightboxOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex flex-col items-center justify-center p-4"
          >
            <div className="absolute top-4 right-4 flex items-center gap-3 z-10">
              <span className="text-white text-xs font-rounded font-semibold bg-white/20 px-3 py-1.5 rounded-full">
                Page {activePageIndex + 1} of {activePaperImages.length}
              </span>
              <button
                type="button"
                onClick={() => setIsImageLightboxOpen(false)}
                className="w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {activePaperImages.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={() =>
                    setActivePageIndex((prev) =>
                      prev > 0 ? prev - 1 : activePaperImages.length - 1
                    )
                  }
                  className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center transition-all cursor-pointer z-10"
                >
                  <ChevronLeft className="w-6 h-6" />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setActivePageIndex((prev) =>
                      prev < activePaperImages.length - 1 ? prev + 1 : 0
                    )
                  }
                  className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center transition-all cursor-pointer z-10"
                >
                  <ChevronRight className="w-6 h-6" />
                </button>
              </>
            )}

            <div className="max-w-5xl max-h-[88vh] w-full flex items-center justify-center overflow-auto p-2">
              <img
                src={currentImageSrc}
                alt="Enlarged answer script"
                className="max-h-[88vh] max-w-full object-contain rounded-xl shadow-2xl bg-white"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ════════ RE-RUN AI GRADING PROGRESS & ERROR POPUP ════════ */}
      <AnimatePresence>
        {rerunProgress.isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              className="bg-white rounded-[28px] max-w-lg w-full p-6 sm:p-7 shadow-2xl border border-slate-200 flex flex-col gap-5 relative overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${
                      rerunProgress.step === 'error'
                        ? 'bg-rose-100 text-rose-600'
                        : rerunProgress.step === 'success'
                        ? 'bg-emerald-100 text-emerald-600'
                        : 'bg-gradient-to-br from-[#4DD9E8]/20 to-[#0047AB]/20 text-[#0047AB]'
                    }`}
                  >
                    {rerunProgress.step === 'error' ? (
                      <AlertTriangle className="w-5 h-5 text-rose-600" />
                    ) : rerunProgress.step === 'success' ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    ) : (
                      <Loader2 className="w-5 h-5 text-[#0047AB] animate-spin" />
                    )}
                  </div>
                  <div>
                    <h3 className="font-rounded font-bold text-lg text-slate-800">
                      {rerunProgress.step === 'error'
                        ? 'AI Grading Paused'
                        : rerunProgress.step === 'success'
                        ? 'AI Grading Completed'
                        : 'AI Grading Pipeline'}
                    </h3>
                    <p className="text-xs font-rounded text-slate-500">
                      {rerunProgress.paperTitle} • {rerunProgress.subject}
                    </p>
                  </div>
                </div>

                {/* Close Button */}
                <button
                  type="button"
                  onClick={() =>
                    setRerunProgress((prev) => ({ ...prev, isOpen: false }))
                  }
                  className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Progress Steps List */}
              <div className="flex flex-col gap-3 py-1">
                {/* Step 1: Transcription */}
                <div
                  className={`flex items-start gap-3 p-3.5 rounded-2xl border transition-all ${
                    rerunProgress.step1Status === 'completed' ||
                    rerunProgress.step1Status === 'saved'
                      ? 'bg-emerald-50/70 border-emerald-200'
                      : rerunProgress.step1Status === 'active'
                      ? 'bg-sky-50/80 border-[#4DD9E8] shadow-xs'
                      : 'bg-slate-50/60 border-slate-200 opacity-60'
                  }`}
                >
                  <div className="mt-0.5 shrink-0">
                    {rerunProgress.step1Status === 'completed' ||
                    rerunProgress.step1Status === 'saved' ? (
                      <div className="w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center">
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                      </div>
                    ) : rerunProgress.step1Status === 'active' ? (
                      <div className="w-6 h-6 rounded-full bg-[#0047AB] text-white flex items-center justify-center">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      </div>
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-slate-200 text-slate-500 text-xs font-bold flex items-center justify-center">
                        1
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="font-rounded font-bold text-xs text-slate-800">
                        Step 1: Handwritten Script OCR & Transcription
                      </span>
                      {rerunProgress.step1Status === 'saved' && (
                        <span className="text-[10px] font-rounded font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                          Pre-saved
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 font-rounded mt-0.5 leading-relaxed">
                      {rerunProgress.step1Status === 'saved'
                        ? 'Saved transcription detected — OCR already completed and saved.'
                        : rerunProgress.step1Status === 'completed'
                        ? 'Handwriting transcribed, diagrams noted, and saved to paper.'
                        : rerunProgress.step1Status === 'active'
                        ? 'Digitizing handwritten pages with Gemini OCR...'
                        : 'Awaiting start'}
                    </p>
                  </div>
                </div>

                {/* Step 2: Rubric Evaluation */}
                <div
                  className={`flex items-start gap-3 p-3.5 rounded-2xl border transition-all ${
                    rerunProgress.step2Status === 'completed'
                      ? 'bg-emerald-50/70 border-emerald-200'
                      : rerunProgress.step2Status === 'active'
                      ? 'bg-sky-50/80 border-[#0047AB] shadow-xs'
                      : 'bg-slate-50/60 border-slate-200 opacity-60'
                  }`}
                >
                  <div className="mt-0.5 shrink-0">
                    {rerunProgress.step2Status === 'completed' ? (
                      <div className="w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center">
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                      </div>
                    ) : rerunProgress.step2Status === 'active' ? (
                      <div className="w-6 h-6 rounded-full bg-[#0047AB] text-white flex items-center justify-center">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      </div>
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-slate-200 text-slate-500 text-xs font-bold flex items-center justify-center">
                        2
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="font-rounded font-bold text-xs text-slate-800 block">
                      Step 2: Rubric & Marking Scheme Evaluation
                    </span>
                    <p className="text-[11px] text-slate-500 font-rounded mt-0.5 leading-relaxed">
                      {rerunProgress.step2Status === 'completed'
                        ? `Evaluation complete. Graded against current ${rerunProgress.subject} marking scheme.`
                        : rerunProgress.step2Status === 'active'
                        ? 'Grading against current rubric levels with automatic failover (gemini-3.5-flash-lite, 3.1-flash-lite, openrouter)...'
                        : 'Pending Step 1 transcription'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Error Message Box */}
              {rerunProgress.step === 'error' && (
                <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                  <div className="flex-1 text-xs font-rounded">
                    <span className="font-bold text-rose-900 block">
                      Grading Issue Detected
                    </span>
                    <p className="text-rose-800 mt-1 leading-relaxed">
                      {rerunProgress.errorMessage || 'AI is busy right now, please try again in a few minutes.'}
                    </p>
                    {rerunProgress.step1Status === 'completed' || rerunProgress.step1Status === 'saved' ? (
                      <p className="text-emerald-700 font-semibold mt-2 text-[11px]">
                        ✓ Transcription is already safely saved. Retrying will only repeat Step 2!
                      </p>
                    ) : null}
                  </div>
                </div>
              )}

              {/* Success Result Box */}
              {rerunProgress.step === 'success' && (
                <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-between">
                  <div>
                    <span className="font-rounded font-bold text-xs text-emerald-900 block">
                      Graded Against Current Marking Scheme
                    </span>
                    <p className="text-[11px] text-emerald-700 font-rounded mt-0.5">
                      Updated question marks and rubric justifications applied.
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] uppercase font-bold text-emerald-600 tracking-wider block">
                      Score
                    </span>
                    <span className="text-xl font-bold font-rounded text-emerald-800">
                      {rerunProgress.totalMarksAwarded}{' '}
                      <span className="text-xs text-emerald-600 font-normal">
                        / {rerunProgress.maxMarks}
                      </span>
                    </span>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
                {rerunProgress.step === 'error' ? (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        setRerunProgress((prev) => ({ ...prev, isOpen: false }))
                      }
                      className="px-4 py-2 rounded-full text-xs font-rounded font-semibold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                    >
                      Dismiss
                    </button>
                    <button
                      type="button"
                      onClick={() => handleReRunAIGrading(currentPaper)}
                      disabled={isRetryingAI || retryCooldown > 0}
                      className="px-5 py-2 rounded-full text-xs font-rounded font-bold text-white bg-rose-600 hover:bg-rose-700 shadow-xs transition-all active:scale-95 cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                    >
                      {retryCooldown > 0 ? (
                        <>
                          <Clock className="w-3.5 h-3.5" />
                          <span>Retry in {retryCooldown}s</span>
                        </>
                      ) : (
                        <>
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>Try Again</span>
                        </>
                      )}
                    </button>
                  </>
                ) : rerunProgress.step === 'success' ? (
                  <button
                    type="button"
                    onClick={() =>
                      setRerunProgress((prev) => ({ ...prev, isOpen: false }))
                    }
                    className="px-6 py-2 rounded-full text-xs font-rounded font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-xs transition-all active:scale-95 cursor-pointer"
                  >
                    Done
                  </button>
                ) : (
                  <div className="flex items-center gap-2 text-xs font-rounded text-slate-400 py-1">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-[#0047AB]" />
                    <span>Grading with automatic fallback models...</span>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ════════ REQUIREMENT 7: CORRECTION AUDIT LOG MODAL ════════ */}
      <AnimatePresence>
        {isAuditLogOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-[28px] max-w-2xl w-full p-6 shadow-2xl border border-slate-200 flex flex-col max-h-[85vh] overflow-hidden"
            >
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <History className="w-5 h-5 text-[#0047AB]" />
                  <h3 className="font-rounded font-bold text-lg text-slate-800">
                    Examiner Mark Correction Audit Log
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAuditLogOpen(false)}
                  className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto py-4 flex flex-col gap-3">
                {correctionLogs.length === 0 ? (
                  <div className="text-center py-12 text-slate-400 font-rounded text-sm">
                    No mark corrections have been logged yet.
                  </div>
                ) : (
                  correctionLogs.map((log) => (
                    <div
                      key={log.id}
                      className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col gap-1.5"
                    >
                      <div className="flex items-center justify-between text-xs font-rounded font-bold">
                        <span className="text-[#0047AB]">
                          {log.paperStudentName} — Q{log.questionNumber}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span className="line-through text-slate-400">
                            AI: {log.aiMark}
                          </span>
                          <span className="text-emerald-700 font-bold bg-emerald-100 px-2 py-0.5 rounded-full">
                            Corrected: {log.correctedMark}
                          </span>
                        </div>
                      </div>

                      <div className="text-xs font-rounded text-slate-600 line-clamp-1">
                        {log.questionText}
                      </div>

                      {log.reason && (
                        <div className="text-xs font-rounded text-slate-700 bg-white p-2 rounded-lg border border-slate-200">
                          <strong className="text-slate-500">Reason: </strong>
                          {log.reason}
                        </div>
                      )}

                      <div className="flex items-center justify-between text-[11px] font-rounded text-slate-400 pt-1">
                        <span>Examiner: <strong>{log.examinerName}</strong></span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-slate-400" />
                          <span>{new Date(log.timestamp).toLocaleString()}</span>
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end">
                <button
                  type="button"
                  onClick={() => setIsAuditLogOpen(false)}
                  className="px-5 py-2 rounded-full bg-slate-100 hover:bg-slate-200 font-rounded font-semibold text-xs text-slate-700 cursor-pointer"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ════════ FLOATING SAVE CONFIRMATION TOAST ════════ */}
      <AnimatePresence>
        {saveSuccessToast && (
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 bg-slate-900/95 text-white px-6 py-3 rounded-full shadow-2xl backdrop-blur-md flex items-center gap-3 border border-white/20 text-xs sm:text-sm font-rounded font-semibold max-w-[90vw] text-center"
          >
            <CheckCircle2 className="w-4 h-4 text-[#4DD9E8] shrink-0" />
            <span>{saveSuccessToast}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ════════ BOTTOM BANNER ════════ */}
      <footer className="relative w-full z-20 shrink-0 mt-6">
        <div
          className="w-full h-12 sm:h-16 rounded-t-[24px] sm:rounded-t-[32px] md:rounded-t-[40px] shadow-lg relative overflow-hidden"
          style={{
            background: 'linear-gradient(90deg, #4DD9E8 0%, #0047AB 100%)',
          }}
        >
          <div className="absolute inset-x-0 bottom-0 h-1/3 bg-black/10 pointer-events-none" />
        </div>
      </footer>

      {/* ════════ MARKING SCHEME MANAGER MODAL ════════ */}
      <MarkingSchemeManager
        isOpen={isMarkingSchemeOpen}
        onClose={() => setIsMarkingSchemeOpen(false)}
        schemes={markingSchemes}
        onSaveSchemes={onSaveMarkingSchemes}
        initialSelectedSchemeId={selectedSchemeIdForManager}
        correctionLogs={correctionLogs}
        papers={papers}
        onDeleteScheme={onDeleteMarkingScheme}
      />
    </div>
  );
};
