import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft,
  Search,
  Award,
  Lock,
  FileCheck,
  CheckCircle2,
  Clock,
  BookOpen,
  User,
  GraduationCap,
  ExternalLink,
  Printer,
  SlidersHorizontal,
  Trash2,
  Download,
  FileSpreadsheet,
  Loader2,
} from 'lucide-react';
import { ExamPaper, StudentRecord } from '../data/mockPapers';
import { UserAccount } from '../data/authUsers';
import { UserIdentityBadge } from './UserIdentityBadge';
import {
  StudentAcademicRecord,
  formatAcademicRecords,
  calculateFbiseGrade,
} from '../utils/gradeCalculations';
import { ResultCardView } from './ResultCardView';
import { generateResultCardPDF } from '../utils/pdfExport';
import { jsPDF } from 'jspdf';
import { ShiftFilterType } from './GlobalShiftFilter';

interface ResultCardsScreenProps {
  currentUser?: UserAccount | null;
  papers: ExamPaper[];
  students: StudentRecord[];
  shiftFilter?: ShiftFilterType;
  onShiftFilterChange?: (shift: ShiftFilterType) => void;
  initialStudentId?: string | null;
  onBackToMenu: () => void;
  onOpenEditing: () => void;
  onOpenUploading?: () => void;
  onDeletePaper?: (paperId: string) => void;
}

export const ResultCardsScreen: React.FC<ResultCardsScreenProps> = ({
  currentUser,
  papers,
  students,
  initialStudentId,
  onBackToMenu,
  onOpenEditing,
  onOpenUploading,
  onDeletePaper,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [exportingPaperId, setExportingPaperId] = useState<string | null>(null);

  const handleExportAllStudentsPDF = async (records: StudentAcademicRecord[]) => {
    try {
      setExportingPaperId('all');

      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      records.forEach((record, index) => {
        if (index > 0) {
          doc.addPage();
        }
        generateResultCardPDF(doc, record);
      });

      const fileName = `FBISE_ResultCards_All_${new Date().toISOString().slice(0, 10)}.pdf`;
      doc.save(fileName);
    } catch (err) {
      console.error('Error generating all students PDF:', err);
    } finally {
      setExportingPaperId(null);
    }
  };


  // Format student records from the shared students and papers state
  const records: StudentAcademicRecord[] = useMemo(() => {
    return formatAcademicRecords(students, papers);
  }, [students, papers]);

  // Set selectedRecordId initially if navigated from Student Profile
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(() => {
    if (initialStudentId) {
      const match = records.find((r) => r.studentId === initialStudentId);
      return match ? match.paperId : null;
    }
    return null;
  });

  // Filter records based on user search across all students (no shift restriction)
  const filteredRecords = useMemo(() => {
    return records.filter((rec) => {
      const q = searchQuery.toLowerCase().trim();
      if (!q) return true;
      return (
        rec.studentName.toLowerCase().includes(q) ||
        rec.rollNumber.toLowerCase().includes(q) ||
        rec.registrationNumber.toLowerCase().includes(q) ||
        rec.subjects.some((s) => s.subject.toLowerCase().includes(q))
      );
    });
  }, [records, searchQuery]);

  // Export current list to CSV
  const handleExportCSV = () => {
    if (filteredRecords.length === 0) return;

    const headers = [
      'Roll Number',
      'Student Name',
      'Father Name',
      'Registration No',
      'Class/Grade',
      'Group',
      'Institution',
      'Subjects',
      'Total Marks Obtained',
      'Total Max Marks',
      'Percentage (%)',
      'Grade (FBISE)',
      'CGPA (5.0)',
      'Status',
    ];

    const rows = filteredRecords.map((r) => {
      const subjectsStr = r.subjects.map((s) => `${s.subject}: ${s.marksObtained ?? '-'}/${s.maxMarks ?? 100}`).join('; ');
      return [
        `"${r.rollNumber || ''}"`,
        `"${r.studentName.replace(/"/g, '""')}"`,
        `"${r.fatherName.replace(/"/g, '""')}"`,
        `"${r.registrationNumber || ''}"`,
        `"${r.classGrade || 'HSSC-I'}"`,
        `"${r.group || 'Pre-Engineering'}"`,
        `"${(r.institutionName || 'FBISE Affiliated College').replace(/"/g, '""')}"`,
        `"${subjectsStr.replace(/"/g, '""')}"`,
        r.totalMarksObtained,
        r.totalMaxMarks,
        r.overallPercentage,
        `"${r.overallGrade}"`,
        r.cgpa.toFixed(2),
        `"${r.status}"`,
      ].join(',');
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `FBISE_Results_Record_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export current list to PDF (print report)
  const handleExportPDF = () => {
    window.print();
  };

  // Currently inspected record for full view
  const activeRecord = useMemo(() => {
    if (!selectedRecordId) return null;
    return records.find((r) => r.paperId === selectedRecordId) || null;
  }, [records, selectedRecordId]);

  const [paperDeleteConfirm, setPaperDeleteConfirm] = useState<{
    isOpen: boolean;
    paperId?: string;
    studentName?: string;
  } | null>(null);

  const handleDeletePaperConfirm = () => {
    if (paperDeleteConfirm?.paperId && onDeletePaper) {
      onDeletePaper(paperDeleteConfirm.paperId);
    }
    setPaperDeleteConfirm(null);
  };

  return (
    <div className="relative w-full min-h-screen bg-slate-50 text-slate-800 flex flex-col justify-between select-none">
      {/* ════════ TOP BANNER (Screen 2 / Editing style) ════════ */}
      <header className="relative w-full z-20 shrink-0 print:hidden">
        <div
          className="w-full h-auto py-3 sm:py-4 md:h-28 md:py-0 rounded-b-[24px] sm:rounded-b-[32px] md:rounded-b-[40px] flex flex-col md:flex-row items-center justify-between px-4 sm:px-8 shadow-md relative overflow-hidden gap-3 md:gap-0"
          style={{
            background: 'linear-gradient(90deg, #4DD9E8 0%, #0047AB 100%)',
          }}
        >
          {/* Subtle Top Gloss Accent */}
          <div className="absolute inset-x-0 top-0 h-1/3 bg-white/10 pointer-events-none" />

          {/* Left / Row 1: Back to Menu & Mode Badge */}
          <div className="flex items-center justify-between w-full md:w-auto gap-3 z-10">
            <div className="flex items-center gap-3">
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

            {/* Mobile Status Counts */}
            <div className="flex md:hidden items-center gap-1.5 z-10">
              <span className="text-xs font-rounded font-semibold text-white/80">
                Verified:
              </span>
              <span className="bg-white/20 text-white text-xs font-rounded font-bold px-2 py-0.5 rounded-full">
                {records.filter((r) => r.status === 'Reviewed').length}/{records.length}
              </span>
            </div>
          </div>

          {/* Center / Row 2: Branding Title */}
          <div className="static md:absolute md:left-1/2 md:-translate-x-1/2 md:top-1/2 md:-translate-y-1/2 flex flex-col items-center text-center z-10 pointer-events-none">
            <h1 className="font-rounded font-bold text-xl sm:text-2xl md:text-3xl text-white tracking-widest uppercase drop-shadow-md">
              PROJECT-001
            </h1>
            <span className="text-[11px] sm:text-xs font-rounded text-white/90 font-medium tracking-wide">
              FBISE 10-Point Result Cards & DMC Generator
            </span>
          </div>

          {/* Right: Status Counts (Desktop) */}
          <div className="hidden md:flex items-center gap-2 z-10">
            <span className="text-xs font-rounded font-semibold text-white/80">
              Verified Cards:
            </span>
            <span className="bg-white/20 text-white text-xs font-rounded font-bold px-2.5 py-1 rounded-full">
              {records.filter((r) => r.status === 'Reviewed').length}/{records.length}
            </span>
          </div>
        </div>
      </header>

      {/* ════════ MAIN CONTENT AREA ════════ */}
      <main className="flex-1 flex flex-col p-4 sm:p-6 lg:p-8 pb-24 md:pb-8 max-w-[1580px] w-full mx-auto">
        {activeRecord ? (
          /* ──────── SINGLE RESULT CARD FULL VIEW / DMC GENERATOR ──────── */
          <ResultCardView
            record={activeRecord}
            currentUser={currentUser}
            onBackToList={() => setSelectedRecordId(null)}
          />
        ) : (
          /* ──────── STUDENT CARDS GRID/LIST ──────── */
          <div className="flex flex-col gap-6">
            {/* Header Title & Search/Filter/Export Bar */}
            <div className="bg-white rounded-[24px] p-6 shadow-sm border border-slate-200/80 flex flex-col lg:flex-row items-center justify-between gap-4 print:hidden">
              <div>
                <h2 className="font-rounded font-bold text-2xl text-slate-900 flex items-center gap-2">
                  <Award className="w-6 h-6 text-[#0047AB]" />
                  <span>FBISE Result Cards & DMCs</span>
                </h2>
                <p className="text-xs sm:text-sm font-rounded text-slate-400 mt-0.5">
                  Official certified grade reports & 5.0 GPA transcripts. Papers marked "Reviewed" by examiners are unlocked for DMC printing.
                </p>
              </div>

              {/* Actions: Search + Export Buttons */}
              <div className="flex flex-col sm:flex-row items-center gap-3 w-full lg:w-auto">
                {/* Search Bar */}
                <div className="relative w-full sm:w-72 md:w-80">
                  <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search candidate, roll #..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-slate-100 focus:bg-white text-slate-800 font-rounded text-sm rounded-full pl-11 pr-4 py-2.5 outline-none border border-transparent focus:border-[#4DD9E8] transition-all placeholder:text-slate-400"
                  />
                </div>

                {/* Export CSV / Export PDF Buttons for School Records */}
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleExportCSV}
                    disabled={filteredRecords.length === 0}
                    className="flex items-center gap-1.5 text-xs font-rounded font-semibold text-slate-700 hover:text-[#0047AB] bg-slate-100 hover:bg-slate-200 px-3.5 py-2.5 rounded-full border border-slate-200 transition-all cursor-pointer shadow-xs disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Export list as CSV file for school records"
                  >
                    <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                    <span>Export CSV</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (filteredRecords.length > 0) {
                        handleExportAllStudentsPDF(filteredRecords);
                      }
                    }}
                    disabled={filteredRecords.length === 0 || exportingPaperId === 'all'}
                    className="flex items-center gap-1.5 text-xs font-rounded font-semibold text-slate-700 hover:text-[#0047AB] bg-slate-100 hover:bg-slate-200 px-3.5 py-2.5 rounded-full border border-slate-200 transition-all cursor-pointer shadow-xs disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Export list as PDF file"
                  >
                    {exportingPaperId === 'all' ? (
                      <Loader2 className="w-4 h-4 animate-spin text-[#0047AB]" />
                    ) : (
                      <Download className="w-4 h-4 text-[#0047AB]" />
                    )}
                    <span>{exportingPaperId === 'all' ? 'Generating PDF...' : 'Download PDF (All)'}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Grid of Student Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredRecords.length === 0 ? (
                <div className="col-span-full bg-white rounded-[28px] p-12 sm:p-16 text-center font-rounded border border-slate-200/80 shadow-xs flex flex-col items-center justify-center">
                  <div
                    className="w-16 h-16 rounded-2xl flex items-center justify-center text-white mb-4 shadow-md"
                    style={{
                      background: 'linear-gradient(135deg, #4DD9E8 0%, #0047AB 100%)',
                    }}
                  >
                    <Award className="w-8 h-8" />
                  </div>
                  <h3 className="text-lg sm:text-xl font-bold text-slate-800 mb-1">
                    {searchQuery ? 'No Matching Records' : 'No Result Cards Available Yet'}
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-400 max-w-md mb-6 leading-relaxed">
                    {searchQuery
                      ? `No student records match "${searchQuery}". Try searching by roll number or candidate name.`
                      : 'Mock student exam records have been cleared. Upload answer scripts in the Uploading module and verify marks in the Grading Studio to generate official FBISE DMCs.'}
                  </p>
                  {onOpenUploading && !searchQuery && (
                    <button
                      type="button"
                      onClick={onOpenUploading}
                      className="flex items-center gap-2 text-xs sm:text-sm font-rounded font-bold text-white bg-gradient-to-r from-[#4DD9E8] to-[#0047AB] px-6 py-3 rounded-full shadow-md hover:shadow-lg transition-all cursor-pointer active:scale-95"
                    >
                      <span>Go to Uploading Desk</span>
                      <span>→</span>
                    </button>
                  )}
                </div>
              ) : (
                filteredRecords.map((record, index) => {
                  const isReviewed = record.status === 'Reviewed';

                  return (
                    <motion.div
                      key={record.paperId}
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.35, delay: index * 0.05 }}
                      className={`relative flex flex-col justify-between rounded-[24px] p-6 transition-all duration-200 border ${
                        isReviewed
                          ? 'bg-white hover:bg-slate-50/80 border-slate-200/90 shadow-md hover:shadow-xl'
                          : 'bg-slate-100/90 border-slate-200/80 opacity-90'
                      }`}
                    >
                      {/* Top Row: Name and Status Badge */}
                      <div>
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div>
                            <h3 className="font-rounded font-bold text-xl text-slate-900">
                              {record.studentName}
                            </h3>
                            <span className="text-xs font-rounded text-slate-500 block">
                              S/O {record.fatherName}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {/* Status Badge */}
                            {isReviewed ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-rounded font-bold text-emerald-800 bg-emerald-100 border border-emerald-300 px-2.5 py-0.5 rounded-full shrink-0">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Reviewed</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] font-rounded font-bold text-amber-800 bg-amber-100 border border-amber-300 px-2.5 py-0.5 rounded-full shrink-0">
                                <Clock className="w-3.5 h-3.5" />
                                <span>Pending Review</span>
                              </span>
                            )}

                            {onDeletePaper && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setPaperDeleteConfirm({
                                    isOpen: true,
                                    paperId: record.paperId || record.studentId,
                                    studentName: record.studentName,
                                  });
                                }}
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                title="Delete this paper"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Student Meta Details */}
                        <div className="grid grid-cols-2 gap-2 text-xs font-rounded text-slate-600 bg-slate-50 rounded-xl p-3 my-3 border border-slate-100">
                          <div>
                            <span className="text-[10px] uppercase font-bold text-slate-400 block">
                              Roll Number
                            </span>
                            <span className="font-mono font-semibold text-slate-800">
                              {record.rollNumber}
                            </span>
                          </div>

                          <div>
                            <span className="text-[10px] uppercase font-bold text-slate-400 block">
                              Class / Grade
                            </span>
                            <span className="font-semibold text-slate-800">
                              {record.classGrade}
                            </span>
                          </div>

                          <div className="col-span-2">
                            <span className="text-[10px] uppercase font-bold text-slate-400 block">
                              Subject(s)
                            </span>
                            <span className="font-semibold text-slate-800 line-clamp-1">
                              {record.subjects.map((s) => s.subject).join(', ')}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Middle: FBISE 10-Point Score & GPA Summary */}
                      <div className="my-2">
                        {isReviewed ? (
                          <div className="flex items-center justify-between p-3 rounded-xl bg-gradient-to-r from-teal-50 to-blue-50 border border-[#4DD9E8]/30">
                            <div>
                              <span className="text-[10px] font-rounded font-semibold text-slate-500 uppercase tracking-wider block">
                                Cumulative GPA (5.0)
                              </span>
                              <div className="flex items-baseline gap-1">
                                <span className="text-xl font-rounded font-bold text-[#0047AB]">
                                  {record.cgpa.toFixed(2)}
                                </span>
                                <span className="text-[11px] font-rounded text-slate-500">
                                  / 5.00
                                </span>
                              </div>
                            </div>

                            <div className="text-right">
                              <span className="text-[10px] font-rounded font-semibold text-slate-500 uppercase tracking-wider block">
                                FBISE Grade
                              </span>
                              <span className="text-sm font-rounded font-bold text-emerald-800 bg-white px-2.5 py-0.5 rounded-md border border-emerald-200 inline-block">
                                Grade {record.overallGrade} ({record.overallPercentage}%)
                              </span>
                            </div>
                          </div>
                        ) : (
                          /* Locked State for Pending Review */
                          <div className="p-3 rounded-xl bg-amber-50/80 border border-amber-200/80 text-amber-900 flex items-start gap-2">
                            <Lock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                            <div className="text-xs font-rounded leading-snug">
                              <strong className="block text-amber-950 font-bold mb-0.5">
                                DMC Pending Examiner Review
                              </strong>
                              Complete scoring verification in the Editing desk to unlock official FBISE certificate.
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Bottom Button Action */}
                      <div className="mt-4 pt-3 border-t border-slate-200/70 print:hidden">
                        {isReviewed ? (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setSelectedRecordId(record.paperId)}
                              className="flex-1 flex items-center justify-center gap-1.5 bg-gradient-to-r from-[#4DD9E8] to-[#0047AB] hover:opacity-95 text-white font-rounded font-bold text-xs sm:text-sm py-2.5 px-3 rounded-xl shadow-md hover:shadow-lg active:scale-[0.98] transition-all cursor-pointer"
                              title="View full official FBISE DMC transcript"
                            >
                              <Printer className="w-4 h-4" />
                              <span>View / Print DMC</span>
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={onOpenEditing}
                            className="w-full flex items-center justify-center gap-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-rounded font-semibold text-xs py-2.5 px-4 rounded-xl transition-all cursor-pointer"
                            title="Go to Editing module to finalize this paper"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            <span>Open in Grading Desk</span>
                          </button>
                        )}
                      </div>
                    </motion.div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </main>

      {/* ════════ BOTTOM BANNER ════════ */}
      <footer className="relative w-full z-20 shrink-0 mt-8 print:hidden">
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
    </div>
  );
};
