import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  ArrowLeft,
  UserCheck,
  UserX,
  Edit3,
  Trash2,
  Calendar,
  Building,
  School,
  Mail,
  Phone,
  Hash,
  BookOpen,
  Award,
  Layers,
  ShieldCheck,
  Clock,
  ExternalLink,
  AlertCircle,
} from 'lucide-react';
import { StudentRecord, ExamPaper } from '../data/mockPapers';
import { StudentModal } from './StudentModal';

interface StudentProfileViewProps {
  student: StudentRecord;
  associatedPaper?: ExamPaper;
  onBackToList: () => void;
  onUpdateStudent: (updatedStudent: StudentRecord) => void;
  onDeleteStudent: (studentId: string) => void;
  onViewResultCard: (studentId: string) => void;
  onOpenEditing: () => void;
}

export const StudentProfileView: React.FC<StudentProfileViewProps> = ({
  student,
  associatedPaper,
  onBackToList,
  onUpdateStudent,
  onDeleteStudent,
  onViewResultCard,
  onOpenEditing,
}) => {
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);

  // Compute 2-letter initials for avatar
  const initials = student.fullName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');

  // Toggle active/inactive status
  const handleToggleStatus = () => {
    const updated: StudentRecord = {
      ...student,
      enrollmentStatus: student.enrollmentStatus === 'Active' ? 'Inactive' : 'Active',
    };
    onUpdateStudent(updated);
  };

  const isReviewed = associatedPaper?.status === 'Reviewed';

  return (
    <div className="w-full flex flex-col items-center">
      {/* ──── Non-printed Action Bar ──── */}
      <div className="w-full max-w-4xl flex items-center justify-between mb-6">
        <button
          onClick={onBackToList}
          className="flex items-center gap-2 text-xs sm:text-sm font-rounded font-semibold text-slate-700 hover:text-[#0047AB] bg-white hover:bg-slate-100 border border-slate-200 px-4 py-2.5 rounded-full transition-all cursor-pointer shadow-xs"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Students List</span>
        </button>

        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={() => setIsEditModalOpen(true)}
            className="flex items-center gap-1.5 text-xs sm:text-sm font-rounded font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 px-3.5 py-2.5 rounded-full transition-all cursor-pointer shadow-xs"
          >
            <Edit3 className="w-3.5 h-3.5 text-[#0047AB]" />
            <span>Edit Profile</span>
          </button>

          <button
            onClick={handleToggleStatus}
            className={`flex items-center gap-1.5 text-xs sm:text-sm font-rounded font-semibold px-3.5 py-2.5 rounded-full transition-all cursor-pointer shadow-xs ${
              student.enrollmentStatus === 'Active'
                ? 'bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300'
                : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300'
            }`}
          >
            {student.enrollmentStatus === 'Active' ? (
              <>
                <UserX className="w-3.5 h-3.5 text-amber-600" />
                <span>Deactivate Student</span>
              </>
            ) : (
              <>
                <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>Reactivate Student</span>
              </>
            )}
          </button>

          <button
            onClick={() => setIsDeleteConfirmOpen(true)}
            className="flex items-center gap-1.5 text-xs sm:text-sm font-rounded font-semibold text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 px-3.5 py-2.5 rounded-full transition-all cursor-pointer shadow-xs"
            title="Delete this student record"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Delete</span>
          </button>
        </div>
      </div>

      {/* ──── Main Student Profile Card ──── */}
      <div className="w-full max-w-4xl bg-white border border-slate-200 rounded-[28px] p-6 sm:p-10 shadow-xl relative overflow-hidden text-slate-800">
        {/* Top Header Card */}
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 pb-6 border-b border-slate-100">
          {/* Avatar Placeholder */}
          <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-slate-200 border-4 border-white shadow-lg flex items-center justify-center text-slate-600 font-rounded font-bold text-3xl sm:text-4xl shrink-0 select-none">
            {initials || 'ST'}
          </div>

          <div className="flex-1 text-center sm:text-left">
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 mb-1">
              <h2 className="font-rounded font-bold text-2xl sm:text-3xl text-slate-900">
                {student.fullName}
              </h2>
              <span
                className={`text-xs font-rounded font-bold px-3 py-1 rounded-full ${
                  student.enrollmentStatus === 'Active'
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    : 'bg-slate-200 text-slate-700 border border-slate-300'
                }`}
              >
                {student.enrollmentStatus || 'Active'} Candidate
              </span>
            </div>

            <p className="text-sm font-rounded text-slate-500 mb-3">
              Son/Daughter of <strong className="text-slate-700">{student.fatherName}</strong>
              {(student.institutionName || student.centerCode) && (
                <>
                  {' '}· Examination Center:{' '}
                  <strong className="text-slate-700">
                    {student.institutionName || student.centerCode}
                  </strong>
                </>
              )}
            </p>

            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
              <span className="bg-teal-50 text-teal-800 text-xs font-mono font-bold px-3 py-1 rounded-full border border-teal-200">
                Roll #: {student.rollNumber}
              </span>
              {student.group && (
                <span className="bg-blue-50 text-[#0047AB] text-xs font-rounded font-semibold px-3 py-1 rounded-full border border-blue-200">
                  {student.group} Group
                </span>
              )}
              {student.classGrade && (
                <span className="bg-slate-100 text-slate-700 text-xs font-rounded font-semibold px-3 py-1 rounded-full border border-slate-200">
                  {student.classGrade}{student.section ? ` - Sec ${student.section}` : ''}
                </span>
              )}
              {student.centerCode && (
                <span className="bg-amber-50 text-amber-800 text-xs font-mono font-semibold px-3 py-1 rounded-full border border-amber-200">
                  Center: {student.centerCode}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ──── Two Column Info Panel (Strictly Verified Slip Fields) ──── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 my-6">
          {/* Left Column: Official Candidate Identification (from Slip) */}
          <div className="bg-slate-50/80 rounded-2xl p-5 border border-slate-100 flex flex-col justify-between">
            <div>
              <h3 className="text-xs font-rounded font-bold uppercase tracking-wider text-[#0047AB] mb-4 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-[#0047AB]" />
                <span>Verified Roll Slip Identification</span>
              </h3>

              <div className="space-y-3.5 text-xs sm:text-sm font-rounded">
                <div className="flex items-start justify-between">
                  <span className="text-slate-400">Candidate Name:</span>
                  <span className="font-semibold text-slate-800 text-right">{student.fullName}</span>
                </div>
                <div className="flex items-start justify-between">
                  <span className="text-slate-400">Father / Guardian:</span>
                  <span className="font-semibold text-slate-800 text-right">{student.fatherName}</span>
                </div>
                <div className="flex items-start justify-between">
                  <span className="text-slate-400">Official Roll No:</span>
                  <span className="font-mono font-bold text-[#0047AB] text-right">{student.rollNumber}</span>
                </div>
                {student.registrationNumber && (
                  <div className="flex items-start justify-between">
                    <span className="text-slate-400">Registration / CNIC:</span>
                    <span className="font-mono font-semibold text-slate-800 text-right">{student.registrationNumber}</span>
                  </div>
                )}
                {student.admissionNumber && (
                  <div className="flex items-start justify-between">
                    <span className="text-slate-400">Admission / Index No:</span>
                    <span className="font-mono font-semibold text-slate-800 text-right">{student.admissionNumber}</span>
                  </div>
                )}
                {(student.institutionName || student.centerCode) && (
                  <div className="flex items-start justify-between">
                    <span className="text-slate-400">Institution / Center:</span>
                    <span className="font-semibold text-slate-800 text-right max-w-[240px]">
                      {student.institutionName || student.centerCode}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Column: Academic Details & Enrolled Subjects List */}
          <div className="bg-slate-50/80 rounded-2xl p-5 border border-slate-100 flex flex-col justify-between">
            <div>
              <h3 className="text-xs font-rounded font-bold uppercase tracking-wider text-[#0047AB] mb-4 flex items-center gap-1.5">
                <BookOpen className="w-4 h-4 text-[#0047AB]" />
                <span>Academic & Subject Enrollment</span>
              </h3>

              <div className="space-y-3.5 text-xs sm:text-sm font-rounded mb-4">
                {student.group && (
                  <div className="flex items-start justify-between">
                    <span className="text-slate-400">Academic Group:</span>
                    <span className="font-semibold text-slate-800">{student.group}</span>
                  </div>
                )}
                {student.classGrade && (
                  <div className="flex items-start justify-between">
                    <span className="text-slate-400">Class & Grade:</span>
                    <span className="font-semibold text-slate-800">
                      {student.classGrade}{student.section ? ` (Sec ${student.section})` : ''}
                    </span>
                  </div>
                )}
                <div className="flex items-start justify-between">
                  <span className="text-slate-400">Primary Paper Subject:</span>
                  <span className="font-semibold text-[#0047AB] text-right">{student.subjectEnrolled}</span>
                </div>
              </div>

              {/* Enrolled Subjects List from Roll Slip / Date Sheet */}
              <div className="pt-3 border-t border-slate-200/80">
                <span className="text-xs font-rounded font-bold text-slate-500 block mb-2">
                  Enrolled Subjects List (from Slip / Date Sheet):
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {(student.enrolledSubjects && student.enrolledSubjects.length > 0
                    ? student.enrolledSubjects
                    : [student.subjectEnrolled]
                  ).map((subj, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-rounded font-medium bg-blue-50 text-[#0047AB] border border-blue-200/70"
                    >
                      <BookOpen className="w-3 h-3 text-[#0047AB]" />
                      <span>{subj}</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ──── Optional Contact Information Panel (Render ONLY if verified non-empty data exists) ──── */}
        {(Boolean(student.dateOfBirth) || Boolean(student.guardianPhone) || Boolean(student.email)) && (
          <div className="bg-slate-50/80 rounded-2xl p-5 border border-slate-100 mb-6">
            <h3 className="text-xs font-rounded font-bold uppercase tracking-wider text-slate-600 mb-3 flex items-center gap-1.5">
              <span>Additional Contact Data</span>
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs sm:text-sm font-rounded">
              {student.dateOfBirth && (
                <div>
                  <span className="text-slate-400 block text-xs">Date of Birth:</span>
                  <span className="font-semibold text-slate-800">{student.dateOfBirth}</span>
                </div>
              )}
              {student.guardianPhone && (
                <div>
                  <span className="text-slate-400 block text-xs">Guardian Phone:</span>
                  <span className="font-semibold text-slate-800">{student.guardianPhone}</span>
                </div>
              )}
              {student.email && (
                <div>
                  <span className="text-slate-400 block text-xs">Email Address:</span>
                  <span className="font-semibold text-slate-800 break-all">{student.email}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ──── Linked Academic Record & Examination Status ──── */}
        <div className="rounded-2xl p-5 sm:p-6 bg-gradient-to-r from-teal-50/60 to-blue-50/60 border border-[#4DD9E8]/30">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Award className="w-5 h-5 text-[#0047AB]" />
                <h4 className="font-rounded font-bold text-lg text-slate-900">
                  Examination Performance & Review Status
                </h4>
              </div>
              <p className="text-xs font-rounded text-slate-500">
                Subject: <strong className="text-slate-700">{student.subjectEnrolled}</strong> · Paper Status:{' '}
                {associatedPaper ? (
                  <span
                    className={`font-bold px-2 py-0.5 rounded-full text-[11px] ${
                      isReviewed
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {associatedPaper.status}
                  </span>
                ) : (
                  <span className="text-slate-500 italic">No paper assigned yet</span>
                )}
              </p>
            </div>

            {/* Quick Action Button to Result Card or Editing */}
            <div className="flex items-center gap-2.5 w-full sm:w-auto">
              {isReviewed ? (
                <button
                  onClick={() => onViewResultCard(student.id)}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 bg-gradient-to-r from-[#4DD9E8] to-[#0047AB] hover:opacity-95 text-white font-rounded font-bold text-xs sm:text-sm py-2.5 px-5 rounded-full shadow-md active:scale-95 transition-all cursor-pointer"
                >
                  <Award className="w-4 h-4" />
                  <span>View Result Card</span>
                </button>
              ) : (
                <button
                  onClick={onOpenEditing}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 bg-white hover:bg-slate-50 text-[#0047AB] border border-[#0047AB]/30 font-rounded font-semibold text-xs sm:text-sm py-2.5 px-5 rounded-full shadow-xs active:scale-95 transition-all cursor-pointer"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>Open in Editing Module</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ──── Edit Modal ──── */}
      <StudentModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        onSave={onUpdateStudent}
        initialStudent={student}
        mode="edit"
      />

      {/* ──── Delete Confirmation Modal ──── */}
      {isDeleteConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="w-full max-w-md bg-white rounded-[24px] p-6 shadow-2xl border border-slate-200"
          >
            <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mb-4">
              <AlertCircle className="w-6 h-6" />
            </div>

            <h3 className="font-rounded font-bold text-xl text-slate-900 mb-2">
              Delete Student Record?
            </h3>
            <p className="text-xs font-rounded text-slate-500 mb-6 leading-relaxed">
              Are you sure you want to delete <strong className="text-slate-800">{student.fullName}</strong> ({student.rollNumber})? This will permanently remove their academic file from the system.
            </p>

            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setIsDeleteConfirmOpen(false)}
                className="px-4 py-2 rounded-full text-xs font-rounded font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onDeleteStudent(student.id);
                  setIsDeleteConfirmOpen(false);
                  onBackToList();
                }}
                className="px-5 py-2 rounded-full text-xs font-rounded font-bold text-white bg-red-600 hover:bg-red-700 transition-all cursor-pointer shadow-sm"
              >
                Confirm Delete
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};
