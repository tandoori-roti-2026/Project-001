import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  BookOpen,
  Plus,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  ArrowLeft,
  Search,
  Save,
  X,
  FileText,
  Bot,
  HelpCircle,
  Copy,
  Layers,
  ChevronDown,
  ChevronUp,
  Target,
  FileUp,
  Check,
  Split,
  GitBranch,
  Percent,
  ListOrdered,
  ListCheck,
  Loader2,
} from 'lucide-react';
import {
  MarkingScheme,
  MarkingQuestionScheme,
  MarkingKeyPoint,
  MarkingRubricLevel,
  MarkingSubPart,
  calculateQuestionKeyPointsTotal,
  calculateQuestionRubricHighestLevel,
  isQuestionMarksValid,
  ensureDescriptiveSchemeQuestions,
} from '../data/mockMarkingSchemes';
import { CorrectionLog, ExamPaper } from '../data/mockPapers';
import { AccuracyTestTool } from './AccuracyTestTool';

interface MarkingSchemeManagerProps {
  isOpen: boolean;
  onClose: () => void;
  schemes: MarkingScheme[];
  onSaveSchemes: (updatedSchemes: MarkingScheme[]) => void;
  initialSelectedSchemeId?: string | null;
  correctionLogs?: CorrectionLog[];
  papers?: ExamPaper[];
  onDeleteScheme?: (schemeId: string) => void;
}

export const MarkingSchemeManager: React.FC<MarkingSchemeManagerProps> = ({
  isOpen,
  onClose,
  schemes,
  onSaveSchemes,
  initialSelectedSchemeId,
  correctionLogs = [],
  papers = [],
  onDeleteScheme,
}) => {
  const [localSchemes, setLocalSchemes] = useState<MarkingScheme[]>(schemes);
  const [selectedSchemeId, setSelectedSchemeId] = useState<string | null>(
    initialSelectedSchemeId || null
  );
  const [activeTab, setActiveTab] = useState<'schemes' | 'accuracy'>('schemes');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeQuestionIndex, setActiveQuestionIndex] = useState<number>(0);
  const [saveToast, setSaveToast] = useState<string | null>(null);

  // Deletion confirmation modal state
  const [deleteConfirmModal, setDeleteConfirmModal] = useState<{
    isOpen: boolean;
    schemeId: string;
    schemeTitle: string;
    referencedCount: number;
  } | null>(null);

  const [errorAlert, setErrorAlert] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
  } | null>(null);

  // Import from Text Modal State
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importRawText, setImportRawText] = useState('');
  const [importSubject, setImportSubject] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importedPreviewScheme, setImportedPreviewScheme] = useState<MarkingScheme | null>(null);

  // Sync if prop schemes change
  React.useEffect(() => {
    setLocalSchemes(schemes);
  }, [schemes]);

  if (!isOpen) return null;

  const currentScheme = localSchemes.find((s) => s.id === selectedSchemeId) || null;

  const showToast = (msg: string) => {
    setSaveToast(msg);
    setTimeout(() => {
      setSaveToast((cur) => (cur === msg ? null : cur));
    }, 3000);
  };

  // Filter schemes in list
  const filteredSchemes = localSchemes.filter((s) => {
    const q = searchQuery.toLowerCase();
    return (
      s.subject.toLowerCase().includes(q) ||
      s.title.toLowerCase().includes(q) ||
      s.examSession.toLowerCase().includes(q)
    );
  });

  // Handle creating a brand new scheme
  const handleCreateNewScheme = () => {
    const newId = `scheme-${Date.now()}`;
    const newScheme: MarkingScheme = {
      id: newId,
      subject: 'New Subject',
      examSession: 'Annual Senior Examinations 2026',
      title: 'Official Evaluation Marking Rubric',
      description: 'Standardized grading blueprint with FBISE rubric levels and sub-parts.',
      totalMarks: 20,
      updatedAt: new Date().toISOString(),
      questions: [
        {
          id: `q-${Date.now()}-1`,
          questionNumber: 1,
          questionText: 'State the core physical principle and define all associated quantities.',
          maxMarks: 10,
          modelAnswer: 'Clear concise standard answer describing theoretical basis and key formulation.',
          mode: 'rubric_levels',
          rubricLevels: [
            {
              id: `q1-l1`,
              levelNumber: 1,
              title: 'Level 1 (Full Marks)',
              description: 'Complete and accurate definition with standard formula and SI units.',
              marks: 10,
            },
            {
              id: `q1-l2`,
              levelNumber: 2,
              title: 'Level 2',
              description: 'Accurate definition with formula; units omitted.',
              marks: 7.5,
            },
            {
              id: `q1-l3`,
              levelNumber: 3,
              title: 'Level 3',
              description: 'Formula stated correctly without verbal definition.',
              marks: 5,
            },
            {
              id: `q1-l4`,
              levelNumber: 4,
              title: 'Level 4',
              description: 'Partial or incomplete equation with minor conceptual error.',
              marks: 2.5,
            },
            {
              id: `q1-l5`,
              levelNumber: 5,
              title: 'Level 5 (Zero)',
              description: 'Incorrect answer or irrelevant scientific statement.',
              marks: 0,
            },
          ],
        },
      ],
    };

    const updated = [newScheme, ...localSchemes];
    setLocalSchemes(updated);
    onSaveSchemes(updated);
    setSelectedSchemeId(newId);
    setActiveQuestionIndex(0);
    showToast(`Created new marking scheme for "${newScheme.subject}"`);
  };

  // Duplicate an existing scheme
  const handleDuplicateScheme = (schemeToCopy: MarkingScheme) => {
    const copyId = `scheme-${Date.now()}`;
    const cloned: MarkingScheme = {
      ...JSON.parse(JSON.stringify(schemeToCopy)),
      id: copyId,
      title: `${schemeToCopy.title} (Copy)`,
      updatedAt: new Date().toISOString(),
    };
    const updated = [cloned, ...localSchemes];
    setLocalSchemes(updated);
    onSaveSchemes(updated);
    setSelectedSchemeId(copyId);
    showToast(`Duplicated scheme as "${cloned.title}"`);
  };

  // Request scheme deletion (opens confirmation dialog)
  const handleRequestDeleteScheme = (schemeId: string, title: string) => {
    const target = localSchemes.find((s) => s.id === schemeId);
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
      schemeId,
      schemeTitle: displayTitle,
      referencedCount,
    });
  };

  // Confirmed scheme deletion
  const handleConfirmDeleteScheme = () => {
    if (!deleteConfirmModal) return;
    const { schemeId, schemeTitle } = deleteConfirmModal;
    const target = localSchemes.find((s) => s.id === schemeId);
    const updated = localSchemes.filter((s) => s.id !== schemeId);
    setLocalSchemes(updated);
    onSaveSchemes(updated);
    if (onDeleteScheme) {
      onDeleteScheme(schemeId);
    }
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
    if (selectedSchemeId === schemeId) {
      setSelectedSchemeId(updated[0]?.id || null);
    }
    setDeleteConfirmModal(null);
    showToast(`Marking scheme "${schemeTitle}" deleted.`);
  };

  // Update current scheme fields
  const handleUpdateCurrentScheme = (updater: (prev: MarkingScheme) => MarkingScheme) => {
    if (!currentScheme) return;
    const updatedScheme = updater(currentScheme);
    // Recalculate total marks
    const totalMarks = updatedScheme.questions.reduce((acc, q) => acc + (Number(q.maxMarks) || 0), 0);
    updatedScheme.totalMarks = Number(totalMarks.toFixed(2));
    updatedScheme.updatedAt = new Date().toISOString();

    const updatedList = localSchemes.map((s) => (s.id === updatedScheme.id ? updatedScheme : s));
    setLocalSchemes(updatedList);
    onSaveSchemes(updatedList);
  };

  // Add Question
  const handleAddQuestion = () => {
    if (!currentScheme) return;
    handleUpdateCurrentScheme((prev) => {
      const nextNum = prev.questions.length + 1;
      const newQuestion: MarkingQuestionScheme = {
        id: `q-${Date.now()}-${nextNum}`,
        questionNumber: nextNum,
        questionText: `Question ${nextNum}: Describe the concept and application.`,
        maxMarks: 10,
        modelAnswer: 'Standard model answer for evaluation.',
        mode: 'rubric_levels',
        rubricLevels: [
          {
            id: `l1-${Date.now()}`,
            levelNumber: 1,
            title: 'Level 1 (Full Marks)',
            description: 'Complete and accurate answer covering all theoretical requirements.',
            marks: 10,
          },
          {
            id: `l2-${Date.now()}`,
            levelNumber: 2,
            title: 'Level 2',
            description: 'Partially correct answer with minor conceptual omission.',
            marks: 5,
          },
          {
            id: `l3-${Date.now()}`,
            levelNumber: 3,
            title: 'Level 3 (Zero)',
            description: 'Incorrect answer or no relevant content.',
            marks: 0,
          },
        ],
      };
      return {
        ...prev,
        questions: [...prev.questions, newQuestion],
      };
    });
    setActiveQuestionIndex(currentScheme.questions.length);
    showToast('New question added to scheme.');
  };

  const handleRemoveQuestion = (questionId: string) => {
    if (!currentScheme) return;
    if (currentScheme.questions.length <= 1) {
      setErrorAlert({
        isOpen: true,
        title: 'Cannot Remove Question',
        message: 'A marking scheme must contain at least one question.',
      });
      return;
    }
    handleUpdateCurrentScheme((prev) => {
      const filtered = prev.questions.filter((q) => q.id !== questionId);
      const reindexed = filtered.map((q, idx) => ({
        ...q,
        questionNumber: idx + 1,
      }));
      return {
        ...prev,
        questions: reindexed,
      };
    });
    setActiveQuestionIndex(0);
    showToast('Question removed.');
  };

  // Requirement 6: Import FBISE Rubric from Raw Text via Gemini
  const handleRunImportFromText = async () => {
    if (!importRawText.trim()) {
      setErrorAlert({
        isOpen: true,
        title: 'Empty Input',
        message: 'Please paste some rubric text first.',
      });
      return;
    }
    setIsImporting(true);
    setImportError(null);

    try {
      const response = await fetch('/api/rubric/import-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: importRawText,
          subject: importSubject.trim() || undefined,
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

      const descriptiveScheme = ensureDescriptiveSchemeQuestions(data.scheme);
      setImportedPreviewScheme(descriptiveScheme);
    } catch (err: any) {
      setImportError(err.message || 'Error parsing rubric text.');
    } finally {
      setIsImporting(false);
    }
  };

  const handleAcceptImportedScheme = () => {
    if (!importedPreviewScheme) return;
    const finalScheme = ensureDescriptiveSchemeQuestions(importedPreviewScheme);
    const updated = [finalScheme, ...localSchemes];
    setLocalSchemes(updated);
    onSaveSchemes(updated);
    setSelectedSchemeId(finalScheme.id);
    setActiveQuestionIndex(0);
    setIsImportModalOpen(false);
    setImportedPreviewScheme(null);
    setImportRawText('');
    showToast(`Imported scheme "${finalScheme.title}" successfully!`);
  };

  // Sample FBISE Rubric text generator for 1-click test
  const handleInsertSampleFBISEText = () => {
    setImportSubject('Physics (Advanced)');
    setImportRawText(`FEDERAL BOARD OF INTERMEDIATE AND SECONDARY EDUCATION (FBISE)
ANNUAL SENIOR EXAMINATIONS 2026
MARKING SCHEME — PHYSICS (THEORY)

SECTION B (Short Questions)

Q.1 (a) State Gauss's Law in electrostatics. (2 Marks)
Rubric:
- Level 1 (2.0 Marks): Correct verbal statement AND mathematical formula ∮E·dA = Q/ε₀ with ε₀ defined.
- Level 2 (1.0 Mark): Correct formula only or statement without formula.
- Level 3 (0.0 Marks): Wrong statement or irrelevant text.

(b) Derive Gauss's Law in differential form (∇·E = ρ/ε₀) using divergence theorem. (4 Marks)
Rubric:
- Level 1 (4.0 Marks): Applies divergence theorem to convert surface integral to volume integral ∫(∇·E)dV, substitutes Q = ∫ρ dV, and deduces ∇·E = ρ/ε₀.
- Level 2 (2.5 Marks): Divergence theorem applied, minor step missing in equating integrands.
- Level 3 (1.0 Mark): Formula stated without proof.
- Level 4 (0.0 Marks): Incorrect derivation.

Q.2 Calculate de Broglie wavelength of an electron accelerated through 150V. (4 Marks)
Rubric:
- Level 1 (4.0 Marks): Correct formula λ = h/√(2mqV), substitutes values accurately, calculates 1.002 Å (or 0.10 nm) with unit.
- Level 2 (2.5 Marks): Correct formula and substitution; minor arithmetic error in final square root.
- Level 3 (1.0 Mark): Formula λ = 1.227/√V stated without complete calculation.
- Level 4 (0.0 Marks): Incorrect formula.

SECTION C (Long Questions with Choice)

Q.3 (a) Explain the working principle of a step-up transformer with labeled circuit diagram. (5 Marks)
Rubric:
- Level 1 (5.0 Marks): Mutual induction principle, neat labeled circuit diagram showing laminated core and primary/secondary coils.
- Level 2 (3.0 Marks): Principle and diagram present with minor labeling omitted.
- Level 3 (1.0 Mark): Diagram only or brief text without diagram.
- Level 4 (0.0 Marks): Incorrect answer.

OR

(b) Describe AC Generator working principle and derive peak induced emf equation e₀ = NBAω. (5 Marks)
Rubric:
- Level 1 (5.0 Marks): Electromagnetic induction principle, labeled coil rotation diagram, derivation of e = NBAω sin(ωt) and peak emf e₀ = NBAω.
- Level 2 (3.0 Marks): Correct principle and derivation, diagram missing slip rings or brushes.
- Level 3 (1.0 Mark): Formula stated only.
- Level 4 (0.0 Marks): Irrelevant.`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 md:p-6 bg-slate-900/60 backdrop-blur-xs select-none">
      {/* Toast Notification */}
      <AnimatePresence>
        {saveToast && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-6 left-1/2 -translate-x-1/2 z-60 bg-emerald-600 text-white text-xs sm:text-sm font-rounded font-semibold px-4 py-2.5 rounded-full shadow-xl flex items-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-200" />
            <span>{saveToast}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 15 }}
        className="w-full max-w-[1440px] h-[93vh] bg-white rounded-[28px] sm:rounded-[36px] shadow-2xl border border-slate-200/80 flex flex-col overflow-hidden"
      >
        {/* ════════ TOP BANNER ════════ */}
        <header
          className="relative px-6 py-4 sm:py-5 flex items-center justify-between text-white shrink-0 shadow-md"
          style={{
            background: 'linear-gradient(90deg, #4DD9E8 0%, #0047AB 100%)',
          }}
        >
          {/* Subtle Top Gloss Accent */}
          <div className="absolute inset-x-0 top-0 h-1/3 bg-white/10 pointer-events-none" />

          {/* Left: Back / Title */}
          <div className="flex items-center gap-3 z-10">
            {selectedSchemeId ? (
              <button
                onClick={() => setSelectedSchemeId(null)}
                className="flex items-center gap-1.5 text-xs sm:text-sm font-rounded font-semibold bg-white/15 hover:bg-white/30 backdrop-blur-xs px-3 sm:px-4 py-1.5 rounded-full transition-all cursor-pointer shadow-xs active:scale-95"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>All Schemes</span>
              </button>
            ) : null}

            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                <BookOpen className="w-4 h-4 text-white" />
              </div>
              <div>
                <h2 className="font-rounded font-bold text-base sm:text-lg text-white leading-tight">
                  {selectedSchemeId
                    ? currentScheme?.title || 'Edit Marking Scheme'
                    : 'Marking Schemes & Rubric Manager (FBISE Compatible)'}
                </h2>
                <p className="text-[11px] sm:text-xs text-white/80 font-rounded">
                  {selectedSchemeId
                    ? `${currentScheme?.subject} • ${currentScheme?.examSession}`
                    : 'Configure rubric levels (0.5 steps), sub-parts (i, ii), OR choices, and import from FBISE PDF.'}
                </p>
              </div>
            </div>
          </div>

          {/* Right: Actions, Tab Switcher & Close */}
          <div className="flex items-center gap-2.5 z-10">
            {/* View Mode Switcher: Rubrics vs Test Accuracy Tool */}
            <div className="flex items-center gap-1 bg-white/20 p-1 rounded-full border border-white/25">
              <button
                type="button"
                onClick={() => setActiveTab('schemes')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-rounded font-bold transition-all cursor-pointer ${
                  activeTab === 'schemes'
                    ? 'bg-white text-[#0047AB] shadow-xs'
                    : 'text-white hover:bg-white/10'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>Rubrics</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('accuracy')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-rounded font-bold transition-all cursor-pointer ${
                  activeTab === 'accuracy'
                    ? 'bg-white text-[#0047AB] shadow-xs'
                    : 'text-white hover:bg-white/10'
                }`}
              >
                <Target className="w-3.5 h-3.5 text-cyan-300" />
                <span>Test Accuracy</span>
              </button>
            </div>

            {/* Requirement 6: Import from text button */}
            <button
              onClick={() => setIsImportModalOpen(true)}
              className="flex items-center gap-1.5 text-xs sm:text-sm font-rounded font-bold text-[#0047AB] bg-cyan-100 hover:bg-cyan-200 px-3.5 sm:px-4 py-1.5 rounded-full transition-all cursor-pointer shadow-md active:scale-95 border border-cyan-200"
              title="Import rubric text copied from FBISE PDF"
            >
              <FileUp className="w-4 h-4 text-[#0047AB]" />
              <span className="hidden sm:inline">Import from text</span>
              <span className="sm:hidden">Import</span>
            </button>

            {activeTab === 'schemes' && !selectedSchemeId && (
              <button
                onClick={handleCreateNewScheme}
                className="flex items-center gap-1.5 text-xs sm:text-sm font-rounded font-bold text-[#0047AB] bg-white hover:bg-white/90 px-3.5 sm:px-4 py-1.5 rounded-full transition-all cursor-pointer shadow-md active:scale-95"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">Create New Scheme</span>
                <span className="sm:hidden">New</span>
              </button>
            )}

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/15 hover:bg-white/30 flex items-center justify-center text-white transition-all cursor-pointer active:scale-90"
              title="Close Marking Schemes"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* ════════ BODY CONTENT ════════ */}
        <div className="flex-1 overflow-hidden flex flex-col bg-slate-50/70">
          {activeTab === 'accuracy' ? (
            <AccuracyTestTool
              schemes={localSchemes}
              initialSelectedSchemeId={selectedSchemeId}
              correctionLogs={correctionLogs}
            />
          ) : !selectedSchemeId ? (
            /* ──────────────── VIEW A: LIST OF SCHEMES ──────────────── */
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 flex flex-col gap-6">
              {/* Search & Overview Bar */}
              <div className="bg-white rounded-[22px] p-5 shadow-xs border border-slate-200/80 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="relative w-full sm:w-80">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by subject or exam..."
                    className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-full text-xs sm:text-sm font-rounded text-slate-800 placeholder-slate-400 focus:outline-hidden focus:border-[#0047AB] focus:bg-white transition-colors"
                  />
                </div>

                <div className="flex items-center gap-2.5 text-xs font-rounded text-slate-500 w-full sm:w-auto justify-between sm:justify-end">
                  <span className="bg-blue-50 text-[#0047AB] font-bold px-3 py-1 rounded-full border border-blue-200">
                    {filteredSchemes.length} Scheme{filteredSchemes.length !== 1 ? 's' : ''} Configured
                  </span>
                  <button
                    onClick={() => setIsImportModalOpen(true)}
                    className="flex items-center gap-1 text-xs font-rounded font-bold text-[#0047AB] bg-cyan-50 hover:bg-cyan-100 border border-cyan-200 px-3 py-1 rounded-full cursor-pointer"
                  >
                    <FileUp className="w-3.5 h-3.5" />
                    <span>Import PDF Text</span>
                  </button>
                </div>
              </div>

              {/* Schemes Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                {filteredSchemes.map((scheme) => {
                  const invalidCount = scheme.questions.filter(
                    (q) => !isQuestionMarksValid(q).valid
                  ).length;
                  const isAllBalanced = invalidCount === 0;

                  return (
                    <div
                      key={scheme.id}
                      className="bg-white rounded-[24px] p-5 shadow-xs hover:shadow-md border border-slate-200/90 transition-all flex flex-col justify-between group"
                    >
                      <div>
                        {/* Top tag & balance badge */}
                        <div className="flex items-center justify-between gap-2 mb-3">
                          <span className="text-[11px] font-rounded font-bold uppercase tracking-wider text-[#0047AB] bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-100">
                            {scheme.subject}
                          </span>
                          {isAllBalanced ? (
                            <span className="flex items-center gap-1 text-[10px] font-rounded font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              <span>Levels Validated</span>
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-[10px] font-rounded font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                              <AlertTriangle className="w-3 h-3 text-amber-600" />
                              <span>{invalidCount} mismatch</span>
                            </span>
                          )}
                        </div>

                        {/* Title & Description */}
                        <h3 className="font-rounded font-bold text-base text-slate-800 leading-snug group-hover:text-[#0047AB] transition-colors">
                          {scheme.title}
                        </h3>
                        <p className="text-xs font-rounded text-slate-400 mt-1">
                          {scheme.examSession}
                        </p>
                        {scheme.description && (
                          <p className="text-xs font-rounded text-slate-600 mt-2 line-clamp-2">
                            {scheme.description}
                          </p>
                        )}

                        {/* Metrics Pills */}
                        <div className="flex flex-wrap items-center gap-2 mt-4 pt-3 border-t border-slate-100 text-xs font-rounded text-slate-600">
                          <span className="bg-slate-100 px-2.5 py-1 rounded-lg font-semibold">
                            {scheme.questions.length} Questions
                          </span>
                          <span className="bg-slate-100 px-2.5 py-1 rounded-lg font-bold text-slate-800">
                            {scheme.totalMarks} Total Marks
                          </span>
                          {scheme.questions.some((q) => q.mode === 'rubric_levels') && (
                            <span className="bg-cyan-50 text-[#0047AB] border border-cyan-200 px-2 py-0.5 rounded-lg text-[10px] font-bold">
                              FBISE Rubric Levels
                            </span>
                          )}
                          {scheme.questions.some((q) => q.hasOrChoice) && (
                            <span className="bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.5 rounded-lg text-[10px] font-bold">
                              OR Choice
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Card Footer Actions */}
                      <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleDuplicateScheme(scheme)}
                            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                            title="Duplicate Scheme"
                          >
                            <Copy className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleRequestDeleteScheme(scheme.id, scheme.title)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                            title="Delete Scheme"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>

                        <button
                          onClick={() => {
                            setSelectedSchemeId(scheme.id);
                            setActiveQuestionIndex(0);
                          }}
                          className="flex items-center gap-1 text-xs font-rounded font-bold text-white bg-[#0047AB] hover:bg-[#003882] px-4 py-2 rounded-full transition-all cursor-pointer shadow-xs active:scale-95"
                        >
                          <span>Open & Edit Scheme</span>
                          <ArrowLeft className="w-3.5 h-3.5 rotate-180" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            /* ──────────────── VIEW B: SCHEME EDITOR ──────────────── */
            currentScheme && (
              <div className="flex-1 overflow-hidden flex flex-col">
                {/* Scheme Header Details Bar */}
                <div className="bg-white border-b border-slate-200 px-6 py-3 flex flex-col md:flex-row md:items-center justify-between gap-3 shrink-0 shadow-2xs">
                  <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="text-[10px] font-rounded font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                        Subject
                      </label>
                      <input
                        type="text"
                        value={currentScheme.subject}
                        onChange={(e) =>
                          handleUpdateCurrentScheme((prev) => ({
                            ...prev,
                            subject: e.target.value,
                          }))
                        }
                        className="w-full text-xs font-rounded font-bold text-slate-800 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-hidden focus:border-[#0047AB] focus:bg-white"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-rounded font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                        Exam Session
                      </label>
                      <input
                        type="text"
                        value={currentScheme.examSession}
                        onChange={(e) =>
                          handleUpdateCurrentScheme((prev) => ({
                            ...prev,
                            examSession: e.target.value,
                          }))
                        }
                        className="w-full text-xs font-rounded font-semibold text-slate-800 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-hidden focus:border-[#0047AB] focus:bg-white"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-rounded font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                        Scheme Title
                      </label>
                      <input
                        type="text"
                        value={currentScheme.title}
                        onChange={(e) =>
                          handleUpdateCurrentScheme((prev) => ({
                            ...prev,
                            title: e.target.value,
                          }))
                        }
                        className="w-full text-xs font-rounded font-semibold text-slate-800 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-hidden focus:border-[#0047AB] focus:bg-white"
                      />
                    </div>
                  </div>

                  {/* Summary & Add Question Button */}
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <div className="text-xs font-rounded font-bold text-slate-800">
                        {currentScheme.questions.length} Questions • {currentScheme.totalMarks} Marks
                      </div>
                      <div className="text-[10px] font-rounded text-slate-400">
                        Fractional 0.5 steps supported
                      </div>
                    </div>

                    <button
                      onClick={handleAddQuestion}
                      className="flex items-center gap-1.5 text-xs font-rounded font-bold text-white bg-[#0047AB] hover:bg-[#003882] px-3.5 py-2 rounded-full transition-all cursor-pointer shadow-xs active:scale-95"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Question</span>
                    </button>
                  </div>
                </div>

                {/* Main Editor Split Pane */}
                <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">
                  {/* Left: Questions Navigation List */}
                  <div className="w-full lg:w-72 border-b lg:border-b-0 lg:border-r border-slate-200 bg-slate-50/80 p-3 overflow-y-auto flex flex-row lg:flex-col gap-2 shrink-0">
                    <div className="hidden lg:flex items-center justify-between px-2 mb-1">
                      <span className="text-xs font-rounded font-bold text-slate-500 uppercase tracking-wider">
                        Questions ({currentScheme.questions.length})
                      </span>
                    </div>

                    {currentScheme.questions.map((q, idx) => {
                      const validation = isQuestionMarksValid(q);
                      const isActive = activeQuestionIndex === idx;

                      return (
                        <button
                          key={`${q.id || 'q'}-${q.questionNumber}-${q.partLabel || ''}-${idx}`}
                          onClick={() => setActiveQuestionIndex(idx)}
                          className={`w-full text-left p-3 rounded-2xl transition-all cursor-pointer flex flex-col gap-1 border ${
                            isActive
                              ? 'bg-white border-[#0047AB] shadow-sm ring-1 ring-[#0047AB]/20'
                              : 'bg-white/70 hover:bg-white border-slate-200/80'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-rounded font-bold text-xs text-slate-800">
                              Question {q.questionNumber}
                            </span>
                            <span
                              className={`text-[10px] font-rounded font-bold px-2 py-0.5 rounded-full ${
                                validation.valid
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {q.maxMarks} marks
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 text-[10px] font-rounded text-slate-500">
                            <span className="font-semibold text-[#0047AB]">
                              {q.mode === 'rubric_levels' ? 'Rubric levels' : 'Key points'}
                            </span>
                            {q.hasSubParts && (
                              <span className="bg-blue-50 text-blue-700 px-1 rounded">
                                {q.subParts?.length} sub-parts
                              </span>
                            )}
                            {q.hasOrChoice && (
                              <span className="bg-purple-50 text-purple-700 px-1 rounded font-bold">
                                OR
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] font-rounded text-slate-500 line-clamp-1">
                            {q.questionText}
                          </p>
                        </button>
                      );
                    })}
                  </div>

                  {/* Right: Active Question Detail & Rubric Levels Editor */}
                  <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-white flex flex-col gap-6">
                    {currentScheme.questions[activeQuestionIndex] ? (
                      (() => {
                        const q = currentScheme.questions[activeQuestionIndex];
                        const validation = isQuestionMarksValid(q);

                        return (
                          <div className="flex flex-col gap-6 max-w-4xl">
                            {/* Question Header & Max Marks */}
                            <div className="bg-slate-50 rounded-[24px] p-5 sm:p-6 border border-slate-200/80 flex flex-col gap-4">
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <div className="flex items-center gap-2">
                                  <span className="w-7 h-7 rounded-full bg-[#0047AB] text-white flex items-center justify-center font-rounded font-bold text-xs">
                                    Q{q.questionNumber}
                                  </span>
                                  <h3 className="font-rounded font-bold text-base text-slate-800">
                                    Question {q.questionNumber} Configuration
                                  </h3>
                                </div>

                                <div className="flex items-center gap-3">
                                  {/* Fractional Max Marks (0.5 steps) */}
                                  <div className="flex items-center gap-1.5 bg-white px-3 py-1 rounded-full border border-slate-200 shadow-2xs">
                                    <label className="text-xs font-rounded font-semibold text-slate-500">
                                      Max Marks:
                                    </label>
                                    <input
                                      type="number"
                                      step="0.5"
                                      min="0.5"
                                      max="100"
                                      value={q.maxMarks}
                                      onChange={(e) => {
                                        const newMax = Math.max(0.5, parseFloat(e.target.value) || 0.5);
                                        handleUpdateCurrentScheme((prev) => ({
                                          ...prev,
                                          questions: prev.questions.map((item) =>
                                            item.id === q.id ? { ...item, maxMarks: newMax } : item
                                          ),
                                        }));
                                      }}
                                      className="w-16 text-center font-rounded font-bold text-sm text-[#0047AB] bg-slate-50 border border-slate-200 rounded-md py-0.5 focus:outline-hidden focus:border-[#0047AB]"
                                    />
                                  </div>

                                  <button
                                    onClick={() => handleRemoveQuestion(q.id)}
                                    className="text-xs font-rounded text-slate-400 hover:text-rose-600 p-2 hover:bg-rose-50 rounded-full transition-colors cursor-pointer"
                                    title="Delete this question"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>

                              {/* Requirement 4: Mode Switcher per Question ("Key points" vs "Rubric levels") */}
                              <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-white rounded-2xl border border-slate-200">
                                <div>
                                  <span className="text-xs font-rounded font-bold text-slate-800 block">
                                    Grading Evaluation Mode
                                  </span>
                                  <span className="text-[11px] font-rounded text-slate-400">
                                    Choose whether AI and examiners grade by rubric levels or additive key points.
                                  </span>
                                </div>

                                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      handleUpdateCurrentScheme((prev) => ({
                                        ...prev,
                                        questions: prev.questions.map((item) =>
                                          item.id === q.id
                                            ? {
                                                ...item,
                                                mode: 'rubric_levels',
                                                rubricLevels:
                                                  item.rubricLevels && item.rubricLevels.length > 0
                                                    ? item.rubricLevels
                                                    : [
                                                        {
                                                          id: `l1-${Date.now()}`,
                                                          levelNumber: 1,
                                                          title: 'Level 1 (Full Marks)',
                                                          description: 'Complete and fully correct answer.',
                                                          marks: item.maxMarks,
                                                        },
                                                        {
                                                          id: `l2-${Date.now()}`,
                                                          levelNumber: 2,
                                                          title: 'Level 2',
                                                          description: 'Partial answer or minor omission.',
                                                          marks: Math.round(item.maxMarks * 0.5 * 2) / 2,
                                                        },
                                                        {
                                                          id: `l3-${Date.now()}`,
                                                          levelNumber: 3,
                                                          title: 'Level 3 (Zero)',
                                                          description: 'Incorrect answer or no relevant content.',
                                                          marks: 0,
                                                        },
                                                      ],
                                              }
                                            : item
                                        ),
                                      }));
                                    }}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-rounded font-bold transition-all cursor-pointer ${
                                      q.mode === 'rubric_levels'
                                        ? 'bg-white text-[#0047AB] shadow-xs'
                                        : 'text-slate-600 hover:text-slate-900'
                                    }`}
                                  >
                                    <ListOrdered className="w-3.5 h-3.5 text-[#0047AB]" />
                                    <span>Rubric Levels (FBISE Style)</span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => {
                                      handleUpdateCurrentScheme((prev) => ({
                                        ...prev,
                                        questions: prev.questions.map((item) =>
                                          item.id === q.id
                                            ? {
                                                ...item,
                                                mode: 'key_points',
                                                keyPoints:
                                                  item.keyPoints && item.keyPoints.length > 0
                                                    ? item.keyPoints
                                                    : [
                                                        {
                                                          id: `kp-${Date.now()}`,
                                                          description: 'Core criterion or principle',
                                                          marks: item.maxMarks,
                                                        },
                                                      ],
                                              }
                                            : item
                                        ),
                                      }));
                                    }}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-rounded font-bold transition-all cursor-pointer ${
                                      q.mode === 'key_points'
                                        ? 'bg-white text-[#0047AB] shadow-xs'
                                        : 'text-slate-600 hover:text-slate-900'
                                    }`}
                                  >
                                    <ListCheck className="w-3.5 h-3.5 text-[#0047AB]" />
                                    <span>Key Points</span>
                                  </button>
                                </div>
                              </div>

                              {/* Question Options: Sub-parts & OR Choice Toggles */}
                              <div className="flex flex-wrap items-center gap-4 text-xs font-rounded">
                                {/* Requirement 2: Sub-parts Toggle */}
                                <label className="flex items-center gap-2 cursor-pointer bg-white px-3 py-1.5 rounded-xl border border-slate-200">
                                  <input
                                    type="checkbox"
                                    checked={Boolean(q.hasSubParts)}
                                    onChange={(e) => {
                                      const checked = e.target.checked;
                                      handleUpdateCurrentScheme((prev) => ({
                                        ...prev,
                                        questions: prev.questions.map((item) => {
                                          if (item.id !== q.id) return item;
                                          return {
                                            ...item,
                                            hasSubParts: checked,
                                            subParts: checked
                                              ? item.subParts && item.subParts.length > 0
                                                ? item.subParts
                                                : [
                                                    {
                                                      id: `sp-${Date.now()}-1`,
                                                      partLabel: '(i)',
                                                      partText: 'Define core concept.',
                                                      maxMarks: Math.round((item.maxMarks / 2) * 2) / 2,
                                                      mode: 'rubric_levels',
                                                      rubricLevels: [
                                                        {
                                                          id: `sp-l1`,
                                                          levelNumber: 1,
                                                          title: 'Level 1 (Full)',
                                                          description: 'Correct definition and formula.',
                                                          marks: Math.round((item.maxMarks / 2) * 2) / 2,
                                                        },
                                                        {
                                                          id: `sp-l2`,
                                                          levelNumber: 2,
                                                          title: 'Level 2 (Zero)',
                                                          description: 'Incorrect answer.',
                                                          marks: 0,
                                                        },
                                                      ],
                                                    },
                                                    {
                                                      id: `sp-${Date.now()}-2`,
                                                      partLabel: '(ii)',
                                                      partText: 'Derive expression or calculate.',
                                                      maxMarks:
                                                        item.maxMarks -
                                                        Math.round((item.maxMarks / 2) * 2) / 2,
                                                      mode: 'rubric_levels',
                                                      rubricLevels: [
                                                        {
                                                          id: `sp2-l1`,
                                                          levelNumber: 1,
                                                          title: 'Level 1 (Full)',
                                                          description: 'Complete calculation with units.',
                                                          marks:
                                                            item.maxMarks -
                                                            Math.round((item.maxMarks / 2) * 2) / 2,
                                                        },
                                                        {
                                                          id: `sp2-l2`,
                                                          levelNumber: 2,
                                                          title: 'Level 2 (Zero)',
                                                          description: 'Incorrect answer.',
                                                          marks: 0,
                                                        },
                                                      ],
                                                    },
                                                  ]
                                              : undefined,
                                          };
                                        }),
                                      }));
                                    }}
                                    className="w-4 h-4 text-[#0047AB] rounded"
                                  />
                                  <span className="font-bold text-slate-700">
                                    Has Sub-parts (i, ii, iii...)
                                  </span>
                                </label>

                                {/* Requirement 2: OR Choice Toggle */}
                                <label className="flex items-center gap-2 cursor-pointer bg-white px-3 py-1.5 rounded-xl border border-slate-200">
                                  <input
                                    type="checkbox"
                                    checked={Boolean(q.hasOrChoice)}
                                    onChange={(e) => {
                                      const checked = e.target.checked;
                                      handleUpdateCurrentScheme((prev) => ({
                                        ...prev,
                                        questions: prev.questions.map((item) => {
                                          if (item.id !== q.id) return item;
                                          return {
                                            ...item,
                                            hasOrChoice: checked,
                                            orChoice: checked
                                              ? item.orChoice || {
                                                  questionText: 'OR: Alternative question prompt...',
                                                  maxMarks: item.maxMarks,
                                                  modelAnswer: 'Alternative model answer...',
                                                  mode: 'rubric_levels',
                                                  rubricLevels: [
                                                    {
                                                      id: `or-l1-${Date.now()}`,
                                                      levelNumber: 1,
                                                      title: 'Level 1 (Full)',
                                                      description: 'Correct solution for OR question.',
                                                      marks: item.maxMarks,
                                                    },
                                                    {
                                                      id: `or-l2-${Date.now()}`,
                                                      levelNumber: 2,
                                                      title: 'Level 2 (Zero)',
                                                      description: 'Incorrect answer.',
                                                      marks: 0,
                                                    },
                                                  ],
                                                }
                                              : undefined,
                                          };
                                        }),
                                      }));
                                    }}
                                    className="w-4 h-4 text-purple-600 rounded"
                                  />
                                  <span className="font-bold text-slate-700">
                                    Has Alternative OR Choice
                                  </span>
                                </label>
                              </div>

                              {/* Question Text */}
                              <div>
                                <label className="text-xs font-rounded font-bold text-slate-600 block mb-1">
                                  Question Prompt / Text
                                </label>
                                <textarea
                                  rows={2}
                                  value={q.questionText}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    handleUpdateCurrentScheme((prev) => ({
                                      ...prev,
                                      questions: prev.questions.map((item) =>
                                        item.id === q.id ? { ...item, questionText: val } : item
                                      ),
                                    }));
                                  }}
                                  placeholder="Enter the full question text as given on the examination paper..."
                                  className="w-full text-xs sm:text-sm font-rounded text-slate-800 bg-white border border-slate-200 rounded-xl p-3 focus:outline-hidden focus:border-[#0047AB] transition-colors"
                                />
                              </div>

                              {/* Model Answer (Short) */}
                              <div>
                                <label className="text-xs font-rounded font-bold text-slate-600 flex items-center gap-1.5 mb-1">
                                  <FileText className="w-3.5 h-3.5 text-[#0047AB]" />
                                  <span>Model Answer (Ground-truth reference for AI evaluator)</span>
                                </label>
                                <textarea
                                  rows={2}
                                  value={q.modelAnswer}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    handleUpdateCurrentScheme((prev) => ({
                                      ...prev,
                                      questions: prev.questions.map((item) =>
                                        item.id === q.id ? { ...item, modelAnswer: val } : item
                                      ),
                                    }));
                                  }}
                                  placeholder="Concise reference model answer..."
                                  className="w-full text-xs font-rounded text-slate-800 bg-white border border-slate-200 rounded-xl p-3 focus:outline-hidden focus:border-[#0047AB] transition-colors"
                                />
                              </div>
                            </div>

                            {/* ──────── SUB-PARTS EDITOR SECTION (IF HAS SUB-PARTS) ──────── */}
                            {q.hasSubParts && q.subParts && (
                              <div className="flex flex-col gap-4 p-5 bg-blue-50/50 rounded-[24px] border border-blue-200">
                                <div className="flex items-center justify-between">
                                  <div>
                                    <h4 className="font-rounded font-bold text-sm text-[#0047AB] flex items-center gap-2">
                                      <Split className="w-4 h-4" />
                                      <span>Question Sub-parts (Sum must equal {q.maxMarks} marks)</span>
                                    </h4>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const newNum = (q.subParts?.length || 0) + 1;
                                      const label = `(${['i', 'ii', 'iii', 'iv', 'v'][newNum - 1] || newNum})`;
                                      const newSp: MarkingSubPart = {
                                        id: `sp-${Date.now()}-${newNum}`,
                                        partLabel: label,
                                        partText: 'Sub-part question prompt...',
                                        maxMarks: 2.5,
                                        mode: 'rubric_levels',
                                        rubricLevels: [
                                          {
                                            id: `sp-l1-${Date.now()}`,
                                            levelNumber: 1,
                                            title: 'Level 1 (Full)',
                                            description: 'Correct answer.',
                                            marks: 2.5,
                                          },
                                          {
                                            id: `sp-l2-${Date.now()}`,
                                            levelNumber: 2,
                                            title: 'Level 2 (Zero)',
                                            description: 'Incorrect answer.',
                                            marks: 0,
                                          },
                                        ],
                                      };
                                      handleUpdateCurrentScheme((prev) => ({
                                        ...prev,
                                        questions: prev.questions.map((item) =>
                                          item.id === q.id
                                            ? { ...item, subParts: [...(item.subParts || []), newSp] }
                                            : item
                                        ),
                                      }));
                                    }}
                                    className="flex items-center gap-1 text-xs font-rounded font-bold text-[#0047AB] bg-white border border-blue-200 px-3 py-1.5 rounded-full cursor-pointer shadow-2xs"
                                  >
                                    <Plus className="w-3.5 h-3.5" />
                                    <span>Add Sub-part</span>
                                  </button>
                                </div>

                                <div className="flex flex-col gap-3">
                                  {q.subParts.map((sp, spIdx) => (
                                    <div
                                      key={sp.id}
                                      className="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs flex flex-col gap-3"
                                    >
                                      <div className="flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-2">
                                          <input
                                            type="text"
                                            value={sp.partLabel}
                                            onChange={(e) => {
                                              const val = e.target.value;
                                              handleUpdateCurrentScheme((prev) => ({
                                                ...prev,
                                                questions: prev.questions.map((item) =>
                                                  item.id === q.id
                                                    ? {
                                                        ...item,
                                                        subParts: item.subParts?.map((p, i) =>
                                                          i === spIdx ? { ...p, partLabel: val } : p
                                                        ),
                                                      }
                                                    : item
                                                ),
                                              }));
                                            }}
                                            className="w-14 text-center font-bold text-xs bg-slate-100 rounded px-1.5 py-1 text-[#0047AB]"
                                          />
                                          <input
                                            type="text"
                                            value={sp.partText}
                                            onChange={(e) => {
                                              const val = e.target.value;
                                              handleUpdateCurrentScheme((prev) => ({
                                                ...prev,
                                                questions: prev.questions.map((item) =>
                                                  item.id === q.id
                                                    ? {
                                                        ...item,
                                                        subParts: item.subParts?.map((p, i) =>
                                                          i === spIdx ? { ...p, partText: val } : p
                                                        ),
                                                      }
                                                    : item
                                                ),
                                              }));
                                            }}
                                            placeholder="Sub-part prompt..."
                                            className="flex-1 text-xs font-rounded px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg"
                                          />
                                        </div>

                                        <div className="flex items-center gap-2">
                                          <span className="text-xs text-slate-500 font-semibold">Marks:</span>
                                          <input
                                            type="number"
                                            step="0.5"
                                            min="0.5"
                                            value={sp.maxMarks}
                                            onChange={(e) => {
                                              const val = Math.max(0.5, parseFloat(e.target.value) || 0.5);
                                              handleUpdateCurrentScheme((prev) => ({
                                                ...prev,
                                                questions: prev.questions.map((item) =>
                                                  item.id === q.id
                                                    ? {
                                                        ...item,
                                                        subParts: item.subParts?.map((p, i) => {
                                                          if (i !== spIdx) return p;
                                                          // Update Level 1 to match new maxMarks if in rubric_levels mode
                                                          const updatedLevels = p.rubricLevels?.map((l, lIdx) =>
                                                            lIdx === 0 ? { ...l, marks: val } : l
                                                          );
                                                          return { ...p, maxMarks: val, rubricLevels: updatedLevels };
                                                        }),
                                                      }
                                                    : item
                                                ),
                                              }));
                                            }}
                                            className="w-14 text-center font-bold text-xs bg-slate-100 border border-slate-200 rounded px-1 py-1 text-[#0047AB]"
                                          />
                                          <button
                                            type="button"
                                            onClick={() => {
                                              handleUpdateCurrentScheme((prev) => ({
                                                ...prev,
                                                questions: prev.questions.map((item) =>
                                                  item.id === q.id
                                                    ? {
                                                        ...item,
                                                        subParts: item.subParts?.filter((_, i) => i !== spIdx),
                                                      }
                                                    : item
                                                ),
                                              }));
                                            }}
                                            className="text-slate-400 hover:text-rose-600 p-1"
                                          >
                                            <Trash2 className="w-3.5 h-3.5" />
                                          </button>
                                        </div>
                                      </div>

                                      {/* Sub-part Rubric Levels List */}
                                      <div className="flex flex-col gap-1.5 pl-3 border-l-2 border-blue-200">
                                        <div className="flex items-center justify-between text-[11px] font-bold text-slate-500">
                                          <span>Rubric Levels for Sub-part {sp.partLabel}</span>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              const newLvlNum = (sp.rubricLevels?.length || 0) + 1;
                                              const newLevel: MarkingRubricLevel = {
                                                id: `lvl-${Date.now()}-${newLvlNum}`,
                                                levelNumber: newLvlNum,
                                                title: `Level ${newLvlNum}`,
                                                description: 'Level criterion description...',
                                                marks: 0,
                                              };
                                              handleUpdateCurrentScheme((prev) => ({
                                                ...prev,
                                                questions: prev.questions.map((item) =>
                                                  item.id === q.id
                                                    ? {
                                                        ...item,
                                                        subParts: item.subParts?.map((p, i) =>
                                                          i === spIdx
                                                            ? {
                                                                ...p,
                                                                rubricLevels: [...(p.rubricLevels || []), newLevel],
                                                              }
                                                            : p
                                                        ),
                                                      }
                                                    : item
                                                ),
                                              }));
                                            }}
                                            className="text-[10px] text-[#0047AB] hover:underline cursor-pointer flex items-center gap-0.5"
                                          >
                                            <Plus className="w-3 h-3" />
                                            <span>Add Level</span>
                                          </button>
                                        </div>

                                        {sp.rubricLevels?.map((lvl, lIdx) => (
                                          <div
                                            key={lvl.id}
                                            className="flex items-center gap-2 bg-slate-50 p-2 rounded-xl text-xs"
                                          >
                                            <span className="font-bold text-[11px] text-slate-500 w-16 shrink-0">
                                              Level {lvl.levelNumber}
                                            </span>
                                            <input
                                              type="text"
                                              value={lvl.description}
                                              onChange={(e) => {
                                                const val = e.target.value;
                                                handleUpdateCurrentScheme((prev) => ({
                                                  ...prev,
                                                  questions: prev.questions.map((item) =>
                                                    item.id === q.id
                                                      ? {
                                                          ...item,
                                                          subParts: item.subParts?.map((p, i) =>
                                                            i === spIdx
                                                              ? {
                                                                  ...p,
                                                                  rubricLevels: p.rubricLevels?.map((l, li) =>
                                                                    li === lIdx ? { ...l, description: val } : l
                                                                  ),
                                                                }
                                                              : p
                                                          ),
                                                        }
                                                      : item
                                                  ),
                                                }));
                                              }}
                                              placeholder="What the candidate wrote..."
                                              className="flex-1 bg-white border border-slate-200 rounded px-2 py-1 text-xs"
                                            />
                                            <div className="flex items-center gap-1 shrink-0">
                                              <input
                                                type="number"
                                                step="0.5"
                                                min="0"
                                                value={lvl.marks}
                                                onChange={(e) => {
                                                  const val = Math.max(0, parseFloat(e.target.value) || 0);
                                                  handleUpdateCurrentScheme((prev) => ({
                                                    ...prev,
                                                    questions: prev.questions.map((item) =>
                                                      item.id === q.id
                                                        ? {
                                                            ...item,
                                                            subParts: item.subParts?.map((p, i) =>
                                                              i === spIdx
                                                                ? {
                                                                    ...p,
                                                                    rubricLevels: p.rubricLevels?.map((l, li) =>
                                                                      li === lIdx ? { ...l, marks: val } : l
                                                                    ),
                                                                  }
                                                                : p
                                                            ),
                                                          }
                                                        : item
                                                    ),
                                                  }));
                                                }}
                                                className="w-14 text-center font-bold text-xs bg-white border border-slate-200 rounded px-1 py-1 text-[#0047AB]"
                                              />
                                              <span className="text-[10px] text-slate-400">marks</span>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* ──────── RUBRIC LEVELS EDITOR SECTION (IF NOT HAS SUB-PARTS AND MODE IS RUBRIC_LEVELS) ──────── */}
                            {!q.hasSubParts && q.mode === 'rubric_levels' && (
                              <div className="flex flex-col gap-4">
                                <div className="flex items-center justify-between">
                                  <div>
                                    <h4 className="font-rounded font-bold text-sm sm:text-base text-slate-800 flex items-center gap-2">
                                      <ListOrdered className="w-4 h-4 text-[#0047AB]" />
                                      <span>FBISE Rubric Levels (Full Marks down to Zero)</span>
                                    </h4>
                                    <p className="text-xs font-rounded text-slate-400">
                                      AI evaluator picks the single best-matching level and awards its exact marks.
                                    </p>
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() => {
                                      const nextLvlNum = (q.rubricLevels?.length || 0) + 1;
                                      const newLevel: MarkingRubricLevel = {
                                        id: `lvl-${Date.now()}-${nextLvlNum}`,
                                        levelNumber: nextLvlNum,
                                        title: `Level ${nextLvlNum}`,
                                        description: 'Description of candidate answer quality...',
                                        marks: 0,
                                      };
                                      handleUpdateCurrentScheme((prev) => ({
                                        ...prev,
                                        questions: prev.questions.map((item) =>
                                          item.id === q.id
                                            ? {
                                                ...item,
                                                rubricLevels: [...(item.rubricLevels || []), newLevel],
                                              }
                                            : item
                                        ),
                                      }));
                                    }}
                                    className="flex items-center gap-1.5 text-xs font-rounded font-bold text-[#0047AB] bg-blue-50 hover:bg-blue-100 border border-blue-200 px-3.5 py-1.5 rounded-full cursor-pointer shadow-2xs"
                                  >
                                    <Plus className="w-3.5 h-3.5" />
                                    <span>Add Level</span>
                                  </button>
                                </div>

                                {/* LIVE VALIDATION BANNER FOR RUBRIC LEVELS */}
                                {validation.valid ? (
                                  <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl p-3.5 flex items-center gap-3">
                                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                                    <div className="text-xs font-rounded">
                                      <span className="font-bold">Rubric Levels Validated: </span>
                                      Level 1 awards full marks ({q.maxMarks} marks) matching question maximum.
                                    </div>
                                  </div>
                                ) : (
                                  <div className="bg-amber-50 border border-amber-300 text-amber-900 rounded-2xl p-3.5 flex items-start sm:items-center gap-3">
                                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5 sm:mt-0" />
                                    <div className="text-xs font-rounded flex-1">
                                      <span className="font-bold">Validation Warning: </span>
                                      {validation.reason || `Level 1 marks must equal question max marks (${q.maxMarks}).`}
                                    </div>
                                  </div>
                                )}

                                {/* Ordered Rubric Levels List */}
                                <div className="flex flex-col gap-2.5">
                                  {q.rubricLevels?.map((level, lIdx) => (
                                    <div
                                      key={level.id}
                                      className={`p-3.5 rounded-2xl border transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
                                        lIdx === 0
                                          ? 'bg-emerald-50/50 border-emerald-200'
                                          : level.marks === 0
                                          ? 'bg-slate-50 border-slate-200'
                                          : 'bg-white border-slate-200'
                                      }`}
                                    >
                                      <div className="flex items-center gap-2 shrink-0">
                                        <span className="font-rounded font-bold text-xs text-white bg-[#0047AB] px-2 py-0.5 rounded-md">
                                          Level {level.levelNumber}
                                        </span>
                                      </div>

                                      <div className="flex-1 w-full sm:w-auto">
                                        <textarea
                                          rows={2}
                                          value={level.description}
                                          onChange={(e) => {
                                            const val = e.target.value;
                                            handleUpdateCurrentScheme((prev) => ({
                                              ...prev,
                                              questions: prev.questions.map((item) =>
                                                item.id === q.id
                                                  ? {
                                                      ...item,
                                                      rubricLevels: item.rubricLevels?.map((l, i) =>
                                                        i === lIdx ? { ...l, description: val } : l
                                                      ),
                                                    }
                                                  : item
                                              ),
                                            }));
                                          }}
                                          placeholder="Description of what student wrote to earn these marks..."
                                          className="w-full text-xs font-rounded bg-white border border-slate-200 rounded-xl p-2 outline-none focus:border-[#0047AB]"
                                        />
                                      </div>

                                      {/* Marks input (0.5 steps) */}
                                      <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                                        <div className="flex items-center gap-1 bg-slate-100 px-2 py-1 rounded-xl border border-slate-200">
                                          <input
                                            type="number"
                                            step="0.5"
                                            min="0"
                                            max={q.maxMarks}
                                            value={level.marks}
                                            onChange={(e) => {
                                              const val = Math.max(0, parseFloat(e.target.value) || 0);
                                              handleUpdateCurrentScheme((prev) => ({
                                                ...prev,
                                                questions: prev.questions.map((item) =>
                                                  item.id === q.id
                                                    ? {
                                                        ...item,
                                                        rubricLevels: item.rubricLevels?.map((l, i) =>
                                                          i === lIdx ? { ...l, marks: val } : l
                                                        ),
                                                      }
                                                    : item
                                                ),
                                              }));
                                            }}
                                            className="w-14 text-center font-bold text-xs bg-white rounded py-0.5 text-[#0047AB]"
                                          />
                                          <span className="text-[11px] font-semibold text-slate-500">marks</span>
                                        </div>

                                        {q.rubricLevels && q.rubricLevels.length > 2 && (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              handleUpdateCurrentScheme((prev) => ({
                                                ...prev,
                                                questions: prev.questions.map((item) =>
                                                  item.id === q.id
                                                    ? {
                                                        ...item,
                                                        rubricLevels: item.rubricLevels
                                                          ?.filter((_, i) => i !== lIdx)
                                                          .map((l, newIdx) => ({
                                                            ...l,
                                                            levelNumber: newIdx + 1,
                                                            title: `Level ${newIdx + 1}`,
                                                          })),
                                                      }
                                                    : item
                                                ),
                                              }));
                                            }}
                                            className="text-slate-400 hover:text-rose-600 p-1"
                                          >
                                            <Trash2 className="w-3.5 h-3.5" />
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* ──────── KEY POINTS LIST & LIVE BALANCE (IF MODE IS KEY_POINTS AND NO SUB-PARTS) ──────── */}
                            {!q.hasSubParts && q.mode === 'key_points' && (
                              <div className="flex flex-col gap-4">
                                <div className="flex items-center justify-between">
                                  <div>
                                    <h4 className="font-rounded font-bold text-sm sm:text-base text-slate-800 flex items-center gap-2">
                                      <Layers className="w-4 h-4 text-[#0047AB]" />
                                      <span>Grading Key Points Breakdown</span>
                                    </h4>
                                    <p className="text-xs font-rounded text-slate-400">
                                      Each key point awards partial credit. Sum of key point marks must equal {q.maxMarks} marks.
                                    </p>
                                  </div>

                                  <button
                                    onClick={() => {
                                      const newKp: MarkingKeyPoint = {
                                        id: `kp-${Date.now()}`,
                                        description: 'New grading criterion...',
                                        marks: 2.5,
                                      };
                                      handleUpdateCurrentScheme((prev) => ({
                                        ...prev,
                                        questions: prev.questions.map((item) =>
                                          item.id === q.id
                                            ? { ...item, keyPoints: [...(item.keyPoints || []), newKp] }
                                            : item
                                        ),
                                      }));
                                    }}
                                    className="flex items-center gap-1.5 text-xs font-rounded font-bold text-[#0047AB] bg-blue-50 hover:bg-blue-100 border border-blue-200 px-3 py-1.5 rounded-full transition-colors cursor-pointer"
                                  >
                                    <Plus className="w-3.5 h-3.5" />
                                    <span>Add Key Point</span>
                                  </button>
                                </div>

                                {/* LIVE VALIDATION BANNER FOR KEY POINTS */}
                                {validation.valid ? (
                                  <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl p-3.5 flex items-center gap-3">
                                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                                    <div className="text-xs font-rounded">
                                      <span className="font-bold">Key Points Balanced: </span>
                                      Key point marks sum exactly to max marks ({q.maxMarks} marks).
                                    </div>
                                  </div>
                                ) : (
                                  <div className="bg-amber-50 border border-amber-300 text-amber-900 rounded-2xl p-3.5 flex items-start sm:items-center gap-3">
                                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5 sm:mt-0" />
                                    <div className="text-xs font-rounded flex-1">
                                      <span className="font-bold">Marks Mismatch: </span>
                                      {validation.reason || `Key points must sum to ${q.maxMarks} marks.`}
                                    </div>
                                  </div>
                                )}

                                {/* Key Points List */}
                                <div className="flex flex-col gap-2.5">
                                  {q.keyPoints?.map((kp, kpIdx) => (
                                    <div
                                      key={kp.id}
                                      className="p-3 bg-white rounded-2xl border border-slate-200 flex items-center gap-3"
                                    >
                                      <span className="font-mono text-xs font-bold text-slate-400">
                                        #{kpIdx + 1}
                                      </span>
                                      <input
                                        type="text"
                                        value={kp.description}
                                        onChange={(e) => {
                                          const val = e.target.value;
                                          handleUpdateCurrentScheme((prev) => ({
                                            ...prev,
                                            questions: prev.questions.map((item) =>
                                              item.id === q.id
                                                ? {
                                                    ...item,
                                                    keyPoints: item.keyPoints?.map((k, i) =>
                                                      i === kpIdx ? { ...k, description: val } : k
                                                    ),
                                                  }
                                                : item
                                            ),
                                          }));
                                        }}
                                        className="flex-1 text-xs font-rounded bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 outline-none focus:border-[#0047AB]"
                                      />
                                      <div className="flex items-center gap-1.5 shrink-0">
                                        <input
                                          type="number"
                                          step="0.5"
                                          min="0"
                                          value={kp.marks}
                                          onChange={(e) => {
                                            const val = Math.max(0, parseFloat(e.target.value) || 0);
                                            handleUpdateCurrentScheme((prev) => ({
                                              ...prev,
                                              questions: prev.questions.map((item) =>
                                                item.id === q.id
                                                  ? {
                                                      ...item,
                                                      keyPoints: item.keyPoints?.map((k, i) =>
                                                        i === kpIdx ? { ...k, marks: val } : k
                                                      ),
                                                    }
                                                  : item
                                              ),
                                            }));
                                          }}
                                          className="w-14 text-center font-bold text-xs bg-slate-100 border border-slate-200 rounded-lg py-1 text-[#0047AB]"
                                        />
                                        <span className="text-xs text-slate-500">marks</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* ──────── ALTERNATIVE OR CHOICE SECTION ──────── */}
                            {q.hasOrChoice && q.orChoice && (
                              <div className="flex flex-col gap-3 p-5 bg-purple-50/60 rounded-[24px] border border-purple-200">
                                <div className="flex items-center gap-2">
                                  <GitBranch className="w-4 h-4 text-purple-700" />
                                  <h4 className="font-rounded font-bold text-sm text-purple-900">
                                    Alternative Version (OR Choice — Candidate attempts only one)
                                  </h4>
                                </div>

                                <div>
                                  <label className="text-xs font-rounded font-bold text-purple-800 block mb-1">
                                    OR Choice Question Prompt
                                  </label>
                                  <textarea
                                    rows={2}
                                    value={q.orChoice.questionText}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      handleUpdateCurrentScheme((prev) => ({
                                        ...prev,
                                        questions: prev.questions.map((item) =>
                                          item.id === q.id
                                            ? {
                                                ...item,
                                                orChoice: { ...item.orChoice!, questionText: val },
                                              }
                                            : item
                                        ),
                                      }));
                                    }}
                                    className="w-full text-xs font-rounded bg-white border border-purple-200 rounded-xl p-2.5 outline-none focus:border-purple-600"
                                  />
                                </div>

                                <div>
                                  <label className="text-xs font-rounded font-bold text-purple-800 block mb-1">
                                    OR Choice Model Answer
                                  </label>
                                  <textarea
                                    rows={2}
                                    value={q.orChoice.modelAnswer}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      handleUpdateCurrentScheme((prev) => ({
                                        ...prev,
                                        questions: prev.questions.map((item) =>
                                          item.id === q.id
                                            ? {
                                                ...item,
                                                orChoice: { ...item.orChoice!, modelAnswer: val },
                                              }
                                            : item
                                        ),
                                      }));
                                    }}
                                    className="w-full text-xs font-rounded bg-white border border-purple-200 rounded-xl p-2.5 outline-none focus:border-purple-600"
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })()
                    ) : (
                      <div className="text-center py-12 text-slate-400 font-rounded text-sm">
                        Select a question to edit.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          )}
        </div>
      </motion.div>

      {/* ════════ REQUIREMENT 6: IMPORT FROM TEXT MODAL ════════ */}
      <AnimatePresence>
        {isImportModalOpen && (
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
              className="bg-white rounded-[32px] max-w-2xl w-full p-6 sm:p-7 shadow-2xl border border-slate-200 flex flex-col max-h-[92vh] overflow-hidden"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <FileUp className="w-5 h-5 text-[#0047AB]" />
                  <h3 className="font-rounded font-bold text-lg text-slate-800">
                    Import FBISE Marking Scheme from PDF Text
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsImportModalOpen(false)}
                  className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {!importedPreviewScheme ? (
                <div className="flex-1 overflow-y-auto py-4 flex flex-col gap-4">
                  <p className="text-xs font-rounded text-slate-500">
                    Paste raw rubric text copied from an official FBISE marking scheme PDF. Gemini will structure it into competency-based rubric levels, sub-parts, and OR choices.
                  </p>

                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                    <input
                      type="text"
                      placeholder="Optional Subject Name (e.g. Physics Advanced)"
                      value={importSubject}
                      onChange={(e) => setImportSubject(e.target.value)}
                      className="w-full sm:w-72 text-xs font-rounded bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none focus:border-[#4DD9E8] focus:bg-white"
                    />

                    <button
                      type="button"
                      onClick={handleInsertSampleFBISEText}
                      className="text-xs font-rounded font-bold text-[#0047AB] bg-blue-50 hover:bg-blue-100 border border-blue-200 px-3 py-1.5 rounded-full transition-colors cursor-pointer"
                    >
                      Paste Sample FBISE Text
                    </button>
                  </div>

                  <div className="flex-1 flex flex-col">
                    <label className="text-xs font-rounded font-bold text-slate-700 block mb-1">
                      Pasted Rubric Text
                    </label>
                    <textarea
                      rows={12}
                      value={importRawText}
                      onChange={(e) => setImportRawText(e.target.value)}
                      placeholder="Paste text from PDF here..."
                      className="w-full flex-1 min-h-[220px] text-xs font-mono bg-slate-50 border border-slate-200 rounded-2xl p-3 outline-none focus:border-[#4DD9E8] focus:bg-white resize-y"
                    />
                  </div>

                  {importError && (
                    <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs font-rounded text-rose-800 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                      <span>{importError}</span>
                    </div>
                  )}

                  <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setIsImportModalOpen(false)}
                      className="px-4 py-2 rounded-full bg-slate-100 hover:bg-slate-200 font-rounded font-semibold text-xs text-slate-700 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleRunImportFromText}
                      disabled={isImporting || !importRawText.trim()}
                      className="flex items-center gap-1.5 px-6 py-2 rounded-full bg-gradient-to-r from-[#4DD9E8] to-[#0047AB] text-white font-rounded font-bold text-xs shadow-md hover:opacity-95 cursor-pointer disabled:opacity-50"
                    >
                      {isImporting ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Converting with AI...</span>
                        </>
                      ) : (
                        <>
                          <Bot className="w-4 h-4 text-cyan-200" />
                          <span>Convert to Scheme</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                /* Converted Scheme Review Preview */
                <div className="flex-1 overflow-y-auto py-4 flex flex-col gap-4">
                  <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3 text-emerald-800 text-xs font-rounded flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>
                      AI successfully converted your rubric text! Review the extracted questions below before adding.
                    </span>
                  </div>

                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 flex flex-col gap-1.5 text-xs font-rounded">
                    <div className="font-bold text-sm text-slate-800">
                      {importedPreviewScheme.title}
                    </div>
                    <div className="text-slate-500">
                      Subject: <strong>{importedPreviewScheme.subject}</strong> • {importedPreviewScheme.examSession}
                    </div>
                    <div className="text-[#0047AB] font-bold">
                      {importedPreviewScheme.questions.length} Questions • Total {importedPreviewScheme.totalMarks} Marks
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 max-h-60 overflow-y-auto">
                    {importedPreviewScheme.questions.map((q, qIdx) => (
                      <div
                        key={`${q.id || 'imp-q'}-${q.questionNumber}-${q.partLabel || ''}-${qIdx}`}
                        className="p-3 bg-white rounded-xl border border-slate-200 text-xs font-rounded flex flex-col gap-1"
                      >
                        <div className="flex items-center justify-between font-bold">
                          <span className="text-[#0047AB]">Question {q.questionNumber}</span>
                          <span className="bg-slate-100 px-2 py-0.5 rounded text-[11px]">
                            {q.maxMarks} marks
                          </span>
                        </div>
                        <div className="text-slate-700 line-clamp-1">{q.questionText}</div>
                        <div className="text-[10px] text-slate-400">
                          {q.hasSubParts
                            ? `${q.subParts?.length} sub-parts detected`
                            : `${q.rubricLevels?.length || 0} rubric levels generated`}
                          {q.hasOrChoice && ' • Includes OR choice alternative'}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setImportedPreviewScheme(null)}
                      className="px-4 py-2 rounded-full bg-slate-100 hover:bg-slate-200 font-rounded font-semibold text-xs text-slate-700 cursor-pointer"
                    >
                      Back to Text
                    </button>
                    <button
                      type="button"
                      onClick={handleAcceptImportedScheme}
                      className="flex items-center gap-1.5 px-6 py-2 rounded-full bg-gradient-to-r from-emerald-600 to-teal-700 text-white font-rounded font-bold text-xs shadow-md hover:opacity-95 cursor-pointer"
                    >
                      <Check className="w-4 h-4" />
                      <span>Accept & Edit Scheme</span>
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ════════ CONFIRMATION MODAL FOR SCHEME DELETION ════════ */}
      <AnimatePresence>
        {deleteConfirmModal && deleteConfirmModal.isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
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
                  Are you sure you want to delete &lsquo;
                  <strong className="text-slate-900 font-bold">
                    {deleteConfirmModal.schemeTitle}
                  </strong>
                  &rsquo;? This cannot be undone.
                </p>
              </div>

              {deleteConfirmModal.referencedCount > 0 && (
                <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-2.5 text-xs font-rounded text-amber-900">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold block">Paper Dependency Warning</span>
                    <span>
                      This scheme is used by {deleteConfirmModal.referencedCount} existing paper(s). Deleting it may affect their grading.
                    </span>
                  </div>
                </div>
              )}

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
                  onClick={handleConfirmDeleteScheme}
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
