import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Loader2,
  CheckCircle2,
  AlertCircle,
  ChevronUp,
  ChevronDown,
  X,
  ArrowRight,
  Clock,
  Layers,
  FileCheck,
  Check,
  UserCheck,
} from 'lucide-react';
import { BackgroundGradingJob } from '../utils/asyncGradingPipeline';

interface BackgroundJobsTrayProps {
  jobs: BackgroundGradingJob[];
  onOpenEditingWithPaper?: (paperId: string) => void;
  onDismissJob?: (jobId: string) => void;
}

export const BackgroundJobsTray: React.FC<BackgroundJobsTrayProps> = ({
  jobs,
  onOpenEditingWithPaper,
  onDismissJob,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const activeJobs = jobs.filter((j) => j.status === 'queued' || j.status === 'extracting_cover' || j.status === 'grading');
  const completedJobs = jobs.filter((j) => j.status === 'completed' || j.status === 'failed');

  if (jobs.length === 0) return null;

  return (
    <aside aria-label="Background AI grading jobs" className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-2 max-w-sm sm:max-w-md w-full pointer-events-none select-none">
      <div className="w-full pointer-events-auto">
        <motion.div
          layout
          className="bg-slate-900/95 text-white backdrop-blur-md rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-700/80 overflow-hidden"
        >
          {/* Header Bar */}
          <div
            onClick={() => setIsExpanded((prev) => !prev)}
            className="p-3.5 sm:p-4 flex items-center justify-between cursor-pointer hover:bg-white/5 transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#4DD9E8] to-[#0047AB] flex items-center justify-center text-white shrink-0 shadow-xs">
                {activeJobs.length > 0 ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-emerald-300" />
                )}
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <h4 className="font-rounded font-bold text-xs sm:text-sm text-white">
                    Background AI Grading
                  </h4>
                  {activeJobs.length > 0 && (
                    <span className="bg-cyan-400/20 text-cyan-200 border border-cyan-400/30 text-[10px] font-rounded font-bold px-2 py-0.5 rounded-full animate-pulse">
                      {activeJobs.length} active
                    </span>
                  )}
                </div>
                <p className="text-[11px] font-rounded text-slate-400">
                  {activeJobs.length > 0
                    ? `Processing ${activeJobs[0].submissionId}...`
                    : `${completedJobs.length} recent submissions completed`}
                </p>
              </div>
            </div>

            <button className="text-slate-400 hover:text-white p-1 transition-colors">
              {isExpanded ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronUp className="w-4 h-4" />
              )}
            </button>
          </div>

          {/* Collapsed Active Progress Bar */}
          {!isExpanded && activeJobs.length > 0 && (
            <div className="px-4 pb-3">
              <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-gradient-to-r from-[#4DD9E8] to-[#0047AB]"
                  initial={{ width: '15%' }}
                  animate={{ width: `${activeJobs[0].progress}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>
            </div>
          )}

          {/* Expanded Drawer List */}
          <AnimatePresence>
            {isExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="border-t border-white/10 px-4 py-3 flex flex-col gap-2.5 max-h-72 overflow-y-auto"
              >
                {jobs.map((job) => (
                  <div
                    key={job.id}
                    className="p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 transition-all flex flex-col gap-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 overflow-hidden">
                        <span className="text-[11px] font-mono font-bold text-cyan-300">
                          {job.submissionId}
                        </span>
                        <span className="text-xs font-rounded font-bold text-white truncate">
                          {job.studentName}
                        </span>
                      </div>

                      {onDismissJob && job.status === 'completed' && (
                        <button
                          onClick={() => onDismissJob(job.id)}
                          className="text-slate-500 hover:text-slate-300 p-0.5"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    <div className="flex items-center justify-between text-[11px] font-rounded text-slate-400">
                      <span>
                        {job.subject} • {job.pageImages.length} pgs
                      </span>
                      <span className="flex items-center gap-1 font-semibold">
                        {job.status === 'extracting_cover' ? (
                          <span className="text-amber-300 flex items-center gap-1">
                            <Loader2 className="w-3 h-3 animate-spin" /> OCR Cover Matching
                          </span>
                        ) : job.status === 'grading' ? (
                          <span className="text-cyan-300 flex items-center gap-1">
                            <Loader2 className="w-3 h-3 animate-spin" /> AI Question Grading
                          </span>
                        ) : job.status === 'completed' ? (
                          <span className="text-emerald-300 flex items-center gap-1">
                            <Check className="w-3 h-3" /> {job.totalAIMarks}/{job.maxMarks} Marks
                          </span>
                        ) : (
                          <span className="text-rose-300 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" /> Failed
                          </span>
                        )}
                      </span>
                    </div>

                    {/* Progress Bar for In-flight Jobs */}
                    {job.status !== 'completed' && job.status !== 'failed' && (
                      <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                        <motion.div
                          className="h-full bg-gradient-to-r from-[#4DD9E8] to-[#0047AB]"
                          style={{ width: `${job.progress}%` }}
                        />
                      </div>
                    )}

                    {/* Quick Link to Paper in Editing Desk */}
                    {job.status === 'completed' && onOpenEditingWithPaper && (
                      <div className="pt-1 flex justify-end">
                        <button
                          onClick={() => onOpenEditingWithPaper(job.paperId)}
                          className="text-[11px] font-rounded font-bold text-cyan-300 hover:text-cyan-100 flex items-center gap-1 cursor-pointer transition-colors"
                        >
                          <span>Review in Editing Desk</span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </aside>
  );
};
