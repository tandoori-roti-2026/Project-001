import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft,
  Plus,
  Search,
  Filter,
  Users,
  UserCheck,
  UserX,
  ChevronDown,
  ArrowUpDown,
  BookOpen,
  Award,
  Calendar,
  ShieldCheck,
  CheckCircle2,
  Trash2,
  RotateCcw,
} from 'lucide-react';
import { StudentRecord, ExamPaper } from '../data/mockPapers';
import { UserAccount } from '../data/authUsers';
import { UserIdentityBadge } from './UserIdentityBadge';
import { StudentProfileView } from './StudentProfileView';
import { StudentModal } from './StudentModal';
import { GlobalShiftFilter, ShiftFilterType, matchesShiftFilter } from './GlobalShiftFilter';

interface StudentsDataScreenProps {
  currentUser?: UserAccount | null;
  students: StudentRecord[];
  papers: ExamPaper[];
  shiftFilter?: ShiftFilterType;
  onShiftFilterChange?: (shift: ShiftFilterType) => void;
  onAddStudent: (newStudent: StudentRecord) => void;
  onUpdateStudent: (updatedStudent: StudentRecord) => void;
  onDeleteStudent: (studentId: string) => void;
  onClearAllStudents?: () => void;
  onResetStudents?: () => void;
  onBackToMenu: () => void;
  onViewResultCard: (studentId: string) => void;
  onOpenEditing: () => void;
}

export const StudentsDataScreen: React.FC<StudentsDataScreenProps> = ({
  currentUser,
  students,
  papers,
  shiftFilter = 'morning',
  onShiftFilterChange,
  onAddStudent,
  onUpdateStudent,
  onDeleteStudent,
  onClearAllStudents,
  onResetStudents,
  onBackToMenu,
  onViewResultCard,
  onOpenEditing,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [clearStudentsConfirm, setClearStudentsConfirm] = useState(false);

  const handleClearStudentsConfirm = () => {
    if (onClearAllStudents) {
      onClearAllStudents();
      triggerToast('Cleared student candidate records.');
    }
    setClearStudentsConfirm(false);
  };
  const [selectedGroup, setSelectedGroup] = useState<string>('All');
  const [selectedClass, setSelectedClass] = useState<string>('All');
  const [sortBy, setSortBy] = useState<'name' | 'roll' | 'class'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [actionToast, setActionToast] = useState<string | null>(null);

  // Trigger toast
  const triggerToast = (msg: string) => {
    setActionToast(msg);
    setTimeout(() => {
      setActionToast((cur) => (cur === msg ? null : cur));
    }, 3000);
  };

  // Filter & Sort students
  const filteredStudents = useMemo(() => {
    return students
      .filter((student) => {

        const q = searchQuery.toLowerCase();
        const matchesQuery =
          student.fullName.toLowerCase().includes(q) ||
          student.rollNumber.toLowerCase().includes(q) ||
          (student.registrationNumber?.toLowerCase().includes(q) ?? false) ||
          (student.admissionNumber?.toLowerCase().includes(q) ?? false) ||
          student.subjectEnrolled.toLowerCase().includes(q) ||
          (student.enrolledSubjects?.some((s) => s.toLowerCase().includes(q)) ?? false);

        const matchesGroup =
          selectedGroup === 'All' || student.group === selectedGroup;

        const matchesClass =
          selectedClass === 'All' || student.classGrade === selectedClass;

        return matchesQuery && matchesGroup && matchesClass;
      })
      .sort((a, b) => {
        let comparison = 0;
        if (sortBy === 'name') {
          comparison = a.fullName.localeCompare(b.fullName);
        } else if (sortBy === 'roll') {
          comparison = a.rollNumber.localeCompare(b.rollNumber);
        } else if (sortBy === 'class') {
          comparison = (a.classGrade || '').localeCompare(b.classGrade || '');
        }
        return sortOrder === 'asc' ? comparison : -comparison;
      });
  }, [students, searchQuery, selectedGroup, selectedClass, sortBy, sortOrder]);

  const activeStudent = useMemo(() => {
    if (!selectedStudentId) return null;
    return students.find((s) => s.id === selectedStudentId) || null;
  }, [students, selectedStudentId]);

  const activePaper = useMemo(() => {
    if (!activeStudent) return undefined;
    return papers.find((p) => p.studentId === activeStudent.id);
  }, [papers, activeStudent]);

  return (
    <div className="relative w-full min-h-screen bg-slate-50 text-slate-800 flex flex-col justify-between select-none">
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

          {/* Left / Row 1: Back to Menu & Mode Badge + Mobile Add button */}
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

            {/* Mobile Add New Student Button */}
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="flex md:hidden items-center gap-1.5 text-xs font-rounded font-bold text-[#0047AB] bg-white hover:bg-white/90 shadow-md px-3 py-1.5 rounded-full transition-all cursor-pointer active:scale-95 shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Add</span>
            </button>
          </div>

          {/* Center / Row 2: Branding Title */}
          <div className="static md:absolute md:left-1/2 md:-translate-x-1/2 md:top-1/2 md:-translate-y-1/2 flex flex-col items-center text-center z-10 pointer-events-none">
            <h1 className="font-rounded font-bold text-xl sm:text-2xl md:text-3xl text-white tracking-widest uppercase drop-shadow-md">
              PROJECT-001
            </h1>
            <span className="text-[11px] sm:text-xs font-rounded text-white/90 font-medium tracking-wide">
              Master Academic Student Registry
            </span>
          </div>

          {/* Right: + Add New Student Button (Desktop) */}
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="hidden md:flex items-center gap-1.5 text-xs sm:text-sm font-rounded font-bold text-[#0047AB] bg-white hover:bg-white/90 shadow-md px-3.5 sm:px-4 py-2 rounded-full transition-all cursor-pointer active:scale-95 z-10"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Add New Student</span>
            <span className="sm:hidden">Add</span>
          </button>
        </div>
      </header>

      {/* ════════ MAIN WORKSPACE ════════ */}
      <main className="flex-1 flex flex-col p-4 sm:p-6 lg:p-8 pb-24 md:pb-8 max-w-[1580px] w-full mx-auto">
        {activeStudent ? (
          /* ──────── DETAIL STUDENT PROFILE VIEW ──────── */
          <StudentProfileView
            student={activeStudent}
            associatedPaper={activePaper}
            onBackToList={() => setSelectedStudentId(null)}
            onUpdateStudent={(updated) => {
              onUpdateStudent(updated);
              triggerToast(`Updated profile for ${updated.fullName}`);
            }}
            onDeleteStudent={(id) => {
              onDeleteStudent(id);
              triggerToast('Student record deleted successfully');
            }}
            onViewResultCard={onViewResultCard}
            onOpenEditing={onOpenEditing}
          />
        ) : (
          /* ──────── MASTER TABLE & SEARCH / FILTER ──────── */
          <div className="flex flex-col gap-6">
            {/* Filter and Search Bar Card */}
            <div className="bg-white rounded-[24px] p-6 shadow-sm border border-slate-200/80 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-teal-50 flex items-center justify-center text-[#0047AB]">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-rounded font-bold text-2xl text-slate-900">
                      Students Registry
                    </h2>
                    {onClearAllStudents && (
                      <button
                        onClick={() => setClearStudentsConfirm(true)}
                        className="flex items-center gap-1 text-[11px] font-rounded font-bold text-rose-700 hover:text-rose-900 bg-rose-50 hover:bg-rose-100 border border-rose-200 px-2.5 py-1 rounded-full transition-all cursor-pointer"
                        title="Wipe out pre-populated candidates to test with real uploads"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>Clear Extracted / Mock Students</span>
                      </button>
                    )}
                    {onResetStudents && students.length === 0 && (
                      <button
                        onClick={() => {
                          onResetStudents();
                          triggerToast('Restored default candidate database.');
                        }}
                        className="flex items-center gap-1 text-[11px] font-rounded font-bold text-[#0047AB] bg-blue-50 hover:bg-blue-100 border border-blue-200 px-2.5 py-1 rounded-full transition-all cursor-pointer"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Restore Default Students</span>
                      </button>
                    )}
                  </div>
                  <p className="text-xs sm:text-sm font-rounded text-slate-400 mt-0.5">
                    Master student records ({students.length} total, {students.filter((s) => s.enrollmentStatus === 'Active').length} active)
                  </p>
                </div>
              </div>

              {/* Filters & Search Inputs */}
              <div className="flex flex-wrap items-center gap-3">
                {/* Search Input */}
                <div className="relative flex-1 sm:w-64 md:w-72">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search name, roll, reg ID..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-slate-100 focus:bg-white text-slate-800 font-rounded text-xs sm:text-sm rounded-full pl-10 pr-4 py-2 outline-none border border-transparent focus:border-[#4DD9E8] transition-all"
                  />
                </div>

                {/* Group Filter */}
                <select
                  value={selectedGroup}
                  onChange={(e) => setSelectedGroup(e.target.value)}
                  className="bg-slate-100 text-slate-700 text-xs font-rounded font-semibold px-3 py-2 rounded-full border border-slate-200 outline-none"
                >
                  <option value="All">All Groups</option>
                  <option value="Pre-Engineering">Pre-Engineering</option>
                  <option value="Pre-Medical">Pre-Medical</option>
                  <option value="Computer Science">Computer Science</option>
                </select>

                {/* Class Filter */}
                <select
                  value={selectedClass}
                  onChange={(e) => setSelectedClass(e.target.value)}
                  className="bg-slate-100 text-slate-700 text-xs font-rounded font-semibold px-3 py-2 rounded-full border border-slate-200 outline-none"
                >
                  <option value="All">All Grades</option>
                  <option value="Grade 12">Grade 12</option>
                  <option value="Grade 11">Grade 11</option>
                </select>

                {/* Sort Toggle */}
                <button
                  onClick={() => setSortOrder((cur) => (cur === 'asc' ? 'desc' : 'asc'))}
                  className="p-2 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors cursor-pointer"
                  title={`Sort order: ${sortOrder === 'asc' ? 'Ascending' : 'Descending'}`}
                >
                  <ArrowUpDown className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* ──────── DESKTOP TABLE VIEW (hidden on small screens) ──────── */}
            <div className="hidden md:block bg-white rounded-[24px] shadow-sm border border-slate-200/80 overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-rounded font-bold uppercase tracking-wider text-slate-400">
                    <th className="py-4 px-6">Student</th>
                    <th
                      className="py-4 px-4 cursor-pointer hover:text-slate-700 transition-colors"
                      onClick={() => setSortBy('roll')}
                    >
                      <span className="flex items-center gap-1">
                        <span>Roll Number</span>
                        {sortBy === 'roll' && <span className="text-[#0047AB]">•</span>}
                      </span>
                    </th>
                    <th
                      className="py-4 px-4 cursor-pointer hover:text-slate-700 transition-colors"
                      onClick={() => setSortBy('class')}
                    >
                      Class & Section
                    </th>
                    <th className="py-4 px-4">Academic Group</th>
                    <th className="py-4 px-4">Enrolled Subjects</th>
                    <th className="py-4 px-4 text-center">Status</th>
                    <th className="py-4 px-6 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-rounded text-sm">
                  {filteredStudents.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-400 font-rounded">
                        No students found matching your criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredStudents.map((student) => {
                      const initials = student.fullName
                        .split(' ')
                        .filter(Boolean)
                        .slice(0, 2)
                        .map((w) => w[0].toUpperCase())
                        .join('');

                      return (
                        <tr
                          key={student.id}
                          onClick={() => setSelectedStudentId(student.id)}
                          className="hover:bg-slate-50/80 transition-colors cursor-pointer group"
                        >
                          {/* Photo Avatar & Name */}
                          <td className="py-4 px-6">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-slate-200 border-2 border-slate-100 flex items-center justify-center text-slate-600 font-bold text-xs shrink-0 shadow-2xs group-hover:bg-[#4DD9E8]/20 group-hover:text-[#0047AB] transition-colors">
                                {initials || 'ST'}
                              </div>
                              <div>
                                <strong className="text-slate-900 font-bold block text-sm group-hover:text-[#0047AB] transition-colors">
                                  {student.fullName}
                                </strong>
                                <span className="text-xs text-slate-400 font-normal">
                                  S/O {student.fatherName}
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* Roll Number */}
                          <td className="py-4 px-4 font-mono font-semibold text-slate-700 text-xs">
                            {student.rollNumber}
                          </td>

                          {/* Class / Section */}
                          <td className="py-4 px-4 text-slate-700">
                            {student.classGrade || 'HSSC'}{student.section ? ` - ${student.section}` : ''}
                          </td>

                          {/* Group */}
                          <td className="py-4 px-4">
                            <span className="text-xs bg-blue-50 text-[#0047AB] border border-blue-200/60 font-semibold px-2.5 py-1 rounded-full">
                              {student.group || 'Pre-Engineering'}
                            </span>
                          </td>

                          {/* Subject List & Summary */}
                          <td className="py-4 px-4 text-slate-700">
                            {student.enrolledSubjects && student.enrolledSubjects.length > 0 ? (
                              <div className="flex flex-col gap-1 max-w-[340px]">
                                <div className="flex flex-wrap gap-1 items-center">
                                  {student.enrolledSubjects.slice(0, 3).map((subj, idx) => (
                                    <span
                                      key={idx}
                                      className="text-[11px] font-semibold bg-blue-50 text-[#0047AB] px-2 py-0.5 rounded-md border border-blue-200/60"
                                    >
                                      {subj}
                                    </span>
                                  ))}
                                  {student.enrolledSubjects.length > 3 && (
                                    <span
                                      className="text-[10px] font-bold bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-md border border-slate-200 cursor-help"
                                      title={student.enrolledSubjects.slice(3).join(', ')}
                                    >
                                      +{student.enrolledSubjects.length - 3} more
                                    </span>
                                  )}
                                </div>
                                <p
                                  className="text-[10px] text-slate-400 font-mono truncate max-w-[280px]"
                                  title={student.enrolledSubjects.join(' • ')}
                                >
                                  {student.enrolledSubjects.join(' • ')}
                                </p>
                              </div>
                            ) : (
                              <span className="font-semibold text-xs text-[#0047AB] bg-blue-50 px-2.5 py-1 rounded-md border border-blue-100">
                                {student.subjectEnrolled}
                              </span>
                            )}
                          </td>

                          {/* Status Badge */}
                          <td className="py-4 px-4 text-center">
                            <span
                              className={`text-[11px] font-bold px-3 py-1 rounded-full ${
                                student.enrollmentStatus === 'Active'
                                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                  : 'bg-slate-200 text-slate-600 border border-slate-300'
                              }`}
                            >
                              {student.enrollmentStatus}
                            </span>
                          </td>

                          {/* Action Button */}
                          <td className="py-4 px-6 text-right">
                            <span className="text-xs font-bold text-[#0047AB] group-hover:underline underline-offset-2">
                              View Profile →
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* ──────── MOBILE CARD LIST (visible on mobile only) ──────── */}
            <div className="grid grid-cols-1 gap-4 md:hidden">
              {filteredStudents.length === 0 ? (
                <div className="bg-white rounded-[24px] p-8 text-center text-slate-400 font-rounded border border-slate-200">
                  No students found.
                </div>
              ) : (
                filteredStudents.map((student) => {
                  const initials = student.fullName
                    .split(' ')
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((w) => w[0].toUpperCase())
                    .join('');

                  return (
                    <div
                      key={student.id}
                      onClick={() => setSelectedStudentId(student.id)}
                      className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex flex-col gap-3 cursor-pointer active:scale-99 transition-all"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-11 h-11 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 font-bold text-sm shrink-0">
                            {initials || 'ST'}
                          </div>
                          <div>
                            <h3 className="font-rounded font-bold text-base text-slate-900">
                              {student.fullName}
                            </h3>
                            <span className="text-xs text-slate-400 font-rounded">
                              {student.rollNumber}
                            </span>
                          </div>
                        </div>

                        <span
                          className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                            student.enrollmentStatus === 'Active'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-slate-200 text-slate-600'
                          }`}
                        >
                          {student.enrollmentStatus}
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-1.5 text-xs font-rounded text-slate-600 pt-1">
                        {student.classGrade && (
                          <span className="bg-slate-100 px-2 py-0.5 rounded-md text-[11px]">
                            {student.classGrade}{student.section ? `-${student.section}` : ''}
                          </span>
                        )}
                        <span className="bg-blue-50 text-[#0047AB] px-2 py-0.5 rounded-md font-semibold text-[11px] border border-blue-100">
                          {student.group || 'Pre-Engineering'}
                        </span>
                        {student.enrolledSubjects && student.enrolledSubjects.length > 0 ? (
                          student.enrolledSubjects.map((s, idx) => (
                            <span key={idx} className="bg-teal-50 text-teal-800 px-2 py-0.5 rounded-md text-[11px] border border-teal-100">
                              {s}
                            </span>
                          ))
                        ) : (
                          <span className="bg-teal-50 text-teal-800 px-2 py-0.5 rounded-md text-[11px]">
                            {student.subjectEnrolled}
                          </span>
                        )}
                      </div>

                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs font-rounded font-bold text-[#0047AB]">
                        <span>Click to view profile</span>
                        <span>→</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </main>

      {/* ──── Add New Student Modal ──── */}
      <StudentModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSave={(newStudent) => {
          onAddStudent(newStudent);
          triggerToast(`Added student: ${newStudent.fullName}`);
        }}
        mode="add"
      />

      {/* ──── Toast Notification ──── */}
      <AnimatePresence>
        {actionToast && (
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 30 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 bg-slate-900/95 text-white px-6 py-3 rounded-full shadow-2xl backdrop-blur-md flex items-center gap-3 border border-white/20 text-xs sm:text-sm font-rounded font-semibold"
          >
            <CheckCircle2 className="w-5 h-5 text-[#4DD9E8]" />
            <span>{actionToast}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ════════ BOTTOM BANNER ════════ */}
      <footer className="relative w-full z-20 shrink-0 mt-8">
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
      {/* ════════ CLEAR STUDENTS CONFIRMATION MODAL ════════ */}
      <AnimatePresence>
        {clearStudentsConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
            onClick={() => setClearStudentsConfirm(false)}
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
                    Clear Students Registry
                  </h3>
                  <p className="text-xs font-rounded text-slate-500">
                    Confirm registry wipe
                  </p>
                </div>
              </div>

              <div className="text-sm font-rounded text-slate-700 leading-relaxed">
                <p>
                  Are you sure you want to clear all student candidate records? This action is permanent and allows testing with clean real uploads.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setClearStudentsConfirm(false)}
                  className="px-4 py-2 rounded-xl text-xs font-rounded font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleClearStudentsConfirm}
                  className="px-4 py-2 rounded-xl text-xs font-rounded font-bold text-white bg-rose-600 hover:bg-rose-700 active:scale-95 transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clear All</span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
