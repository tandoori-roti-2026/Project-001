import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { LogOut, User, CheckCircle2, CloudUpload, Database } from 'lucide-react';
import { ModuleItem, ModuleModal } from './ModuleModal';
import { UserAccount } from '../data/authUsers';
import { UserIdentityBadge } from './UserIdentityBadge';
import { GlobalShiftFilter, ShiftFilterType } from './GlobalShiftFilter';
import { ExamPaper } from '../data/mockPapers';

interface MainMenuScreenProps {
  currentUser: UserAccount | null;
  papers?: ExamPaper[];
  shiftFilter?: ShiftFilterType;
  onShiftFilterChange?: (shift: ShiftFilterType) => void;
  onLogout: () => void;
  onOpenUploading?: () => void;
  onOpenEditing: () => void;
  onOpenResultCards: () => void;
  onOpenStudentsData: () => void;
  onOpenAgent: () => void;
  onImportLocalDataToFirestore?: () => Promise<void>;
  isImportingLocalData?: boolean;
}

const MODULES_DATA: ModuleItem[] = [
  {
    id: 'uploading',
    title: 'Uploading',
    body: 'Digitize answer scripts by capturing or importing clear paper images for grading.',
    iconName: 'upload',
    mockDetails:
      'High-resolution multi-page exam scanner, batch OCR, automated corner detection, and quality validation pipeline.',
  },
  {
    id: 'editing',
    title: 'Editing',
    body: "Review AI-generated scores, adjust marks with full oversight, and finalize results before they're published.",
    iconName: 'edit',
    mockDetails:
      'Digital red-pen annotation tool, question-by-question scoring rubric, grade recalculation, and remarks editor.',
  },
  {
    id: 'result-cards',
    title: 'Result Cards',
    body: 'Generate, view, and manage complete result cards for every student in one place.',
    iconName: 'award',
    mockDetails:
      'Automated PDF report card generation, grade distribution analytics, passing criteria checks, and export to CSV.',
  },
  {
    id: 'students-data',
    title: 'Students Data',
    body: 'Maintain full academic profiles — subjects, records, and performance history — for every student.',
    iconName: 'users',
    mockDetails:
      'Comprehensive student registry with roll numbers, class sections, historical performance graphs, and attendance records.',
  },
  {
    id: 'examiner-chat',
    title: 'Examiner Chat',
    body: 'Ask marking questions, get model answers & key points, evaluate student answers, and explore app workflows.',
    iconName: 'message-square',
    mockDetails:
      'Interactive FBISE marking advisor: provides question rubrics, marks breakdowns, OR-choice evaluation, and student answer advice.',
  },
];

export const MainMenuScreen: React.FC<MainMenuScreenProps> = ({
  currentUser,
  papers = [],
  shiftFilter = 'morning',
  onShiftFilterChange,
  onLogout,
  onOpenUploading,
  onOpenEditing,
  onOpenResultCards,
  onOpenStudentsData,
  onOpenAgent,
  onImportLocalDataToFirestore,
  isImportingLocalData,
}) => {
  const [selectedModule, setSelectedModule] = useState<ModuleItem | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [usdRate, setUsdRate] = useState<number | null>(null);
  const [rateError, setRateError] = useState<boolean>(false);

  // Fetch live exchange rate from open.er-api.com USD -> PKR
  useEffect(() => {
    let isMounted = true;
    fetch('https://open.er-api.com/v6/latest/USD')
      .then((res) => res.json())
      .then((data) => {
        if (isMounted && data && data.rates && data.rates.PKR) {
          setUsdRate(data.rates.PKR);
          setRateError(false);
        } else {
          if (isMounted) setRateError(true);
        }
      })
      .catch(() => {
        if (isMounted) setRateError(true);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  // Live count calculations (real saved results count)
  const totalChecked = papers.filter((p) => p.status === 'Reviewed').length;
  const totalPapersCount = 800;

  const isExaminerRole = currentUser?.role === 'normal';
  const assignedTotal = 200;
  const examinerChecked = Math.min(assignedTotal, totalChecked);

  const checkedCountForMoney = totalChecked;
  const pkrAmount = checkedCountForMoney * 20;
  const usdAmount = usdRate && usdRate > 0 ? pkrAmount / usdRate : 0;

  const handleCardClick = (module: ModuleItem) => {
    // If Uploading is clicked, navigate directly to the functional Uploading screen
    if (module.id === 'uploading' && onOpenUploading) {
      onOpenUploading();
      return;
    }

    // If Editing is clicked, navigate directly to the functional Editing screen
    if (module.id === 'editing') {
      onOpenEditing();
      return;
    }

    // If Result Cards is clicked, navigate directly to the functional Result Cards screen
    if (module.id === 'result-cards') {
      onOpenResultCards();
      return;
    }

    // If Students Data is clicked, navigate directly to the functional Students Data screen
    if (module.id === 'students-data') {
      onOpenStudentsData();
      return;
    }

    // If Examiner Chat is clicked, open Examiner Chat
    if (module.id === 'examiner-chat') {
      onOpenAgent();
      return;
    }

    // 1. Log to console as requested for pending modules
    console.log(`${module.title} module coming soon`);

    // 2. Show brief toast notification
    setToastMessage(`${module.title} module coming soon`);
    setTimeout(() => {
      setToastMessage((current) => (current === `${module.title} module coming soon` ? null : current));
    }, 2800);

    // 3. Open preview modal
    setSelectedModule(module);
  };

  return (
    <div className="relative w-full min-h-screen bg-white text-slate-800 flex flex-col justify-between select-none">
      {/* ════════ TOP BANNER ════════ */}
      <header className="relative w-full z-20 shrink-0">
        <div
          className="w-full h-auto md:h-28 py-3.5 px-4 md:p-0 rounded-b-[24px] sm:rounded-b-[32px] md:rounded-b-[40px] flex flex-col md:flex-row items-center justify-center md:justify-between shadow-md relative overflow-hidden"
          style={{
            background: 'linear-gradient(90deg, #4DD9E8 0%, #0047AB 100%)',
          }}
        >
          {/* Subtle Top Gloss Accent */}
          <div className="absolute inset-x-0 top-0 h-1/3 bg-white/10 pointer-events-none" />

          {/* Row 1 on mobile / Left & Right on desktop */}
          <div className="w-full md:w-auto flex items-center justify-between z-10 mb-2 md:mb-0">
            {/* User identity & active mode on left */}
            <div className="static md:absolute md:left-4 sm:md:left-8 md:top-1/2 md:-translate-y-1/2 z-10">
              <UserIdentityBadge user={currentUser} compactOnMobile={true} />
            </div>

            {/* Logout Button on right */}
            <button
              onClick={onLogout}
              className="static md:absolute md:right-4 sm:md:right-8 md:top-1/2 md:-translate-y-1/2 flex items-center gap-1.5 text-xs sm:text-sm font-rounded font-semibold text-white bg-white/15 hover:bg-white/30 backdrop-blur-xs px-3 sm:px-4 py-1.5 rounded-full transition-all cursor-pointer shadow-xs active:scale-95 z-10"
              title="Log out and return to login"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Logout</span>
            </button>
          </div>

          {/* Row 2 on mobile / Center on desktop: Brand Title */}
          <div className="static md:absolute md:left-1/2 md:-translate-x-1/2 md:top-1/2 md:-translate-y-1/2 text-center z-10">
            <h1 className="font-rounded font-bold text-xl sm:text-3xl md:text-4xl text-white tracking-widest uppercase drop-shadow-md">
              PROJECT-001
            </h1>
          </div>
        </div>
      </header>

      {/* ════════ MAIN CONTENT: 5 CARDS IN A ROW ════════ */}
      <main className="flex-1 flex flex-col justify-start items-center px-4 sm:px-8 py-6 sm:py-8 pb-24 md:pb-8 z-10 w-full max-w-[1580px] mx-auto">
        {/* Live Count Bar & Firestore Sync Status */}
        <div className="w-full flex justify-center mb-6 sm:mb-8 mt-4 md:mt-[50px]">
          <div className="flex flex-col md:flex-row items-center justify-center gap-4 sm:gap-6 px-6 py-3 bg-blue-50/90 border border-blue-200/90 rounded-2xl shadow-xs font-rounded text-xs sm:text-sm text-[#0047AB]">
            {/* Left: Overall Checked / Total */}
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-500">Papers checked:</span>
              <span className="font-bold text-base text-[#0047AB]">
                {totalChecked}/{totalPapersCount}
              </span>
            </div>

            <div className="hidden md:block w-px h-4 bg-blue-200" />

            {/* Right: Earnings (Dev & Normal mode) or Assigned Papers (Examiner mode) */}
            <div className="flex flex-col items-center sm:items-start">
              {isExaminerRole ? (
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-500">Your papers:</span>
                  <span className="font-bold text-base text-[#0047AB]">
                    {examinerChecked}/{assignedTotal}
                  </span>
                </div>
              ) : (
                <div className="flex flex-col items-center sm:items-start">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-500">Earnings:</span>
                    <span className="font-bold text-base text-[#0047AB]">
                      {pkrAmount.toLocaleString()} PKR {rateError ? '' : `· $${usdAmount.toFixed(2)}`}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400 font-normal mt-0.5">
                    20 PKR per checked paper · {rateError ? 'USD rate unavailable' : 'rate as of today'}
                  </span>
                </div>
              )}
            </div>

            <div className="hidden md:block w-px h-4 bg-blue-200" />

            {/* Firestore Status Badge & One-Time Import Button */}
            <div className="flex flex-wrap items-center justify-center gap-2">
              <span className="inline-flex items-center gap-1.5 bg-emerald-100/90 text-emerald-800 text-[11px] font-bold px-2.5 py-1 rounded-full border border-emerald-300 shadow-2xs">
                <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                Firestore Active
              </span>

              {onImportLocalDataToFirestore && (
                <button
                  type="button"
                  onClick={() => onImportLocalDataToFirestore()}
                  disabled={isImportingLocalData}
                  className="flex items-center gap-1.5 bg-white hover:bg-blue-100/80 text-[#0047AB] border border-blue-300/80 shadow-2xs px-3 py-1 rounded-full text-[11px] font-bold transition-all cursor-pointer disabled:opacity-50 active:scale-95"
                  title="One-time sync: Upload local browser data (localStorage/IndexedDB) into Firestore"
                >
                  <CloudUpload className="w-3.5 h-3.5" />
                  <span>{isImportingLocalData ? 'Importing Data...' : 'Import Browser Data to Firestore'}</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Subtle section subline */}
        <div className="text-center flex flex-col items-center mt-6 md:mt-[90px] mb-0">
          <h2 className="font-rounded font-bold text-xl sm:text-2xl text-slate-700 tracking-wide">
            Examination Management Suite
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 font-rounded mt-1">
            Select a module below to launch the workflow shell
          </p>
        </div>

        {/* The 5 Cards Row matching 2.png */}
        <div className="w-full grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 sm:gap-5 lg:gap-6 justify-center items-stretch mt-6 md:mt-[100px]">
          {MODULES_DATA.map((module, index) => (
            <motion.div
              key={module.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: index * 0.08 }}
              whileHover={{
                scale: 1.035,
                y: -4,
                boxShadow: '0 20px 35px -8px rgba(0, 71, 171, 0.45)',
              }}
              whileTap={{ scale: 0.98 }}
              onClick={() => handleCardClick(module)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleCardClick(module);
                }
              }}
              className="group relative flex flex-col items-center justify-start text-center rounded-[24px] sm:rounded-[28px] p-6 sm:p-7 text-white cursor-pointer select-none transition-all duration-200 overflow-hidden min-h-[260px] sm:min-h-[290px] lg:min-h-[320px]"
              style={{
                background: 'linear-gradient(180deg, #4DD9E8 0%, #0047AB 100%)',
                boxShadow: '0 12px 28px -6px rgba(0, 71, 171, 0.35)',
              }}
            >
              {/* Top ambient highlight */}
              <div className="absolute inset-x-0 top-0 h-1/4 bg-white/10 opacity-70 group-hover:opacity-100 transition-opacity pointer-events-none" />

              {/* Card Title */}
              <h3 className="font-rounded font-bold text-xl sm:text-2xl text-white mb-4 sm:mb-5 tracking-wide drop-shadow-xs group-hover:text-white">
                {module.title}
              </h3>

              {/* Card Body Text */}
              <p className="font-rounded font-medium text-xs sm:text-sm lg:text-[14px] text-white/95 leading-relaxed flex-1 flex items-center justify-center px-1">
                {module.body}
              </p>

              {/* Subtle hover prompt at bottom of card */}
              <div className="mt-4 pt-3 border-t border-white/20 w-full flex items-center justify-center gap-1 text-[11px] font-rounded font-semibold text-white/80 group-hover:text-white transition-colors">
                <span>Click to open shell</span>
              </div>
            </motion.div>
          ))}
        </div>
      </main>

      {/* ════════ FLOATING TOAST NOTIFICATION ════════ */}
      {toastMessage && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          className="fixed bottom-24 left-1/2 -translate-x-1/2 z-40 bg-slate-900/90 text-white px-5 py-2.5 rounded-full shadow-2xl backdrop-blur-md flex items-center gap-2.5 border border-white/20 text-xs sm:text-sm font-rounded font-medium"
        >
          <CheckCircle2 className="w-4 h-4 text-[#4DD9E8]" />
          <span>{toastMessage}</span>
        </motion.div>
      )}

      {/* ════════ BOTTOM BANNER ════════ */}
      <footer className="relative w-full z-20 shrink-0">
        <div
          className="w-full h-16 sm:h-20 md:h-24 rounded-t-[24px] sm:rounded-t-[32px] md:rounded-t-[40px] shadow-lg relative overflow-hidden"
          style={{
            background: 'linear-gradient(90deg, #4DD9E8 0%, #0047AB 100%)',
          }}
        >
          {/* Decorative mirror bar */}
          <div className="absolute inset-x-0 bottom-0 h-1/3 bg-black/10 pointer-events-none" />
        </div>
      </footer>

      {/* Interactive Shell Modal */}
      <ModuleModal
        module={selectedModule}
        onClose={() => setSelectedModule(null)}
      />
    </div>
  );
};
