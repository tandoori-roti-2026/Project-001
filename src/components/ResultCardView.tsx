import React, { useState } from 'react';
import { Printer, ArrowLeft, Download, Loader2 } from 'lucide-react';
import { StudentAcademicRecord } from '../utils/gradeCalculations';
import { UserAccount } from '../data/authUsers';
import { jsPDF } from 'jspdf';
import { generateResultCardPDF } from '../utils/pdfExport';

interface ResultCardViewProps {
  record: StudentAcademicRecord;
  currentUser?: UserAccount | null;
  onBackToList: () => void;
}

export const ResultCardView: React.FC<ResultCardViewProps> = ({
  record,
  onBackToList,
}) => {
  const [isExporting, setIsExporting] = useState(false);

  const handleExportPDF = async () => {
    try {
      setIsExporting(true);
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      generateResultCardPDF(doc, record);

      const cleanRoll = (record.rollNumber || 'ResultCard').replace(/[^a-zA-Z0-9]/g, '_');
      const cleanName = (record.studentName || 'Candidate')
        .replace(/\s+/g, '_')
        .replace(/[^a-zA-Z0-9_]/g, '');
      const fileName = `FBISE_ResultCard_${cleanRoll}_${cleanName}.pdf`;

      doc.save(fileName);
    } catch (err) {
      console.error('Failed to generate PDF with jsPDF:', err);
    } finally {
      setIsExporting(false);
    }
  };

  // Extract year from exam session or date submitted (e.g., "2026")
  const examYear = (() => {
    const sessionMatch = (record.examSession || '').match(/\b(20\d\d)\b/);
    if (sessionMatch) return sessionMatch[1];
    const dateMatch = (record.dateSubmitted || '').match(/\b(20\d\d)\b/);
    if (dateMatch) return dateMatch[1];
    return '2026';
  })();

  // Registration number display
  const regNumber = (record.registrationNumber || '').replace(/^REG-?/i, '').replace(/-FB$/i, '').trim();

  // ID Number display (e.g. 1118 / 00469 or admission number)
  const idNumber = (() => {
    if (record.admissionNumber) {
      const clean = record.admissionNumber.replace(/^ADM-?/i, '').trim();
      if (clean.includes('-')) {
        return clean.replace('-', ' / ');
      }
      if (clean.length > 4) {
        return `${clean.slice(0, 4)} / ${clean.slice(4)}`;
      }
      return clean;
    }
    return '1118 / 00469';
  })();

  // Candidate group
  const groupLabel = (record.group || 'PRE-ENGINEERING').toUpperCase();

  // Standard FBISE HSSC-I subjects based on candidate group
  const standardSubjectsConfig: Array<{ key: string; name: string }> = (() => {
    const isPreMed = groupLabel.includes('MED');
    const isComp = groupLabel.includes('COMP') || groupLabel.includes('ICS');

    return [
      { key: 'english', name: 'ENGLISH - I (COMP.)' },
      { key: 'urdu', name: 'URDU - I (COMP.)' },
      { key: 'islamic', name: 'ISLAMIC EDUCATION (COMP.)' },
      {
        key: isPreMed ? 'biology' : 'mathematics',
        name: isPreMed ? 'BIOLOGY - I (TH.)' : 'MATHEMATICS - I',
      },
      { key: 'quran', name: 'TRANSLATION OF HOLY QURAN-I' },
      { key: 'physics', name: 'PHYSICS - I (TH.)' },
      {
        key: isComp ? 'computer' : 'chemistry',
        name: isComp ? 'COMPUTER SCIENCE - I (TH.)' : 'CHEMISTRY - I (TH.)',
      },
    ];
  })();

  // Match student's actual evaluated papers against the subject list
  const evaluatedSubjectsMap = new Map<string, any>();
  if (Array.isArray(record.subjects)) {
    for (const sub of record.subjects) {
      const subName = (sub.subject || '').toLowerCase();
      // Only include evaluated papers (skip pending empty records without score)
      const hasEvaluatedScore =
        typeof sub.marksObtained === 'number' &&
        sub.remarks !== 'Pending Submission' &&
        !record.paperId.startsWith('new-');

      if (hasEvaluatedScore) {
        if (subName.includes('phys')) evaluatedSubjectsMap.set('physics', sub);
        else if (subName.includes('chem')) evaluatedSubjectsMap.set('chemistry', sub);
        else if (subName.includes('math') || subName.includes('calc')) evaluatedSubjectsMap.set('mathematics', sub);
        else if (subName.includes('bio')) evaluatedSubjectsMap.set('biology', sub);
        else if (subName.includes('comp') || subName.includes('cs')) evaluatedSubjectsMap.set('computer', sub);
        else if (subName.includes('urdu')) evaluatedSubjectsMap.set('urdu', sub);
        else if (subName.includes('eng')) evaluatedSubjectsMap.set('english', sub);
        else if (subName.includes('islam') || subName.includes('ethics')) evaluatedSubjectsMap.set('islamic', sub);
        else if (subName.includes('quran')) evaluatedSubjectsMap.set('quran', sub);
        else {
          evaluatedSubjectsMap.set(subName, sub);
        }
      }
    }
  }

  // Build rows for the 4-column FBISE table
  const tableRows = standardSubjectsConfig.map((item, idx) => {
    const evaluated = evaluatedSubjectsMap.get(item.key);
    if (!evaluated) {
      // Subjects with no paper yet: leave marks cell blank, not 0, and do not paint red
      return {
        serialNumber: idx + 1,
        subjectName: item.name,
        marksObtainedStr: '',
        practicalMarksStr: '',
        isFailed: false,
        hasPaper: false,
      };
    }

    const marksNum = Number(evaluated.marksObtained);
    // Pad obtained marks with leading zero (e.g. 068, 047, 022)
    const marksObtainedStr = !isNaN(marksNum) ? String(Math.round(marksNum)).padStart(3, '0') : '';

    // FBISE Passing threshold: < 33% (or below pass benchmark e.g. 33/100, 23/68, 28/85, or isPassed === false)
    const maxMarks = evaluated.maxMarks || 100;
    const passThreshold = Math.ceil(maxMarks * 0.33);
    const isFailed = marksNum < passThreshold || evaluated.percentage < 33 || evaluated.isPassed === false || evaluated.grade === 'U';

    return {
      serialNumber: idx + 1,
      subjectName: item.name,
      marksObtainedStr,
      practicalMarksStr: '',
      isFailed,
      hasPaper: true,
    };
  });

  // Candidate photo (if available in record, else show blue-border "Paste a pic here" box)
  const studentPhoto = (record as any).photoUrl || (record as any).photo || (record as any).avatar;

  return (
    <div className="w-full flex flex-col items-center">
      {/* ──── Non-printed Action Bar ──── */}
      <div className="w-full max-w-[760px] flex items-center justify-between gap-3 mb-6 print:hidden">
        <button
          type="button"
          onClick={onBackToList}
          className="flex items-center gap-2 text-xs sm:text-sm font-rounded font-semibold text-slate-700 hover:text-[#0047AB] bg-white hover:bg-slate-100 border border-slate-300 px-4 py-2.5 rounded-full transition-all cursor-pointer shadow-xs"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Result Cards List</span>
        </button>

          <button
            type="button"
            onClick={handleExportPDF}
            disabled={isExporting}
            className="flex items-center gap-2 text-xs sm:text-sm font-rounded font-bold text-white bg-gradient-to-r from-[#4DD9E8] to-[#0047AB] hover:opacity-95 px-5 py-2.5 rounded-full transition-all cursor-pointer shadow-md active:scale-95 disabled:opacity-50"
            title="Export individual student result card as PDF"
          >
            {isExporting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            <span>{isExporting ? 'Generating PDF...' : 'Download PDF'}</span>
          </button>
      </div>

      {/* ──── EXACT FBISE HSSC RESULT CARD CONTAINER ──── */}
      <div
        id={`printable-result-card-${record.paperId}`}
        className="w-full max-w-[760px] bg-white text-black border border-black p-6 sm:p-8 md:p-10 shadow-sm print:shadow-none print:border-black print:p-6 print:max-w-none print:w-full print:m-0 font-sans leading-normal select-text"
        style={{
          boxSizing: 'border-box',
          WebkitPrintColorAdjust: 'exact',
          printColorAdjust: 'exact',
        }}
      >
        {/* 1. Header Centered, Bold */}
        <div className="text-center font-bold text-slate-950 uppercase leading-snug tracking-tight">
          <h1 className="text-sm sm:text-base md:text-[17px] font-bold">
            FEDERAL BOARD OF INTERMEDIATE AND SECONDARY EDUCATION, ISLAMABAD
          </h1>
          <h2 className="text-xs sm:text-sm md:text-[15px] font-bold mt-1">
            HIGHER SECONDARY SCHOOL CERTIFICATE (PART-I) 1<sup>st</sup> ANNUAL EXAMINATION {examYear}
          </h2>
          <h3 className="text-xs sm:text-sm md:text-[15px] font-bold mt-1">
            <u>RESULT CARD</u>
          </h3>
        </div>

        {/* 2. Top Right: REG */}
        <div className="flex justify-end mt-2 mb-1">
          <p className="text-xs sm:text-sm font-bold text-black tracking-wider">
            <u>REG: {regNumber || '2511180061'}</u>
          </p>
        </div>

        {/* 3 & 4. Left Student Info Block + Right Photo Box */}
        <div className="flex items-start justify-between gap-4 mt-1">
          {/* Left Block */}
          <div className="flex-1 text-xs sm:text-sm leading-relaxed text-black">
            {/* Row 1: ID NO & Roll No */}
            <div className="flex items-center justify-between max-w-[460px]">
              <div className="flex items-center">
                <span className="w-24 sm:w-28 font-normal text-black">ID NO:</span>
                <span className="font-normal text-black">{idNumber}</span>
              </div>
              <div className="flex items-center pr-4 sm:pr-8">
                <span className="font-normal text-black mr-2">Roll No:</span>
                <span className="font-bold text-black text-sm sm:text-base">
                  {record.rollNumber || '3080260'}
                </span>
              </div>
            </div>

            {/* Row 2: Group/Trade */}
            <div className="flex items-center">
              <span className="w-24 sm:w-28 font-normal text-black">Group/Trade:</span>
              <span className="font-normal text-black uppercase">{groupLabel}</span>
            </div>

            {/* Row 3: Student Name */}
            <div className="flex items-center">
              <span className="w-24 sm:w-28 font-normal text-black">Student Name:</span>
              <span className="font-normal text-black uppercase">
                {record.studentName || 'SAIF-UL-ISLAM'}
              </span>
            </div>

            {/* Row 4: Father Name */}
            <div className="flex items-center">
              <span className="w-24 sm:w-28 font-normal text-black">Father Name:</span>
              <span className="font-normal text-black uppercase">
                {record.fatherName || 'ABDUL KHALIQ ANSARI'}
              </span>
            </div>

            {/* Row 5: Marks Obt */}
            <div className="flex items-center">
              <span className="w-24 sm:w-28 font-normal text-black">Marks Obt:</span>
              <span className="font-normal text-black uppercase">COMP.</span>
            </div>
          </div>

          {/* 4. Right Photo Box */}
          <div className="shrink-0">
            {studentPhoto ? (
              <div className="w-[115px] h-[145px] sm:w-[130px] sm:h-[160px] border-2 border-[#0047AB] overflow-hidden bg-slate-100 flex items-center justify-center">
                <img
                  src={studentPhoto}
                  alt={record.studentName}
                  className="w-full h-full object-cover"
                />
              </div>
            ) : (
              <div className="w-[115px] h-[145px] sm:w-[130px] sm:h-[160px] border-2 border-[#0047AB] bg-white flex items-center justify-center text-center p-2">
                <span className="text-xs sm:text-sm font-semibold text-[#0047AB] leading-tight">
                  Paste a pic here
                </span>
              </div>
            )}
          </div>
        </div>

        {/* 5. INSTITUTION */}
        <div className="mt-4 text-xs sm:text-sm text-black">
          <u className="font-semibold">INSTITUTION:</u>
          &nbsp;&nbsp;&nbsp;&nbsp;
          <u className="font-semibold uppercase tracking-wide">
            {record.institutionName || 'ISLAMABAD COLLEGE FOR BOYS, G-6/3, ISLAMABAD'}
          </u>
        </div>

        {/* 6. Section Title: THEORY PAPER(S) */}
        <div className="mt-4 mb-1">
          <u className="font-bold text-xs sm:text-sm text-black tracking-wide">
            THEORY PAPER(S)
          </u>
        </div>

        {/* 7 & 8. Table with 4 Columns & Light-Red Failure Highlight */}
        <table
          className="w-full text-black border-collapse border border-black text-xs sm:text-sm"
          style={{ borderSpacing: 0 }}
        >
          <thead>
            <tr className="bg-white border-b border-black text-black font-bold uppercase">
              <th className="border border-black py-1 px-2 text-center w-12 font-bold">
                S.#
              </th>
              <th className="border border-black py-1 px-3 text-center font-bold">
                SUBJECT/PAPER
              </th>
              <th className="border border-black py-1 px-3 text-center w-36 font-bold leading-tight">
                MARKS
                <br />
                OBTAINED
              </th>
              <th className="border border-black py-1 px-3 text-center w-40 font-bold">
                PRACTICAL MARKS
              </th>
            </tr>
          </thead>
          <tbody>
            {tableRows.map((row) => (
              <tr
                key={row.serialNumber}
                className={row.isFailed ? 'text-black' : 'bg-white text-black'}
                style={row.isFailed ? { backgroundColor: '#f87171' } : { backgroundColor: '#ffffff' }}
              >
                <td className="border border-black py-1 px-2 text-center font-normal">
                  {row.serialNumber}
                </td>
                <td className="border border-black py-1 px-3 text-left font-normal uppercase tracking-wide">
                  {row.subjectName}
                </td>
                <td className="border border-black py-1 px-3 text-center font-normal font-mono">
                  {row.marksObtainedStr}
                </td>
                <td className="border border-black py-1 px-3 text-center font-normal">
                  {row.practicalMarksStr}
                </td>
              </tr>
            ))}

            {/* 9. Disclaimer Box spanning under table */}
            <tr className="bg-white">
              <td
                colSpan={4}
                className="border border-black py-1.5 px-3 text-left text-[11px] sm:text-xs text-black leading-tight"
              >
                <i>
                  <u>Disclaimer :</u>
                </i>
                &nbsp;&nbsp;&nbsp;&nbsp;
                This result in the app is a school copy for checking. It is not an official Board certificate.
              </td>
            </tr>
          </tbody>
        </table>

        {/* 10. Bottom Section: QR Code & Controller Signature */}
        <div className="flex items-end justify-between mt-8 pt-2 px-1">
          {/* Bottom Left: QR-style Square Placeholder */}
          <div className="shrink-0">
            <svg
              width="88"
              height="88"
              viewBox="0 0 88 88"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="w-20 h-20 sm:w-22 sm:h-22"
              aria-label="QR Verification Code"
            >
              {/* Outer boundary */}
              <rect width="88" height="88" fill="white" />
              {/* Top-Left Finder */}
              <rect x="4" y="4" width="24" height="24" fill="black" />
              <rect x="8" y="8" width="16" height="16" fill="white" />
              <rect x="12" y="12" width="8" height="8" fill="black" />
              {/* Top-Right Finder */}
              <rect x="60" y="4" width="24" height="24" fill="black" />
              <rect x="64" y="8" width="16" height="16" fill="white" />
              <rect x="68" y="12" width="8" height="8" fill="black" />
              {/* Bottom-Left Finder */}
              <rect x="4" y="60" width="24" height="24" fill="black" />
              <rect x="8" y="64" width="16" height="16" fill="white" />
              <rect x="12" y="68" width="8" height="8" fill="black" />
              {/* Data Modules */}
              <rect x="34" y="4" width="6" height="6" fill="black" />
              <rect x="46" y="4" width="6" height="6" fill="black" />
              <rect x="34" y="16" width="6" height="6" fill="black" />
              <rect x="46" y="16" width="6" height="6" fill="black" />
              <rect x="4" y="34" width="6" height="6" fill="black" />
              <rect x="16" y="34" width="6" height="6" fill="black" />
              <rect x="28" y="34" width="6" height="6" fill="black" />
              <rect x="40" y="34" width="6" height="6" fill="black" />
              <rect x="52" y="34" width="6" height="6" fill="black" />
              <rect x="64" y="34" width="6" height="6" fill="black" />
              <rect x="76" y="34" width="6" height="6" fill="black" />
              <rect x="10" y="46" width="6" height="6" fill="black" />
              <rect x="22" y="46" width="6" height="6" fill="black" />
              <rect x="34" y="46" width="6" height="6" fill="black" />
              <rect x="46" y="46" width="6" height="6" fill="black" />
              <rect x="58" y="46" width="6" height="6" fill="black" />
              <rect x="70" y="46" width="6" height="6" fill="black" />
              <rect x="34" y="60" width="6" height="6" fill="black" />
              <rect x="46" y="60" width="6" height="6" fill="black" />
              <rect x="58" y="60" width="6" height="6" fill="black" />
              <rect x="70" y="60" width="6" height="6" fill="black" />
              <rect x="34" y="74" width="6" height="6" fill="black" />
              <rect x="46" y="74" width="6" height="6" fill="black" />
              <rect x="64" y="74" width="6" height="6" fill="black" />
              <rect x="76" y="74" width="6" height="6" fill="black" />
            </svg>
          </div>

          {/* Bottom Right: Signature Scribble & Controller Label */}
          <div className="flex flex-col items-center text-center">
            <svg
              width="140"
              height="55"
              viewBox="0 0 140 55"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="h-10 sm:h-12 w-auto"
              aria-label="Controller Signature"
            >
              <path
                d="M12 38 C 22 28, 28 8, 32 10 C 37 12, 22 46, 38 32 C 46 22, 45 14, 48 16 C 52 18, 46 44, 58 35 C 66 28, 76 30, 90 28 C 104 26, 118 20, 130 23 M 60 39 L 98 35"
                stroke="#111827"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="132" cy="22" r="1.5" fill="#111827" />
            </svg>
            <p className="font-bold text-xs sm:text-sm uppercase text-black tracking-wider mt-1">
              (CONTROLLER OF EXAMINATION)
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
