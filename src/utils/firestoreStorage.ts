import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  getDocs,
  onSnapshot,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { ExamPaper, StudentRecord, CorrectionLog, INITIAL_MOCK_PAPERS, INITIAL_MOCK_STUDENTS } from '../data/mockPapers';
import { MarkingScheme, INITIAL_MOCK_MARKING_SCHEMES } from '../data/mockMarkingSchemes';
import { paperStorage } from './paperStorage';

/**
 * Utility to strip undefined values so Firestore does not throw errors.
 */
export function sanitizeForFirestore<T>(data: T): T {
  return JSON.parse(JSON.stringify(data));
}

// Collections
const COLLECTION_STUDENTS = 'students';
const COLLECTION_PAPERS = 'papers';
const COLLECTION_SCHEMES = 'markingSchemes';
const COLLECTION_CORRECTION_LOGS = 'correctionLogs';

/**
 * Compresses base64 page scan image to keep document under maxBytes (e.g. 150 KB).
 */
async function compressImageIfNeeded(dataUrl: string, maxBytes = 150000): Promise<string> {
  if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image')) {
    return dataUrl || '';
  }
  if (dataUrl.length <= maxBytes) return dataUrl;

  return new Promise((resolve) => {
    const img = new Image();
    img.src = dataUrl;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      const maxDimension = 1200;
      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);

      let quality = 0.7;
      let result = canvas.toDataURL('image/jpeg', quality);
      while (result.length > maxBytes && quality > 0.2) {
        quality -= 0.15;
        result = canvas.toDataURL('image/jpeg', quality);
      }
      resolve(result);
    };
    img.onerror = () => resolve(dataUrl);
  });
}

// ════════ SUBCOLLECTION PAGE IMAGE STORAGE ════════

export async function savePaperPagesFirestore(paperId: string, pageImages: string[]): Promise<void> {
  if (!pageImages || pageImages.length === 0) return;
  for (let idx = 0; idx < pageImages.length; idx++) {
    const rawImg = pageImages[idx];
    if (!rawImg) continue;
    const compressedImg = typeof window !== 'undefined' ? await compressImageIfNeeded(rawImg) : rawImg;
    const pageId = `page_${idx}`;
    const pageDocPath = `${COLLECTION_PAPERS}/${paperId}/pages/${pageId}`;
    try {
      await setDoc(doc(db, COLLECTION_PAPERS, paperId, 'pages', pageId), {
        id: pageId,
        index: idx,
        imageUrl: compressedImg,
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, pageDocPath);
    }
  }
}

export async function loadPaperPagesFirestore(paperId: string): Promise<string[]> {
  try {
    const pagesSnap = await getDocs(collection(db, COLLECTION_PAPERS, paperId, 'pages'));
    if (pagesSnap.empty) return [];
    const pages: { index: number; imageUrl: string }[] = [];
    pagesSnap.forEach((d) => {
      const data = d.data();
      if (data && typeof data.imageUrl === 'string') {
        pages.push({
          index: typeof data.index === 'number' ? data.index : 0,
          imageUrl: data.imageUrl,
        });
      }
    });
    pages.sort((a, b) => a.index - b.index);
    return pages.map((p) => p.imageUrl);
  } catch (err) {
    return [];
  }
}

// ════════ REAL-TIME SUBSCRIPTIONS ════════

export function subscribeToStudents(
  onData: (students: StudentRecord[]) => void,
  onError?: (err: any) => void
) {
  let active = true;

  return onSnapshot(
    collection(db, COLLECTION_STUDENTS),
    async (snapshot) => {
      const students: StudentRecord[] = [];
      snapshot.forEach((docSnap) => {
        students.push(docSnap.data() as StudentRecord);
      });

      if (students.length === 0 && snapshot.metadata.fromCache === false) {
        try {
          await seedInitialStudents();
        } catch (_) {}
      } else {
        if (active) onData(students);
      }
    },
    (error) => {
      console.warn('Students snapshot error:', error);
      if (onError) onError(error);
      handleFirestoreError(error, OperationType.GET, COLLECTION_STUDENTS);
    }
  );
}

export function subscribeToPapers(
  onData: (papers: ExamPaper[]) => void,
  onError?: (err: any) => void
) {
  let active = true;

  return onSnapshot(
    collection(db, COLLECTION_PAPERS),
    async (snapshot) => {
      const rawPapers: ExamPaper[] = [];
      snapshot.forEach((docSnap) => {
        rawPapers.push(docSnap.data() as ExamPaper);
      });

      if (rawPapers.length === 0 && snapshot.metadata.fromCache === false) {
        try {
          await seedInitialPapers();
        } catch (_) {}
      } else {
        // Hydrate subcollection page images for each paper
        const fullPapers = await Promise.all(
          rawPapers.map(async (p) => {
            const pageImages = await loadPaperPagesFirestore(p.id);
            if (pageImages.length > 0) {
              return { ...p, pageImages };
            }
            return p;
          })
        );
        if (active) onData(fullPapers);
      }
    },
    (error) => {
      console.warn('Papers snapshot error:', error);
      if (onError) onError(error);
      handleFirestoreError(error, OperationType.GET, COLLECTION_PAPERS);
    }
  );
}

export function subscribeToMarkingSchemes(
  onData: (schemes: MarkingScheme[]) => void,
  onError?: (err: any) => void
) {
  let active = true;

  return onSnapshot(
    collection(db, COLLECTION_SCHEMES),
    async (snapshot) => {
      const schemes: MarkingScheme[] = [];
      snapshot.forEach((docSnap) => {
        schemes.push(docSnap.data() as MarkingScheme);
      });

      if (schemes.length === 0 && snapshot.metadata.fromCache === false) {
        try {
          await seedInitialSchemes();
        } catch (_) {}
      } else {
        if (active) onData(schemes);
      }
    },
    (error) => {
      console.warn('MarkingSchemes snapshot error:', error);
      if (onError) onError(error);
      handleFirestoreError(error, OperationType.GET, COLLECTION_SCHEMES);
    }
  );
}

export function subscribeToCorrectionLogs(
  onData: (logs: CorrectionLog[]) => void,
  onError?: (err: any) => void
) {
  let active = true;

  return onSnapshot(
    collection(db, COLLECTION_CORRECTION_LOGS),
    async (snapshot) => {
      const logs: CorrectionLog[] = [];
      snapshot.forEach((docSnap) => {
        logs.push(docSnap.data() as CorrectionLog);
      });
      if (active) onData(logs);
    },
    (error) => {
      console.warn('CorrectionLogs snapshot error:', error);
      if (onError) onError(error);
      handleFirestoreError(error, OperationType.GET, COLLECTION_CORRECTION_LOGS);
    }
  );
}

// ════════ INDIVIDUAL SAVES & DELETES ════════

export async function saveStudentFirestore(student: StudentRecord): Promise<void> {
  const path = `${COLLECTION_STUDENTS}/${student.id}`;
  try {
    const cleanData = sanitizeForFirestore(student);
    await setDoc(doc(db, COLLECTION_STUDENTS, student.id), cleanData);
    await paperStorage.saveStudent(student);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteStudentFirestore(studentId: string): Promise<void> {
  const path = `${COLLECTION_STUDENTS}/${studentId}`;
  try {
    await deleteDoc(doc(db, COLLECTION_STUDENTS, studentId));
    await paperStorage.saveAllStudents(
      (await paperStorage.loadAllStudents()).filter((s) => s.id !== studentId)
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function savePaperFirestore(paper: ExamPaper): Promise<void> {
  const path = `${COLLECTION_PAPERS}/${paper.id}`;
  const rawPageImages = paper.pageImages || [];

  // Strip pageImages from the main document to ensure it stays well under 1 MB
  const cleanPaper = sanitizeForFirestore({
    ...paper,
    pageImages: [],
  });

  try {
    await setDoc(doc(db, COLLECTION_PAPERS, paper.id), cleanPaper);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }

  // Save each page scan into the pages subcollection
  if (rawPageImages.length > 0) {
    await savePaperPagesFirestore(paper.id, rawPageImages);
  }

  await paperStorage.savePaper(paper);
}

export async function deletePaperFirestore(paperId: string): Promise<void> {
  const path = `${COLLECTION_PAPERS}/${paperId}`;
  try {
    const pagesSnap = await getDocs(collection(db, COLLECTION_PAPERS, paperId, 'pages'));
    pagesSnap.forEach((d) => {
      deleteDoc(d.ref).catch(() => {});
    });

    await deleteDoc(doc(db, COLLECTION_PAPERS, paperId));
    await paperStorage.deletePaper(paperId);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function saveMarkingSchemeFirestore(scheme: MarkingScheme): Promise<void> {
  const path = `${COLLECTION_SCHEMES}/${scheme.id}`;
  try {
    const cleanData = sanitizeForFirestore(scheme);
    await setDoc(doc(db, COLLECTION_SCHEMES, scheme.id), cleanData);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteMarkingSchemeFirestore(schemeId: string): Promise<void> {
  const path = `${COLLECTION_SCHEMES}/${schemeId}`;
  try {
    await deleteDoc(doc(db, COLLECTION_SCHEMES, schemeId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function saveCorrectionLogFirestore(log: CorrectionLog): Promise<void> {
  const path = `${COLLECTION_CORRECTION_LOGS}/${log.id}`;
  try {
    const cleanData = sanitizeForFirestore(log);
    await setDoc(doc(db, COLLECTION_CORRECTION_LOGS, log.id), cleanData);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

// ════════ INITIAL SEEDERS FOR NEW FIRESTORE DATABASE ════════

export async function seedInitialStudents(): Promise<void> {
  try {
    for (const student of INITIAL_MOCK_STUDENTS) {
      await setDoc(doc(db, COLLECTION_STUDENTS, student.id), sanitizeForFirestore(student));
    }
  } catch (error) {
    console.error('Error seeding initial students to Firestore:', error);
  }
}

export async function seedInitialPapers(): Promise<void> {
  try {
    for (const paper of INITIAL_MOCK_PAPERS) {
      await savePaperFirestore(paper);
    }
  } catch (error) {
    console.error('Error seeding initial papers to Firestore:', error);
  }
}

export async function seedInitialSchemes(): Promise<void> {
  try {
    for (const scheme of INITIAL_MOCK_MARKING_SCHEMES) {
      await setDoc(doc(db, COLLECTION_SCHEMES, scheme.id), sanitizeForFirestore(scheme));
    }
  } catch (error) {
    console.error('Error seeding initial schemes to Firestore:', error);
  }
}

/**
 * ONE-TIME MIGRATION UTILITY:
 * Reads all existing data in browser localStorage / IndexedDB and pushes it to Firestore with pages subcollection.
 */
export async function importLocalBrowserDataToFirestore(): Promise<{
  studentsCount: number;
  papersCount: number;
  schemesCount: number;
  logsCount: number;
}> {
  let studentsCount = 0;
  let papersCount = 0;
  let schemesCount = 0;
  let logsCount = 0;

  // 1. Load Local Students
  try {
    const localStudents = await paperStorage.loadAllStudents();
    for (const s of localStudents) {
      if (s && s.id) {
        await saveStudentFirestore(s);
        studentsCount++;
      }
    }
  } catch (err) {
    console.warn('Migration: Failed to import students', err);
  }

  // 2. Load Local Papers
  try {
    const localPapers = await paperStorage.loadAllPapers();
    for (const p of localPapers) {
      if (p && p.id) {
        await savePaperFirestore(p);
        papersCount++;
      }
    }
  } catch (err) {
    console.warn('Migration: Failed to import papers', err);
  }

  // 3. Load Local Schemes from localStorage
  try {
    let localSchemes: MarkingScheme[] = [];
    const savedSchemes = localStorage.getItem('project001_marking_schemes_v2');
    if (savedSchemes) {
      try {
        localSchemes = JSON.parse(savedSchemes);
      } catch (_) {}
    }
    if (localSchemes.length === 0) {
      localSchemes = INITIAL_MOCK_MARKING_SCHEMES;
    }
    for (const sch of localSchemes) {
      if (sch && sch.id) {
        await saveMarkingSchemeFirestore(sch);
        schemesCount++;
      }
    }
  } catch (err) {
    console.warn('Migration: Failed to import schemes', err);
  }

  // 4. Load Local Correction Logs from localStorage
  try {
    let localLogs: CorrectionLog[] = [];
    const savedLogs = localStorage.getItem('project001_correction_logs');
    if (savedLogs) {
      try {
        localLogs = JSON.parse(savedLogs);
      } catch (_) {}
    }
    for (const log of localLogs) {
      if (log && log.id) {
        await saveCorrectionLogFirestore(log);
        logsCount++;
      }
    }
  } catch (err) {
    console.warn('Migration: Failed to import correction logs', err);
  }

  return { studentsCount, papersCount, schemesCount, logsCount };
}
