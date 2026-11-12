import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  CloudUpload,
  Download,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  Database,
  FileSpreadsheet,
  FileText,
  Users,
} from 'lucide-react';
import { paperStorage } from '../utils/paperStorage';
import { ExamPaper, StudentRecord } from '../data/mockPapers';
import { MarkingScheme } from '../data/mockMarkingSchemes';

interface DataMigrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMigrationComplete?: (counts: { papers: number; students: number; schemes: number }) => void;
  currentPapers?: ExamPaper[];
  currentStudents?: StudentRecord[];
  currentSchemes?: MarkingScheme[];
}

export const DataMigrationModal: React.FC<DataMigrationModalProps> = ({
  isOpen,
  onClose,
  onMigrationComplete,
  currentPapers = [],
  currentStudents = [],
  currentSchemes = [],
}) => {
  const [isImporting, setIsImporting] = useState(false);
  const [progressPercent, setProgressPercent] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [resultSummary, setResultSummary] = useState<{
    papers: number;
    students: number;
    schemes: number;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleStartImport = async () => {
    setIsImporting(true);
    setErrorMessage(null);
    setResultSummary(null);
    setProgressPercent(5);
    setStatusMessage('Reading local IndexedDB and localStorage caches...');

    try {
      const backup = await paperStorage.getLocalDataBackup();
      const papersToMigrate = backup.papers.length > 0 ? backup.papers : currentPapers;
      const studentsToMigrate = backup.students.length > 0 ? backup.students : currentStudents;
      const schemesToMigrate = backup.markingSchemes.length > 0 ? backup.markingSchemes : currentSchemes;

      const totalItems = papersToMigrate.length + studentsToMigrate.length + schemesToMigrate.length;
      let completedItems = 0;

      // 1. Upload students
      setStatusMessage(`Migrating ${studentsToMigrate.length} candidate students to Firestore...`);
      for (let i = 0; i < studentsToMigrate.length; i++) {
        await paperStorage.saveStudent(studentsToMigrate[i]);
        completedItems++;
        setProgressPercent(Math.round((completedItems / Math.max(1, totalItems)) * 95));
      }

      // 2. Upload marking schemes
      setStatusMessage(`Migrating ${schemesToMigrate.length} official marking schemes to Firestore...`);
      for (let i = 0; i < schemesToMigrate.length; i++) {
        await paperStorage.saveMarkingScheme(schemesToMigrate[i]);
        completedItems++;
        setProgressPercent(Math.round((completedItems / Math.max(1, totalItems)) * 95));
      }

      // 3. Upload papers with page images to Firebase Storage
      for (let i = 0; i < papersToMigrate.length; i++) {
        const p = papersToMigrate[i];
        setStatusMessage(
          `Uploading paper ${i + 1} of ${papersToMigrate.length} (${p.subject}) to Firestore & Storage...`
        );
        await paperStorage.savePaper(p);
        completedItems++;
        setProgressPercent(Math.round((completedItems / Math.max(1, totalItems)) * 95));
      }

      setProgressPercent(100);
      setStatusMessage('Cloud migration finished successfully!');
      const summary = {
        papers: papersToMigrate.length,
        students: studentsToMigrate.length,
        schemes: schemesToMigrate.length,
      };
      setResultSummary(summary);
      if (onMigrationComplete) {
        onMigrationComplete(summary);
      }
    } catch (err: any) {
      console.error('[Data Migration] Error:', err);
      setErrorMessage(err.message || 'An error occurred during data migration.');
    } finally {
      setIsImporting(false);
    }
  };

  const handleExportBackup = async () => {
    try {
      const backup = await paperStorage.getLocalDataBackup();
      const exportPayload = {
        app: 'PROJECT-001',
        exportedAt: new Date().toISOString(),
        papers: backup.papers.length > 0 ? backup.papers : currentPapers,
        students: backup.students.length > 0 ? backup.students : currentStudents,
        markingSchemes: backup.markingSchemes.length > 0 ? backup.markingSchemes : currentSchemes,
      };

      const jsonString = JSON.stringify(exportPayload, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `PROJECT001_Data_Backup_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('[Export Backup] Failed:', err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden"
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-5"
          style={{
            background: 'linear-gradient(90deg, #4DD9E8 0%, #0047AB 100%)',
          }}
        >
          <div className="flex items-center gap-3 text-white">
            <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center backdrop-blur-xs">
              <Database className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-rounded font-bold text-lg leading-tight">
                Cloud Sync & Data Migration
              </h3>
              <p className="text-xs text-white/80 font-rounded">
                Developer Tool • Firestore & Firebase Storage
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isImporting}
            className="text-white/80 hover:text-white p-1 rounded-full transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 flex flex-col gap-5">
          <p className="text-xs sm:text-sm text-slate-600 font-rounded">
            Migrate existing browser cache (IndexedDB and localStorage) to the persistent Google Cloud
            Firestore database and Firebase Storage buckets. Local cache is preserved without deletion.
          </p>

          {/* Quick Stats Grid */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-blue-50/70 border border-blue-100 rounded-2xl p-3 flex flex-col items-center text-center">
              <FileText className="w-4 h-4 text-[#0047AB] mb-1" />
              <span className="text-xs text-slate-500 font-rounded font-medium">Papers</span>
              <span className="font-bold text-slate-900 font-rounded text-base">
                {currentPapers.length}
              </span>
            </div>
            <div className="bg-teal-50/70 border border-teal-100 rounded-2xl p-3 flex flex-col items-center text-center">
              <Users className="w-4 h-4 text-teal-600 mb-1" />
              <span className="text-xs text-slate-500 font-rounded font-medium">Students</span>
              <span className="font-bold text-slate-900 font-rounded text-base">
                {currentStudents.length}
              </span>
            </div>
            <div className="bg-amber-50/70 border border-amber-100 rounded-2xl p-3 flex flex-col items-center text-center">
              <FileSpreadsheet className="w-4 h-4 text-amber-600 mb-1" />
              <span className="text-xs text-slate-500 font-rounded font-medium">Schemes</span>
              <span className="font-bold text-slate-900 font-rounded text-base">
                {currentSchemes.length}
              </span>
            </div>
          </div>

          {/* Progress bar if importing */}
          {isImporting && (
            <div className="flex flex-col gap-2 bg-slate-50 border border-slate-200 rounded-2xl p-4">
              <div className="flex items-center justify-between text-xs font-rounded font-semibold text-slate-700">
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 text-[#0047AB] animate-spin" />
                  <span>Migrating records...</span>
                </span>
                <span>{progressPercent}%</span>
              </div>
              <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[#4DD9E8] to-[#0047AB] transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <p className="text-[11px] text-slate-500 font-rounded truncate">{statusMessage}</p>
            </div>
          )}

          {/* Success Summary */}
          {resultSummary && (
            <div className="flex items-start gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-800">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div className="text-xs font-rounded">
                <p className="font-bold text-emerald-900 text-sm">Migration Complete!</p>
                <p className="mt-0.5">
                  Successfully stored <b>{resultSummary.papers}</b> papers,{' '}
                  <b>{resultSummary.students}</b> students, and <b>{resultSummary.schemes}</b> marking
                  schemes into Cloud Firestore. High-res page images uploaded to Firebase Storage.
                </p>
              </div>
            </div>
          )}

          {/* Error alert */}
          {errorMessage && (
            <div className="flex items-start gap-3 p-4 bg-rose-50 border border-rose-200 rounded-2xl text-rose-800">
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div className="text-xs font-rounded">
                <p className="font-bold text-rose-900">Migration Error</p>
                <p className="mt-0.5">{errorMessage}</p>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
            <button
              onClick={handleExportBackup}
              className="w-full sm:w-auto flex items-center justify-center gap-2 text-xs font-rounded font-bold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-4 py-2.5 rounded-full transition-all cursor-pointer shadow-xs active:scale-95"
            >
              <Download className="w-4 h-4 text-slate-500" />
              <span>Export backup (JSON)</span>
            </button>

            <button
              onClick={handleStartImport}
              disabled={isImporting}
              className="w-full sm:w-auto flex items-center justify-center gap-2 text-xs font-rounded font-bold text-white bg-gradient-to-r from-[#4DD9E8] to-[#0047AB] hover:opacity-95 px-5 py-2.5 rounded-full transition-all cursor-pointer shadow-md active:scale-95 disabled:opacity-50"
            >
              {isImporting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Migrating Data...</span>
                </>
              ) : (
                <>
                  <CloudUpload className="w-4 h-4" />
                  <span>Import my local data</span>
                </>
              )}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
