import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Target,
  Cpu,
  Upload,
  CheckCircle2,
  AlertTriangle,
  FileText,
  RotateCcw,
  Loader2,
  TrendingUp,
  Percent,
  Plus,
  Trash2,
  Eye,
  Check,
  X,
  XCircle,
  HelpCircle,
  Award,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { MarkingScheme } from '../data/mockMarkingSchemes';
import { CorrectionLog } from '../data/mockPapers';
import { generateSamplePaperSvg } from '../utils/samplePaperImages';

export interface TestScriptItem {
  id: string;
  studentName: string;
  studentRoll: string;
  subject: string;
  pageImages: string[];
  humanMarks: Record<number, number>; // questionNumber -> human awarded mark
  humanNotes?: string;
  aiGrading?: {
    totalAIMarks: number;
    questionResults: Record<
      number,
      {
        questionNumber: number;
        questionText: string;
        maxMarks: number;
        humanMark: number;
        aiMark: number;
        diff: number; // aiMark - humanMark
        absDiff: number;
        withinOneMark: boolean;
        isFlagged: boolean;
        flagReason?: string;
        reason: string;
        keyPointsFound: string[];
        keyPointsMissing: string[];
        confidence: 'high' | 'medium' | 'low';
      }
    >;
    flaggedCount: number;
    overallConfidence: 'high' | 'medium' | 'low';
    gradedAt: string;
  };
}

interface AccuracyTestToolProps {
  schemes: MarkingScheme[];
  initialSelectedSchemeId?: string | null;
  correctionLogs?: CorrectionLog[];
}

export const AccuracyTestTool: React.FC<AccuracyTestToolProps> = ({
  schemes,
  initialSelectedSchemeId,
  correctionLogs = [],
}) => {
  const [selectedSchemeId, setSelectedSchemeId] = useState<string>(() => {
    if (initialSelectedSchemeId && schemes.some((s) => s.id === initialSelectedSchemeId)) {
      return initialSelectedSchemeId;
    }
    return schemes[0]?.id || '';
  });

  const activeScheme = useMemo(() => {
    return schemes.find((s) => s.id === selectedSchemeId) || schemes[0];
  }, [schemes, selectedSchemeId]);

  // Initial Benchmark Test Scripts Generator
  const createDefaultBenchmarkScripts = (scheme: MarkingScheme): TestScriptItem[] => {
    const questions = scheme.questions;
    const isPhysics = scheme.subject.toLowerCase().includes('physics');
    const isMath = scheme.subject.toLowerCase().includes('math');
    const variant = isPhysics ? 'physics' : isMath ? 'math' : 'default';

    return [
      {
        id: `bench-1`,
        studentName: 'Aarav Sharma',
        studentRoll: 'SEC-2026-041',
        subject: scheme.subject,
        pageImages: [
          generateSamplePaperSvg('SEC-2026-041', 'Aarav Sharma', scheme.subject, 1, 2, variant),
          generateSamplePaperSvg('SEC-2026-041', 'Aarav Sharma', scheme.subject, 2, 2, variant),
        ],
        humanMarks: {
          1: 9,
          2: 8,
          3: 8,
          4: 9,
          5: 8,
        },
        humanNotes: 'Very neat presentation. Derivations well supported with vector notations.',
      },
      {
        id: `bench-2`,
        studentName: 'Fatima Al-Mansoor',
        studentRoll: 'SEC-2026-089',
        subject: scheme.subject,
        pageImages: [
          generateSamplePaperSvg('SEC-2026-089', 'Fatima Al-Mansoor', scheme.subject, 1, 1, variant),
        ],
        humanMarks: {
          1: 10,
          2: 9,
          3: 7,
          4: 9,
          5: 7,
        },
        humanNotes: 'Excellent theoretical knowledge; slightly brief on question 3 intermediate algebra.',
      },
      {
        id: `bench-3`,
        studentName: 'Tariq Malik',
        studentRoll: 'SEC-2026-154',
        subject: scheme.subject,
        pageImages: [
          generateSamplePaperSvg('SEC-2026-154', 'Tariq Malik', scheme.subject, 1, 1, variant),
        ],
        humanMarks: {
          1: 9,
          2: 8,
          3: 8,
          4: 9,
          5: 9,
        },
        humanNotes: 'Consistent high marks throughout all 5 questions.',
      },
    ];
  };

  // State for test scripts
  const [testScripts, setTestScripts] = useState<TestScriptItem[]>(() => {
    return activeScheme ? createDefaultBenchmarkScripts(activeScheme) : [];
  });

  // Track if scripts were updated when scheme changes
  React.useEffect(() => {
    if (activeScheme) {
      setTestScripts(createDefaultBenchmarkScripts(activeScheme));
    }
  }, [activeScheme?.id]);

  // Benchmark running state
  const [isRunningBenchmark, setIsRunningBenchmark] = useState(false);
  const [benchmarkProgress, setBenchmarkProgress] = useState<{ current: number; total: number; scriptName: string }>({
    current: 0,
    total: 0,
    scriptName: '',
  });
  const [benchmarkError, setBenchmarkError] = useState<string | null>(null);

  const [errorAlert, setErrorAlert] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
  } | null>(null);

  // New script upload modal state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newStudentName, setNewStudentName] = useState('');
  const [newStudentRoll, setNewStudentRoll] = useState('');
  const [newHumanMarks, setNewHumanMarks] = useState<Record<number, number>>({});
  const [newHumanNotes, setNewHumanNotes] = useState('');

  // Reset new script form
  const handleOpenAddModal = () => {
    if (!activeScheme) return;
    const initialMarks: Record<number, number> = {};
    activeScheme.questions.forEach((q) => {
      initialMarks[q.questionNumber] = Math.max(1, Math.round(q.maxMarks * 0.8));
    });
    setNewHumanMarks(initialMarks);
    setNewStudentName('');
    setNewStudentRoll(`SEC-2026-${Math.floor(100 + Math.random() * 900)}`);
    setNewHumanNotes('');
    setIsAddModalOpen(true);
  };

  // Add new script to batch
  const handleSaveNewScript = () => {
    if (!newStudentName.trim()) {
      setErrorAlert({
        isOpen: true,
        title: 'Missing Student Name',
        message: 'Please enter a student name for the script.',
      });
      return;
    }
    const newScript: TestScriptItem = {
      id: `script-${Date.now()}`,
      studentName: newStudentName.trim(),
      studentRoll: newStudentRoll.trim() || 'SEC-2026-999',
      subject: activeScheme.subject,
      pageImages: [
        generateSamplePaperSvg(
          newStudentRoll.trim() || 'SEC-2026-999',
          newStudentName.trim(),
          activeScheme.subject,
          1,
          1,
          'default'
        ),
      ],
      humanMarks: newHumanMarks,
      humanNotes: newHumanNotes.trim(),
    };

    setTestScripts((prev) => [...prev, newScript]);
    setIsAddModalOpen(false);
  };

  // Delete script from batch
  const handleDeleteScript = (scriptId: string) => {
    if (testScripts.length <= 1) {
      setErrorAlert({
        isOpen: true,
        title: 'Cannot Delete Script',
        message: 'Keep at least one test script in the accuracy batch.',
      });
      return;
    }
    setTestScripts((prev) => prev.filter((s) => s.id !== scriptId));
  };

  // Run AI on a single script
  const gradeScriptWithAI = async (script: TestScriptItem, scheme: MarkingScheme) => {
    const response = await fetch('/api/grade', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        paperId: script.id,
        pageImages: script.pageImages,
        markingScheme: scheme,
        selectedStudent: {
          id: script.id,
          fullName: script.studentName,
          rollNumber: script.studentRoll,
        },
        pastCorrections: correctionLogs,
      }),
    });

    let data: any;
    try {
      const rawText = await response.text();
      data = JSON.parse(rawText);
    } catch (_) {
      throw new Error('AI is busy right now, please try again in a few minutes.');
    }

    if (!response.ok || !data || !data.success) {
      throw new Error(data?.error || 'AI is busy right now, please try again in a few minutes.');
    }

    const questionResultsMap: Record<number, any> = {};

    scheme.questions.forEach((sq) => {
      const qNum = sq.questionNumber;
      const qRes = data.questionResults?.[qNum];
      const humanScore = script.humanMarks[qNum] ?? Math.round(sq.maxMarks * 0.8);
      const aiScore = qRes ? Number(qRes.marks_awarded) : humanScore;
      const diff = aiScore - humanScore;
      const absDiff = Math.abs(diff);

      const isOrChoice = qRes?.attempted_choice === 'or_choice';
      const questionTextToUse = isOrChoice && sq.orChoice?.questionText ? sq.orChoice.questionText : sq.questionText;

      questionResultsMap[qNum] = {
        questionNumber: qNum,
        questionText: questionTextToUse,
        maxMarks: sq.maxMarks,
        humanMark: humanScore,
        aiMark: aiScore,
        diff,
        absDiff,
        withinOneMark: absDiff <= 1,
        isFlagged: Boolean(qRes?.flag_for_review),
        flagReason: qRes?.flag_reason || '',
        reason: qRes?.reason || 'Graded according to key points found in rubric.',
        keyPointsFound: qRes?.key_points_found || [],
        keyPointsMissing: qRes?.key_points_missing || [],
        confidence: qRes?.confidence || 'high',
      };
    });

    return {
      totalAIMarks: data.totalAIMarks,
      questionResults: questionResultsMap,
      flaggedCount: data.flaggedCount,
      overallConfidence: data.overallConfidence,
      gradedAt: new Date().toISOString(),
    };
  };

  // Run the full AI benchmark across all test scripts in the batch
  const handleRunFullBenchmark = async () => {
    if (!activeScheme) return;
    setIsRunningBenchmark(true);
    setBenchmarkError(null);

    const total = testScripts.length;
    const updatedScripts: TestScriptItem[] = [...testScripts];

    try {
      for (let i = 0; i < total; i++) {
        const script = updatedScripts[i];
        setBenchmarkProgress({
          current: i + 1,
          total,
          scriptName: `${script.studentName} (${script.studentRoll})`,
        });

        // Small pause between scripts to respect server limits
        if (i > 0) {
          await new Promise((res) => setTimeout(res, 600));
        }

        const aiGrading = await gradeScriptWithAI(script, activeScheme);
        updatedScripts[i] = {
          ...script,
          aiGrading,
        };
      }

      setTestScripts(updatedScripts);
    } catch (err: any) {
      console.error('Benchmark execution error:', err);
      setBenchmarkError(err.message || 'Benchmark interrupted. Check network or server connection.');
    } finally {
      setIsRunningBenchmark(false);
    }
  };

  // ════════ METRIC CALCULATIONS FOR ACCURACY REPORT ════════
  const reportMetrics = useMemo(() => {
    const gradedScripts = testScripts.filter((s) => s.aiGrading !== undefined);
    if (gradedScripts.length === 0) return null;

    let totalQuestionsCount = 0;
    let questionsWithinOneMarkCount = 0;
    let totalQuestionAbsDiff = 0;
    let totalFlaggedQuestions = 0;
    const allDisagreements: Array<{
      scriptId: string;
      studentName: string;
      studentRoll: string;
      questionNumber: number;
      questionText: string;
      maxMarks: number;
      humanMark: number;
      aiMark: number;
      diff: number;
      absDiff: number;
      reason: string;
      flagReason?: string;
      isFlagged: boolean;
      confidence: 'high' | 'medium' | 'low';
    }> = [];

    gradedScripts.forEach((script) => {
      const qResults = script.aiGrading?.questionResults || {};
      Object.values(qResults).forEach((qr: any) => {
        totalQuestionsCount++;
        totalQuestionAbsDiff += qr.absDiff;
        if (qr.withinOneMark) {
          questionsWithinOneMarkCount++;
        }
        if (qr.isFlagged) {
          totalFlaggedQuestions++;
        }

        // Collect all discrepancies for the biggest disagreements leaderboard
        allDisagreements.push({
          scriptId: script.id,
          studentName: script.studentName,
          studentRoll: script.studentRoll,
          questionNumber: qr.questionNumber,
          questionText: qr.questionText,
          maxMarks: qr.maxMarks,
          humanMark: qr.humanMark,
          aiMark: qr.aiMark,
          diff: qr.diff,
          absDiff: qr.absDiff,
          reason: qr.reason,
          flagReason: qr.flagReason,
          isFlagged: qr.isFlagged,
          confidence: qr.confidence,
        });
      });
    });

    const avgDiffPerQuestion =
      totalQuestionsCount > 0
        ? Number((totalQuestionAbsDiff / totalQuestionsCount).toFixed(2))
        : 0;

    const percentWithinOneMark =
      totalQuestionsCount > 0
        ? Number(((questionsWithinOneMarkCount / totalQuestionsCount) * 100).toFixed(1))
        : 0;

    const percentFlagged =
      totalQuestionsCount > 0
        ? Number(((totalFlaggedQuestions / totalQuestionsCount) * 100).toFixed(1))
        : 0;

    // Sort biggest disagreements by absolute delta descending
    allDisagreements.sort((a, b) => b.absDiff - a.absDiff);

    return {
      gradedScriptsCount: gradedScripts.length,
      totalQuestionsCount,
      avgDiffPerQuestion,
      percentWithinOneMark,
      percentFlagged,
      biggestDisagreements: allDisagreements.slice(0, 10), // Top 10 disagreements
    };
  }, [testScripts]);

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 flex flex-col gap-6">
      {/* ──────── HEADER CONTROLS & SCHEME SELECTOR ──────── */}
      <div className="bg-white rounded-[24px] p-5 shadow-xs border border-slate-200/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Target className="w-5 h-5 text-[#0047AB]" />
            <h3 className="font-rounded font-bold text-lg text-slate-800">
              AI Accuracy Benchmark & Test Mode
            </h3>
            <span className="text-[10px] font-rounded font-bold px-2 py-0.5 rounded-full bg-cyan-100 text-[#0047AB] border border-cyan-200">
              Verification Engine
            </span>
          </div>
          <p className="text-xs font-rounded text-slate-500">
            Compare AI automated scores against human-awarded gold standards to evaluate production readiness.
          </p>
        </div>

        {/* Scheme Selector & Run Benchmark Action */}
        <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
          <select
            value={selectedSchemeId}
            onChange={(e) => setSelectedSchemeId(e.target.value)}
            disabled={isRunningBenchmark}
            className="text-xs font-rounded font-semibold bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 outline-none focus:border-[#4DD9E8]"
          >
            {schemes.map((s) => (
              <option key={s.id} value={s.id}>
                {s.subject} ({s.questions.length} questions, {s.totalMarks} marks)
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={handleRunFullBenchmark}
            disabled={isRunningBenchmark}
            className="flex items-center gap-2 text-xs font-rounded font-bold text-white bg-gradient-to-r from-[#4DD9E8] to-[#0047AB] hover:opacity-95 px-5 py-2.5 rounded-full shadow-md active:scale-95 transition-all cursor-pointer disabled:opacity-50"
          >
            {isRunningBenchmark ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Benchmarking...</span>
              </>
            ) : (
              <>
                <Cpu className="w-4 h-4 text-cyan-200" />
                <span>Run Accuracy Benchmark</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* ──────── LIVE BENCHMARK PROGRESS BAR ──────── */}
      {isRunningBenchmark && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex flex-col gap-2 shadow-xs">
          <div className="flex items-center justify-between text-xs font-rounded font-bold text-[#0047AB]">
            <span className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-[#0047AB]" />
              <span>
                Grading script {benchmarkProgress.current} of {benchmarkProgress.total}: {benchmarkProgress.scriptName}
              </span>
            </span>
            <span>
              {Math.round((benchmarkProgress.current / (benchmarkProgress.total || 1)) * 100)}%
            </span>
          </div>
          <div className="w-full h-2.5 bg-blue-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-[#4DD9E8] to-[#0047AB] transition-all duration-300"
              style={{
                width: `${(benchmarkProgress.current / (benchmarkProgress.total || 1)) * 100}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Benchmark Error Banner */}
      {benchmarkError && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 flex items-center justify-between text-xs font-rounded text-rose-800">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{benchmarkError}</span>
          </div>
          <button
            type="button"
            onClick={handleRunFullBenchmark}
            className="font-bold underline cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* ════════ ACCURACY REPORT & METRICS (SHOWN AFTER RUN) ════════ */}
      {reportMetrics && (
        <div className="flex flex-col gap-5">
          {/* Readout Verdict Header Banner */}
          <div
            className={`rounded-2xl p-4 sm:p-5 text-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-md ${
              reportMetrics.percentWithinOneMark >= 80
                ? 'bg-gradient-to-r from-emerald-600 to-teal-800'
                : 'bg-gradient-to-r from-amber-600 to-orange-800'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                <Award className="w-6 h-6 text-white" />
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider text-white/80 block">
                  Evaluation Verdict
                </span>
                <h4 className="font-rounded font-bold text-lg text-white">
                  {reportMetrics.percentWithinOneMark >= 80
                    ? 'AI Model Ready for Pilot Examiner Verification'
                    : 'Model Calibration Recommended Before Production Use'}
                </h4>
                <p className="text-xs text-white/90">
                  {reportMetrics.percentWithinOneMark >= 80
                    ? `Achieved ${reportMetrics.percentWithinOneMark}% human alignment within ±1 mark across ${reportMetrics.totalQuestionsCount} questions.`
                    : `Current human alignment is ${reportMetrics.percentWithinOneMark}%. Target is ≥ 80% tolerance.`}
                </p>
              </div>
            </div>

            <div className="bg-white/15 backdrop-blur-xs px-4 py-2 rounded-xl text-center self-end sm:self-center">
              <span className="text-[10px] text-white/80 uppercase font-semibold block">
                Evaluated
              </span>
              <span className="font-rounded font-bold text-xl text-white">
                {reportMetrics.gradedScriptsCount} Scripts
              </span>
            </div>
          </div>

          {/* 4 Summary KPI Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* 1. Average Difference in Marks */}
            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs flex flex-col justify-between">
              <div className="flex items-center justify-between text-slate-400 mb-1">
                <span className="text-xs font-rounded font-bold uppercase tracking-wider text-slate-500">
                  Average Difference
                </span>
                <TrendingUp className="w-4 h-4 text-[#0047AB]" />
              </div>
              <div className="font-rounded font-bold text-2xl text-slate-900 my-1">
                ±{reportMetrics.avgDiffPerQuestion}{' '}
                <span className="text-xs font-normal text-slate-400">marks/Q</span>
              </div>
              <p className="text-[11px] font-rounded text-slate-400">
                Mean absolute deviation between AI and human examiner marks.
              </p>
            </div>

            {/* 2. Percentage of Questions within 1 mark of human */}
            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs flex flex-col justify-between">
              <div className="flex items-center justify-between text-slate-400 mb-1">
                <span className="text-xs font-rounded font-bold uppercase tracking-wider text-slate-500">
                  Within ±1 Mark
                </span>
                <Percent className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="font-rounded font-bold text-2xl text-emerald-700 my-1">
                {reportMetrics.percentWithinOneMark}%
              </div>
              <p className="text-[11px] font-rounded text-slate-400">
                Primary tolerance benchmark: questions within 1 mark of human.
              </p>
            </div>

            {/* 3. Percentage of Flagged Questions */}
            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs flex flex-col justify-between">
              <div className="flex items-center justify-between text-slate-400 mb-1">
                <span className="text-xs font-rounded font-bold uppercase tracking-wider text-slate-500">
                  Flagged by AI
                </span>
                <AlertTriangle className="w-4 h-4 text-amber-500" />
              </div>
              <div className="font-rounded font-bold text-2xl text-amber-800 my-1">
                {reportMetrics.percentFlagged}%
              </div>
              <p className="text-[11px] font-rounded text-slate-400">
                Questions flagged for low confidence, illegibility, or unusual steps.
              </p>
            </div>

            {/* 4. Past Corrections Injected */}
            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs flex flex-col justify-between">
              <div className="flex items-center justify-between text-slate-400 mb-1">
                <span className="text-xs font-rounded font-bold uppercase tracking-wider text-slate-500">
                  Learning Corrections
                </span>
                <Cpu className="w-4 h-4 text-[#0047AB]" />
              </div>
              <div className="font-rounded font-bold text-2xl text-[#0047AB] my-1">
                {correctionLogs.length}{' '}
                <span className="text-xs font-normal text-slate-400">active examples</span>
              </div>
              <p className="text-[11px] font-rounded text-slate-400">
                Past examiner corrections supplied in prompt for few-shot learning.
              </p>
            </div>
          </div>

          {/* ──────── PER-PAPER AI VS HUMAN TOTAL COMPARISON TABLE ──────── */}
          <div className="bg-white rounded-[24px] p-5 shadow-xs border border-slate-200/80">
            <h4 className="font-rounded font-bold text-base text-slate-800 mb-1">
              Per-Paper AI vs Human Marks Comparison
            </h4>
            <p className="text-xs font-rounded text-slate-400 mb-4">
              Overview of candidate scripts evaluated against the {activeScheme.subject} rubric.
            </p>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-rounded font-bold uppercase tracking-wider text-slate-400">
                    <th className="py-2.5 px-3">Candidate Script</th>
                    <th className="py-2.5 px-3 text-center">Human Total</th>
                    <th className="py-2.5 px-3 text-center">AI Total</th>
                    <th className="py-2.5 px-3 text-center">Difference (Δ)</th>
                    <th className="py-2.5 px-3 text-center">Per-Question Breakdown</th>
                    <th className="py-2.5 px-3 text-center">Flags</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs font-rounded">
                  {testScripts.map((script) => {
                    const humanTotal = Object.values(script.humanMarks).reduce(
                      (sum, m) => sum + (Number(m) || 0),
                      0
                    );
                    const aiTotal = script.aiGrading?.totalAIMarks ?? null;
                    const diff = aiTotal !== null ? aiTotal - humanTotal : null;

                    return (
                      <tr key={script.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3 px-3">
                          <div className="font-bold text-slate-800">{script.studentName}</div>
                          <div className="font-mono text-[10px] text-slate-400">
                            {script.studentRoll}
                          </div>
                        </td>

                        <td className="py-3 px-3 text-center font-bold text-slate-800">
                          {humanTotal} / {activeScheme.totalMarks}
                        </td>

                        <td className="py-3 px-3 text-center">
                          {aiTotal !== null ? (
                            <span className="font-bold text-[#0047AB]">
                              {aiTotal} / {activeScheme.totalMarks}
                            </span>
                          ) : (
                            <span className="text-slate-400 italic">Not graded</span>
                          )}
                        </td>

                        <td className="py-3 px-3 text-center">
                          {diff !== null ? (
                            <span
                              className={`font-bold px-2 py-0.5 rounded-full inline-block text-[11px] ${
                                Math.abs(diff) <= 1
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : Math.abs(diff) <= 3
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-rose-100 text-rose-800'
                              }`}
                            >
                              {diff > 0 ? `+${diff}` : diff}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>

                        {/* Per-Question breakdown chips */}
                        <td className="py-3 px-3">
                          <div className="flex flex-wrap items-center justify-center gap-1">
                            {activeScheme.questions.map((q) => {
                              const qNum = q.questionNumber;
                              const qr = script.aiGrading?.questionResults?.[qNum];
                              const hMark = script.humanMarks[qNum] ?? 0;
                              const aiMark = qr ? qr.aiMark : null;

                              return (
                                <span
                                  key={qNum}
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono border ${
                                    aiMark === null
                                      ? 'bg-slate-100 text-slate-500 border-slate-200'
                                      : qr?.withinOneMark
                                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                      : 'bg-rose-50 text-rose-800 border-rose-200 font-bold'
                                  }`}
                                  title={`Q${qNum}: Human ${hMark} vs AI ${aiMark ?? '?'}`}
                                >
                                  Q{qNum}:{aiMark ?? '?'}/{hMark}
                                </span>
                              );
                            })}
                          </div>
                        </td>

                        <td className="py-3 px-3 text-center">
                          {script.aiGrading?.flaggedCount ? (
                            <span className="inline-flex items-center gap-1 font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full">
                              <AlertTriangle className="w-3 h-3 text-amber-600" />
                              <span>{script.aiGrading.flaggedCount}</span>
                            </span>
                          ) : (
                            <span className="text-slate-400">0</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* ──────── LIST OF THE BIGGEST DISAGREEMENTS ──────── */}
          <div className="bg-white rounded-[24px] p-5 shadow-xs border border-slate-200/80">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h4 className="font-rounded font-bold text-base text-slate-800">
                  Biggest Disagreements Leaderboard
                </h4>
                <p className="text-xs font-rounded text-slate-400">
                  Questions ranked by highest discrepancy between Human mark and AI mark (|AI - Human|).
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-2.5">
              {reportMetrics.biggestDisagreements.length === 0 ? (
                <div className="text-center py-6 text-slate-400 text-xs font-rounded">
                  No disagreements found! All questions matched human marks exactly.
                </div>
              ) : (
                reportMetrics.biggestDisagreements.map((item, idx) => (
                  <div
                    key={idx}
                    className={`p-3.5 rounded-2xl border transition-all ${
                      item.absDiff >= 2
                        ? 'bg-rose-50/70 border-rose-200'
                        : item.absDiff === 1
                        ? 'bg-amber-50/60 border-amber-200'
                        : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-lg bg-white border border-slate-200 text-slate-800">
                          #{idx + 1}
                        </span>
                        <span className="font-rounded font-bold text-xs text-[#0047AB]">
                          {item.studentName} ({item.studentRoll})
                        </span>
                        <span className="text-xs font-bold text-slate-700 bg-white/80 px-2 py-0.5 rounded border border-slate-200">
                          Q{item.questionNumber}
                        </span>
                        {item.isFlagged && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-800 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-full">
                            <AlertTriangle className="w-2.5 h-2.5 text-amber-600" />
                            <span>Flagged: {item.flagReason || 'Review Needed'}</span>
                          </span>
                        )}
                      </div>

                      {/* Marks Delta Pill */}
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-rounded font-semibold text-slate-500">
                          Human: <strong>{item.humanMark}</strong>
                        </span>
                        <span className="text-xs font-rounded font-semibold text-[#0047AB]">
                          AI: <strong>{item.aiMark}</strong>
                        </span>
                        <span
                          className={`text-xs font-rounded font-bold px-2.5 py-0.5 rounded-full ${
                            item.absDiff >= 2
                              ? 'bg-rose-600 text-white'
                              : item.absDiff === 1
                              ? 'bg-amber-600 text-white'
                              : 'bg-emerald-600 text-white'
                          }`}
                        >
                          Δ {item.diff > 0 ? `+${item.diff}` : item.diff} marks
                        </span>
                      </div>
                    </div>

                    <div className="text-xs font-rounded text-slate-700 font-semibold mb-1 line-clamp-1">
                      {item.questionText}
                    </div>

                    <div className="text-[11px] font-rounded text-slate-600 bg-white/90 p-2 rounded-xl border border-slate-200/80">
                      <strong className="text-slate-500">AI Evaluator Reason: </strong>
                      <span>"{item.reason}"</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ──────── TEST SCRIPTS BATCH MANAGEMENT SECTION ──────── */}
      <div className="bg-white rounded-[24px] p-5 shadow-xs border border-slate-200/80 flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h4 className="font-rounded font-bold text-base text-slate-800">
              Benchmark Scripts Batch ({testScripts.length})
            </h4>
            <p className="text-xs font-rounded text-slate-400">
              Each script contains uploaded page images and human gold-standard marks per question.
            </p>
          </div>

          <button
            type="button"
            onClick={handleOpenAddModal}
            className="flex items-center gap-1.5 text-xs font-rounded font-bold text-[#0047AB] bg-blue-50 hover:bg-blue-100 border border-blue-200 px-3.5 py-2 rounded-full transition-all cursor-pointer shadow-2xs active:scale-95"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Upload / Add Test Script</span>
          </button>
        </div>

        {/* Scripts Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {testScripts.map((script) => {
            const humanTotal = Object.values(script.humanMarks).reduce(
              (sum, m) => sum + (Number(m) || 0),
              0
            );

            return (
              <div
                key={script.id}
                className="p-4 rounded-2xl border border-slate-200 bg-slate-50/60 flex flex-col justify-between gap-3 shadow-2xs"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div>
                      <h5 className="font-rounded font-bold text-sm text-slate-900">
                        {script.studentName}
                      </h5>
                      <span className="font-mono text-[11px] text-slate-500">
                        {script.studentRoll}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDeleteScript(script.id)}
                      className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                      title="Remove from batch"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="flex items-center gap-2 text-xs font-rounded text-slate-500 mb-2">
                    <FileText className="w-3.5 h-3.5 text-slate-400" />
                    <span>{script.pageImages.length} Digitized Page(s)</span>
                  </div>

                  {/* Human Marks Row */}
                  <div className="bg-white p-2 rounded-xl border border-slate-200 text-xs font-rounded">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                      Human Awarded Marks
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {activeScheme.questions.map((q, qIdx) => (
                        <span
                          key={`${q.id || 'q'}-${q.questionNumber}-${q.partLabel || ''}-${qIdx}`}
                          className="px-2 py-0.5 rounded bg-slate-100 font-mono text-[11px] font-semibold text-slate-700"
                        >
                          Q{q.questionNumber}: {script.humanMarks[q.questionNumber] ?? 0}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs font-rounded pt-2 border-t border-slate-200/80">
                  <span className="font-semibold text-slate-600">
                    Human Total: <strong>{humanTotal} / {activeScheme.totalMarks}</strong>
                  </span>
                  {script.aiGrading ? (
                    <span className="text-emerald-700 font-bold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>AI: {script.aiGrading.totalAIMarks}</span>
                    </span>
                  ) : (
                    <span className="text-slate-400 italic">Pending run</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ──────── MODAL: ADD / UPLOAD TEST SCRIPT WITH HUMAN MARKS ──────── */}
      <AnimatePresence>
        {isAddModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-60 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-[28px] max-w-xl w-full p-6 shadow-2xl border border-slate-200 flex flex-col max-h-[90vh] overflow-hidden"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <Plus className="w-5 h-5 text-[#0047AB]" />
                  <h4 className="font-rounded font-bold text-base text-slate-800">
                    Add Test Script with Human-Awarded Marks
                  </h4>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto py-4 flex flex-col gap-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-rounded font-bold text-slate-700 block mb-1">
                      Candidate Name
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Sara Chen"
                      value={newStudentName}
                      onChange={(e) => setNewStudentName(e.target.value)}
                      className="w-full text-xs font-rounded bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none focus:border-[#4DD9E8] focus:bg-white"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-rounded font-bold text-slate-700 block mb-1">
                      Candidate Roll Number
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. SEC-2026-023"
                      value={newStudentRoll}
                      onChange={(e) => setNewStudentRoll(e.target.value)}
                      className="w-full text-xs font-rounded bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none focus:border-[#4DD9E8] focus:bg-white font-mono"
                    />
                  </div>
                </div>

                {/* Human Marks per Question */}
                <div>
                  <label className="text-xs font-rounded font-bold text-slate-700 block mb-1">
                    Enter Human-Awarded Marks per Question ({activeScheme.subject})
                  </label>
                  <p className="text-[11px] font-rounded text-slate-400 mb-2">
                    Enter what the human teacher or examiner awarded for each question.
                  </p>

                  <div className="flex flex-col gap-2 bg-slate-50 p-3 rounded-2xl border border-slate-200 max-h-56 overflow-y-auto">
                    {activeScheme.questions.map((q, qIdx) => (
                      <div
                        key={`${q.id || 'q'}-${q.questionNumber}-${q.partLabel || ''}-${qIdx}`}
                        className="flex items-center justify-between gap-3 bg-white p-2.5 rounded-xl border border-slate-200"
                      >
                        <div className="flex-1">
                          <span className="font-rounded font-bold text-xs text-[#0047AB] block">
                            Q{q.questionNumber} (Max {q.maxMarks})
                          </span>
                          <span className="text-[11px] font-rounded text-slate-600 line-clamp-1">
                            {q.questionText}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <input
                            type="number"
                            min={0}
                            max={q.maxMarks}
                            value={newHumanMarks[q.questionNumber] ?? 0}
                            onChange={(e) =>
                              setNewHumanMarks((prev) => ({
                                ...prev,
                                [q.questionNumber]: Math.min(
                                  q.maxMarks,
                                  Math.max(0, Number(e.target.value) || 0)
                                ),
                              }))
                            }
                            className="w-16 text-center font-rounded font-bold text-xs py-1 px-1.5 rounded-lg border border-slate-300 outline-none"
                          />
                          <span className="text-xs text-slate-400 font-rounded">/ {q.maxMarks}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-rounded font-bold text-slate-700 block mb-1">
                    Examiner Human Notes / Reasoning (Optional)
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Enter any context about student handwriting, grace marks, or edge cases..."
                    value={newHumanNotes}
                    onChange={(e) => setNewHumanNotes(e.target.value)}
                    className="w-full text-xs font-rounded bg-slate-50 border border-slate-200 rounded-xl p-2.5 outline-none focus:border-[#4DD9E8] focus:bg-white"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-full bg-slate-100 hover:bg-slate-200 font-rounded font-semibold text-xs text-slate-700 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveNewScript}
                  className="px-5 py-2 rounded-full bg-gradient-to-r from-[#4DD9E8] to-[#0047AB] text-white font-rounded font-bold text-xs shadow-md hover:opacity-95 cursor-pointer active:scale-95"
                >
                  Add to Benchmark Batch
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
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-rounded font-bold text-base sm:text-lg text-slate-900 leading-tight">
                    {errorAlert.title}
                  </h3>
                  <p className="text-xs font-rounded text-slate-500">
                    System Alert
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
    </div>
  );
};
