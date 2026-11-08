import React, { useState } from 'react';
import { motion } from 'motion/react';
import { X, UserPlus, Building, BookOpen, User, Phone, Mail, Hash, Layers } from 'lucide-react';
import { StudentRecord } from '../data/mockPapers';

interface StudentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (student: StudentRecord) => void;
  initialStudent?: StudentRecord | null;
  mode: 'add' | 'edit';
}

export const StudentModal: React.FC<StudentModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialStudent,
  mode,
}) => {
  const [formData, setFormData] = useState<Partial<StudentRecord>>(() => {
    if (initialStudent) {
      return { ...initialStudent };
    }
    const randNum = Math.floor(100 + Math.random() * 900);
    return {
      fullName: '',
      fatherName: '',
      dateOfBirth: '',
      rollNumber: `SEC-2026-${randNum}`,
      registrationNumber: '',
      admissionNumber: '',
      classGrade: 'Grade 12',
      section: 'A',
      group: 'Pre-Engineering',
      institutionName: '',
      guardianPhone: '',
      email: '',
      enrollmentStatus: 'Active',
      subjectEnrolled: 'Physics (Advanced)',
    };
  });

  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  if (!isOpen) return null;

  const validate = () => {
    const errors: Record<string, string> = {};
    if (!formData.fullName?.trim()) errors.fullName = 'Full name is required';
    if (!formData.fatherName?.trim()) errors.fatherName = "Father's name is required";
    if (!formData.rollNumber?.trim()) errors.rollNumber = 'Roll number is required';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    const studentToSave: StudentRecord = {
      id: initialStudent?.id || `student-${Date.now()}`,
      fullName: formData.fullName!.trim(),
      fatherName: formData.fatherName!.trim(),
      dateOfBirth: formData.dateOfBirth?.trim() || undefined,
      rollNumber: formData.rollNumber!.trim(),
      registrationNumber: formData.registrationNumber?.trim() || undefined,
      admissionNumber: formData.admissionNumber?.trim() || undefined,
      classGrade: formData.classGrade?.trim() || undefined,
      section: formData.section?.trim() || undefined,
      group: formData.group?.trim() || undefined,
      institutionName: formData.institutionName?.trim() || undefined,
      guardianPhone: formData.guardianPhone?.trim() || undefined,
      email: formData.email?.trim() || undefined,
      enrollmentStatus: formData.enrollmentStatus || 'Active',
      subjectEnrolled: formData.subjectEnrolled?.trim() || 'General Science',
    };

    onSave(studentToSave);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs select-none overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative w-full max-w-2xl bg-white rounded-[28px] shadow-2xl overflow-hidden border border-slate-200 my-8"
      >
        {/* Header with Project Gradient */}
        <div
          className="px-6 py-5 flex items-center justify-between text-white relative overflow-hidden"
          style={{
            background: 'linear-gradient(90deg, #4DD9E8 0%, #0047AB 100%)',
          }}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-white">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-rounded font-bold text-xl sm:text-2xl text-white">
                {mode === 'add' ? 'Add New Student Record' : 'Edit Student Profile'}
              </h3>
              <p className="text-xs text-white/90 font-rounded">
                {mode === 'add'
                  ? 'Create a student identity entry for PROJECT-001'
                  : `Update record for ${initialStudent?.fullName}`}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Fields */}
        <form onSubmit={handleSubmit} className="p-6 sm:p-8 flex flex-col gap-5 max-h-[75vh] overflow-y-auto">
          {/* Section: Personal Information */}
          <div>
            <h4 className="text-xs font-rounded font-bold uppercase tracking-wider text-[#0047AB] mb-3 flex items-center gap-1.5">
              <User className="w-4 h-4" />
              <span>Personal Information</span>
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-rounded font-bold text-slate-700 mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Aarav Sharma"
                  value={formData.fullName || ''}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  className="w-full bg-slate-50 focus:bg-white border border-slate-200 focus:border-[#4DD9E8] rounded-xl px-3.5 py-2.5 text-sm font-rounded text-slate-800 outline-none transition-all"
                />
                {formErrors.fullName && (
                  <p className="text-[11px] text-red-600 font-rounded mt-1">{formErrors.fullName}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-rounded font-bold text-slate-700 mb-1">
                  Father's / Guardian Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Rajesh Sharma"
                  value={formData.fatherName || ''}
                  onChange={(e) => setFormData({ ...formData, fatherName: e.target.value })}
                  className="w-full bg-slate-50 focus:bg-white border border-slate-200 focus:border-[#4DD9E8] rounded-xl px-3.5 py-2.5 text-sm font-rounded text-slate-800 outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-rounded font-bold text-slate-700 mb-1">
                  Date of Birth
                </label>
                <input
                  type="date"
                  value={formData.dateOfBirth || ''}
                  onChange={(e) => setFormData({ ...formData, dateOfBirth: e.target.value })}
                  className="w-full bg-slate-50 focus:bg-white border border-slate-200 focus:border-[#4DD9E8] rounded-xl px-3.5 py-2.5 text-sm font-rounded text-slate-800 outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-rounded font-bold text-slate-700 mb-1">
                  Guardian Phone
                </label>
                <input
                  type="text"
                  placeholder="+91 98000 00000"
                  value={formData.guardianPhone || ''}
                  onChange={(e) => setFormData({ ...formData, guardianPhone: e.target.value })}
                  className="w-full bg-slate-50 focus:bg-white border border-slate-200 focus:border-[#4DD9E8] rounded-xl px-3.5 py-2.5 text-sm font-rounded text-slate-800 outline-none transition-all"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-rounded font-bold text-slate-700 mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  placeholder="student@institution.edu"
                  value={formData.email || ''}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full bg-slate-50 focus:bg-white border border-slate-200 focus:border-[#4DD9E8] rounded-xl px-3.5 py-2.5 text-sm font-rounded text-slate-800 outline-none transition-all"
                />
              </div>
            </div>
          </div>

          {/* Section: Academic Information */}
          <div className="pt-2 border-t border-slate-100">
            <h4 className="text-xs font-rounded font-bold uppercase tracking-wider text-[#0047AB] mb-3 flex items-center gap-1.5">
              <BookOpen className="w-4 h-4" />
              <span>Academic Details</span>
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-rounded font-bold text-slate-700 mb-1">
                  Roll Number *
                </label>
                <input
                  type="text"
                  required
                  placeholder="SEC-2026-041"
                  value={formData.rollNumber || ''}
                  onChange={(e) => setFormData({ ...formData, rollNumber: e.target.value })}
                  className="w-full bg-slate-50 focus:bg-white border border-slate-200 focus:border-[#4DD9E8] rounded-xl px-3.5 py-2.5 text-sm font-mono text-slate-800 outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-rounded font-bold text-slate-700 mb-1">
                  Registration Number
                </label>
                <input
                  type="text"
                  placeholder="REG-88204-DL"
                  value={formData.registrationNumber || ''}
                  onChange={(e) => setFormData({ ...formData, registrationNumber: e.target.value })}
                  className="w-full bg-slate-50 focus:bg-white border border-slate-200 focus:border-[#4DD9E8] rounded-xl px-3.5 py-2.5 text-sm font-mono text-slate-800 outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-rounded font-bold text-slate-700 mb-1">
                  Admission Number
                </label>
                <input
                  type="text"
                  placeholder="ADM-2024-0041"
                  value={formData.admissionNumber || ''}
                  onChange={(e) => setFormData({ ...formData, admissionNumber: e.target.value })}
                  className="w-full bg-slate-50 focus:bg-white border border-slate-200 focus:border-[#4DD9E8] rounded-xl px-3.5 py-2.5 text-sm font-mono text-slate-800 outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-rounded font-bold text-slate-700 mb-1">
                  Class / Grade
                </label>
                <select
                  value={formData.classGrade || 'Grade 12'}
                  onChange={(e) => setFormData({ ...formData, classGrade: e.target.value })}
                  className="w-full bg-slate-50 focus:bg-white border border-slate-200 focus:border-[#4DD9E8] rounded-xl px-3.5 py-2.5 text-sm font-rounded text-slate-800 outline-none transition-all"
                >
                  <option value="Grade 12">Grade 12</option>
                  <option value="Grade 11">Grade 11</option>
                  <option value="Grade 10">Grade 10</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-rounded font-bold text-slate-700 mb-1">
                  Section
                </label>
                <select
                  value={formData.section || 'A'}
                  onChange={(e) => setFormData({ ...formData, section: e.target.value })}
                  className="w-full bg-slate-50 focus:bg-white border border-slate-200 focus:border-[#4DD9E8] rounded-xl px-3.5 py-2.5 text-sm font-rounded text-slate-800 outline-none transition-all"
                >
                  <option value="A">Section A</option>
                  <option value="B">Section B</option>
                  <option value="C">Section C</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-rounded font-bold text-slate-700 mb-1">
                  Academic Group
                </label>
                <select
                  value={formData.group || 'Pre-Engineering'}
                  onChange={(e) => setFormData({ ...formData, group: e.target.value })}
                  className="w-full bg-slate-50 focus:bg-white border border-slate-200 focus:border-[#4DD9E8] rounded-xl px-3.5 py-2.5 text-sm font-rounded text-slate-800 outline-none transition-all"
                >
                  <option value="Pre-Engineering">Pre-Engineering</option>
                  <option value="Pre-Medical">Pre-Medical</option>
                  <option value="Computer Science">Computer Science</option>
                  <option value="General Science">General Science</option>
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-rounded font-bold text-slate-700 mb-1">
                  Institution Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Apex International Collegiate"
                  value={formData.institutionName || ''}
                  onChange={(e) => setFormData({ ...formData, institutionName: e.target.value })}
                  className="w-full bg-slate-50 focus:bg-white border border-slate-200 focus:border-[#4DD9E8] rounded-xl px-3.5 py-2.5 text-sm font-rounded text-slate-800 outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-rounded font-bold text-slate-700 mb-1">
                  Enrolled Subject
                </label>
                <input
                  type="text"
                  placeholder="e.g. Physics (Advanced)"
                  value={formData.subjectEnrolled || ''}
                  onChange={(e) => setFormData({ ...formData, subjectEnrolled: e.target.value })}
                  className="w-full bg-slate-50 focus:bg-white border border-slate-200 focus:border-[#4DD9E8] rounded-xl px-3.5 py-2.5 text-sm font-rounded text-slate-800 outline-none transition-all"
                />
              </div>
            </div>
          </div>

          {/* Section: Enrollment Status */}
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
            <div>
              <span className="text-xs font-rounded font-bold text-slate-700 block">
                Enrollment Status
              </span>
              <span className="text-[11px] text-slate-400 font-rounded">
                Active students can participate in exam evaluation.
              </span>
            </div>
            <select
              value={formData.enrollmentStatus || 'Active'}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  enrollmentStatus: e.target.value as 'Active' | 'Inactive',
                })
              }
              className={`px-3 py-1.5 rounded-full text-xs font-rounded font-bold border outline-none ${
                formData.enrollmentStatus === 'Active'
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                  : 'bg-slate-100 text-slate-600 border-slate-300'
              }`}
            >
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
          </div>

          {/* Footer Action Buttons */}
          <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-full text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 font-rounded font-semibold text-sm transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-6 py-2.5 rounded-full text-white bg-gradient-to-r from-[#4DD9E8] to-[#0047AB] hover:opacity-95 font-rounded font-bold text-sm shadow-md hover:shadow-lg active:scale-98 transition-all cursor-pointer"
            >
              {mode === 'add' ? 'Save New Student' : 'Save Changes'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};
