import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Upload,
  Files,
  CheckCircle2,
  AlertCircle,
  Clock,
  Layers,
  ArrowRight,
  X,
  Loader2,
  FileCheck,
  RefreshCw,
  Zap,
  Play,
  ShieldCheck,
  Award,
} from 'lucide-react';
import { StudentRecord, ExamPaper, PaperStatus, ExamQuestion } from '../data/mockPapers';
import { MarkingScheme } from '../data/mockMarkingSchemes';
import { RecentUploadLog } from './UploadingScreen';
import { generateSamplePaperSvg } from '../utils/samplePaperImages';
import { calculateFbiseGrade } from '../utils/gradeCalculations';
import { checkForDuplicatePaper } from '../utils/duplicateCheck';

interface BatchUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  papers?: ExamPaper[];
  students: StudentRecord[];
  markingSchemes: MarkingScheme[];
  onSubmitPaper: (newPaper: ExamPaper) => void;
  onAddRecentUpload: (log: RecentUploadLog) => void;
  onOpenEditingWithPaper?: (paperId: string) => void;
}

interface QueuedItem {
  id: string;
  studentName: string;
  studentRoll: string;
  studentId: string;
  subject: string;
  fileName: string;
  fileSize?: string;
  pagesCount: number;
  thumbnailUrl: string;
  status: 'queued' | 'processing' | 'completed' | 'error';
  paperId?: string;
  totalScore?: number;
  maxScore?: number;
  grade?: string;
  gpa?: number;
}

export const BatchUploadModal: React.FC<BatchUploadModalProps> = ({
  isOpen,
  onClose,
  papers = [],
  students,
  markingSchemes,
  onSubmitPaper,
  onAddRecentUpload,
  onOpenEditingWithPaper,
}) => {
  const [queue, setQueue] = useState<QueuedItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const completedCount = queue.filter((item) => item.status === 'completed').length;
  const progressPercent =
    queue.length > 0 ? Math.round((completedCount / queue.length) * 100) : 0;

  // Handle actual files chosen via drag & drop or file dialog
  const handleFilesDropped = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const fileList = Array.from(files).filter(
      (f) => f.type.startsWith('image/') || f.type.includes('pdf') || f.name.match(/\.(png|jpe?g|webp|pdf)$/i)
    );

    if (fileList.length === 0) return;

    const subjectsList = [
      'Physics (Advanced)',
      'Pure Mathematics',
      'Chemistry (Organic)',
      'Computer Science',
      'Biology',
    ];

    const newItems: QueuedItem[] = fileList.map((file, i) => {
      const student =
        students[i % Math.max(1, students.length)] || {
          id: `batch-std-${Date.now()}-${i}`,
          fullName: `Candidate #${1000 + i}`,
          rollNumber: `SEC-2026-${100 + i}`,
        };

      const subject =
        subjectsList[i % subjectsList.length] || 'Physics (Advanced)';

      // Generate simulated SVG script thumbnail
      const variant = (
        subject.toLowerCase().includes('phys')
          ? 'physics'
          : subject.toLowerCase().includes('math')
          ? 'math'
          : subject.toLowerCase().includes('chem')
          ? 'chemistry'
          : subject.toLowerCase().includes('comp')
          ? 'cs'
          : 'default'
      ) as 'physics' | 'math' | 'chemistry' | 'cs' | 'biology' | 'default';

      const thumbSvg = generateSamplePaperSvg(
        student.rollNumber,
        student.fullName,
        subject,
        1,
        2,
        variant
      );

      const thumbUrl = `data:image/svg+xml;utf8,${encodeURIComponent(thumbSvg)}`;

      return {
        id: `batch-item-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
        studentName: student.fullName,
        studentRoll: student.rollNumber,
        studentId: student.id,
        subject,
        fileName: file.name,
        fileSize: `${(file.size / 1024).toFixed(1)} KB`,
        pagesCount: Math.floor(Math.random() * 2) + 2,
        thumbnailUrl: thumbUrl,
        status: 'queued',
      };
    });

    setQueue((prev) => [...prev, ...newItems]);
  };

  // Generate synthetic test batches for Dev Mode (10, 25, or 50 scripts)
  const handleGenerateDevBatch = (batchSize: number) => {
    const subjectsList = [
      'Physics (Advanced)',
      'Pure Mathematics',
      'Chemistry (Organic)',
      'Computer Science',
      'Biology',
    ];

    const dummyNames = [
      'Hamza Tariq',
      'Ayesha Siddiqua',
      'Zaid Khan',
      'Fatima Noor',
      'Bilal Ahmed',
      'Mahnoor Zehra',
      'Usman Ghani',
      'Hira Mansoor',
      'Saad Rafique',
      'Maryam Bibi',
      'Zubair Ali',
      'Sana Malik',
      'Taimoor Shah',
      'Laiba Javed',
      'Hassan Raza',
      'Zainab Kazmi',
      'Shahzaib Qureshi',
      'Iqra Batool',
      'Ali Asghar',
      'Dua Zahra',
      'Arham Farooq',
      'Khadija Tul Kubra',
      'Musa Iftikhar',
      'Anum Rasheed',
      'Mustafa Kamal',
      'Bareera Sheikh',
      'Waleed Jan',
      'Amna Khalid',
      'Haris Mehmood',
      'Rameen Sohail',
    ];

    const generated: QueuedItem[] = [];

    for (let i = 0; i < batchSize; i++) {
      const studentName = dummyNames[i % dummyNames.length];
      const rollNumber = `SEC-2026-${101 + i}`;
      const studentId = `batch-std-${101 + i}`;
      const subject = subjectsList[i % subjectsList.length];

      const variant = (
        subject.toLowerCase().includes('phys')
          ? 'physics'
          : subject.toLowerCase().includes('math')
          ? 'math'
          : subject.toLowerCase().includes('chem')
          ? 'chemistry'
          : subject.toLowerCase().includes('comp')
          ? 'cs'
          : 'default'
      ) as 'physics' | 'math' | 'chemistry' | 'cs' | 'biology' | 'default';

      const thumbSvg = generateSamplePaperSvg(
        rollNumber,
        studentName,
        subject,
        1,
        2,
        variant
      );
      const thumbUrl = `data:image/svg+xml;utf8,${encodeURIComponent(thumbSvg)}`;

      generated.push({
        id: `batch-item-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
        studentName,
        studentRoll: rollNumber,
        studentId,
        subject,
        fileName: `Scan_Roll_${rollNumber}_${subject.replace(/[^a-zA-Z]/g, '')}.jpg`,
        fileSize: `${Math.floor(180 + Math.random() * 420)} KB`,
        pagesCount: Math.floor(Math.random() * 3) + 2,
        thumbnailUrl: thumbUrl,
        status: 'queued',
      });
    }

    setQueue((prev) => [...prev, ...generated]);
  };

  // Process the queue item by item with real-time state ingestion
  const startProcessingQueue = async () => {
    if (isProcessing || queue.length === 0) return;
    setIsProcessing(true);

    for (let i = 0; i < queue.length; i++) {
      if (queue[i].status === 'completed') continue;

      setCurrentIndex(i);
      setQueue((prev) =>
        prev.map((item, idx) => (idx === i ? { ...item, status: 'processing' } : item))
      );

      // Simulated realistic OCR & FBISE grading processing delay (100ms - 220ms per paper in batch)
      await new Promise((res) => setTimeout(res, 140));

      const item = queue[i];
      const dupCheck = checkForDuplicatePaper(
        papers,
        students,
        item.studentRoll,
        item.studentName,
        item.studentId,
        item.subject
      );

      if (dupCheck.isDuplicate) {
        setQueue((prev) =>
          prev.map((it, idx) =>
            idx === i ? { ...it, status: 'error' } : it
          )
        );
        continue;
      }

      const paperId = `paper-batch-${Date.now()}-${i}`;
      const activeScheme =
        markingSchemes.find(
          (s) => s.subject.toLowerCase() === item.subject.toLowerCase()
        ) || markingSchemes[0];

      const totalMarks = activeScheme?.totalMarks || 50;
      // High performance distribution between 65% and 98%
      const percentageScore = Math.floor(65 + Math.random() * 32);
      const marksAwarded = Math.round((percentageScore / 100) * totalMarks);
      const fbise = calculateFbiseGrade(percentageScore);

      const questionsList: ExamQuestion[] = (activeScheme?.questions || [1, 2, 3, 4, 5]).map(
        (sq: any, qIdx: number) => {
          const qNum = typeof sq === 'number' ? sq : sq.questionNumber;
          const qMax = typeof sq === 'number' ? 10 : sq.maxMarks;
          const awarded = Math.min(qMax, Math.round((marksAwarded / 5) * (0.85 + Math.random() * 0.3)));
          return {
            questionNumber: qNum,
            questionText: typeof sq === 'object' ? sq.questionText : `Question ${qNum}`,
            maxMarks: qMax,
            aiSuggestedMark: awarded,
            examinerMark: awarded,
          };
        }
      );

      const variant = (
        item.subject.toLowerCase().includes('phys')
          ? 'physics'
          : item.subject.toLowerCase().includes('math')
          ? 'math'
          : item.subject.toLowerCase().includes('chem')
          ? 'chemistry'
          : item.subject.toLowerCase().includes('comp')
          ? 'cs'
          : 'default'
      ) as 'physics' | 'math' | 'chemistry' | 'cs' | 'biology' | 'default';

      const page1Svg = generateSamplePaperSvg(item.studentRoll, item.studentName, item.subject, 1, 2, variant);
      const page2Svg = generateSamplePaperSvg(item.studentRoll, item.studentName, item.subject, 2, 2, variant);

      const pageImages = [
        `data:image/svg+xml;utf8,${encodeURIComponent(page1Svg)}`,
        `data:image/svg+xml;utf8,${encodeURIComponent(page2Svg)}`,
      ];

      const newPaper: ExamPaper = {
        id: paperId,
        studentId: item.studentId,
        subject: item.subject,
        examSession: 'Annual Senior Examinations 2026',
        dateSubmitted: new Date().toISOString().split('T')[0],
        status: 'Pending Review',
        remarks: `Batch Ingested • AI Scored: ${marksAwarded}/${totalMarks} (${percentageScore}% - Grade ${fbise.grade}, GPA ${fbise.gpa.toFixed(2)}/5.00). Awaiting examiner audit.`,
        pageImages,
        questions: questionsList,
        aiGradingDetails: {
          transcription: {
            header: {
              studentName: item.studentName,
              studentRoll: item.studentRoll,
            },
            answers: [],
          },
          questionResults: {},
          identityCheck: {
            passed: true,
            paperRollNumber: item.studentRoll,
            paperStudentName: item.studentName,
          },
          totalAIMarks: marksAwarded,
          overallConfidence: 'high',
          flaggedQuestionCount: 0,
          gradedAt: new Date().toISOString(),
        },
      };

      // Submit immediately to update master state in real time
      onSubmitPaper(newPaper);

      // Add to recent uploads for real-time header count update
      onAddRecentUpload({
        paperId,
        studentId: item.studentId,
        studentName: item.studentName,
        studentRoll: item.studentRoll,
        subject: item.subject,
        pagesCount: item.pagesCount,
        thumbnailUrl: item.thumbnailUrl,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        status: 'Pending Review',
      });

      // Update queue item state to completed
      setQueue((prev) =>
        prev.map((it, idx) =>
          idx === i
            ? {
                ...it,
                status: 'completed',
                paperId,
                totalScore: marksAwarded,
                maxScore: totalMarks,
                grade: fbise.grade,
                gpa: fbise.gpa,
              }
            : it
        )
      );
    }

    setIsProcessing(false);
  };

  const handleClearQueue = () => {
    if (isProcessing) return;
    setQueue([]);
    setCurrentIndex(0);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 select-none overflow-y-auto">
      <motion.div
        initial={{ scale: 0.94, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.94, opacity: 0, y: 20 }}
        className="bg-white rounded-[32px] shadow-2xl border border-slate-200/90 w-full max-w-4xl overflow-hidden flex flex-col my-auto max-h-[92vh]"
      >
        {/* Modal Top Header Banner */}
        <header
          className="px-6 py-5 text-white relative shrink-0"
          style={{
            background: 'linear-gradient(90deg, #4DD9E8 0%, #0047AB 100%)',
          }}
        >
          <div className="absolute inset-x-0 top-0 h-1/3 bg-white/10 pointer-events-none" />
          <div className="relative z-10 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center shadow-xs">
                <Files className="w-5 h-5 text-cyan-200" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-rounded font-bold text-lg sm:text-xl text-white">
                    Multi-Paper Batch Upload Desk
                  </h3>
                  <span className="bg-white/25 text-white text-[10px] font-rounded font-bold uppercase tracking-wider px-2 py-0.5 rounded-full">
                    Dev Mode
                  </span>
                </div>
                <p className="text-xs text-white/80 font-rounded">
                  Bulk ingest 10 to 50 answer scripts simultaneously with live OCR queuing and real-time counter updates.
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              disabled={isProcessing}
              className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/25 flex items-center justify-center text-white transition-colors cursor-pointer disabled:opacity-30"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 flex flex-col gap-6">
          {/* Top Quick Actions Bar (Dev presets + Drag Zone) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <button
              onClick={() => handleGenerateDevBatch(10)}
              disabled={isProcessing}
              className="p-3.5 rounded-2xl bg-blue-50/80 hover:bg-blue-100/80 border border-blue-200 text-[#0047AB] flex items-center justify-between transition-all cursor-pointer group active:scale-98 disabled:opacity-40"
            >
              <div className="flex items-center gap-2.5">
                <Zap className="w-5 h-5 text-[#0047AB] group-hover:scale-110 transition-transform" />
                <div className="text-left">
                  <strong className="block text-xs font-rounded font-bold">Queue 10 Scripts</strong>
                  <span className="text-[11px] font-rounded text-slate-500">Fast batch test</span>
                </div>
              </div>
              <span className="text-xs font-rounded font-bold bg-white px-2 py-1 rounded-lg border border-blue-200">
                +10
              </span>
            </button>

            <button
              onClick={() => handleGenerateDevBatch(25)}
              disabled={isProcessing}
              className="p-3.5 rounded-2xl bg-cyan-50/80 hover:bg-cyan-100/80 border border-cyan-200 text-[#0047AB] flex items-center justify-between transition-all cursor-pointer group active:scale-98 disabled:opacity-40"
            >
              <div className="flex items-center gap-2.5">
                <Layers className="w-5 h-5 text-cyan-600 group-hover:scale-110 transition-transform" />
                <div className="text-left">
                  <strong className="block text-xs font-rounded font-bold">Queue 25 Scripts</strong>
                  <span className="text-[11px] font-rounded text-slate-500">Standard classroom batch</span>
                </div>
              </div>
              <span className="text-xs font-rounded font-bold bg-white px-2 py-1 rounded-lg border border-cyan-200">
                +25
              </span>
            </button>

            <button
              onClick={() => handleGenerateDevBatch(50)}
              disabled={isProcessing}
              className="p-3.5 rounded-2xl bg-emerald-50/80 hover:bg-emerald-100/80 border border-emerald-200 text-emerald-800 flex items-center justify-between transition-all cursor-pointer group active:scale-98 disabled:opacity-40"
            >
              <div className="flex items-center gap-2.5">
                <Files className="w-5 h-5 text-emerald-600 group-hover:scale-110 transition-transform" />
                <div className="text-left">
                  <strong className="block text-xs font-rounded font-bold">Queue 50 Scripts</strong>
                  <span className="text-[11px] font-rounded text-slate-500">Full exam hall simulation</span>
                </div>
              </div>
              <span className="text-xs font-rounded font-bold bg-white px-2 py-1 rounded-lg border border-emerald-200">
                +50
              </span>
            </button>
          </div>

          {/* Drag & Drop Multi-file Target Area */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragOver(false);
              handleFilesDropped(e.dataTransfer.files);
            }}
            className={`border-2 border-dashed rounded-[24px] p-6 text-center transition-all ${
              isDragOver
                ? 'border-[#0047AB] bg-blue-50/60 scale-[1.01]'
                : 'border-slate-300 bg-slate-50/60 hover:bg-slate-50 hover:border-[#4DD9E8]'
            }`}
          >
            <div className="w-12 h-12 rounded-2xl bg-blue-50 text-[#0047AB] border border-blue-200 flex items-center justify-center mx-auto mb-2">
              <Upload className="w-6 h-6" />
            </div>
            <h4 className="font-rounded font-bold text-sm text-slate-800 mb-1">
              Drag & Drop 10 to 50 Answer Script Images Here
            </h4>
            <p className="text-xs font-rounded text-slate-500 max-w-md mx-auto mb-3">
              Accepts PNG, JPG, WEBP, or scanned scripts. All files will be queued and auto-assigned to candidate profiles.
            </p>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessing}
              className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 text-xs font-rounded font-bold rounded-xl border border-slate-200 shadow-2xs transition-colors cursor-pointer"
            >
              Browse Files on Computer
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.pdf"
              multiple
              className="hidden"
              onChange={(e) => handleFilesDropped(e.target.files)}
            />
          </div>

          {/* ════════ LIVE BATCH PROGRESS BAR ════════ */}
          {queue.length > 0 && (
            <div className="bg-slate-900 text-white rounded-[24px] p-5 shadow-md flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center text-cyan-300">
                    {isProcessing ? (
                      <Loader2 className="w-4 h-4 animate-spin text-cyan-300" />
                    ) : progressPercent === 100 ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <Clock className="w-4 h-4 text-slate-300" />
                    )}
                  </div>
                  <div>
                    <h4 className="font-rounded font-bold text-sm text-white flex items-center gap-2">
                      <span>Batch Pipeline Status:</span>
                      <span className="text-cyan-300">
                        {isProcessing
                          ? `Processing Script ${currentIndex + 1} of ${queue.length}...`
                          : progressPercent === 100
                          ? 'All Scripts Ingested & Verified'
                          : `${completedCount} of ${queue.length} Papers Completed`}
                      </span>
                    </h4>
                    <p className="text-[11px] font-rounded text-slate-400">
                      Real-time counter sync active • Papers directly available in Editing Desk & Result Cards.
                    </p>
                  </div>
                </div>

                <div className="text-right">
                  <span className="font-rounded font-extrabold text-2xl text-cyan-300">
                    {progressPercent}%
                  </span>
                  <span className="text-[10px] font-rounded text-slate-400 block">
                    {completedCount} / {queue.length} Done
                  </span>
                </div>
              </div>

              {/* Progress Bar Track */}
              <div className="w-full h-3 bg-white/10 rounded-full overflow-hidden relative">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-[#4DD9E8] via-blue-400 to-[#0047AB]"
                  style={{ width: `${progressPercent}%` }}
                  transition={{ ease: 'easeOut', duration: 0.2 }}
                />
              </div>

              {/* Action Buttons inside Progress Panel */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-white/10">
                <div className="flex items-center gap-2 text-xs font-rounded text-slate-300">
                  <span className="px-2 py-0.5 rounded-md bg-white/10 text-emerald-300 font-bold">
                    ✓ {completedCount} Done
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-white/10 text-amber-300 font-bold">
                    ⏳ {queue.length - completedCount} In Queue
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleClearQueue}
                    disabled={isProcessing}
                    className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-rounded text-slate-300 transition-colors cursor-pointer disabled:opacity-30"
                  >
                    Clear Queue
                  </button>

                  <button
                    onClick={startProcessingQueue}
                    disabled={isProcessing || completedCount === queue.length}
                    className="px-5 py-2 rounded-xl text-xs font-rounded font-bold text-white shadow-md transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-40"
                    style={{
                      background: 'linear-gradient(135deg, #4DD9E8 0%, #0047AB 100%)',
                    }}
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Processing Batch...</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>Start Batch Processing</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ════════ QUEUED SCRIPTS LIST ════════ */}
          {queue.length > 0 && (
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between pb-1">
                <span className="text-xs font-rounded font-bold text-slate-700">
                  Queued Answer Scripts ({queue.length})
                </span>
                <span className="text-[11px] font-rounded text-slate-400">
                  Scroll down to review all candidates in batch
                </span>
              </div>

              <div className="max-h-[300px] overflow-y-auto space-y-2 pr-1">
                {queue.map((item, idx) => (
                  <div
                    key={item.id}
                    className={`p-3 rounded-2xl border transition-all flex items-center justify-between gap-3 text-left ${
                      item.status === 'processing'
                        ? 'bg-blue-50/80 border-[#0047AB] ring-2 ring-[#0047AB]/20'
                        : item.status === 'completed'
                        ? 'bg-emerald-50/40 border-emerald-200'
                        : 'bg-slate-50 border-slate-200/80'
                    }`}
                  >
                    <div className="flex items-center gap-3 overflow-hidden">
                      {/* Script Thumbnail */}
                      <div className="w-9 h-11 rounded-lg bg-slate-900 shrink-0 overflow-hidden border border-slate-200">
                        <img
                          src={item.thumbnailUrl}
                          alt="Thumbnail"
                          className="w-full h-full object-cover"
                        />
                      </div>

                      <div className="truncate">
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-rounded font-bold text-slate-800 truncate">
                            {item.studentName} ({item.studentRoll})
                          </p>
                          <span className="text-[10px] font-rounded text-slate-400">
                            #{idx + 1}
                          </span>
                        </div>
                        <p className="text-[11px] font-rounded text-slate-500 truncate">
                          {item.subject} • {item.pagesCount} Pages • {item.fileSize || 'Standard'}
                        </p>
                      </div>
                    </div>

                    {/* Status Badge & Inspection */}
                    <div className="flex items-center gap-2 shrink-0">
                      {item.status === 'completed' ? (
                        <div className="flex items-center gap-2">
                          <div className="text-right hidden sm:block">
                            <span className="text-[11px] font-rounded font-bold text-emerald-800 block">
                              Grade {item.grade} • GPA {item.gpa?.toFixed(2)}
                            </span>
                            <span className="text-[10px] font-rounded text-slate-400">
                              {item.totalScore}/{item.maxScore} marks
                            </span>
                          </div>
                          <span className="flex items-center gap-1 text-[11px] font-rounded font-bold text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-full border border-emerald-300">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Ingested</span>
                          </span>
                          {item.paperId && onOpenEditingWithPaper && (
                            <button
                              onClick={() => {
                                onClose();
                                onOpenEditingWithPaper(item.paperId!);
                              }}
                              className="text-[11px] font-rounded font-bold text-[#0047AB] hover:underline px-2 py-1 bg-white border border-slate-200 rounded-lg shadow-2xs cursor-pointer"
                            >
                              Grade →
                            </button>
                          )}
                        </div>
                      ) : item.status === 'processing' ? (
                        <span className="flex items-center gap-1 text-[11px] font-rounded font-bold text-[#0047AB] bg-blue-100 px-2.5 py-1 rounded-full animate-pulse border border-blue-300">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Evaluating...</span>
                        </span>
                      ) : (
                        <span className="text-[11px] font-rounded font-medium text-slate-500 bg-slate-200/80 px-2.5 py-0.5 rounded-full">
                          Pending
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <footer className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <span className="text-xs font-rounded text-slate-500">
            {completedCount > 0
              ? `Successfully added ${completedCount} papers to the master examination records.`
              : 'Add files or select a Dev Preset to begin bulk ingestion.'}
          </span>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-5 py-2.5 rounded-2xl bg-white hover:bg-slate-100 text-slate-700 text-xs font-rounded font-bold border border-slate-200 transition-colors cursor-pointer"
            >
              Close Desk
            </button>
          </div>
        </footer>
      </motion.div>
    </div>
  );
};
