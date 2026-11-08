import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { StudentAcademicRecord } from './gradeCalculations';

export const generateResultCardPDF = (doc: jsPDF, record: StudentAcademicRecord, startY: number = 0) => {
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 10;
  let y = startY + 15;

  // Extract year
  const examYear = (() => {
    const sessionMatch = (record.examSession || '').match(/\b(20\d\d)\b/);
    if (sessionMatch) return sessionMatch[1];
    const dateMatch = (record.dateSubmitted || '').match(/\b(20\d\d)\b/);
    if (dateMatch) return dateMatch[1];
    return '2026';
  })();

  // 1. Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(0, 0, 0);
  doc.text('FEDERAL BOARD OF INTERMEDIATE AND SECONDARY EDUCATION, ISLAMABAD', pageWidth / 2, y, { align: 'center' });
  y += 6;
  doc.setFontSize(11);
  doc.text(`HIGHER SECONDARY SCHOOL CERTIFICATE (PART-I) 1st ANNUAL EXAMINATION ${examYear}`, pageWidth / 2, y, { align: 'center' });
  y += 6;
  doc.setFontSize(12);
  doc.text('RESULT CARD', pageWidth / 2, y, { align: 'center' });
  const textWidth = doc.getTextWidth('RESULT CARD');
  doc.setDrawColor(0, 0, 0);
  doc.line(pageWidth / 2 - textWidth / 2, y + 1, pageWidth / 2 + textWidth / 2, y + 1);
  y += 10;

  // 2. Registration Number (Top Right)
  const regText = `REG: ${(record.registrationNumber || '2511180061').replace(/^REG-?/i, '').replace(/-FB$/i, '').trim()}`;
  doc.setFontSize(10);
  doc.text(regText, pageWidth - margin, y, { align: 'right' });
  const regWidth = doc.getTextWidth(regText);
  doc.line(pageWidth - margin - regWidth, y + 0.5, pageWidth - margin, y + 0.5);
  y += 8;

  // 3. Student Info Block
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  
  const drawInfoRow = (label: string, value: string, rowY: number) => {
    doc.setFont('helvetica', 'normal');
    doc.text(label, margin, rowY);
    doc.setFont('helvetica', 'bold');
    doc.text(value, margin + 35, rowY);
  };

  // ID NO and Roll No
  doc.text('ID NO:', margin, y);
  const idNum = record.admissionNumber 
    ? record.admissionNumber.replace(/^ADM-?/i, '').trim().replace('-', ' / ')
    : '1118 / 00469';
  doc.setFont('helvetica', 'bold');
  doc.text(idNum, margin + 35, y);
  
  doc.setFont('helvetica', 'normal');
  doc.text('Roll No:', pageWidth - 60, y);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(record.rollNumber || '3080260', pageWidth - margin - 25, y);
  doc.setFontSize(10);
  y += 7;

  drawInfoRow('Group/Trade:', (record.group || 'PRE-ENGINEERING').toUpperCase(), y);
  y += 7;
  drawInfoRow('Student Name:', (record.studentName || 'SAIF-UL-ISLAM').toUpperCase(), y);
  y += 7;
  drawInfoRow('Father Name:', (record.fatherName || 'ABDUL KHALIQ ANSARI').toUpperCase(), y);
  y += 7;
  drawInfoRow('Marks Obt:', 'COMP.', y);
  y += 8;

  // 4. Institution
  doc.setFont('helvetica', 'bold');
  doc.text('INSTITUTION:', margin, y);
  const instName = (record.institutionName || 'ISLAMABAD COLLEGE FOR BOYS, G-6/3, ISLAMABAD').toUpperCase();
  doc.setFont('helvetica', 'normal');
  doc.text(instName, margin + 30, y);
  doc.line(margin + 30, y + 0.5, margin + 30 + doc.getTextWidth(instName), y + 0.5);
  y += 10;

  // 5. Section Title
  doc.setFont('helvetica', 'bold');
  doc.text('THEORY PAPER(S)', margin, y);
  doc.line(margin, y + 0.5, margin + doc.getTextWidth('THEORY PAPER(S)'), y + 0.5);
  y += 5;

  // 6. Table
  const head = [['S.#', 'SUBJECT/PAPER', 'MARKS\nOBTAINED', 'PRACTICAL MARKS']];
  
  // Standard subjects configuration (same as in ResultCardView)
  const groupLabel = (record.group || 'PRE-ENGINEERING').toUpperCase();
  const isPreMed = groupLabel.includes('MED');
  const isComp = groupLabel.includes('COMP') || groupLabel.includes('ICS');

  const standardSubjectsConfig = [
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

  const evaluatedSubjectsMap = new Map<string, any>();
  if (Array.isArray(record.subjects)) {
    for (const sub of record.subjects) {
      const subName = (sub.subject || '').toLowerCase();
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
        else evaluatedSubjectsMap.set(subName, sub);
      }
    }
  }

  const tableRowsData = standardSubjectsConfig.map((item, idx) => {
    const evaluated = evaluatedSubjectsMap.get(item.key);
    if (!evaluated) {
      return { serialNumber: idx + 1, subjectName: item.name, marksObtainedStr: '', practicalMarksStr: '', isFailed: false };
    }
    const marksNum = Number(evaluated.marksObtained);
    const marksObtainedStr = !isNaN(marksNum) ? String(Math.round(marksNum)).padStart(3, '0') : '';
    const maxMarks = evaluated.maxMarks || 100;
    const passThreshold = Math.ceil(maxMarks * 0.33);
    const isFailed = marksNum < passThreshold || evaluated.percentage < 33 || evaluated.isPassed === false || evaluated.grade === 'U';

    return { serialNumber: idx + 1, subjectName: item.name, marksObtainedStr, practicalMarksStr: '', isFailed };
  });

  const body = tableRowsData.map(row => [
    row.serialNumber,
    row.subjectName,
    row.marksObtainedStr,
    row.practicalMarksStr
  ]);

  autoTable(doc, {
    head: head,
    body: body,
    startY: y,
    theme: 'grid',
    styles: {
      fontSize: 9,
      cellPadding: 2,
      lineColor: [0, 0, 0],
      lineWidth: 0.1,
      textColor: [0, 0, 0],
      valign: 'middle',
    },
    headStyles: {
      fillColor: [255, 255, 255],
      textColor: [0, 0, 0],
      fontStyle: 'bold',
      halign: 'center',
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 15 },
      1: { halign: 'left' },
      2: { halign: 'center', cellWidth: 35 },
      3: { halign: 'center', cellWidth: 40 },
    },
    didParseCell: (data) => {
      if (data.section === 'body') {
        const rowIndex = data.row.index;
        if (tableRowsData[rowIndex].isFailed) {
          data.cell.styles.fillColor = [248, 113, 113];
        }
      }
    },
    foot: [['Disclaimer :    This result in the app is a school copy for checking. It is not an official Board certificate.']],
    footStyles: {
      fillColor: [255, 255, 255],
      textColor: [0, 0, 0],
      fontStyle: 'italic',
      halign: 'left',
      fontSize: 8,
    },
    showFoot: 'everyPage',
  });

  y = (doc as any).lastAutoTable.finalY + 15;

  // 7. Bottom Section
  doc.setDrawColor(0, 0, 0);
  doc.rect(margin, y, 25, 25);
  doc.setFontSize(7);
  doc.text('QR VERIFICATION', margin + 12.5, y + 12.5, { align: 'center' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('(CONTROLLER OF EXAMINATION)', pageWidth - margin - 30, y + 25, { align: 'center' });
};
