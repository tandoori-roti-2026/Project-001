import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft,
  Camera,
  Upload,
  Image as ImageIcon,
  CheckCircle2,
  Trash2,
  ChevronLeft,
  ChevronRight,
  RotateCw,
  Plus,
  RefreshCw,
  AlertCircle,
  FileText,
  User,
  BookOpen,
  Calendar,
  Layers,
  ArrowRight,
  Eye,
  X,
  SwitchCamera,
  Check,
  AlertTriangle,
  Loader2,
  ShieldCheck,
  ShieldAlert,
  Files,
  Zap,
  FileCheck,
  UserCheck,
  Scan,
  FileSpreadsheet,
  FileUp,
  Clock,
} from 'lucide-react';
import { StudentRecord, ExamPaper, PaperStatus, ExamQuestion } from '../data/mockPapers';
import { MarkingScheme } from '../data/mockMarkingSchemes';
import { UserAccount } from '../data/authUsers';
import { UserIdentityBadge } from './UserIdentityBadge';
import { BatchUploadModal } from './BatchUploadModal';
import { convertPdfToPageImages, compressImageToJpeg } from '../utils/pdfProcessor';
import { BackgroundGradingJob } from '../utils/asyncGradingPipeline';
import { StudentImportBatchJob } from '../utils/studentImportPipeline';
import { checkForDuplicatePaper } from '../utils/duplicateCheck';

export interface RecentUploadLog {
  paperId: string;
  studentId: string;
  studentName: string;
  studentRoll: string;
  subject: string;
  pagesCount: number;
  thumbnailUrl: string;
  timestamp: string;
  status: PaperStatus;
}

interface UploadingScreenProps {
  currentUser?: UserAccount | null;
  papers?: ExamPaper[];
  students: StudentRecord[];
  markingSchemes: MarkingScheme[];
  onSaveMarkingScheme?: (scheme: MarkingScheme) => void;
  onDeleteMarkingScheme?: (schemeId: string) => void;
  onDeleteAllMarkingSchemes?: () => void;
  onBackToMenu: () => void;
  onSubmitPaper: (newPaper: ExamPaper) => void;
  onQueueBackgroundJob?: (job: BackgroundGradingJob) => void;
  onBatchImportStudents?: (job: StudentImportBatchJob, images: string[], replaceExisting?: boolean) => void;
  studentImportJobs?: StudentImportBatchJob[];
  onAddStudent?: (student: StudentRecord) => void;
  onOpenEditingWithPaper: (paperId: string) => void;
  onOpenSchemeEditor?: () => void;
  recentUploads: RecentUploadLog[];
  onAddRecentUpload: (log: RecentUploadLog) => void;
}

const COMMON_SUBJECTS = [
  'Physics (Advanced)',
  'Pure Mathematics',
  'Chemistry (Organic)',
  'Computer Science',
  'Biology',
  'General Studies',
  'English Literature',
  'Islamic Studies / Ethics',
  'Pakistan Studies / Social Studies',
];

export const UploadingScreen: React.FC<UploadingScreenProps> = ({
  currentUser,
  papers = [],
  students,
  markingSchemes,
  onSaveMarkingScheme,
  onDeleteMarkingScheme,
  onDeleteAllMarkingSchemes,
  onBackToMenu,
  onSubmitPaper,
  onQueueBackgroundJob,
  onBatchImportStudents,
  studentImportJobs,
  onAddStudent,
  onOpenEditingWithPaper,
  onOpenSchemeEditor,
  recentUploads,
  onAddRecentUpload,
}) => {
  // Student, Shift & Subject selection state
  const [selectedStudentId, setSelectedStudentId] = useState<string>(
    students[0]?.id || ''
  );
  const [studentSearch, setStudentSearch] = useState('');
  const [isStudentDropdownOpen, setIsStudentDropdownOpen] = useState(false);
  const [selectedShift, setSelectedShift] = useState<'morning' | 'evening'>('morning');

  // Developer Mode Bulk Student Import via Roll Number Slips state
  const [slipsToast, setSlipsToast] = useState<{ batchTitle: string; count: number } | null>(null);
  const [isSlipsParsing, setIsSlipsParsing] = useState<boolean>(false);
  const [replaceExistingOnImport, setReplaceExistingOnImport] = useState<boolean>(false);
  const [showWipeConfirmModal, setShowWipeConfirmModal] = useState<boolean>(false);
  const [pendingWipeImport, setPendingWipeImport] = useState<{
    job: StudentImportBatchJob;
    images: string[];
  } | null>(null);

  // Developer Mode Question Paper Scheme Generator state
  const [qpImages, setQpImages] = useState<string[]>([]);
  const [qpSubject, setQpSubject] = useState<string>('Physics (Advanced)');
  const [qpShift, setQpShift] = useState<'morning' | 'evening'>('morning');
  const [isGeneratingScheme, setIsGeneratingScheme] = useState<boolean>(false);
  const [generatedScheme, setGeneratedScheme] = useState<MarkingScheme | null>(null);
  const [qpError, setQpError] = useState<string | null>(null);
  const [isDetectingHeader, setIsDetectingHeader] = useState<boolean>(false);
  const [detectedHeaderInfo, setDetectedHeaderInfo] = useState<{
    subject: string;
    shift: 'morning' | 'evening';
    headerText?: string;
  } | null>(null);
  const [schemeToast, setSchemeToast] = useState<{
    message: string;
    type: 'info' | 'success' | 'error';
    subject?: string;
    shift?: string;
  } | null>(null);

  // PDF parsing state
  const [pdfStatus, setPdfStatus] = useState<{
    isParsing: boolean;
    fileName: string;
    totalPages: number;
  } | null>(null);

  // Cover Page OCR Auto-Identification state
  const [coverExtraction, setCoverExtraction] = useState<{
    isExtracting: boolean;
    metadata?: any;
    autoMatchedStudent?: StudentRecord | null;
    isAutoCreated?: boolean;
  } | null>(null);

  const [deleteConfirmModal, setDeleteConfirmModal] = useState<{
    isOpen: boolean;
    type: 'single' | 'all';
    schemeId?: string;
    title?: string;
  } | null>(null);

  const [errorAlert, setErrorAlert] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
  } | null>(null);

  const handleDeleteConfirm = () => {
    if (!deleteConfirmModal) return;
    if (deleteConfirmModal.type === 'all' && onDeleteAllMarkingSchemes) {
      onDeleteAllMarkingSchemes();
      setSchemeToast({ message: 'All marking schemes deleted. System reset to clean state.', type: 'info' });
    } else if (deleteConfirmModal.type === 'single' && deleteConfirmModal.schemeId && onDeleteMarkingScheme) {
      onDeleteMarkingScheme(deleteConfirmModal.schemeId);
      setSchemeToast({ message: `Marking scheme "${deleteConfirmModal.title}" deleted.`, type: 'info' });
    }
    setDeleteConfirmModal(null);
  };

  // Asynchronous non-blocking submission toast
  const [asyncToast, setAsyncToast] = useState<{
    submissionId: string;
    studentName: string;
    studentRoll: string;
    pagesCount: number;
    subject: string;
    timestamp: string;
  } | null>(null);

  const selectedStudent =
    selectedStudentId && selectedStudentId !== 'auto-detect'
      ? students.find((s) => s.id === selectedStudentId) || students[0]
      : null;

  const [selectedSchemeId, setSelectedSchemeId] = useState<string>(() => {
    if (markingSchemes && markingSchemes.length > 0) {
      const studentSub = selectedStudent?.subjectEnrolled;
      if (studentSub) {
        const match = markingSchemes.find(
          (s) =>
            s.subject.toLowerCase() === studentSub.toLowerCase() ||
            s.title.toLowerCase().includes(studentSub.toLowerCase())
        );
        if (match) return match.id;
      }
      return markingSchemes[0].id;
    }
    return '';
  });

  const [selectedSubject, setSelectedSubject] = useState<string>(() => {
    if (markingSchemes && markingSchemes.length > 0) {
      const match = markingSchemes.find((s) => s.id === selectedSchemeId);
      if (match) return match.title || match.subject;
    }
    return selectedStudent?.subjectEnrolled || 'Physics (Advanced)';
  });
  const [customSubject, setCustomSubject] = useState('');
  const [isCustomSubject, setIsCustomSubject] = useState(false);
  const [examSession] = useState('Annual Senior Examinations 2026');

  // AI Grading Pipeline Modal State
  const [pipelineModal, setPipelineModal] = useState<{
    isOpen: boolean;
    step: 'reading' | 'grading' | 'done' | 'failed';
    paperId: string;
    subjectName: string;
    studentName: string;
    error?: string;
    totalMarks?: number;
    maxMarks?: number;
    identityCheck?: {
      passed: boolean;
      paperRollNumber?: string;
      paperStudentName?: string;
      selectedStudentRoll?: string;
      selectedStudentName?: string;
      mismatchReason?: string;
    };
    status?: PaperStatus;
  }>({
    isOpen: false,
    step: 'reading',
    paperId: '',
    subjectName: '',
    studentName: '',
  });

  // Batch Upload Dev Mode Modal State
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);

  // Update default subject and scheme when student changes
  useEffect(() => {
    if (selectedStudent && !isCustomSubject) {
      const studentSub = selectedStudent.subjectEnrolled || '';
      const matchedScheme = markingSchemes.find(
        (s) =>
          s.subject.toLowerCase() === studentSub.toLowerCase() ||
          s.title.toLowerCase().includes(studentSub.toLowerCase())
      );
      if (matchedScheme) {
        setSelectedSchemeId(matchedScheme.id);
        setSelectedSubject(matchedScheme.title || matchedScheme.subject);
      } else if (studentSub) {
        setSelectedSubject(studentSub);
      }
    }
  }, [selectedStudentId, isCustomSubject, markingSchemes]);

  // Keep selectedSchemeId valid if markingSchemes list updates
  useEffect(() => {
    if (markingSchemes.length > 0) {
      const currentExists = markingSchemes.some((s) => s.id === selectedSchemeId);
      if (!currentExists) {
        setSelectedSchemeId(markingSchemes[0].id);
        setSelectedSubject(markingSchemes[0].title || markingSchemes[0].subject);
      }
    }
  }, [markingSchemes]);

  // Uploaded Pages state (Multi-page script)
  const [pages, setPages] = useState<string[]>([]);
  const [stagingImage, setStagingImage] = useState<string | null>(null);
  const [stagingRotation, setStagingRotation] = useState<number>(0);

  // Live Camera Viewfinder state
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraFacing, setCameraFacing] = useState<'environment' | 'user'>('environment');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Fallback hidden inputs
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  // Drag & drop state
  const [isDragOver, setIsDragOver] = useState(false);

  // Inspection modal
  const [previewingPageIdx, setPreviewingPageIdx] = useState<number | null>(null);

  // Submission success state
  const [submittedPaper, setSubmittedPaper] = useState<{
    paperId: string;
    studentName: string;
    studentRoll: string;
    subject: string;
    pagesCount: number;
    submittedAt: string;
  } | null>(null);

  // Filter students by search term
  const filteredStudents = students.filter(
    (s) =>
      s.fullName.toLowerCase().includes(studentSearch.toLowerCase()) ||
      s.rollNumber.toLowerCase().includes(studentSearch.toLowerCase()) ||
      (s.classGrade?.toLowerCase().includes(studentSearch.toLowerCase()) ?? false)
  );

  // Clean up camera stream on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  // ════════ CAMERA MANAGEMENT ════════
  const startCamera = async (facing: 'environment' | 'user' = 'environment') => {
    stopCamera();
    setCameraError(null);
    setIsCameraActive(true);

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera API not supported in this browser.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facing },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    } catch (err: any) {
      console.warn('Camera access unavailable:', err);
      setIsCameraActive(false);
      setCameraError('Camera not available — please upload a file instead');
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
  };

  const toggleCameraFacing = () => {
    const nextFacing = cameraFacing === 'environment' ? 'user' : 'environment';
    setCameraFacing(nextFacing);
    startCamera(nextFacing);
  };

  const captureCameraFrame = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');

    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
      stopCamera();
      setStagingImage(dataUrl);
      setStagingRotation(0);
    }
  };

  // ════════ OCR COVER PAGE AUTO-IDENTIFICATION TRIGGER ════════
  const triggerCoverExtraction = async (page1Image: string) => {
    if (!page1Image) return;
    setCoverExtraction({ isExtracting: true });

    try {
      const res = await fetch('/api/extract-cover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          coverImage: page1Image,
          existingStudents: students,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success && data.metadata) {
          const isExplicitStudent = Boolean(
            selectedStudentId &&
            selectedStudentId !== 'auto-detect' &&
            students.some((s) => s.id === selectedStudentId)
          );

          if (!isExplicitStudent) {
            if (data.matchedStudent) {
              setSelectedStudentId(data.matchedStudent.id);
            } else if (data.autoStudent) {
              if (onAddStudent) {
                onAddStudent(data.autoStudent);
              }
              setSelectedStudentId(data.autoStudent.id);
            }
          }

          if (data.metadata.subject) {
            const matchedSub = COMMON_SUBJECTS.find(
              (s) => s.toLowerCase().includes(data.metadata.subject.toLowerCase())
            );
            if (matchedSub) setSelectedSubject(matchedSub);
          }
          if (data.metadata.shift) {
            setSelectedShift(data.metadata.shift === 'evening' ? 'evening' : 'morning');
          }

          setCoverExtraction({
            isExtracting: false,
            metadata: data.metadata,
            autoMatchedStudent: isExplicitStudent
              ? (selectedStudent || data.matchedStudent || data.autoStudent || null)
              : (data.matchedStudent || data.autoStudent || null),
            isAutoCreated: Boolean(data.autoStudent),
          });
        } else {
          setCoverExtraction(null);
        }
      } else {
        setCoverExtraction(null);
      }
    } catch (e) {
      console.warn('Cover extraction non-blocking error:', e);
      setCoverExtraction(null);
    }
  };

  // ════════ DEV MODE: OFFICIAL QUESTION PAPER & SCHEME GENERATOR HANDLERS ════════
  const handleQPFilesSelected = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const fileArray = Array.from(files);

    const pdfFiles = fileArray.filter(
      (f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
    );
    const imageFiles = fileArray.filter(
      (f) => f.type.startsWith('image/') || f.name.match(/\.(png|jpe?g|webp)$/i)
    );

    let newImages: string[] = [];

    if (pdfFiles.length > 0) {
      try {
        for (const pdf of pdfFiles) {
          const parsed = await convertPdfToPageImages(pdf, pdf.name, 1.2);
          newImages = [...newImages, ...parsed.pageImages];
        }
      } catch (err: any) {
        setQpError('Failed to parse Question Paper PDF: ' + (err.message || 'Error reading PDF.'));
      }
    }

    if (imageFiles.length > 0) {
      const readers = imageFiles.map((file) => {
        return new Promise<string>((resolve) => {
          const r = new FileReader();
          r.onload = async () => {
            const raw = r.result as string;
            try {
              const compressed = await compressImageToJpeg(raw, 1400, 0.72);
              resolve(compressed);
            } catch (_) {
              resolve(raw);
            }
          };
          r.readAsDataURL(file);
        });
      });
      const dataUrls = await Promise.all(readers);
      newImages = [...newImages, ...dataUrls];
    }

    if (newImages.length > 0) {
      setQpImages((prev) => [...prev, ...newImages]);
      setQpError(null);

      // 1. Fast filename heuristic check
      const primaryFileName = files[0]?.name || '';
      const fn = primaryFileName.toLowerCase();
      let matchedSub = '';
      if (fn.includes('chem')) matchedSub = 'Chemistry (Organic)';
      else if (fn.includes('math') || fn.includes('calc')) matchedSub = 'Pure Mathematics';
      else if (fn.includes('comp') || fn.includes('cs')) matchedSub = 'Computer Science';
      else if (fn.includes('bio')) matchedSub = 'Biology';
      else if (fn.includes('phys')) matchedSub = 'Physics (Advanced)';
      else if (fn.includes('urdu')) matchedSub = 'Urdu Literature';
      else if (fn.includes('eng')) matchedSub = 'English Advanced';
      else if (fn.includes('islam')) matchedSub = 'Islamic Education';
      else if (fn.includes('pak')) matchedSub = 'Pakistan Studies';

      if (matchedSub) {
        setQpSubject(matchedSub);
      }

      if (
        fn.includes('eve') ||
        fn.includes('grp2') ||
        fn.includes('group-2') ||
        fn.includes('group2') ||
        fn.includes('group-ii') ||
        fn.includes('group ii')
      ) {
        setQpShift('evening');
      } else if (
        fn.includes('morn') ||
        fn.includes('grp1') ||
        fn.includes('group-1') ||
        fn.includes('group1') ||
        fn.includes('group-i') ||
        fn.includes('group i')
      ) {
        setQpShift('morning');
      }

      // 2. Scan question paper header (e.g., text reading "CHEMISTRY HSSC-I") BEFORE generation
      setIsDetectingHeader(true);
      fetch('/api/detect-qp-header', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: newImages[0],
          filename: primaryFileName,
        }),
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.success) {
            if (data.subject) {
              setQpSubject(data.subject);
            }
            if (data.shift) {
              setQpShift(data.shift === 'evening' ? 'evening' : 'morning');
            }
            setDetectedHeaderInfo({
              subject: data.subject || qpSubject,
              shift: (data.shift || qpShift) === 'evening' ? 'evening' : 'morning',
              headerText: data.headerText,
            });
          }
        })
        .catch((err) => console.warn('Header auto-detection error:', err))
        .finally(() => setIsDetectingHeader(false));
    }
  };

  // ════════ DEV MODE: BULK STUDENT IMPORT VIA ROLL NUMBER SLIPS HANDLER ════════
  const handleSlipsFilesSelected = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const fileArray = Array.from(files);

    setIsSlipsParsing(true);
    let allPageImages: string[] = [];

    const pdfFiles = fileArray.filter(
      (f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
    );
    const imageFiles = fileArray.filter(
      (f) => f.type.startsWith('image/') || f.name.match(/\.(png|jpe?g|webp)$/i)
    );

    if (pdfFiles.length > 0) {
      for (const pdfFile of pdfFiles) {
        try {
          const parsed = await convertPdfToPageImages(pdfFile, pdfFile.name, 1.2);
          allPageImages = [...allPageImages, ...parsed.pageImages];
        } catch (e) {
          console.warn('Error reading Roll Number Slip PDF:', e);
        }
      }
    }

    if (imageFiles.length > 0) {
      const readers = imageFiles.map((file) => {
        return new Promise<string>((resolve) => {
          const r = new FileReader();
          r.onload = async () => {
            const raw = r.result as string;
            try {
              const compressed = await compressImageToJpeg(raw, 1400, 0.72);
              resolve(compressed);
            } catch (_) {
              resolve(raw);
            }
          };
          r.readAsDataURL(file);
        });
      });
      const dataUrls = await Promise.all(readers);
      allPageImages = [...allPageImages, ...dataUrls];
    }

    setIsSlipsParsing(false);

    if (allPageImages.length > 0 && onBatchImportStudents) {
      const batchTitle = files[0]?.name || 'Roll_Number_Slips_Batch.pdf';
      const job: StudentImportBatchJob = {
        id: `job-import-${Date.now()}`,
        batchTitle,
        filesCount: allPageImages.length,
        status: 'queued',
        extractedCount: 0,
        newStudentsCount: 0,
        updatedStudentsCount: 0,
        startTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      if (replaceExistingOnImport) {
        // Do NOT immediately pass replaceExisting=true into the import!
        // Open an in-app confirmation modal (NOT window.confirm)
        setPendingWipeImport({ job, images: allPageImages });
        setShowWipeConfirmModal(true);
      } else {
        onBatchImportStudents(job, allPageImages, false);
        setSlipsToast({
          batchTitle,
          count: allPageImages.length,
        });
      }
    }
  };

  const handleConfirmWipeImport = () => {
    if (pendingWipeImport && onBatchImportStudents) {
      onBatchImportStudents(pendingWipeImport.job, pendingWipeImport.images, true);
      setSlipsToast({
        batchTitle: pendingWipeImport.job.batchTitle,
        count: pendingWipeImport.images.length,
      });
    }
    setShowWipeConfirmModal(false);
    setPendingWipeImport(null);
  };

  const handleCancelWipeImport = () => {
    setShowWipeConfirmModal(false);
    setPendingWipeImport(null);
  };

  const handleSendQpToAI = async () => {
    if (qpImages.length === 0) {
      setQpError('Please upload at least one page of the official Question Paper scan or PDF.');
      return;
    }

    // Keep local copy of upload state for background job (do not clear qpImages until job succeeds)
    const rawImages = [...qpImages];
    const targetSubject = qpSubject;
    const targetShift = qpShift;
    const isEvening = targetShift === 'evening';
    const targetShiftLabel = isEvening ? 'Evening (Group 2)' : 'Morning (Group 1)';
    const cleanShiftStr = isEvening ? 'Evening' : 'Morning';
    const session = examSession;

    const schemeTitle = `${targetSubject} ${cleanShiftStr}`;
    const normalizedKey = `${targetSubject}_${targetShiftLabel}`;

    setQpError(null);
    setIsGeneratingScheme(true);

    // Initial non-blocking background toast
    setSchemeToast({
      message: `Generating marking scheme for ${targetSubject} (${cleanShiftStr})...`,
      type: 'info',
      subject: targetSubject,
      shift: targetShift,
    });

    // Execute generation asynchronously without aborting
    (async () => {
      // 10-minute timeout (never 120s abort)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 600000);

      try {
        // Compress all QP images first to ensure max 1400px, 0.72 quality and opaque white background
        const imagesToProcess = await Promise.all(
          rawImages.map((img) => compressImageToJpeg(img, 1400, 0.72))
        );

        const res = await fetch('/api/generate-scheme', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            questionPaperImages: imagesToProcess,
            subject: targetSubject,
            shift: targetShift,
            examSession: session,
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `Server responded with status ${res.status}`);
        }

        const data = await res.json();
        if (data.success && data.scheme && Array.isArray(data.scheme.questions) && data.scheme.questions.length > 0) {
          const finalScheme: MarkingScheme = {
            ...data.scheme,
            id: normalizedKey,
            subject: targetSubject,
            shift: targetShift,
            title: data.scheme.title || schemeTitle,
          };

          try {
            localStorage.setItem(`project001_scheme_${normalizedKey}`, JSON.stringify(finalScheme));
            localStorage.setItem(normalizedKey, JSON.stringify(finalScheme));
            localStorage.setItem(`scheme_${normalizedKey}`, JSON.stringify(finalScheme));
          } catch (_) {}

          setGeneratedScheme(finalScheme);
          if (onSaveMarkingScheme) {
            onSaveMarkingScheme(finalScheme);
          }

          setSchemeToast({
            message: `Marking Scheme "${finalScheme.title}" generated & saved!`,
            type: 'success',
            subject: targetSubject,
            shift: targetShift,
          });

          // Clear qpImages now that job has completed successfully
          setQpImages([]);
        } else {
          throw new Error(data.error || 'Failed to parse questions from question paper. Please ensure scans are clear.');
        }
      } catch (err: any) {
        console.error('[Question Paper Scheme OCR Error]:', err);
        const errMsg = err?.message || 'Vision extraction timed out or could not recognize text.';
        setQpError(`OCR Extraction failed: ${errMsg}. Please re-upload pages.`);
        setSchemeToast({
          message: `OCR Extraction failed: ${errMsg}. Please re-upload pages.`,
          type: 'error',
          subject: targetSubject,
          shift: targetShift,
        });
        setGeneratedScheme(null);
      } finally {
        setIsGeneratingScheme(false);
      }
    })();
  };

  const handleDeleteMarkingSchemeItem = (schemeId: string, title?: string) => {
    if (
      !deleteConfirmModal
    ) {
      setDeleteConfirmModal({
        isOpen: true,
        type: 'single',
        schemeId: schemeId,
        title: title || 'this scheme',
      });
      return;
    }
    if (generatedScheme?.id === schemeId || (generatedScheme as any)?.key === schemeId) {
      setGeneratedScheme(null);
    }
    if (onDeleteMarkingScheme) {
      onDeleteMarkingScheme(schemeId);
    }
    setSchemeToast({
      message: `Marking scheme "${title || 'Selected'}" deleted.`,
      type: 'info',
    });
  };

  // ════════ FILE INPUT HANDLERS (Images & Multi-Page PDFs) ════════
  const handleFilesSelected = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const fileArray = Array.from(files);

    // 1. Check for Multi-Page PDF file
    const pdfFiles = fileArray.filter(
      (f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
    );
    const imageFiles = fileArray.filter(
      (f) => f.type.startsWith('image/') || f.name.match(/\.(png|jpe?g|webp)$/i)
    );

    if (pdfFiles.length > 0) {
      const pdfFile = pdfFiles[0];
      setPdfStatus({ isParsing: true, fileName: pdfFile.name, totalPages: 0 });
      try {
        const parsed = await convertPdfToPageImages(pdfFile, pdfFile.name, 1.5);
        setPdfStatus({
          isParsing: false,
          fileName: pdfFile.name,
          totalPages: parsed.totalPages,
        });
        setPages(parsed.pageImages);
        if (parsed.pageImages.length > 0) {
          triggerCoverExtraction(parsed.pageImages[0]);
        }
      } catch (err: any) {
        console.error('PDF parsing error:', err);
        setPdfStatus(null);
        setCameraError('PDF parsing error: ' + (err.message || 'Please upload image pages directly.'));
      }
      return;
    }

    // 2. Handle Image Files
    if (imageFiles.length === 1 && pages.length === 0) {
      const reader = new FileReader();
      reader.onload = (e) => {
        if (typeof e.target?.result === 'string') {
          setStagingImage(e.target.result);
          setStagingRotation(0);
          triggerCoverExtraction(e.target.result);
        }
      };
      reader.readAsDataURL(imageFiles[0]);
    } else if (imageFiles.length > 0) {
      const readers = imageFiles.map((file) => {
        return new Promise<string>((resolve) => {
          const r = new FileReader();
          r.onload = () => resolve(r.result as string);
          r.readAsDataURL(file);
        });
      });

      const dataUrls = await Promise.all(readers);
      setPages((prev) => {
        const updated = [...prev, ...dataUrls];
        if (prev.length === 0 && dataUrls[0]) {
          triggerCoverExtraction(dataUrls[0]);
        }
        return updated;
      });
    }
  };

  // Rotate staging image
  const handleRotateStaging = () => {
    if (!stagingImage) return;
    const img = new Image();
    img.src = stagingImage;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.height;
      canvas.height = img.width;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate((90 * Math.PI) / 180);
        ctx.drawImage(img, -img.width / 2, -img.height / 2);
        setStagingImage(canvas.toDataURL('image/jpeg', 0.92));
      }
    };
  };

  // Confirm staging image and append as a page
  const handleConfirmStaging = () => {
    if (!stagingImage) return;
    setPages((prev) => [...prev, stagingImage]);
    setStagingImage(null);
    setStagingRotation(0);
  };

  // Discard staging image
  const handleDiscardStaging = () => {
    setStagingImage(null);
    setStagingRotation(0);
  };

  // Multi-page manipulation
  const handleRemovePage = (index: number) => {
    setPages((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleMovePageLeft = (index: number) => {
    if (index === 0) return;
    setPages((prev) => {
      const next = [...prev];
      const temp = next[index - 1];
      next[index - 1] = next[index];
      next[index] = temp;
      return next;
    });
  };

  const handleMovePageRight = (index: number) => {
    if (index === pages.length - 1) return;
    setPages((prev) => {
      const next = [...prev];
      const temp = next[index + 1];
      next[index + 1] = next[index];
      next[index] = temp;
      return next;
    });
  };

  // ════════ AI GRADING PIPELINE RUNNER ════════
  const runGradingPipeline = async (
    paperId: string,
    subjectName: string,
    student: StudentRecord,
    pagesToGrade: string[],
    scheme: MarkingScheme
  ) => {
    const dupCheck = checkForDuplicatePaper(
      papers,
      students,
      student?.rollNumber,
      student?.fullName,
      student?.id,
      subjectName
    );

    if (dupCheck.isDuplicate) {
      setErrorAlert({
        isOpen: true,
        title: 'Duplicate Paper Detected',
        message: dupCheck.errorMessage || '',
      });
      return;
    }

    setPipelineModal({
      isOpen: true,
      step: 'reading',
      paperId,
      subjectName,
      studentName: student.fullName,
    });

    const stepTimer = setTimeout(() => {
      setPipelineModal((prev) =>
        prev.step === 'reading' ? { ...prev, step: 'grading' } : prev
      );
    }, 2400);

    try {
      const response = await fetch('/api/grade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paperId,
          pageImages: pagesToGrade,
          markingScheme: scheme,
          selectedStudent: {
            id: student.id,
            fullName: student.fullName,
            rollNumber: student.rollNumber,
          },
        }),
      });

      clearTimeout(stepTimer);
      
      let data: any;
      try {
        const rawText = await response.text();
        data = JSON.parse(rawText);
      } catch (_) {
        throw new Error('AI is busy right now, please try again in a few minutes.');
      }

      if (!response.ok || !data || !data.success) {
        const isBusy =
          response.status === 503 ||
          response.status === 429 ||
          data?.error?.includes('AI is busy') ||
          data?.error?.includes('503') ||
          data?.error?.includes('429');
        throw new Error(
          isBusy
            ? 'AI is busy right now, please try again in a few minutes.'
            : data?.error || 'AI is busy right now, please try again in a few minutes.'
        );
      }

      const finalQuestions: ExamQuestion[] = scheme.questions.map((sq, sqIdx) => {
        let qResult: any = null;
        if (Array.isArray(data.questionResults)) {
          qResult =
            data.questionResults.find(
              (r: any) =>
                Number(r.questionNumber) === sq.questionNumber &&
                (sq.partLabel ? r.partLabel === sq.partLabel : true)
            ) || data.questionResults[sqIdx];
        } else if (data.questionResults && typeof data.questionResults === 'object') {
          const key = sq.id || `${sq.section || ''}_${sq.questionNumber}_${sq.partLabel || ''}_${sqIdx}`;
          qResult = data.questionResults[key] || data.questionResults[sq.questionNumber];
        }

        const qTrans =
          data.transcription?.answers?.find(
            (a: any) =>
              Number(a.questionNumber) === sq.questionNumber &&
              (sq.partLabel ? a.partLabel === sq.partLabel : true)
          ) ||
          data.transcription?.answers?.find(
            (a: any) => Number(a.questionNumber) === sq.questionNumber
          );

        const isNotInPaper =
          qResult?.not_in_paper === true ||
          qResult?.reason === 'Not in paper' ||
          (typeof qResult?.reason === 'string' && qResult.reason.trim().toLowerCase() === 'not in paper');

        const questionTextToUse = qResult?.questionText || (qResult?.attempted_choice === 'or_choice' && sq.orChoice?.questionText ? sq.orChoice.questionText : sq.questionText);

        return {
          id: sq.id || `${sq.section || ''}_${sq.questionNumber}_${sq.partLabel || ''}_${sqIdx}`,
          section: sq.section,
          partLabel: sq.partLabel,
          hasOrChoice: sq.hasOrChoice,
          orChoice: sq.orChoice,
          questionNumber: sq.questionNumber,
          questionText: questionTextToUse,
          maxMarks: isNotInPaper ? 0 : sq.maxMarks,
          aiSuggestedMark: isNotInPaper ? 0 : (qResult ? qResult.marks_awarded : 0),
          examinerMark: isNotInPaper ? 0 : (qResult ? qResult.marks_awarded : 0),
          gradingResult: qResult,
          transcription: qTrans,
        };
      });

      const paperStatus: PaperStatus = data.status; // 'Pending Review' or 'Identity Check Needed'
      const isExplicitStudent = Boolean(
        selectedStudentId &&
        selectedStudentId !== 'auto-detect' &&
        students.some((s) => s.id === selectedStudentId)
      );

      const finalPaper: ExamPaper = {
        id: paperId,
        studentId: isExplicitStudent ? student.id : (data.identityCheck?.passed ? student.id : ''),
        subject: subjectName,
        examSession,
        dateSubmitted: new Date().toISOString().split('T')[0],
        status: paperStatus,
        remarks: isExplicitStudent
          ? `AI Graded for selected candidate ${student.fullName} (${student.rollNumber}). Total ${data.totalAIMarks}/${scheme.totalMarks} marks awarded.`
          : (data.identityCheck?.passed
            ? `AI Graded: Total ${data.totalAIMarks}/${scheme.totalMarks} marks awarded across ${finalQuestions.length} questions.`
            : `Identity Check: ${data.identityCheck?.mismatchReason || 'Roll number mismatch'}. Student unassigned pending review.`),
        pageImages: pagesToGrade,
        questions: finalQuestions,
        aiGradingDetails: {
          transcription: data.transcription,
          questionResults: data.questionResults,
          identityCheck: {
            ...(data.identityCheck || {}),
            selectedStudentName: student.fullName,
            selectedStudentRoll: student.rollNumber,
          },
          totalAIMarks: data.totalAIMarks,
          overallConfidence: data.overallConfidence,
          flaggedQuestionCount: data.flaggedCount,
          gradedAt: new Date().toISOString(),
        },
      };

      onSubmitPaper(finalPaper);

      const uploadLog: RecentUploadLog = {
        paperId,
        studentId: isExplicitStudent ? student.id : (data.identityCheck?.passed ? student.id : ''),
        studentName: student.fullName,
        studentRoll: student.rollNumber,
        subject: subjectName,
        pagesCount: pagesToGrade.length,
        thumbnailUrl: pagesToGrade[0],
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        status: paperStatus,
      };
      onAddRecentUpload(uploadLog);

      setPipelineModal({
        isOpen: true,
        step: 'done',
        paperId,
        subjectName,
        studentName: student.fullName,
        totalMarks: data.totalAIMarks,
        maxMarks: scheme.totalMarks,
        identityCheck: data.identityCheck,
        status: paperStatus,
      });
    } catch (err: any) {
      clearTimeout(stepTimer);
      const errorMsg = err.message || 'AI grading pipeline failed to respond.';

      const fallbackQuestions: ExamQuestion[] = scheme.questions.map((sq) => ({
        questionNumber: sq.questionNumber,
        questionText: sq.questionText,
        maxMarks: sq.maxMarks,
        aiSuggestedMark: 0,
        examinerMark: 0,
      }));

      const failedPaper: ExamPaper = {
        id: paperId,
        studentId: student.id,
        subject: subjectName,
        examSession,
        dateSubmitted: new Date().toISOString().split('T')[0],
        status: 'AI Failed - Manual Grading',
        remarks: `AI Grading failed: ${errorMsg}. Transferred to manual examiner grading desk.`,
        pageImages: pagesToGrade,
        questions: fallbackQuestions,
        aiGradingDetails: {
          transcription: { header: {}, answers: [] },
          questionResults: {},
          identityCheck: { passed: false, mismatchReason: errorMsg },
          totalAIMarks: 0,
          overallConfidence: 'low',
          flaggedQuestionCount: fallbackQuestions.length,
          gradedAt: new Date().toISOString(),
          error: errorMsg,
        },
      };

      onSubmitPaper(failedPaper);

      const uploadLog: RecentUploadLog = {
        paperId,
        studentId: student.id,
        studentName: student.fullName,
        studentRoll: student.rollNumber,
        subject: subjectName,
        pagesCount: pagesToGrade.length,
        thumbnailUrl: pagesToGrade[0],
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        status: 'AI Failed - Manual Grading',
      };
      onAddRecentUpload(uploadLog);

      setPipelineModal({
        isOpen: true,
        step: 'failed',
        paperId,
        subjectName,
        studentName: student.fullName,
        error: errorMsg,
        status: 'AI Failed - Manual Grading',
      });
    }
  };

  // ════════ ASYNCHRONOUS NON-BLOCKING SUBMIT PAPER ════════
  const handleSubmitPaper = () => {
    if (pages.length === 0) return;

    const submissionId = `SUB-2026-${Math.floor(1000 + Math.random() * 9000)}`;
    const paperId = `paper-sub-${Date.now()}`;

    const activeScheme =
      (selectedSchemeId ? markingSchemes.find((s) => s.id === selectedSchemeId) : null) ||
      markingSchemes.find(
        (s) =>
          s.subject.toLowerCase() === selectedSubject.toLowerCase() ||
          s.title.toLowerCase() === selectedSubject.toLowerCase()
      ) ||
      markingSchemes[0];

    const finalSchemeId = activeScheme?.id || selectedSchemeId;
    const subjectName = isCustomSubject && customSubject.trim()
      ? customSubject.trim()
      : activeScheme?.title || activeScheme?.subject || selectedSubject;

    const isExplicitStudent = Boolean(
      selectedStudentId &&
      selectedStudentId !== 'auto-detect' &&
      students.some((s) => s.id === selectedStudentId)
    );
    const explicitStudentObj = isExplicitStudent ? students.find((s) => s.id === selectedStudentId) : null;

    // Priority 1: Dropdown Selected Student
    // Priority 2: Auto-detected / matched student from script OCR
    // Priority 3: Fallback generic candidate profile
    const targetStudent = explicitStudentObj || coverExtraction?.autoMatchedStudent || null;

    let studentName = '';
    let studentRoll = '';
    let studentId = '';

    if (targetStudent) {
      studentName = targetStudent.fullName;
      studentRoll = targetStudent.rollNumber;
      studentId = targetStudent.id;
    } else if (coverExtraction?.metadata?.candidateName || coverExtraction?.metadata?.rollNumber) {
      studentName = coverExtraction.metadata.candidateName || `Auto-Detected Candidate (#${submissionId.slice(-4)})`;
      studentRoll = coverExtraction.metadata.rollNumber || `SEC-2026-${submissionId.slice(-4)}`;
      studentId = `auto-std-${Date.now()}`;
    } else {
      studentName = `Candidate Script (#${submissionId.slice(-4)})`;
      studentRoll = `SEC-2026-${submissionId.slice(-4)}`;
      studentId = `anon-std-${Date.now()}`;
    }

    const dupCheck = checkForDuplicatePaper(
      papers,
      students,
      studentRoll,
      studentName,
      studentId,
      subjectName
    );

    if (dupCheck.isDuplicate) {
      setErrorAlert({
        isOpen: true,
        title: 'Duplicate Paper Detected',
        message: dupCheck.errorMessage || '',
      });
      return;
    }

    // If non-blocking async queue callback is provided
    if (onQueueBackgroundJob) {
      const job: BackgroundGradingJob = {
        id: `job-${Date.now()}`,
        submissionId,
        paperId,
        studentName,
        studentRoll,
        studentId,
        subject: subjectName,
        schemeId: finalSchemeId,
        shift: selectedShift,
        pageImages: [...pages],
        status: 'queued',
        progress: 10,
        startTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      onQueueBackgroundJob(job);

      // Show immediate success toast
      setAsyncToast({
        submissionId,
        studentName,
        studentRoll,
        pagesCount: pages.length,
        subject: subjectName,
        timestamp: job.startTime,
      });

      // Instantly clear dropzone and reset view so the examiner can immediately upload/photograph the next script
      setPages([]);
      setStagingImage(null);
      setPdfStatus(null);
      setCoverExtraction(null);
      return;
    }

    // Direct synchronous pipeline fallback
    const syncScheme = activeScheme || {
      id: 'default-scheme',
      subject: subjectName,
      examSession,
      title: 'Standard Examination Rubric',
      totalMarks: 50,
      updatedAt: new Date().toISOString(),
      questions: [1, 2, 3, 4, 5].map((num) => ({
        id: `def-q${num}`,
        questionNumber: num,
        questionText: `Question ${num}: Evaluate the foundational concepts and problem solving.`,
        maxMarks: 10,
        modelAnswer: 'Standard model answer.',
        keyPoints: [
          { id: `kp-${num}-1`, description: 'Core principles and formulation', marks: 5 },
          { id: `kp-${num}-2`, description: 'Derivation, calculation, and final result with units', marks: 5 },
        ],
      })),
    };

    runGradingPipeline(paperId, subjectName, targetStudent || students[0], pages, syncScheme);
  };

  const handleResetForNext = () => {
    setSubmittedPaper(null);
    setPages([]);
    setStagingImage(null);
    setPipelineModal((prev) => ({ ...prev, isOpen: false }));
  };

  return (
    <div className="relative w-full min-h-screen bg-slate-50 text-slate-800 flex flex-col justify-between select-none">
      {/* ════════ TOP BANNER ════════ */}
      <header className="relative w-full z-20 shrink-0">
        <div
          className="w-full h-auto md:h-28 py-3.5 px-4 md:px-8 md:py-0 rounded-b-[24px] sm:rounded-b-[32px] md:rounded-b-[40px] flex flex-col md:flex-row items-center justify-between shadow-md relative overflow-hidden"
          style={{
            background: 'linear-gradient(90deg, #4DD9E8 0%, #0047AB 100%)',
          }}
        >
          {/* Subtle Top Gloss Accent */}
          <div className="absolute inset-x-0 top-0 h-1/3 bg-white/10 pointer-events-none" />

          {/* Row 1 on mobile / Left & Right on desktop */}
          <div className="w-full md:w-auto flex items-center justify-between z-10 mb-2 md:mb-0">
            <div className="flex items-center gap-2 sm:gap-3">
              <button
                onClick={onBackToMenu}
                className="flex items-center gap-2 text-xs sm:text-sm font-rounded font-semibold text-white bg-white/15 hover:bg-white/30 backdrop-blur-xs px-3 sm:px-4 py-2 rounded-full transition-all cursor-pointer shadow-xs active:scale-95"
                title="Return to Main Menu"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="hidden sm:inline">Back to Menu</span>
                <span className="sm:hidden">Menu</span>
              </button>
              {currentUser && <UserIdentityBadge user={currentUser} compactOnMobile={true} />}
            </div>

            {/* Mobile-only session uploads badge in row 1 right */}
            <div className="flex md:hidden items-center gap-2 z-10">
              <span className="bg-white/20 text-white text-xs font-rounded font-bold px-2.5 py-1 rounded-full">
                {recentUploads.length} uploads
              </span>
            </div>
          </div>

          {/* Row 2 on mobile / Center on desktop: Branding Title */}
          <div className="static md:absolute md:left-1/2 md:-translate-x-1/2 md:top-1/2 md:-translate-y-1/2 flex flex-col items-center text-center z-10">
            <h1 className="font-rounded font-bold text-xl sm:text-2xl md:text-3xl text-white tracking-widest uppercase drop-shadow-md">
              PROJECT-001
            </h1>
            <span className="text-[11px] sm:text-xs font-rounded text-white/90 font-medium tracking-wide">
              Upload Answer Scripts
            </span>
          </div>

          {/* Right on desktop */}
          <div className="hidden md:flex items-center gap-2 z-10">
            <span className="text-xs font-rounded font-semibold text-white/80">
              Session Uploads:
            </span>
            <span className="bg-white/20 text-white text-xs font-rounded font-bold px-2.5 py-1 rounded-full">
              {recentUploads.length}
            </span>
          </div>
        </div>
      </header>

      {/* ════════ MAIN WORKSPACE ════════ */}
      <main className="flex-1 flex flex-col lg:flex-row gap-6 p-4 sm:p-6 lg:p-8 pb-24 md:pb-8 max-w-[1600px] w-full mx-auto">
        {/* ──────── LEFT/CENTER: UPLOAD WORKFLOW ──────── */}
        <div className="flex-1 flex flex-col gap-6">
          {submittedPaper ? (
            /* ════════ SUBMISSION SUCCESS VIEW ════════ */
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-[28px] p-6 sm:p-10 shadow-sm border border-slate-200/80 flex flex-col items-center text-center max-w-2xl mx-auto w-full my-auto"
            >
              <div
                className="w-20 h-20 rounded-full flex items-center justify-center text-white mb-5 shadow-lg"
                style={{
                  background: 'linear-gradient(135deg, #4DD9E8 0%, #0047AB 100%)',
                }}
              >
                <CheckCircle2 className="w-10 h-10" />
              </div>

              <h2 className="font-rounded font-bold text-2xl sm:text-3xl text-slate-900 mb-2">
                Paper Uploaded Successfully!
              </h2>
              <p className="text-sm font-rounded text-slate-500 mb-6 max-w-md">
                The script has been added to the master evaluation database with status{' '}
                <strong className="text-amber-700">"Pending Review"</strong>.
              </p>

              {/* Summary Details Card */}
              <div className="w-full bg-slate-50 rounded-2xl p-5 border border-slate-200/80 text-left space-y-3 mb-8">
                <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                  <span className="text-xs font-rounded text-slate-500">Student</span>
                  <span className="text-sm font-rounded font-bold text-slate-800">
                    {submittedPaper.studentName} ({submittedPaper.studentRoll})
                  </span>
                </div>
                <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                  <span className="text-xs font-rounded text-slate-500">Subject</span>
                  <span className="text-sm font-rounded font-semibold text-slate-800">
                    {submittedPaper.subject}
                  </span>
                </div>
                <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                  <span className="text-xs font-rounded text-slate-500">Total Pages Attached</span>
                  <span className="text-sm font-rounded font-bold text-[#0047AB]">
                    {submittedPaper.pagesCount} {submittedPaper.pagesCount === 1 ? 'Page' : 'Pages'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-rounded text-slate-500">Time & Status</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-rounded text-slate-400">
                      {submittedPaper.submittedAt}
                    </span>
                    <span className="text-[11px] font-rounded font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300">
                      Pending Review
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row items-center gap-3 w-full">
                <button
                  onClick={() => onOpenEditingWithPaper(submittedPaper.paperId)}
                  className="w-full sm:flex-1 py-3.5 px-6 rounded-2xl text-white font-rounded font-bold text-sm shadow-md transition-all cursor-pointer flex items-center justify-center gap-2 group active:scale-95"
                  style={{
                    background: 'linear-gradient(135deg, #4DD9E8 0%, #0047AB 100%)',
                  }}
                >
                  <span>Review in Editing</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </button>

                <button
                  onClick={handleResetForNext}
                  className="w-full sm:flex-1 py-3.5 px-6 rounded-2xl text-slate-700 bg-slate-100 hover:bg-slate-200 font-rounded font-bold text-sm transition-all cursor-pointer flex items-center justify-center gap-2 active:scale-95"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>Upload Another Paper</span>
                </button>
              </div>
            </motion.div>
          ) : (
            <>
              {/* ──────── ASYNC NON-BLOCKING SUBMISSION TOAST ──────── */}
              <AnimatePresence>
                {asyncToast && (
                  <motion.div
                    initial={{ opacity: 0, y: -16, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -16, scale: 0.96 }}
                    className="bg-gradient-to-r from-emerald-600 via-[#0047AB] to-[#1e3a8a] text-white p-4 sm:p-5 rounded-[24px] shadow-xl flex items-center justify-between gap-4 border border-emerald-400/30"
                  >
                    <div className="flex items-center gap-3.5">
                      <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center shrink-0 shadow-inner">
                        <CheckCircle2 className="w-6 h-6 text-emerald-200" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-rounded font-bold text-sm sm:text-base text-white">
                            Paper Queued for Background AI Grading!
                          </h4>
                          <span className="bg-white/20 text-white text-[11px] font-mono font-bold px-2.5 py-0.5 rounded-full border border-white/30">
                            {asyncToast.submissionId}
                          </span>
                        </div>
                        <p className="text-xs text-white/90 font-rounded mt-0.5">
                          Assigned to <strong>{asyncToast.studentName}</strong> ({asyncToast.studentRoll}) • {asyncToast.subject} • {asyncToast.pagesCount} pages. Dropzone has been cleared for your next paper.
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setAsyncToast(null)}
                      className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/25 flex items-center justify-center text-white cursor-pointer transition-colors shrink-0"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ──────── MULTI-PAGE PDF INGESTION BANNER ──────── */}
              {pdfStatus && (
                <div className="bg-gradient-to-r from-blue-50 to-cyan-50 rounded-[20px] p-4 border border-[#4DD9E8]/40 flex items-center justify-between gap-3 text-slate-800">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#0047AB] text-white flex items-center justify-center shrink-0 shadow-xs">
                      {pdfStatus.isParsing ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <FileSpreadsheet className="w-5 h-5 text-cyan-200" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-rounded font-bold text-sm text-[#0047AB]">
                          {pdfStatus.isParsing ? 'Splitting PDF Document...' : 'Multi-Page PDF Ingested'}
                        </h4>
                        {!pdfStatus.isParsing && (
                          <span className="bg-emerald-100 text-emerald-800 text-[10px] font-rounded font-bold px-2 py-0.5 rounded-full border border-emerald-300">
                            {pdfStatus.totalPages} Sequential Pages
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] font-rounded text-slate-600">
                        {pdfStatus.isParsing
                          ? `Extracting sequential high-resolution page images from "${pdfStatus.fileName}"...`
                          : `"${pdfStatus.fileName}" split into Page 1 (Cover Sheet) and Pages 2–${pdfStatus.totalPages} (Answers).`}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* ──────── AUTO-IDENTIFIED STUDENT BADGE ──────── */}
              {coverExtraction && (
                <div className="bg-emerald-50 rounded-[20px] p-4 border border-emerald-300 flex items-center justify-between gap-3 text-slate-800">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                      {coverExtraction.isExtracting ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <UserCheck className="w-5 h-5" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-rounded font-bold text-sm text-emerald-900">
                          {coverExtraction.isExtracting
                            ? 'Reading Page 1 Cover Sheet...'
                            : coverExtraction.isAutoCreated
                            ? 'Auto-Detected Candidate Created'
                            : 'Cover Sheet Matched to Enrolled Student'}
                        </h4>
                        {coverExtraction.metadata?.rollNumber && (
                          <span className="bg-emerald-200/80 text-emerald-900 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full">
                            Roll: {coverExtraction.metadata.rollNumber}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] font-rounded text-emerald-700">
                        {coverExtraction.isExtracting
                          ? 'Extracting Roll Number, Candidate Name, Center Code, and Exam Subject...'
                          : `Bound to ${coverExtraction.autoMatchedStudent?.fullName || 'Candidate'} • Center: ${coverExtraction.metadata?.centerCode || 'ISB-042'} • ${coverExtraction.metadata?.subject || 'Subject'}`}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* ──────── STUDENT BULK IMPORT & QUESTION PAPER SCHEME GENERATOR (AVAILABLE IN BOTH DEV & NORMAL MODE) ──────── */}
              {/* Panel 1: Bulk Student Database Import via Roll Number Slips */}
              <div className="bg-white rounded-[24px] p-5 sm:p-6 shadow-sm border border-slate-200/80 flex flex-col gap-4">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-[#0047AB] shrink-0 shadow-2xs">
                          <UserCheck className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2">
                            <h3 className="font-rounded font-bold text-base sm:text-lg text-slate-900">
                              Bulk Import Student Database via Roll Number Slips / Date Sheets
                            </h3>
                            <span className="bg-cyan-100 text-[#0047AB] font-rounded font-bold text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap self-start sm:self-auto shrink-0">
                              Dev Tool • Async OCR
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 font-rounded mt-0.5">
                            Drop multi-page PDFs or image scans of official FBISE Roll Number Slips or Date Sheets. Fast Vision AI extracts candidate text JSON asynchronously in the background. Raw images are not saved to optimize storage.
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Dropzone input */}
                    <div className="flex flex-col sm:flex-row items-center gap-3">
                      <label className="flex-1 w-full flex items-center justify-center gap-3 p-4 bg-slate-50 hover:bg-blue-50/50 border-2 border-dashed border-blue-200 hover:border-[#0047AB] rounded-2xl cursor-pointer transition-all text-xs font-rounded text-slate-700">
                        {isSlipsParsing ? (
                          <Loader2 className="w-5 h-5 animate-spin text-[#0047AB]" />
                        ) : (
                          <FileSpreadsheet className="w-5 h-5 text-[#0047AB]" />
                        )}
                        <span className="font-bold text-slate-800">
                          {isSlipsParsing
                            ? 'Reading Roll Number Slips PDF Pages...'
                            : 'Drop Roll Number Slips / Date Sheets (.pdf, .jpg, .png)'}
                        </span>
                        <input
                          type="file"
                          accept="image/*,.pdf,application/pdf"
                          multiple
                          className="hidden"
                          onChange={(e) => handleSlipsFilesSelected(e.target.files)}
                        />
                      </label>
                    </div>

                    {/* Dangerous Clean State Reset Checkbox */}
                    <div className="flex flex-col gap-1 px-1">
                      <label className="flex items-center gap-2 cursor-pointer text-xs font-rounded font-semibold text-rose-700 select-none">
                        <input
                          type="checkbox"
                          checked={replaceExistingOnImport}
                          onChange={(e) => setReplaceExistingOnImport(e.target.checked)}
                          className="w-4 h-4 rounded text-rose-600 focus:ring-rose-500 border-rose-300 cursor-pointer"
                        />
                        <span>
                          <strong>Dangerous:</strong> Wipe entire Students registry and keep ONLY this import batch
                        </span>
                      </label>
                      <p className="text-[11px] text-slate-500 font-rounded ml-6">
                        Leave UNCHECKED to add/update by roll number and keep existing students.
                      </p>
                    </div>

                    {/* Instant non-blocking notification toast */}
                    <AnimatePresence>
                      {slipsToast && (
                        <motion.div
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          className="bg-emerald-50 border border-emerald-200 text-emerald-900 p-3.5 rounded-xl text-xs font-rounded flex items-center justify-between gap-3 shadow-2xs"
                        >
                          <div className="flex items-center gap-2.5">
                            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                            <div>
                              <p className="font-bold text-emerald-950">
                                Roll number slip batch queued for extraction. Processing in background...
                              </p>
                              <p className="text-[11px] text-emerald-700">
                                Batch "{slipsToast.batchTitle}" ({slipsToast.count} page(s)). You can continue working without waiting.
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={() => setSlipsToast(null)}
                            className="w-6 h-6 rounded-full bg-emerald-100 hover:bg-emerald-200 flex items-center justify-center text-emerald-800 cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Live Progress indicator if import jobs are running */}
                    {studentImportJobs && studentImportJobs.length > 0 && (
                      <div className="space-y-2 mt-1 pt-2 border-t border-slate-100">
                        <p className="text-[11px] font-rounded font-bold text-slate-500 uppercase tracking-wider">
                          Active Background OCR Import Jobs
                        </p>
                        {studentImportJobs.slice(0, 3).map((job) => (
                          <div key={job.id} className="bg-slate-50 border border-slate-200/80 p-3 rounded-xl flex items-center justify-between text-xs font-rounded">
                            <div className="flex items-center gap-2.5">
                              {job.status === 'extracting' ? (
                                <Loader2 className="w-4 h-4 animate-spin text-[#0047AB]" />
                              ) : job.status === 'completed' ? (
                                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                              ) : (
                                <AlertCircle className="w-4 h-4 text-amber-500" />
                              )}
                              <div>
                                <p className="font-bold text-slate-800">{job.batchTitle}</p>
                                <p className="text-[10px] text-slate-500">
                                  {job.status === 'completed'
                                    ? `Completed — Extracted ${job.extractedCount} candidate(s) from ${job.filesCount} page(s) (${job.newStudentsCount} new, ${job.updatedStudentsCount} updated${(job.pagesFailed ?? 0) > 0 ? `, ${job.pagesFailed} failed pages` : ''})`
                                    : job.progressText
                                    ? job.progressText
                                    : `Status: ${job.status} • Extracted: ${job.extractedCount} candidate(s) (${job.newStudentsCount} new, ${job.updatedStudentsCount} updated)`}
                                </p>
                              </div>
                            </div>
                            <span className="text-[10px] bg-slate-200 text-slate-700 font-mono font-bold px-2 py-0.5 rounded-full">
                              Text JSON Stored
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Panel 2: Upload Official Question Paper & Generate Scheme */}
                  <div className="bg-white rounded-[24px] p-5 sm:p-6 shadow-sm border border-slate-200/80 flex flex-col gap-4">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-cyan-50 border border-cyan-100 flex items-center justify-center text-[#0047AB] shrink-0 shadow-2xs">
                          <FileText className="w-5 h-5 text-[#0047AB]" />
                        </div>
                        <div>
                          <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2">
                            <h3 className="font-rounded font-bold text-base sm:text-lg text-slate-900">
                              Upload Official Question Paper & Generate Scheme
                            </h3>
                            <span className="bg-cyan-100 text-[#0047AB] font-rounded font-bold text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap self-start sm:self-auto shrink-0">
                              Dev Tool • AI Scheme Engine
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 font-rounded mt-0.5">
                            Upload PDF or image scans of official question papers (Physics Morning, Maths Evening) to automatically extract full question rubrics, marks, and answer keys with AI.
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Header Auto-Detection Status Alert */}
                    {isDetectingHeader && (
                      <div className="flex items-center gap-2 text-xs font-rounded text-[#0047AB] bg-blue-50/80 border border-blue-200 px-3.5 py-2 rounded-xl animate-pulse">
                        <Loader2 className="w-4 h-4 animate-spin text-[#0047AB] shrink-0" />
                        <span>Scanning Question Paper header for Subject and Shift...</span>
                      </div>
                    )}

                    {(qpImages.length > 0 || detectedHeaderInfo) && !isDetectingHeader && (
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 text-xs font-rounded bg-teal-50 border border-teal-200 px-3.5 py-2 rounded-xl text-teal-950">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0" />
                          <span>
                            Target Paper: <strong>{qpSubject}</strong> ({qpShift === 'evening' ? 'Evening Shift' : 'Morning Shift'})
                            {detectedHeaderInfo?.headerText ? ` • "${detectedHeaderInfo.headerText}"` : ''}
                          </span>
                        </div>
                        <span className="text-[10px] font-bold bg-teal-100 text-teal-800 px-2 py-0.5 rounded-full w-fit">
                          Synced
                        </span>
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Subject Selector */}
                      <div>
                        <label className="block text-xs font-rounded font-semibold text-slate-600 mb-1.5">
                          Target Subject
                        </label>
                        <select
                          value={qpSubject}
                          onChange={(e) => setQpSubject(e.target.value)}
                          className="w-full px-3.5 py-2.5 text-xs font-rounded bg-slate-50 border border-slate-200 rounded-xl text-slate-800 outline-none focus:border-[#4DD9E8] cursor-pointer"
                        >
                          {COMMON_SUBJECTS.map((sub) => (
                            <option key={sub} value={sub}>
                              {sub}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Shift Selector */}
                      <div>
                        <label className="block text-xs font-rounded font-semibold text-slate-600 mb-1.5">
                          Target Shift
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setQpShift('morning')}
                            className={`py-2 px-3 rounded-xl text-xs font-rounded font-bold border transition-all cursor-pointer ${
                              qpShift === 'morning'
                                ? 'bg-amber-500 text-white border-amber-400 shadow-xs'
                                : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                            }`}
                          >
                            Morning (Group 1)
                          </button>
                          <button
                            type="button"
                            onClick={() => setQpShift('evening')}
                            className={`py-2 px-3 rounded-xl text-xs font-rounded font-bold border transition-all cursor-pointer ${
                              qpShift === 'evening'
                                ? 'bg-indigo-600 text-white border-indigo-400 shadow-xs'
                                : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                            }`}
                          >
                            Evening (Group 2)
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Upload Dropzone for Official Question Paper */}
                    <div className="flex flex-col sm:flex-row items-center gap-3">
                      <label className="flex-1 w-full flex items-center justify-center gap-2 p-3 bg-slate-50 hover:bg-blue-50/50 border-2 border-dashed border-blue-200 hover:border-[#0047AB] rounded-2xl cursor-pointer transition-colors text-xs font-rounded text-slate-700">
                        <FileUp className="w-4 h-4 text-[#0047AB]" />
                        <span className="font-semibold text-slate-800">
                          {qpImages.length > 0
                            ? `Selected ${qpImages.length} Question Paper page(s)`
                            : 'Choose Question Paper PDF or Image Scans'}
                        </span>
                        <input
                          type="file"
                          accept="image/*,.pdf,application/pdf"
                          multiple
                          className="hidden"
                          onChange={(e) => handleQPFilesSelected(e.target.files)}
                        />
                      </label>

                      <button
                        type="button"
                        disabled={isGeneratingScheme || qpImages.length === 0}
                        onClick={handleSendQpToAI}
                        className="w-full sm:w-auto px-5 py-3 rounded-2xl bg-[#0047AB] hover:bg-blue-800 text-white font-rounded font-bold text-xs shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer flex items-center justify-center gap-2 shrink-0 active:scale-95"
                      >
                        {isGeneratingScheme ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin text-white" />
                            <span>Generating Scheme...</span>
                          </>
                        ) : (
                          <>
                            <FileCheck className="w-4 h-4 text-cyan-200" />
                            <span>Send to AI & Generate Scheme</span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* Selected Question Paper Page Thumbnails */}
                    {qpImages.length > 0 && (
                      <div className="flex flex-col gap-2 pt-1 border-t border-slate-100">
                        <div className="flex items-center justify-between text-xs font-rounded font-bold text-slate-700">
                          <span className="flex items-center gap-1.5 text-[#0047AB]">
                            <Layers className="w-4 h-4" />
                            <span>{qpImages.length} Question Paper Page(s) Selected</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setQpImages([]);
                              setGeneratedScheme(null);
                            }}
                            className="text-xs text-rose-600 hover:text-rose-700 font-semibold cursor-pointer"
                          >
                            Clear Pages
                          </button>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                          {qpImages.map((img, idx) => (
                            <div
                              key={idx}
                              className="relative rounded-xl border border-slate-200 bg-slate-50 p-1.5 flex flex-col items-center gap-1 shadow-2xs"
                            >
                              <div className="w-full h-24 rounded-lg overflow-hidden bg-slate-200 flex items-center justify-center">
                                <img
                                  src={img}
                                  alt={`QP Page ${idx + 1}`}
                                  className="w-full h-full object-cover object-top"
                                />
                              </div>
                              <div className="flex items-center justify-between w-full px-1">
                                <span className="text-[11px] font-mono font-bold text-slate-700">
                                  Page {idx + 1}
                                </span>
                                <span className="text-[10px] font-rounded text-slate-500">
                                  Uploaded
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Error display */}
                    {qpError && (
                      <div className="bg-rose-50 border border-rose-200 text-rose-800 p-3 rounded-xl text-xs font-rounded flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                        <span>{qpError}</span>
                      </div>
                    )}

                    {/* Non-Blocking Background Scheme Processing Toast & Status */}
                    <AnimatePresence>
                      {schemeToast && (
                        <motion.div
                          initial={{ opacity: 0, y: -8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -8 }}
                          className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-rounded shadow-sm ${
                            schemeToast.type === 'success'
                              ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                              : 'bg-blue-50 border-blue-200 text-blue-950'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            {schemeToast.type === 'success' ? (
                              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                            ) : (
                              <Loader2 className="w-5 h-5 text-[#0047AB] animate-spin shrink-0" />
                            )}
                            <div>
                              <p className="font-bold">{schemeToast.message}</p>
                              {schemeToast.type === 'success' && (
                                <p className="text-[11px] text-emerald-700 mt-0.5">
                                  Saved to database and mapped for immediate use in Grading Studio.
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 self-end sm:self-center">
                            {schemeToast.type === 'success' && (
                              <button
                                type="button"
                                onClick={() => {
                                  if (onOpenSchemeEditor) {
                                    onOpenSchemeEditor();
                                  } else {
                                    onOpenEditingWithPaper('');
                                  }
                                }}
                                className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs shadow-2xs transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5"
                              >
                                <BookOpen className="w-3.5 h-3.5" />
                                <span>View/Edit in Scheme Editor</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setSchemeToast(null)}
                              className="w-6 h-6 rounded-full bg-black/5 hover:bg-black/10 flex items-center justify-center text-slate-700 cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                    {/* Configured & Saved Marking Schemes Gallery */}
                    <div className="pt-3 border-t border-slate-100 flex flex-col gap-2.5">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <span className="text-xs font-rounded font-bold text-slate-700 flex items-center gap-1.5">
                          <BookOpen className="w-4 h-4 text-[#0047AB]" />
                          <span>Active Marking Schemes in System ({markingSchemes.length})</span>
                        </span>
                        <div className="flex items-center gap-2">
                          {markingSchemes.length > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                  setDeleteConfirmModal({
                                    isOpen: true,
                                    type: 'all',
                                  });
                              }}
                              className="text-xs font-rounded text-rose-600 hover:text-rose-800 hover:bg-rose-50 px-2 py-1 rounded-lg font-bold transition-colors cursor-pointer flex items-center gap-1"
                              title="Delete all marking schemes permanently"
                            >
                              <Trash2 className="w-3 h-3 text-rose-600" />
                              <span>Delete All Schemes</span>
                            </button>
                          )}
                          {onOpenSchemeEditor && (
                            <button
                              type="button"
                              onClick={onOpenSchemeEditor}
                              className="text-xs font-rounded text-[#0047AB] hover:underline font-bold cursor-pointer"
                            >
                              Open Scheme Editor →
                            </button>
                          )}
                        </div>
                      </div>

                      {markingSchemes.length === 0 ? (
                        <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-2xl text-center flex flex-col items-center justify-center gap-1">
                          <p className="text-xs font-rounded font-bold text-slate-700">
                            No marking schemes stored in database.
                          </p>
                          <p className="text-[11px] font-rounded text-slate-400">
                            Upload question paper scan page(s) or PDF above and click &quot;Send to AI &amp; Generate Scheme&quot; to auto-extract an 80-mark FBISE scheme.
                          </p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                          {markingSchemes.map((sch) => {
                            const isEve = (sch.shift || '').toLowerCase().includes('eve');
                            return (
                              <div
                                key={sch.id}
                                className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex flex-col justify-between gap-2 shadow-2xs hover:border-slate-300 transition-colors"
                              >
                                <div>
                                  <div className="flex items-center justify-between gap-1 mb-1">
                                    <span className="font-rounded font-bold text-xs text-slate-900 truncate">
                                      {sch.subject}
                                    </span>
                                    <span
                                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                        isEve
                                          ? 'bg-indigo-100 text-indigo-800'
                                          : 'bg-amber-100 text-amber-800'
                                      }`}
                                    >
                                      {isEve ? 'Evening' : 'Morning'}
                                    </span>
                                  </div>
                                  <p className="text-[11px] text-slate-500 font-rounded truncate">
                                    {sch.title}
                                  </p>
                                </div>

                                <div className="flex items-center justify-between pt-2 border-t border-slate-200/60">
                                  <span className="text-[10px] font-mono text-slate-500">
                                    {sch.questions?.length || 0} Qs • {sch.totalMarks || 80}M
                                  </span>
                                  <div className="flex items-center gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (onOpenSchemeEditor) onOpenSchemeEditor();
                                        else onOpenEditingWithPaper('');
                                      }}
                                      className="px-2 py-1 bg-blue-50 hover:bg-blue-100 text-[#0047AB] font-rounded font-bold text-[11px] rounded-lg transition-colors cursor-pointer"
                                    >
                                      View
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteMarkingSchemeItem(sch.id, sch.title || sch.subject)}
                                      className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                      title="Delete Marking Scheme"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>

              {/* ──────── STEP 1: STUDENT & SUBJECT SELECTOR ──────── */}
              <div className="bg-white rounded-[24px] p-6 shadow-sm border border-slate-200/80">
                <div className="flex items-center gap-2 mb-4 pb-2 border-b border-slate-100">
                  <User className="w-5 h-5 text-[#0047AB]" />
                  <h2 className="font-rounded font-bold text-lg text-slate-900">
                    Step 1: Select Student & Subject
                  </h2>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  {/* Student Search & Select Dropdown */}
                  <div className="relative">
                    <label className="block text-xs font-rounded font-semibold text-slate-600 mb-1.5">
                      Select Student
                    </label>

                    {/* Search / Dropdown Trigger */}
                    <div
                      onClick={() => setIsStudentDropdownOpen((prev) => !prev)}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between cursor-pointer hover:border-slate-300 transition-colors"
                    >
                      <div className="flex items-center gap-2.5 overflow-hidden">
                        {selectedStudent ? (
                          <>
                            <div className="w-7 h-7 rounded-full bg-cyan-100 text-[#0047AB] flex items-center justify-center font-rounded font-bold text-xs shrink-0">
                              {selectedStudent.fullName.charAt(0)}
                            </div>
                            <div className="truncate text-left">
                              <p className="text-sm font-rounded font-bold text-slate-800 truncate">
                                {selectedStudent.fullName}
                              </p>
                              <p className="text-[11px] font-rounded text-slate-400">
                                Roll: {selectedStudent.rollNumber} • {selectedStudent.classGrade}-{selectedStudent.section}
                              </p>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="w-7 h-7 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                              <Scan className="w-3.5 h-3.5 text-amber-700" />
                            </div>
                            <div className="truncate text-left">
                              <p className="text-sm font-rounded font-bold text-amber-900 truncate">
                                Auto-detect from script (OCR)
                              </p>
                              <p className="text-[11px] font-rounded text-amber-700/80">
                                Attempt OCR extraction for candidate name & roll #
                              </p>
                            </div>
                          </>
                        )}
                      </div>
                      <ChevronRight
                        className={`w-4 h-4 text-slate-400 transition-transform ${
                          isStudentDropdownOpen ? 'rotate-90' : ''
                        }`}
                      />
                    </div>

                    {/* Dropdown Menu */}
                    <AnimatePresence>
                      {isStudentDropdownOpen && (
                        <motion.div
                          initial={{ opacity: 0, y: -8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -8 }}
                          className="absolute left-0 right-0 top-full mt-1.5 z-30 bg-white rounded-2xl shadow-xl border border-slate-200 p-2 max-h-64 overflow-y-auto"
                        >
                          <div className="p-1 mb-2">
                            <input
                              type="text"
                              value={studentSearch}
                              onChange={(e) => setStudentSearch(e.target.value)}
                              placeholder="Search by name, roll #, or grade..."
                              onClick={(e) => e.stopPropagation()}
                              className="w-full px-3 py-1.5 text-xs font-rounded bg-slate-100 rounded-lg outline-none focus:ring-2 focus:ring-[#4DD9E8]"
                            />
                          </div>

                          <div className="space-y-1">
                            {/* Auto-detect option */}
                            <button
                              key="auto-detect"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedStudentId('auto-detect');
                                setIsStudentDropdownOpen(false);
                              }}
                              className={`w-full p-2.5 rounded-xl flex items-center justify-between text-left transition-colors cursor-pointer border mb-1.5 ${
                                selectedStudentId === 'auto-detect'
                                  ? 'bg-amber-50/90 border-amber-300 text-amber-900 font-bold shadow-xs'
                                  : 'bg-amber-50/40 hover:bg-amber-50 border-amber-200/60 text-amber-900'
                              }`}
                            >
                              <div className="flex items-center gap-2.5">
                                <div className="w-7 h-7 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                                  <Scan className="w-3.5 h-3.5 text-amber-700" />
                                </div>
                                <div>
                                  <p className="text-xs font-rounded font-bold text-amber-900">
                                    Auto-detect from script (OCR)
                                  </p>
                                  <p className="text-[10px] font-rounded text-amber-700/80">
                                    Attempt OCR extraction for candidate name & roll #
                                  </p>
                                </div>
                              </div>
                              {selectedStudentId === 'auto-detect' && (
                                <Check className="w-4 h-4 text-amber-700" />
                              )}
                            </button>

                            {filteredStudents.length > 0 ? (
                              filteredStudents.map((st) => (
                                <button
                                  key={st.id}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedStudentId(st.id);
                                    setIsStudentDropdownOpen(false);
                                  }}
                                  className={`w-full p-2 rounded-xl flex items-center justify-between text-left transition-colors cursor-pointer ${
                                    st.id === selectedStudentId
                                      ? 'bg-blue-50 text-[#0047AB]'
                                      : 'hover:bg-slate-50 text-slate-700'
                                  }`}
                                >
                                  <div>
                                    <p className="text-xs font-rounded font-bold">{st.fullName}</p>
                                    <p className="text-[10px] font-rounded text-slate-400">
                                      {st.rollNumber} • {st.classGrade}-{st.section} • {st.group}
                                    </p>
                                  </div>
                                  {st.id === selectedStudentId && (
                                    <Check className="w-4 h-4 text-[#0047AB]" />
                                  )}
                                </button>
                              ))
                            ) : (
                              <p className="text-xs font-rounded text-slate-400 p-3 text-center">
                                No students match your search.
                              </p>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Subject Selector */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-rounded font-semibold text-slate-600">
                        Exam Subject
                      </label>
                      
                    </div>

                    {isCustomSubject ? (
                      <input
                        type="text"
                        value={customSubject}
                        onChange={(e) => setCustomSubject(e.target.value)}
                        placeholder="e.g. Advanced Microbiology"
                        className="w-full px-4 py-2.5 text-sm font-rounded bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-[#4DD9E8]"
                      />
                    ) : (
                      <select
                        value={selectedSchemeId || selectedSubject}
                        onChange={(e) => {
                          const val = e.target.value;
                          const foundScheme = markingSchemes.find(
                            (s) => s.id === val || s.title === val || s.subject === val
                          );
                          if (foundScheme) {
                            setSelectedSchemeId(foundScheme.id);
                            setSelectedSubject(foundScheme.title || foundScheme.subject);
                            if (foundScheme.shift === 'evening') {
                              setSelectedShift('evening');
                            } else if (foundScheme.shift === 'morning') {
                              setSelectedShift('morning');
                            }
                          } else {
                            setSelectedSchemeId('');
                            setSelectedSubject(val);
                          }
                        }}
                        className="w-full px-4 py-2.5 text-sm font-rounded bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-[#4DD9E8] cursor-pointer"
                      >
                        {markingSchemes.length > 0 && (
                          <optgroup label="Available Marking Schemes (Rubrics)">
                            {markingSchemes.map((sch) => (
                              <option key={sch.id} value={sch.id}>
                                {sch.title || sch.subject} ({sch.subject}{sch.shift ? ` • ${sch.shift}` : ''})
                              </option>
                            ))}
                          </optgroup>
                        )}
                        
                      </select>
                    )}
                  </div>

                  {/* Examination Shift Selector (Morning Group 1 vs Evening Group 2) */}
                  <div className="md:col-span-2 mt-2 pt-3 border-t border-slate-100">
                    <label className="block text-xs font-rounded font-semibold text-slate-700 mb-1.5">
                      Exam Shift (Categorization)
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setSelectedShift('morning')}
                        className={`p-3 rounded-xl border flex items-center gap-2.5 transition-all cursor-pointer ${
                          selectedShift === 'morning'
                            ? 'bg-amber-50 border-amber-400 text-amber-900 shadow-xs ring-2 ring-amber-400/20'
                            : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${selectedShift === 'morning' ? 'bg-amber-500 text-white' : 'bg-slate-200 text-slate-600'}`}>
                          <Clock className="w-4 h-4" />
                        </div>
                        <div className="text-left">
                          <p className="text-xs font-rounded font-bold">Morning Shift (Group 1)</p>
                          <p className="text-[10px] opacity-80">08:30 AM – 11:30 AM</p>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setSelectedShift('evening')}
                        className={`p-3 rounded-xl border flex items-center gap-2.5 transition-all cursor-pointer ${
                          selectedShift === 'evening'
                            ? 'bg-indigo-50 border-indigo-400 text-indigo-900 shadow-xs ring-2 ring-indigo-400/20'
                            : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${selectedShift === 'evening' ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
                          <Clock className="w-4 h-4" />
                        </div>
                        <div className="text-left">
                          <p className="text-xs font-rounded font-bold">Evening Shift (Group 2)</p>
                          <p className="text-[10px] opacity-80">02:00 PM – 05:00 PM</p>
                        </div>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Selected Student Information Chip */}
                {selectedStudent && (
                  <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs font-rounded text-slate-500">
                    <span className="flex items-center gap-1">
                      <span className="font-semibold text-slate-700">Admission:</span>{' '}
                      {selectedStudent.admissionNumber}
                    </span>
                    <span className="hidden sm:inline">•</span>
                    <span className="flex items-center gap-1">
                      <span className="font-semibold text-slate-700">Group:</span>{' '}
                      {selectedStudent.group}
                    </span>
                    <span className="hidden sm:inline">•</span>
                    <span className="flex items-center gap-1">
                      <span className="font-semibold text-slate-700">Institution:</span>{' '}
                      {selectedStudent.institutionName}
                    </span>
                  </div>
                )}
              </div>

              {/* ──────── STEP 2: UPLOAD OR TAKE PHOTO AREA ──────── */}
              <div className="bg-white rounded-[24px] p-6 shadow-sm border border-slate-200/80">
                <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <Layers className="w-5 h-5 text-[#0047AB]" />
                    <h2 className="font-rounded font-bold text-lg text-slate-900">
                      Step 2: Add Answer Script Pages
                    </h2>
                  </div>
                  <span className="text-xs font-rounded font-bold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600">
                    {pages.length} {pages.length === 1 ? 'Page' : 'Pages'} Added
                  </span>
                </div>

                {/* Camera Fallback Warning if Camera was Denied */}
                {cameraError && (
                  <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between text-xs font-rounded text-amber-800">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>{cameraError}</span>
                    </div>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="px-2.5 py-1 bg-amber-200 hover:bg-amber-300 text-amber-900 font-bold rounded-lg transition-colors cursor-pointer"
                    >
                      Choose File
                    </button>
                  </div>
                )}

                {/* Staging / Preview State: After taking a photo or choosing a file */}
                {stagingImage ? (
                  <div className="bg-slate-900 rounded-2xl p-4 text-white flex flex-col items-center gap-4">
                    <div className="flex items-center justify-between w-full pb-2 border-b border-white/10">
                      <span className="text-xs font-rounded font-bold text-cyan-300">
                        Confirm Page {pages.length + 1} Preview
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={handleRotateStaging}
                          className="flex items-center gap-1 text-xs font-rounded bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
                          title="Rotate Image 90°"
                        >
                          <RotateCw className="w-3.5 h-3.5" />
                          <span>Rotate</span>
                        </button>
                      </div>
                    </div>

                    {/* Staged Image Preview */}
                    <div className="max-h-[380px] w-full flex items-center justify-center overflow-hidden rounded-xl bg-black/40 p-2">
                      <img
                        src={stagingImage}
                        alt="Captured page preview"
                        className="max-h-[360px] max-w-full object-contain rounded-lg shadow-xl"
                      />
                    </div>

                    {/* Confirmation & Discard Buttons */}
                    <div className="flex items-center gap-3 w-full sm:w-auto">
                      <button
                        onClick={handleConfirmStaging}
                        className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl font-rounded font-bold text-sm text-white shadow-md transition-all cursor-pointer"
                        style={{
                          background: 'linear-gradient(135deg, #4DD9E8 0%, #0047AB 100%)',
                        }}
                      >
                        <Check className="w-4 h-4" />
                        <span>Use This Image (Page {pages.length + 1})</span>
                      </button>

                      <button
                        onClick={handleDiscardStaging}
                        className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-rounded font-bold text-sm bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
                      >
                        <RefreshCw className="w-4 h-4" />
                        <span>Retake / Choose Again</span>
                      </button>
                    </div>
                  </div>
                ) : isCameraActive ? (
                  /* ════════ LIVE CAMERA VIEWFINDER ════════ */
                  <div className="relative bg-black rounded-2xl overflow-hidden flex flex-col items-center">
                    <div className="relative w-full max-h-[480px] aspect-[4/3] bg-black flex items-center justify-center">
                      <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full h-full object-cover"
                      />

                      {/* Document Framing Scanner Overlay */}
                      <div className="absolute inset-8 sm:inset-12 border-2 border-cyan-400/80 rounded-2xl pointer-events-none flex flex-col justify-between p-4 shadow-[0_0_20px_rgba(77,217,232,0.3)]">
                        <div className="flex justify-between">
                          <div className="w-6 h-6 border-t-4 border-l-4 border-cyan-400 rounded-tl-lg" />
                          <div className="w-6 h-6 border-t-4 border-r-4 border-cyan-400 rounded-tr-lg" />
                        </div>
                        <p className="text-center text-xs font-rounded text-cyan-200 bg-black/60 backdrop-blur-xs py-1 px-3 rounded-full mx-auto shadow-md">
                          Align answer sheet within the frame
                        </p>
                        <div className="flex justify-between">
                          <div className="w-6 h-6 border-b-4 border-l-4 border-cyan-400 rounded-bl-lg" />
                          <div className="w-6 h-6 border-b-4 border-r-4 border-cyan-400 rounded-br-lg" />
                        </div>
                      </div>
                    </div>

                    {/* Camera Action Bar */}
                    <div className="w-full bg-slate-950 p-4 flex items-center justify-between gap-4 z-10">
                      <button
                        onClick={stopCamera}
                        className="text-xs font-rounded text-white/70 hover:text-white px-3 py-2 rounded-xl bg-white/10 transition-colors cursor-pointer"
                      >
                        Cancel
                      </button>

                      {/* Big Shutter Button */}
                      <button
                        onClick={captureCameraFrame}
                        className="w-16 h-16 rounded-full border-4 border-white flex items-center justify-center shadow-lg active:scale-90 transition-transform cursor-pointer"
                        style={{
                          background: 'linear-gradient(135deg, #4DD9E8 0%, #0047AB 100%)',
                        }}
                        title="Capture Photo"
                      >
                        <div className="w-11 h-11 bg-white rounded-full flex items-center justify-center">
                          <Camera className="w-5 h-5 text-[#0047AB]" />
                        </div>
                      </button>

                      <button
                        onClick={toggleCameraFacing}
                        className="flex items-center gap-1.5 text-xs font-rounded text-white/70 hover:text-white px-3 py-2 rounded-xl bg-white/10 transition-colors cursor-pointer"
                        title="Switch Camera (Front/Rear)"
                      >
                        <SwitchCamera className="w-4 h-4" />
                        <span className="hidden sm:inline">Flip</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  /* ════════ TWO PROMINENT OPTIONS SIDE BY SIDE ════════ */
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragOver(true);
                    }}
                    onDragLeave={() => setIsDragOver(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDragOver(false);
                      handleFilesSelected(e.dataTransfer.files);
                    }}
                    className={`rounded-2xl border-2 border-dashed p-6 transition-all ${
                      isDragOver
                        ? 'border-[#4DD9E8] bg-cyan-50/50'
                        : 'border-slate-300 bg-slate-50/60'
                    }`}
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Option 1: Take Photo */}
                      <button
                        onClick={() => startCamera('environment')}
                        className="p-6 rounded-2xl bg-white border border-slate-200/90 hover:border-[#4DD9E8] hover:shadow-md transition-all flex flex-col items-center justify-center text-center group cursor-pointer active:scale-98"
                      >
                        <div
                          className="w-16 h-16 rounded-2xl flex items-center justify-center text-white mb-3 shadow-md group-hover:scale-105 transition-transform"
                          style={{
                            background: 'linear-gradient(135deg, #4DD9E8 0%, #0047AB 100%)',
                          }}
                        >
                          <Camera className="w-8 h-8" />
                        </div>
                        <h3 className="font-rounded font-bold text-base text-slate-800 mb-1">
                          Take Photo
                        </h3>
                        <p className="text-xs font-rounded text-slate-500 max-w-[220px]">
                          Open device camera directly to snap a clear photo of the script.
                        </p>
                      </button>

                      {/* Option 2: Upload from Device */}
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="p-6 rounded-2xl bg-white border border-slate-200/90 hover:border-[#0047AB] hover:shadow-md transition-all flex flex-col items-center justify-center text-center group cursor-pointer active:scale-98"
                      >
                        <div className="w-16 h-16 rounded-2xl bg-blue-50 text-[#0047AB] border border-blue-200 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                          <Upload className="w-8 h-8" />
                        </div>
                        <h3 className="font-rounded font-bold text-base text-slate-800 mb-1">
                          Upload from Device
                        </h3>
                        <p className="text-xs font-rounded text-slate-500 max-w-[220px]">
                          Choose one or more image files from your local phone or computer storage.
                        </p>
                      </button>
                    </div>

                    <p className="text-center text-[11px] font-rounded text-slate-400 mt-4">
                      Supported formats: JPG, PNG, WEBP • Drag and drop files anywhere here
                    </p>

                    {/* Hidden Inputs */}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*,.pdf,application/pdf"
                      multiple
                      className="hidden"
                      onChange={(e) => handleFilesSelected(e.target.files)}
                    />
                    <input
                      ref={cameraInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={(e) => handleFilesSelected(e.target.files)}
                    />
                  </div>
                )}

                {/* ──────── MULTI-PAGE THUMBNAIL STRIP ──────── */}
                {pages.length > 0 && (
                  <div className="mt-6 pt-5 border-t border-slate-100">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-rounded font-bold text-slate-700">
                          Captured Pages Sequence
                        </span>
                        <span className="text-[11px] font-rounded font-semibold text-slate-400">
                          (Click any thumbnail to inspect)
                        </span>
                      </div>

                      <button
                        onClick={() => {
                          // Allow adding next page via file picker or camera
                          fileInputRef.current?.click();
                        }}
                        className="flex items-center gap-1.5 text-xs font-rounded font-bold text-[#0047AB] hover:underline cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add Another Page</span>
                      </button>
                    </div>

                    {/* Wrapping grid for thumbnail cards */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4 overflow-y-auto max-h-[420px] p-2">
                      {pages.map((dataUrl, idx) => (
                        <div
                          key={idx}
                          className="relative group w-full min-w-[120px] bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden flex flex-col"
                        >
                          {/* Image Thumbnail */}
                          <div
                            onClick={() => setPreviewingPageIdx(idx)}
                            className="w-full h-32 bg-slate-900 flex items-center justify-center cursor-pointer overflow-hidden relative"
                          >
                            <img
                              src={dataUrl}
                              alt={`Page ${idx + 1}`}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                            />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                              <Eye className="w-5 h-5" />
                            </div>
                            <span className="absolute top-1 left-1 bg-black/70 text-white text-[10px] font-rounded font-bold px-1.5 py-0.5 rounded">
                              P.{idx + 1}
                            </span>
                          </div>

                          {/* Controls Footer */}
                          <div className="p-1.5 bg-slate-50 flex items-center justify-between border-t border-slate-100">
                            <div className="flex items-center gap-0.5">
                              <button
                                onClick={() => handleMovePageLeft(idx)}
                                disabled={idx === 0}
                                className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30 cursor-pointer"
                                title="Move Left"
                              >
                                <ChevronLeft className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleMovePageRight(idx)}
                                disabled={idx === pages.length - 1}
                                className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30 cursor-pointer"
                                title="Move Right"
                              >
                                <ChevronRight className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            <button
                              onClick={() => handleRemovePage(idx)}
                              className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded cursor-pointer"
                              title="Delete Page"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}

                      {/* Add Another Page Quick Card */}
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full min-w-[120px] h-[152px] rounded-xl border-2 border-dashed border-slate-300 hover:border-[#4DD9E8] bg-slate-50 hover:bg-cyan-50/50 flex flex-col items-center justify-center text-slate-500 hover:text-[#0047AB] transition-all cursor-pointer"
                      >
                        <Plus className="w-6 h-6 mb-1" />
                        <span className="text-xs font-rounded font-bold text-center">
                          + Add Page
                        </span>
                      </button>
                    </div>
                  </div>
                )}

                {/* ──────── SUBMIT BUTTON ──────── */}
                <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between gap-4">
                  <div className="text-xs font-rounded text-slate-500">
                    {pages.length === 0 ? (
                      <span>Capture or choose at least 1 page to submit.</span>
                    ) : (
                      <span>
                        Ready to submit: <strong>{pages.length}</strong> pages for{' '}
                        <strong>{selectedStudent?.fullName}</strong>
                      </span>
                    )}
                  </div>

                  <button
                    onClick={handleSubmitPaper}
                    disabled={pages.length === 0}
                    className="px-6 py-3 rounded-2xl text-white font-rounded font-bold text-sm shadow-md transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 active:scale-95"
                    style={{
                      background: 'linear-gradient(135deg, #4DD9E8 0%, #0047AB 100%)',
                    }}
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Submit Paper for Review</span>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* ──────── RIGHT SIDEBAR: RECENT UPLOADS LOG ──────── */}
        <aside className="w-full lg:w-[380px] shrink-0 flex flex-col gap-4">
          <div className="bg-white rounded-[24px] p-6 shadow-sm border border-slate-200/80 flex flex-col h-full">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#0047AB]" />
                <h3 className="font-rounded font-bold text-base text-slate-900">
                  Recent Uploads
                </h3>
              </div>
              <span className="text-xs font-rounded text-slate-400">
                This Session
              </span>
            </div>

            {recentUploads.length > 0 ? (
              <div className="space-y-3 overflow-y-auto max-h-[600px] pr-1">
                {recentUploads.map((log) => (
                  <div
                    key={log.paperId}
                    className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/70 hover:bg-slate-100/80 transition-colors flex items-center justify-between gap-3 text-left"
                  >
                    <div className="flex items-center gap-3 overflow-hidden">
                      {/* Thumbnail of first page */}
                      <div className="w-10 h-12 rounded-lg bg-slate-900 shrink-0 overflow-hidden border border-slate-200">
                        <img
                          src={log.thumbnailUrl}
                          alt="Thumbnail"
                          className="w-full h-full object-cover"
                        />
                      </div>

                      <div className="truncate">
                        <p className="text-xs font-rounded font-bold text-slate-800 truncate">
                          {log.studentName}
                        </p>
                        <p className="text-[11px] font-rounded text-slate-500 truncate">
                          {log.subject}
                        </p>
                        <div className="flex items-center gap-2 text-[10px] font-rounded text-slate-400 mt-0.5">
                          <span>{log.pagesCount} pgs</span>
                          <span>•</span>
                          <span>{log.timestamp}</span>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => onOpenEditingWithPaper(log.paperId)}
                      className="px-2.5 py-1.5 bg-white hover:bg-blue-50 text-[#0047AB] border border-slate-200 rounded-xl text-[11px] font-rounded font-bold shrink-0 shadow-2xs transition-colors cursor-pointer"
                      title="Open in Editing Module"
                    >
                      Grade →
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-12 flex flex-col items-center justify-center text-center text-slate-400">
                <FileText className="w-10 h-10 mb-2 opacity-30" />
                <p className="text-xs font-rounded font-semibold text-slate-500">
                  No uploads yet in this session
                </p>
                <p className="text-[11px] font-rounded text-slate-400 max-w-[200px] mt-1">
                  Answer scripts you submit will appear here for quick reference.
                </p>
              </div>
            )}
          </div>
        </aside>
      </main>

      {/* ════════ AI GRADING PIPELINE PROGRESS MODAL ════════ */}
      <AnimatePresence>
        {pipelineModal.isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 select-none"
          >
            <motion.div
              initial={{ scale: 0.94, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.94, opacity: 0, y: 20 }}
              className="bg-white rounded-[32px] shadow-2xl border border-slate-200/90 w-full max-w-xl overflow-hidden flex flex-col"
            >
              {/* Modal Header */}
              <div
                className="px-6 py-5 text-white relative shrink-0"
                style={{
                  background: 'linear-gradient(90deg, #4DD9E8 0%, #0047AB 100%)',
                }}
              >
                <div className="absolute inset-x-0 top-0 h-1/3 bg-white/10 pointer-events-none" />
                <div className="relative z-10 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center">
                    <FileCheck className="w-5 h-5 text-cyan-200" />
                  </div>
                  <div>
                    <h3 className="font-rounded font-bold text-lg text-white">
                      AI Paper Grading Pipeline
                    </h3>
                    <p className="text-xs text-white/80 font-rounded">
                      {pipelineModal.subjectName} • {pipelineModal.studentName}
                    </p>
                  </div>
                </div>
              </div>

              {/* Modal Body / Steps */}
              <div className="p-6 flex flex-col gap-5">
                {/* ── STEP 1: READING PAPER ── */}
                <div
                  className={`p-4 rounded-2xl border transition-all flex items-start gap-3.5 ${
                    pipelineModal.step === 'reading'
                      ? 'bg-blue-50/80 border-[#0047AB]/30 ring-1 ring-[#0047AB]/20'
                      : pipelineModal.step === 'grading' || pipelineModal.step === 'done'
                      ? 'bg-emerald-50/60 border-emerald-200'
                      : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="mt-0.5 shrink-0">
                    {pipelineModal.step === 'reading' ? (
                      <Loader2 className="w-5 h-5 text-[#0047AB] animate-spin" />
                    ) : pipelineModal.step === 'grading' || pipelineModal.step === 'done' ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    ) : (
                      <div className="w-5 h-5 rounded-full border-2 border-slate-300" />
                    )}
                  </div>
                  <div className="flex-1">
                    <h4 className="font-rounded font-bold text-sm text-slate-800">
                      Step 1: Reading paper (OCR Transcription)
                    </h4>
                    <p className="text-xs font-rounded text-slate-500 mt-0.5">
                      {pipelineModal.step === 'reading'
                        ? 'Extracting student roll number, transcribing answers, mapping questions, and describing diagrams...'
                        : 'Answer script transcribed and header extracted successfully.'}
                    </p>
                  </div>
                </div>

                {/* ── STEP 2: GRADING ── */}
                <div
                  className={`p-4 rounded-2xl border transition-all flex items-start gap-3.5 ${
                    pipelineModal.step === 'grading'
                      ? 'bg-blue-50/80 border-[#0047AB]/30 ring-1 ring-[#0047AB]/20'
                      : pipelineModal.step === 'done'
                      ? 'bg-emerald-50/60 border-emerald-200'
                      : 'bg-slate-50 border-slate-200 opacity-60'
                  }`}
                >
                  <div className="mt-0.5 shrink-0">
                    {pipelineModal.step === 'grading' ? (
                      <Loader2 className="w-5 h-5 text-[#0047AB] animate-spin" />
                    ) : pipelineModal.step === 'done' ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    ) : (
                      <div className="w-5 h-5 rounded-full border-2 border-slate-300" />
                    )}
                  </div>
                  <div className="flex-1">
                    <h4 className="font-rounded font-bold text-sm text-slate-800">
                      Step 2: Grading against marking scheme
                    </h4>
                    <p className="text-xs font-rounded text-slate-500 mt-0.5">
                      {pipelineModal.step === 'grading'
                        ? 'Evaluating answers strictly against key points, checking alternative methods, and validating scores...'
                        : pipelineModal.step === 'done'
                        ? 'Rubric evaluation complete. Partial marks awarded per key point.'
                        : 'Awaiting completion of OCR transcription...'}
                    </p>
                  </div>
                </div>

                {/* ── STEP 3: DONE / IDENTITY / SUMMARY ── */}
                {pipelineModal.step === 'done' && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col gap-3"
                  >
                    {/* Identity Check Pill */}
                    {pipelineModal.identityCheck?.passed ? (
                      <div className="bg-emerald-50 border border-emerald-300 text-emerald-900 rounded-2xl p-3.5 flex items-center gap-3">
                        <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />
                        <div className="text-xs font-rounded">
                          <span className="font-bold">Identity Verified: </span>
                          Roll number on paper (
                          <span className="font-mono font-bold">
                            {pipelineModal.identityCheck.paperRollNumber}
                          </span>
                          ) matches enrolled student record.
                        </div>
                      </div>
                    ) : (
                      <div className="bg-amber-50 border border-amber-300 text-amber-900 rounded-2xl p-3.5 flex items-start gap-3">
                        <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                        <div className="text-xs font-rounded flex-1">
                          <span className="font-bold">Identity Check Needed: </span>
                          {pipelineModal.identityCheck?.mismatchReason ||
                            'Roll number discrepancy detected.'}{' '}
                          Paper marked as <strong>Identity Check Needed</strong> and not auto-assigned.
                        </div>
                      </div>
                    )}

                    {/* Score summary */}
                    <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 flex items-center justify-between">
                      <div>
                        <span className="text-[11px] font-rounded font-bold text-slate-400 uppercase tracking-wider block">
                          AI Pre-filled Score
                        </span>
                        <div className="text-xl font-rounded font-bold text-[#0047AB]">
                          {pipelineModal.totalMarks} / {pipelineModal.maxMarks} marks
                        </div>
                      </div>
                      <span
                        className={`text-xs font-rounded font-bold px-3 py-1 rounded-full ${
                          pipelineModal.status === 'Identity Check Needed'
                            ? 'bg-amber-100 text-amber-800 border border-amber-300'
                            : 'bg-blue-100 text-[#0047AB] border border-blue-200'
                        }`}
                      >
                        {pipelineModal.status}
                      </span>
                    </div>
                  </motion.div>
                )}

                {/* ── FAILED STATE ── */}
                {pipelineModal.step === 'failed' && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-amber-50 border border-amber-300 rounded-2xl p-4 text-amber-900 flex flex-col gap-2"
                  >
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                      <span className="font-rounded font-bold text-sm">
                        AI Grading Pipeline Issue
                      </span>
                    </div>
                    <p className="text-xs font-rounded text-amber-800">
                      {pipelineModal.error || 'Server connection failed or response timed out.'}
                    </p>
                    <p className="text-[11px] font-rounded text-amber-700 mt-1">
                      Paper preserved in master store with status{' '}
                      <strong>"AI Failed - Manual Grading"</strong>. You can retry with Gemini or grade manually in the Editing desk.
                    </p>
                  </motion.div>
                )}
              </div>

              {/* Modal Footer Actions */}
              <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3 shrink-0">
                {pipelineModal.step === 'failed' ? (
                  <>
                    <button
                      onClick={handleSubmitPaper}
                      className="flex items-center gap-1.5 text-xs font-rounded font-bold text-white bg-[#0047AB] hover:bg-[#003882] px-4 py-2 rounded-full transition-all cursor-pointer shadow-xs active:scale-95"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Retry AI Grading</span>
                    </button>
                    <button
                      onClick={() => {
                        setPipelineModal((prev) => ({ ...prev, isOpen: false }));
                        onOpenEditingWithPaper(pipelineModal.paperId);
                      }}
                      className="text-xs font-rounded font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 px-4 py-2 rounded-full transition-colors cursor-pointer"
                    >
                      Manual Grading Desk →
                    </button>
                  </>
                ) : pipelineModal.step === 'done' ? (
                  <>
                    <button
                      onClick={handleResetForNext}
                      className="text-xs font-rounded font-semibold text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-100 border border-slate-200 px-4 py-2 rounded-full transition-colors cursor-pointer"
                    >
                      Upload Another Script
                    </button>
                    <button
                      onClick={() => {
                        setPipelineModal((prev) => ({ ...prev, isOpen: false }));
                        onOpenEditingWithPaper(pipelineModal.paperId);
                      }}
                      className="flex items-center gap-1.5 text-xs font-rounded font-bold text-white bg-gradient-to-r from-[#4DD9E8] to-[#0047AB] hover:opacity-95 px-5 py-2 rounded-full transition-all cursor-pointer shadow-md active:scale-95"
                    >
                      <span>Open in Editing Desk</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </>
                ) : (
                  <div className="w-full flex items-center justify-between text-xs font-rounded text-slate-400">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                      Processing answer script with Gemini 3.8 Flash...
                    </span>
                    <span>Please keep this window open</span>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ════════ ENLARGED PAGE INSPECTION MODAL ════════ */}
      <AnimatePresence>
        {previewingPageIdx !== null && pages[previewingPageIdx] && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex flex-col items-center justify-center p-4"
          >
            <div className="absolute top-4 right-4 flex items-center gap-3 z-10">
              <span className="text-white text-xs font-rounded font-semibold bg-white/20 px-3 py-1.5 rounded-full">
                Page {previewingPageIdx + 1} of {pages.length}
              </span>
              <button
                onClick={() => setPreviewingPageIdx(null)}
                className="w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="max-w-4xl max-h-[85vh] w-full flex items-center justify-center overflow-auto">
              <img
                src={pages[previewingPageIdx]}
                alt={`Full page preview ${previewingPageIdx + 1}`}
                className="max-h-[85vh] max-w-full object-contain rounded-xl shadow-2xl"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ════════ MULTI-PAPER BATCH UPLOAD (DEV MODE) MODAL ════════ */}
      <BatchUploadModal
        isOpen={isBatchModalOpen}
        onClose={() => setIsBatchModalOpen(false)}
        students={students}
        markingSchemes={markingSchemes}
        onSubmitPaper={onSubmitPaper}
        onAddRecentUpload={onAddRecentUpload}
        onOpenEditingWithPaper={onOpenEditingWithPaper}
      />

      {/* ════════ WIPE REGISTRY IN-APP CONFIRMATION MODAL ════════ */}
      {showWipeConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl border border-rose-100 max-w-md w-full p-6 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-rose-600" />
              </div>
              <div className="space-y-1">
                <h3 className="font-rounded font-bold text-base sm:text-lg text-slate-900">
                  Replace all students?
                </h3>
                <p className="text-xs text-slate-600 font-rounded leading-relaxed">
                  This will DELETE every student currently in Students Data, then keep only candidates extracted from this upload. The existing students will vanish. This cannot be undone.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={handleCancelWipeImport}
                className="px-4 py-2 rounded-xl text-xs font-rounded font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmWipeImport}
                className="px-4 py-2 rounded-xl text-xs font-rounded font-bold text-white bg-rose-600 hover:bg-rose-700 transition-colors shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Wipe & Import</span>
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ════════ MARKING SCHEME DELETE CONFIRMATION MODAL ════════ */}
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
                    Delete Marking Scheme
                  </h3>
                  <p className="text-xs font-rounded text-slate-500">
                    Confirm scheme removal
                  </p>
                </div>
              </div>

              <div className="text-sm font-rounded text-slate-700 leading-relaxed">
                <p>
                  Are you sure you want to delete{' '}
                  {deleteConfirmModal.type === 'all'
                    ? 'all marking schemes'
                    : `the scheme '${deleteConfirmModal.title}'`}
                  ? This action is permanent and cannot be undone.
                </p>
              </div>

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
                  onClick={handleDeleteConfirm}
                  className="px-4 py-2 rounded-xl text-xs font-rounded font-bold text-white bg-rose-600 hover:bg-rose-700 active:scale-95 transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete</span>
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
              className="bg-white rounded-[28px] max-w-md w-full p-6 shadow-2xl border border-slate-200 flex flex-col gap-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0 shadow-inner">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-rounded font-bold text-base sm:text-lg text-slate-900 leading-tight">
                    {deleteConfirmModal.type === 'all' ? 'Delete All Schemes' : 'Delete Marking Scheme'}
                  </h3>
                  <p className="text-xs font-rounded text-slate-500">
                    Confirm deletion
                  </p>
                </div>
              </div>

              <div className="text-sm font-rounded text-slate-700 leading-relaxed">
                <p>
                  {deleteConfirmModal.type === 'all'
                    ? 'Are you sure you want to delete ALL stored marking schemes? This action is permanent and cannot be undone.'
                    : `Are you sure you want to delete the marking scheme "${deleteConfirmModal.title}"? This cannot be undone.`}
                </p>
              </div>

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
                  onClick={handleDeleteConfirm}
                  className="px-4 py-2 rounded-xl text-xs font-rounded font-bold text-white bg-rose-600 hover:bg-rose-700 active:scale-95 transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete {deleteConfirmModal.type === 'all' ? 'All' : ''}</span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
