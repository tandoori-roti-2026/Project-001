/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { LandingScreen } from './components/LandingScreen';
import { LoginScreen } from './components/LoginScreen';
import { MainMenuScreen } from './components/MainMenuScreen';
import { EditingScreen } from './components/EditingScreen';
import { ResultCardsScreen } from './components/ResultCardsScreen';
import { StudentsDataScreen } from './components/StudentsDataScreen';
import { UploadingScreen, RecentUploadLog } from './components/UploadingScreen';
import { ExaminerChatPanel } from './components/ExaminerChatPanel';
import { BackgroundJobsTray } from './components/BackgroundJobsTray';
import { BackgroundGradingJob, runAsyncGradingJob } from './utils/asyncGradingPipeline';
import {
  StudentImportBatchJob,
  runAsyncStudentImportJob,
  normalizeRoll,
  extractNonEmptyStudentFields,
} from './utils/studentImportPipeline';
import { ShiftFilterType } from './components/GlobalShiftFilter';
import { MessageSquareText } from 'lucide-react';
import { paperStorage } from './utils/paperStorage';
import { checkForDuplicatePaper } from './utils/duplicateCheck';
import {
  ExamPaper,
  StudentRecord,
  INITIAL_MOCK_PAPERS,
  INITIAL_MOCK_STUDENTS,
  CorrectionLog,
} from './data/mockPapers';
import {
  MarkingScheme,
  INITIAL_MOCK_MARKING_SCHEMES,
  ensureDescriptiveSchemeQuestions,
} from './data/mockMarkingSchemes';
import {
  UserAccount,
  USER_ACCOUNTS,
  AuthContext,
  isDeveloper,
  isNormal,
} from './data/authUsers';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from './firebase';
import { getAuthorizedUserByEmail } from './utils/userManagement';
import { DataMigrationModal } from './components/DataMigrationModal';

export type ScreenType =
  | 'landing'
  | 'login'
  | 'menu'
  | 'uploading'
  | 'editing'
  | 'result-cards'
  | 'students-data';

export const isLegacyMockStudent = (s: StudentRecord): boolean => {
  const name = s.fullName.toLowerCase().trim();
  const id = s.id.toLowerCase();
  return (
    name.includes('ayesha siddiqui') ||
    name.includes('hamza zubair') ||
    name.includes('muhammad daniyal khan') ||
    name.includes('fatima zahra') ||
    id.startsWith('student-00') ||
    id.startsWith('mock-') ||
    Boolean(s.email?.includes('daniyal.')) ||
    Boolean(s.email?.includes('ayesha.')) ||
    Boolean(s.email?.includes('hamza.'))
  );
};

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<ScreenType>('landing');
  const [transitionDirection, setTransitionDirection] = useState<'forward' | 'backward'>('forward');
  const [isExaminerChatOpen, setIsExaminerChatOpen] = useState(false);
  const [isDataMigrationOpen, setIsDataMigrationOpen] = useState(false);

  // Authenticated User State
  const [currentUser, setCurrentUser] = useState<UserAccount>(() => {
    try {
      const saved = localStorage.getItem('project001_current_user');
      if (saved) return JSON.parse(saved);
    } catch (_) {}
    return USER_ACCOUNTS[0];
  });

  // Listen to Firebase Auth state changes and sync role from Firestore
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser && fbUser.email) {
        try {
          const authUser = await getAuthorizedUserByEmail(fbUser.email);
          if (authUser) {
            setCurrentUser(authUser);
            try {
              localStorage.setItem('project001_current_user', JSON.stringify(authUser));
            } catch (_) {}
            // Refresh live Firestore data on sign-in
            paperStorage.loadAllPapers().then((dbPapers) => {
              if (dbPapers && dbPapers.length > 0) setPapers(dbPapers);
            });
            paperStorage.loadAllStudents().then((dbStudents) => {
              if (dbStudents && dbStudents.length > 0) setStudents(dbStudents);
            });
            paperStorage.loadAllMarkingSchemes().then((dbSchemes) => {
              if (dbSchemes && dbSchemes.length > 0) setMarkingSchemes(dbSchemes);
            });
          } else {
            await signOut(auth);
            localStorage.removeItem('project001_current_user');
          }
        } catch (err) {
          console.warn('[onAuthStateChanged] Error verifying authorized user:', err);
        }
      }
    });

    return () => unsubscribe();
  }, []);

  // Unified shared master database (Persisted in IndexedDB + LocalStorage)
  const [students, setStudents] = useState<StudentRecord[]>(() => paperStorage.loadInitialStudentsSync());
  const [papers, setPapers] = useState<ExamPaper[]>(() => paperStorage.loadInitialPapersSync());

  // Asynchronously hydrate full records (including high-resolution answer page images) from IndexedDB
  useEffect(() => {
    let isMounted = true;
    paperStorage.loadAllPapers().then((dbPapers) => {
      if (isMounted && Array.isArray(dbPapers) && dbPapers.length > 0) {
        setPapers((current) => {
          const map = new Map<string, ExamPaper>();
          // Priority to IndexedDB full data
          dbPapers.forEach((p) => map.set(p.id, p));
          current.forEach((p) => {
            if (!map.has(p.id)) {
              map.set(p.id, p);
            }
          });
          return Array.from(map.values());
        });
      }
    });

    paperStorage.loadAllStudents().then((dbStudents) => {
      if (isMounted && Array.isArray(dbStudents) && dbStudents.length > 0) {
        setStudents((current) => {
          const map = new Map<string, StudentRecord>();
          dbStudents.forEach((s) => map.set(s.id, s));
          current.forEach((s) => {
            if (!map.has(s.id)) {
              map.set(s.id, s);
            }
          });
          return Array.from(map.values());
        });
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);
  const [markingSchemes, setMarkingSchemes] = useState<MarkingScheme[]>(() => {
    try {
      const saved = localStorage.getItem('project001_marking_schemes_v2');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const cleaned = parsed.filter(
            (s) =>
              s.id !== 'scheme-physics-adv-2026' &&
              s.id !== 'scheme-maths-pure-2026' &&
              s.id !== 'scheme-physics-2026' &&
              s.id !== 'scheme-math-2026'
          );
          const mapped = cleaned.map(ensureDescriptiveSchemeQuestions);
          if (cleaned.length !== parsed.length) {
            try {
              localStorage.setItem('project001_marking_schemes_v2', JSON.stringify(mapped));
            } catch (_) {}
          }
          if (mapped.length > 0) return mapped;
        }
      }
    } catch (_) {}
    return INITIAL_MOCK_MARKING_SCHEMES;
  });
  const [activeResultCardStudentId, setActiveResultCardStudentId] = useState<string | null>(null);
  const [activeEditingPaperId, setActiveEditingPaperId] = useState<string | null>(null);
  const [activeEditingTab, setActiveEditingTab] = useState<'grading' | 'schemes'>('grading');
  const [shiftFilter, setShiftFilter] = useState<ShiftFilterType>('morning');
  const [recentUploads, setRecentUploads] = useState<RecentUploadLog[]>([]);
  const [backgroundJobs, setBackgroundJobs] = useState<BackgroundGradingJob[]>([]);
  const [studentImportJobs, setStudentImportJobs] = useState<StudentImportBatchJob[]>([]);
  const [errorAlert, setErrorAlert] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
  } | null>(null);

  const handleBatchImportStudents = (
    job: StudentImportBatchJob,
    images: string[],
    replaceExisting: boolean = false
  ) => {
    setStudentImportJobs((prev) => [job, ...prev]);

    runAsyncStudentImportJob(job, images, replaceExisting ? [] : students, {
      onJobStatusChange: (updatedJob) => {
        setStudentImportJobs((prev) =>
          prev.map((j) => (j.id === updatedJob.id ? updatedJob : j))
        );
      },
      onStudentsImported: (importedStudents) => {
        setStudents((prev) => {
          if (replaceExisting) {
            // Overwrite and replace mock records so only uploaded candidates appear (confirmed in modal)
            const map = new Map<string, StudentRecord>();
            importedStudents.forEach((s) => map.set(normalizeRoll(s.rollNumber), s));
            const updatedList = Array.from(map.values());
            try {
              localStorage.setItem('project001_students', JSON.stringify(updatedList));
            } catch (_) {}
            return updatedList;
          }

          // MERGE PATH (default, checkbox off):
          // a) Match by normalized roll number.
          // b) If roll exists -> UPDATE that record (keep same id, merge non-empty fields from OCR)
          // c) If roll is new -> APPEND.
          // d) NEVER remove a student whose roll is not in this batch.
          // e) Do NOT filter/delete legacy mock students during normal import.
          const map = new Map<string, StudentRecord>();
          prev.forEach((s) => map.set(normalizeRoll(s.rollNumber), s));
          importedStudents.forEach((s) => {
            const key = normalizeRoll(s.rollNumber);
            const existing = map.get(key);
            map.set(
              key,
              existing
                ? {
                    ...existing,
                    ...extractNonEmptyStudentFields(s),
                    id: existing.id,
                  }
                : s
            );
          });
          const updatedList = Array.from(map.values());
          try {
            localStorage.setItem('project001_students', JSON.stringify(updatedList));
          } catch (_) {}
          return updatedList;
        });
      },
    });
  };
  const handleClearAllStudents = () => {
    setStudents([]);
    try {
      localStorage.setItem('project001_students', JSON.stringify([]));
    } catch (_) {}
  };

  const handleResetStudents = () => {
    setStudents(INITIAL_MOCK_STUDENTS);
    try {
      localStorage.setItem('project001_students', JSON.stringify(INITIAL_MOCK_STUDENTS));
    } catch (_) {}
  };

  const [correctionLogs, setCorrectionLogs] = useState<CorrectionLog[]>(() => {
    try {
      const saved = localStorage.getItem('project001_correction_logs');
      if (saved) return JSON.parse(saved);
    } catch (_) {}
    return [];
  });

  const handleSaveMarkingScheme = (newScheme: MarkingScheme) => {
    const targetSubject = newScheme.subject.trim();
    const rawShift = newScheme.shift || 'morning';
    const targetShiftLabel = rawShift.toLowerCase().includes('evening') || rawShift.toLowerCase().includes('group 2')
      ? 'Evening (Group 2)'
      : 'Morning (Group 1)';
    const normalizedKey = `${targetSubject}_${targetShiftLabel}`;

    const normalizedScheme: MarkingScheme = ensureDescriptiveSchemeQuestions({
      ...newScheme,
      id: normalizedKey,
      subject: targetSubject,
      shift: rawShift.toLowerCase().includes('evening') ? 'evening' : 'morning',
    });

    // Save under normalized exact key in localStorage
    try {
      localStorage.setItem(`project001_scheme_${normalizedKey}`, JSON.stringify(normalizedScheme));
      localStorage.setItem(normalizedKey, JSON.stringify(normalizedScheme));
      localStorage.setItem(`scheme_${normalizedKey}`, JSON.stringify(normalizedScheme));
    } catch (_) {}

    setMarkingSchemes((prev) => {
      const filtered = prev.filter((s) => {
        const sSub = s.subject.trim().toLowerCase();
        const sShift = (s.shift || 'morning').trim().toLowerCase();
        const isSame =
          sSub === targetSubject.toLowerCase() &&
          ((rawShift.includes('evening') && sShift.includes('evening')) ||
            (!rawShift.includes('evening') && !sShift.includes('evening')));
        return !isSame && s.id !== newScheme.id && s.id !== normalizedKey;
      });

      const updated = [normalizedScheme, ...filtered].map(ensureDescriptiveSchemeQuestions);
      try {
        localStorage.setItem('project001_marking_schemes_v2', JSON.stringify(updated));
      } catch (_) {}
      return updated;
    });
  };

  const handleSaveOrUpdatePaper = (newOrUpdatedPaper: ExamPaper) => {
    const isNew = !papers.some((p) => p.id === newOrUpdatedPaper.id);
    if (isNew) {
      const studentForPaper = students.find((s) => s.id === newOrUpdatedPaper.studentId);
      const studentRoll = studentForPaper?.rollNumber || newOrUpdatedPaper.aiGradingDetails?.identityCheck?.selectedStudentRoll;
      const studentName = studentForPaper?.fullName || newOrUpdatedPaper.aiGradingDetails?.identityCheck?.selectedStudentName;

      const dupCheck = checkForDuplicatePaper(
        papers,
        students,
        studentRoll,
        studentName,
        newOrUpdatedPaper.studentId,
        newOrUpdatedPaper.subject
      );
      if (dupCheck.isDuplicate) {
        setErrorAlert({
          isOpen: true,
          title: 'Duplicate Paper Detected',
          message: dupCheck.errorMessage || '',
        });
        return;
      }
    }

    setPapers((prev) => {
      const idx = prev.findIndex((p) => p.id === newOrUpdatedPaper.id);
      let updated: ExamPaper[];
      if (idx >= 0) {
        updated = [...prev];
        updated[idx] = newOrUpdatedPaper;
      } else {
        updated = [newOrUpdatedPaper, ...prev];
      }
      paperStorage.saveAllPapers(updated);
      return updated;
    });

    // Auto-link/save student if not yet present in students list
    const studentName =
      newOrUpdatedPaper.aiGradingDetails?.identityCheck?.selectedStudentName ||
      newOrUpdatedPaper.aiGradingDetails?.identityCheck?.paperStudentName ||
      newOrUpdatedPaper.aiGradingDetails?.transcription?.header?.studentName;
    const studentRoll =
      newOrUpdatedPaper.aiGradingDetails?.identityCheck?.selectedStudentRoll ||
      newOrUpdatedPaper.aiGradingDetails?.identityCheck?.paperRollNumber ||
      newOrUpdatedPaper.aiGradingDetails?.transcription?.header?.studentRoll;

    if (newOrUpdatedPaper.studentId && (studentName || studentRoll)) {
      setStudents((prev) => {
        const existing = prev.find(
          (s) => s.id === newOrUpdatedPaper.studentId || (studentRoll && s.rollNumber === studentRoll)
        );
        if (existing) {
          if (studentName && (existing.fullName === 'Auto-Detected Candidate' || existing.fullName === 'Candidate')) {
            const updated = prev.map((s) => (s.id === existing.id ? { ...s, fullName: studentName } : s));
            paperStorage.saveAllStudents(updated);
            return updated;
          }
          return prev;
        }

        const newStd: StudentRecord = {
          id: newOrUpdatedPaper.studentId,
          fullName: studentName || 'Candidate',
          fatherName: 'Guardian',
          rollNumber: studentRoll || '3080260',
          admissionNumber: `ADM-2024-${(studentRoll || '1041').replace(/[^0-9]/g, '').slice(-4)}`,
          classGrade: 'Grade 11 (HSSC-I)',
          section: 'A',
          group: 'Pre-Engineering',
          institutionName: 'Islamabad College for Boys, G-6/3, Islamabad',
          centerCode: 'ISB-042',
          subjectEnrolled: newOrUpdatedPaper.subject || 'Physics (Advanced)',
          enrollmentStatus: 'Active',
          enrolledSubjects: [newOrUpdatedPaper.subject || 'Physics (Advanced)'],
        };
        const updated = [newStd, ...prev];
        paperStorage.saveAllStudents(updated);
        return updated;
      });
    }
  };

  const handleQueueBackgroundJob = (job: BackgroundGradingJob) => {
    setBackgroundJobs((prev) => [job, ...prev]);

    // Asynchronously run pipeline in background
    runAsyncGradingJob(job, students, markingSchemes, {
      onJobStatusChange: (updatedJob) => {
        setBackgroundJobs((prev) =>
          prev.map((j) => (j.id === updatedJob.id ? updatedJob : j))
        );
      },
      onPaperCreated: (newPaper) => {
        handleSaveOrUpdatePaper(newPaper);
      },
      onStudentCreated: (newStudent) => {
        setStudents((prev) => {
          if (prev.some((s) => s.id === newStudent.id || s.rollNumber === newStudent.rollNumber)) {
            return prev;
          }
          const updated = [newStudent, ...prev];
          paperStorage.saveAllStudents(updated);
          return updated;
        });
      },
      onRecentUploadAdded: (log) => {
        setRecentUploads((prev) => [log, ...prev]);
      },
    });
  };

  const handleAddCorrectionLog = (newLog: CorrectionLog) => {
    setCorrectionLogs((prev) => {
      const updated = [newLog, ...prev];
      try {
        localStorage.setItem('project001_correction_logs', JSON.stringify(updated));
      } catch (_) {}
      return updated;
    });
  };

  const handleSaveMarkingSchemes = (updatedSchemes: MarkingScheme[]) => {
    const processed = updatedSchemes.map(ensureDescriptiveSchemeQuestions);
    setMarkingSchemes(processed);
    try {
      localStorage.setItem('project001_marking_schemes_v2', JSON.stringify(processed));
      localStorage.setItem('project001_marking_schemes', JSON.stringify(processed));
    } catch (_) {}
  };

  const handleDeleteMarkingScheme = (schemeId: string) => {
    setMarkingSchemes((prev) => {
      const target = prev.find((s) => s.id === schemeId || (s as any).key === schemeId);
      const updated = prev.filter((s) => s.id !== schemeId && (s as any).key !== schemeId);
      try {
        if (updated.length === 0) {
          localStorage.setItem('project001_marking_schemes_v2', JSON.stringify([]));
          localStorage.setItem('project001_marking_schemes', JSON.stringify([]));
        } else {
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
        }
      } catch (_) {}
      return updated;
    });
  };

  const handleDeleteAllMarkingSchemes = () => {
    setMarkingSchemes([]);
    try {
      localStorage.setItem('project001_marking_schemes_v2', JSON.stringify([]));
      localStorage.setItem('project001_marking_schemes', JSON.stringify([]));
    } catch (_) {}
  };

  const handleLoginSuccess = (user: UserAccount) => {
    setCurrentUser(user);
    try {
      localStorage.setItem('project001_current_user', JSON.stringify(user));
    } catch (_) {}
    goToScreen('menu', 'forward');
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (_) {}
    try {
      localStorage.removeItem('project001_current_user');
    } catch (_) {}
    goToScreen('login', 'backward');
  };

  const goToScreen = (
    screen: ScreenType,
    direction: 'forward' | 'backward' = 'forward'
  ) => {
    setTransitionDirection(direction);
    setCurrentScreen(screen);
  };

  // Update paper marks/status from Editing module
  const handleUpdatePaper = (updatedPaper: ExamPaper) => {
    handleSaveOrUpdatePaper(updatedPaper);
  };

  // Delete paper entry from storage & state (maintains student profile)
  const handleDeletePaper = (paperIdOrStudentId: string) => {
    setPapers((prev) => {
      const updated = prev.filter(
        (p) =>
          p.id !== paperIdOrStudentId &&
          p.studentId !== paperIdOrStudentId &&
          `new-${p.studentId}` !== paperIdOrStudentId &&
          `paper-${p.studentId}` !== paperIdOrStudentId
      );
      paperStorage.saveAllPapers(updated);
      return updated;
    });
    paperStorage.deletePaper(paperIdOrStudentId);
  };

  // Add new student from Students Data module
  const handleAddStudent = (newStudent: StudentRecord) => {
    setStudents((prev) => [newStudent, ...prev]);

    // Automatically create a companion paper record so it's immediately gradeable in Editing
    const newPaper: ExamPaper = {
      id: `paper-${Date.now()}`,
      studentId: newStudent.id,
      subject: newStudent.subjectEnrolled || 'General Studies',
      examSession: 'Annual Senior Examinations 2026',
      dateSubmitted: new Date().toISOString().split('T')[0],
      status: 'Pending Review',
      remarks: 'Freshly enrolled student paper awaiting examiner inspection.',
      questions: [
        {
          questionNumber: 1,
          questionText: 'Fundamentals and core principles assessment question.',
          maxMarks: 10,
          aiSuggestedMark: 8,
          examinerMark: 8,
        },
        {
          questionNumber: 2,
          questionText: 'Analytical problem solving and derivation analysis.',
          maxMarks: 10,
          aiSuggestedMark: 7,
          examinerMark: 7,
        },
        {
          questionNumber: 3,
          questionText: 'Case study evaluation and methodology implementation.',
          maxMarks: 10,
          aiSuggestedMark: 9,
          examinerMark: 9,
        },
        {
          questionNumber: 4,
          questionText: 'Technical diagram interpretation and labeling accuracy.',
          maxMarks: 10,
          aiSuggestedMark: 8,
          examinerMark: 8,
        },
        {
          questionNumber: 5,
          questionText: 'Comprehensive critical summary and conclusion.',
          maxMarks: 10,
          aiSuggestedMark: 8,
          examinerMark: 8,
        },
      ],
    };

    setPapers((prev) => [newPaper, ...prev]);
  };

  // Update student profile from Students Data module
  const handleUpdateStudent = (updatedStudent: StudentRecord) => {
    setStudents((prev) =>
      prev.map((s) => (s.id === updatedStudent.id ? updatedStudent : s))
    );
  };

  // Delete student and any associated paper
  const handleDeleteStudent = (studentId: string) => {
    setStudents((prev) => prev.filter((s) => s.id !== studentId));
    setPapers((prev) => prev.filter((p) => p.studentId !== studentId));
  };

  // Jump from Student Profile to Result Card
  const handleJumpToResultCard = (studentId: string) => {
    setActiveResultCardStudentId(studentId);
    goToScreen('result-cards', 'forward');
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        setCurrentUser: (user) => {
          if (user) setCurrentUser(user);
        },
        isDeveloper: isDeveloper(currentUser),
        isNormal: isNormal(currentUser),
      }}
    >
      <div className="relative w-screen h-screen overflow-hidden bg-black font-rounded">
        <AnimatePresence mode="wait" initial={false}>
          {currentScreen === 'landing' && (
            <motion.div
              key="screen-landing"
              initial={{ opacity: 0, y: transitionDirection === 'forward' ? -40 : 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -80, scale: 0.98 }}
              transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
              className="absolute inset-0 w-full h-full"
            >
              <LandingScreen onContinue={() => goToScreen('login', 'forward')} />
            </motion.div>
          )}

          {currentScreen === 'login' && (
            <motion.div
              key="screen-login"
              initial={{
                opacity: 0,
                y: transitionDirection === 'forward' ? 100 : -50,
              }}
              animate={{ opacity: 1, y: 0 }}
              exit={{
                opacity: 0,
                y: transitionDirection === 'forward' ? -60 : 80,
              }}
              transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
              className="absolute inset-0 w-full h-full overflow-y-auto"
            >
              <LoginScreen
                onLoginSuccess={handleLoginSuccess}
                onBackToLanding={() => goToScreen('landing', 'backward')}
              />
            </motion.div>
          )}

          {currentScreen === 'menu' && (
            <motion.div
              key="screen-menu"
              initial={{ opacity: 0, scale: 0.96, y: transitionDirection === 'forward' ? 40 : -40 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: transitionDirection === 'forward' ? -40 : 40 }}
              transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
              className="absolute inset-0 w-full h-full overflow-y-auto"
            >
              <MainMenuScreen
                currentUser={currentUser}
                papers={papers}
                shiftFilter={shiftFilter}
                onShiftFilterChange={setShiftFilter}
                onLogout={handleLogout}
                onOpenUploading={() => goToScreen('uploading', 'forward')}
                onOpenEditing={() => {
                  setActiveEditingPaperId(null);
                  goToScreen('editing', 'forward');
                }}
                onOpenResultCards={() => {
                  setActiveResultCardStudentId(null);
                  goToScreen('result-cards', 'forward');
                }}
                onOpenStudentsData={() => goToScreen('students-data', 'forward')}
                onOpenAgent={() => setIsExaminerChatOpen(true)}
                onOpenDataMigration={() => setIsDataMigrationOpen(true)}
              />
            </motion.div>
          )}

          {currentScreen === 'uploading' && (
            <motion.div
              key="screen-uploading"
              initial={{ opacity: 0, x: 60 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 60 }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              className="absolute inset-0 w-full h-full overflow-y-auto bg-slate-50"
            >
              <UploadingScreen
                currentUser={currentUser}
                papers={papers}
                students={students}
                markingSchemes={markingSchemes}
                onSaveMarkingScheme={handleSaveMarkingScheme}
                onDeleteMarkingScheme={handleDeleteMarkingScheme}
                onDeleteAllMarkingSchemes={handleDeleteAllMarkingSchemes}
                recentUploads={recentUploads}
                onBackToMenu={() => goToScreen('menu', 'backward')}
                onSubmitPaper={(newPaper) => {
                  handleSaveOrUpdatePaper(newPaper);
                }}
                onQueueBackgroundJob={handleQueueBackgroundJob}
                onBatchImportStudents={handleBatchImportStudents}
                studentImportJobs={studentImportJobs}
                onAddRecentUpload={(log) => {
                  setRecentUploads((prev) => [log, ...prev]);
                }}
                onOpenEditingWithPaper={(paperId) => {
                  setActiveEditingPaperId(paperId);
                  setActiveEditingTab('grading');
                  goToScreen('editing', 'forward');
                }}
                onOpenSchemeEditor={() => {
                  setActiveEditingTab('schemes');
                  goToScreen('editing', 'forward');
                }}
              />
            </motion.div>
          )}

          {currentScreen === 'editing' && (
            <motion.div
              key="screen-editing"
              initial={{ opacity: 0, x: 60 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 60 }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              className="absolute inset-0 w-full h-full overflow-y-auto bg-slate-50"
            >
              <EditingScreen
                currentUser={currentUser}
                papers={papers}
                students={students}
                markingSchemes={markingSchemes}
                shiftFilter={shiftFilter}
                onShiftFilterChange={setShiftFilter}
                onSaveMarkingSchemes={handleSaveMarkingSchemes}
                onDeleteMarkingScheme={handleDeleteMarkingScheme}
                onDeleteAllMarkingSchemes={handleDeleteAllMarkingSchemes}
                initialPaperId={activeEditingPaperId}
                initialTab={activeEditingTab}
                onUpdatePaper={handleUpdatePaper}
                onDeletePaper={handleDeletePaper}
                onBackToMenu={() => goToScreen('menu', 'backward')}
                correctionLogs={correctionLogs}
                onAddCorrectionLog={handleAddCorrectionLog}
              />
            </motion.div>
          )}

          {currentScreen === 'result-cards' && (
            <motion.div
              key="screen-result-cards"
              initial={{ opacity: 0, x: 60 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 60 }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              className="absolute inset-0 w-full h-full overflow-y-auto bg-slate-50"
            >
              <ResultCardsScreen
                currentUser={currentUser}
                papers={papers}
                students={students}
                shiftFilter={shiftFilter}
                onShiftFilterChange={setShiftFilter}
                initialStudentId={activeResultCardStudentId}
                onBackToMenu={() => goToScreen('menu', 'backward')}
                onOpenEditing={() => goToScreen('editing', 'forward')}
                onDeletePaper={handleDeletePaper}
              />
            </motion.div>
          )}

          {currentScreen === 'students-data' && (
            <motion.div
              key="screen-students-data"
              initial={{ opacity: 0, x: 60 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 60 }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              className="absolute inset-0 w-full h-full overflow-y-auto bg-slate-50"
            >
              <StudentsDataScreen
                currentUser={currentUser}
                students={students}
                papers={papers}
                shiftFilter={shiftFilter}
                onShiftFilterChange={setShiftFilter}
                onAddStudent={handleAddStudent}
                onUpdateStudent={handleUpdateStudent}
                onDeleteStudent={handleDeleteStudent}
                onClearAllStudents={handleClearAllStudents}
                onResetStudents={handleResetStudents}
                onBackToMenu={() => goToScreen('menu', 'backward')}
                onViewResultCard={handleJumpToResultCard}
                onOpenEditing={() => goToScreen('editing', 'forward')}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* ════════ GLOBAL EXAMINER CHAT FLOATING BUTTON (Visible on every screen) ════════ */}
        <motion.button
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.94 }}
          onClick={() => setIsExaminerChatOpen((prev) => !prev)}
          className="fixed bottom-4 right-4 md:bottom-6 md:right-6 z-40 w-12 h-12 md:w-14 md:h-14 rounded-full flex items-center justify-center text-white shadow-2xl transition-all cursor-pointer group print:hidden"
          style={{
            background: 'linear-gradient(135deg, #4DD9E8 0%, #0047AB 100%)',
            boxShadow: '0 8px 25px -4px rgba(0, 71, 171, 0.55)',
          }}
          title="Open Examiner Chat"
          aria-label="Open Examiner Chat"
        >
          <div className="relative flex items-center justify-center">
            <MessageSquareText className="w-5 h-5 md:w-6 md:h-6 group-hover:scale-110 transition-transform" />
          </div>
          {/* Subtle online status indicator */}
          <span className="absolute top-1 right-1 w-3 h-3 md:w-3.5 md:h-3.5 bg-emerald-400 rounded-full border-2 border-white ring-2 ring-emerald-300/50" />
        </motion.button>

        {/* ════════ GLOBAL BACKGROUND JOBS TRAY ════════ */}
        <div className="print:hidden">
          <BackgroundJobsTray
            jobs={backgroundJobs}
            onOpenEditingWithPaper={(paperId) => {
              setActiveEditingPaperId(paperId);
              goToScreen('editing', 'forward');
            }}
            onDismissJob={(jobId) => {
              setBackgroundJobs((prev) => prev.filter((j) => j.id !== jobId));
            }}
          />
        </div>

        {/* ════════ GLOBAL SLIDE-OUT EXAMINER CHAT PANEL ════════ */}
        <div className="print:hidden">
          <ExaminerChatPanel
            isOpen={isExaminerChatOpen}
            onClose={() => setIsExaminerChatOpen(false)}
          />
        </div>
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
                    <MessageSquareText className="w-5 h-5 text-amber-600" />
                  </div>
                  <div>
                    <h3 className="font-rounded font-bold text-base sm:text-lg text-slate-900 leading-tight">
                      {errorAlert.title}
                    </h3>
                    <p className="text-xs font-rounded text-slate-500">
                      System Notification
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

        {/* Developer-Only Cloud Data Migration & Backup Modal */}
        <DataMigrationModal
          isOpen={isDataMigrationOpen}
          onClose={() => setIsDataMigrationOpen(false)}
          currentPapers={papers}
          currentStudents={students}
          currentSchemes={markingSchemes}
          onMigrationComplete={(counts) => {
            // Re-sync authoritative records from Firestore
            paperStorage.loadAllPapers().then((p) => {
              if (p && p.length > 0) setPapers(p);
            });
            paperStorage.loadAllStudents().then((s) => {
              if (s && s.length > 0) setStudents(s);
            });
            paperStorage.loadAllMarkingSchemes().then((sch) => {
              if (sch && sch.length > 0) setMarkingSchemes(sch);
            });
          }}
        />
      </div>
    </AuthContext.Provider>
  );
}
