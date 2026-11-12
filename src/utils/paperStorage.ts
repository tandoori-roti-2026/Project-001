import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
} from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { uploadPaperImages } from './imageStorage';
import {
  ExamPaper,
  StudentRecord,
  INITIAL_MOCK_PAPERS,
  INITIAL_MOCK_STUDENTS,
} from '../data/mockPapers';
import {
  MarkingScheme,
  INITIAL_MOCK_MARKING_SCHEMES,
} from '../data/mockMarkingSchemes';

const DB_NAME = 'project001_papers_db';
const DB_VERSION = 1;
const STORE_PAPERS = 'papers';
const STORE_STUDENTS = 'students';
const STORAGE_KEY_PAPERS = 'project001_papers_v1';
const STORAGE_KEY_STUDENTS = 'project001_students';
const STORAGE_KEY_SCHEMES = 'project001_marking_schemes_v2';

/**
 * Open or initialize browser IndexedDB for fast local caching.
 */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not supported in this environment'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const idb = request.result;
      if (!idb.objectStoreNames.contains(STORE_PAPERS)) {
        idb.createObjectStore(STORE_PAPERS, { keyPath: 'id' });
      }
      if (!idb.objectStoreNames.contains(STORE_STUDENTS)) {
        idb.createObjectStore(STORE_STUDENTS, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Safely writes to localStorage as a lightweight synchronous mirror.
 */
function safeSaveToLocalStorage(key: string, data: any) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (err: any) {
    if (key === STORAGE_KEY_PAPERS && Array.isArray(data)) {
      try {
        const lightweight = data.map((p: ExamPaper) => ({
          ...p,
          pageImages: p.pageImages
            ? p.pageImages.map((img, idx) =>
                img.startsWith('http') ? img : `[local-image-${idx}]`
              )
            : [],
        }));
        localStorage.setItem(key, JSON.stringify(lightweight));
      } catch (_) {}
    }
  }
}

/**
 * Paper & Student Persistent Storage Utility
 * Backed primarily by Firebase Firestore & Storage, with local IndexedDB/localStorage caching.
 */
export const paperStorage = {
  /**
   * Synchronous load on initial render so there is zero layout shift or wait time.
   */
  loadInitialPapersSync(): ExamPaper[] {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_PAPERS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (_) {}
    return INITIAL_MOCK_PAPERS;
  },

  loadInitialStudentsSync(): StudentRecord[] {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_STUDENTS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (_) {}
    return INITIAL_MOCK_STUDENTS;
  },

  /**
   * Asynchronously load papers.
   * Reads from Firestore if authenticated, else falls back to IndexedDB/localStorage.
   */
  async loadAllPapers(): Promise<ExamPaper[]> {
    if (auth.currentUser) {
      try {
        const papersCol = collection(db, 'papers');
        const snap = await getDocs(papersCol);
        if (!snap.empty) {
          const firestorePapers: ExamPaper[] = [];
          snap.forEach((docSnap) => {
            firestorePapers.push(docSnap.data() as ExamPaper);
          });
          // Cache locally
          safeSaveToLocalStorage(STORAGE_KEY_PAPERS, firestorePapers);
          try {
            const idb = await openDB();
            const tx = idb.transaction(STORE_PAPERS, 'readwrite');
            const store = tx.objectStore(STORE_PAPERS);
            for (const p of firestorePapers) {
              store.put(p);
            }
          } catch (_) {}
          return firestorePapers;
        }
      } catch (err) {
        console.warn('[paperStorage] Firestore loadAllPapers failed, using local cache:', err);
      }
    }

    // Fallback to IndexedDB / localStorage
    try {
      const idb = await openDB();
      return new Promise<ExamPaper[]>((resolve) => {
        const tx = idb.transaction(STORE_PAPERS, 'readonly');
        const store = tx.objectStore(STORE_PAPERS);
        const req = store.getAll();

        req.onsuccess = () => {
          const results = req.result as ExamPaper[];
          if (Array.isArray(results) && results.length > 0) {
            resolve(results);
          } else {
            resolve(paperStorage.loadInitialPapersSync());
          }
        };

        req.onerror = () => {
          resolve(paperStorage.loadInitialPapersSync());
        };
      });
    } catch (_) {
      return paperStorage.loadInitialPapersSync();
    }
  },

  /**
   * Asynchronously load students from Firestore (fallback IndexedDB/localStorage).
   */
  async loadAllStudents(): Promise<StudentRecord[]> {
    if (auth.currentUser) {
      try {
        const studentsCol = collection(db, 'students');
        const snap = await getDocs(studentsCol);
        if (!snap.empty) {
          const firestoreStudents: StudentRecord[] = [];
          snap.forEach((docSnap) => {
            firestoreStudents.push(docSnap.data() as StudentRecord);
          });
          safeSaveToLocalStorage(STORAGE_KEY_STUDENTS, firestoreStudents);
          try {
            const idb = await openDB();
            const tx = idb.transaction(STORE_STUDENTS, 'readwrite');
            const store = tx.objectStore(STORE_STUDENTS);
            for (const s of firestoreStudents) {
              store.put(s);
            }
          } catch (_) {}
          return firestoreStudents;
        }
      } catch (err) {
        console.warn('[paperStorage] Firestore loadAllStudents failed, using local cache:', err);
      }
    }

    try {
      const idb = await openDB();
      return new Promise<StudentRecord[]>((resolve) => {
        const tx = idb.transaction(STORE_STUDENTS, 'readonly');
        const store = tx.objectStore(STORE_STUDENTS);
        const req = store.getAll();

        req.onsuccess = () => {
          const results = req.result as StudentRecord[];
          if (Array.isArray(results) && results.length > 0) {
            resolve(results);
          } else {
            resolve(paperStorage.loadInitialStudentsSync());
          }
        };

        req.onerror = () => {
          resolve(paperStorage.loadInitialStudentsSync());
        };
      });
    } catch (_) {
      return paperStorage.loadInitialStudentsSync();
    }
  },

  /**
   * Delete a paper from Firestore and local cache.
   */
  async deletePaper(paperIdOrStudentId: string): Promise<void> {
    // Delete from Firestore
    if (auth.currentUser) {
      try {
        await deleteDoc(doc(db, 'papers', paperIdOrStudentId));
      } catch (err) {
        console.warn('[paperStorage] Firestore deleteDoc failed:', err);
      }
    }

    // Delete from IndexedDB
    try {
      const idb = await openDB();
      const tx = idb.transaction(STORE_PAPERS, 'readwrite');
      const store = tx.objectStore(STORE_PAPERS);
      const req = store.getAll();
      req.onsuccess = () => {
        const results = req.result as ExamPaper[];
        if (Array.isArray(results)) {
          for (const p of results) {
            if (
              p.id === paperIdOrStudentId ||
              p.studentId === paperIdOrStudentId ||
              `new-${p.studentId}` === paperIdOrStudentId ||
              `paper-${p.studentId}` === paperIdOrStudentId
            ) {
              store.delete(p.id);
            }
          }
        }
      };
    } catch (_) {}

    // Delete from localStorage mirror
    try {
      const current = paperStorage.loadInitialPapersSync();
      const updated = current.filter(
        (p) =>
          p.id !== paperIdOrStudentId &&
          p.studentId !== paperIdOrStudentId &&
          `new-${p.studentId}` !== paperIdOrStudentId &&
          `paper-${p.studentId}` !== paperIdOrStudentId
      );
      safeSaveToLocalStorage(STORAGE_KEY_PAPERS, updated);
    } catch (_) {}
  },

  /**
   * Save a single paper:
   * 1. Compresses and uploads any base64 page images to Firebase Storage.
   * 2. Sets audit fields (updatedBy, updatedAt).
   * 3. Saves document to Firestore 'papers' collection.
   * 4. Updates local cache mirror.
   */
  async savePaper(paper: ExamPaper): Promise<void> {
    const auditEmail = auth.currentUser?.email || 'system';
    const auditTime = new Date().toISOString();

    let uploadedUrls = paper.pageImages || [];

    // Ensure heavy base64 images are uploaded to Storage and replaced with URLs
    if (paper.pageImages && paper.pageImages.length > 0 && auth.currentUser) {
      try {
        uploadedUrls = await uploadPaperImages(paper.id, paper.pageImages);
      } catch (storageErr) {
        console.warn('[savePaper] Error uploading page images to storage:', storageErr);
      }
    }

    const paperWithAudit: ExamPaper & { updatedBy?: string; updatedAt?: string } = {
      ...paper,
      pageImages: uploadedUrls,
      updatedBy: auditEmail,
      updatedAt: auditTime,
    };

    // Save to Firestore
    if (auth.currentUser) {
      try {
        await setDoc(doc(db, 'papers', paper.id), paperWithAudit, { merge: true });
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `papers/${paper.id}`);
      }
    }

    // Save to IndexedDB
    try {
      const idb = await openDB();
      const tx = idb.transaction(STORE_PAPERS, 'readwrite');
      tx.objectStore(STORE_PAPERS).put(paperWithAudit);
    } catch (_) {}

    // Update localStorage mirror
    try {
      const current = paperStorage.loadInitialPapersSync();
      const idx = current.findIndex((p) => p.id === paper.id);
      let updated: ExamPaper[];
      if (idx >= 0) {
        updated = [...current];
        updated[idx] = paperWithAudit;
      } else {
        updated = [paperWithAudit, ...current];
      }
      safeSaveToLocalStorage(STORAGE_KEY_PAPERS, updated);
    } catch (_) {}
  },

  /**
   * Save all papers to Firestore and local cache.
   */
  async saveAllPapers(papers: ExamPaper[]): Promise<void> {
    safeSaveToLocalStorage(STORAGE_KEY_PAPERS, papers);

    for (const paper of papers) {
      await paperStorage.savePaper(paper);
    }
  },

  /**
   * Save a single student to Firestore and local cache with audit stamps.
   */
  async saveStudent(student: StudentRecord): Promise<void> {
    const auditEmail = auth.currentUser?.email || 'system';
    const auditTime = new Date().toISOString();

    const studentWithAudit: StudentRecord & { updatedBy?: string; updatedAt?: string } = {
      ...student,
      updatedBy: auditEmail,
      updatedAt: auditTime,
    };

    if (auth.currentUser) {
      try {
        await setDoc(doc(db, 'students', student.id), studentWithAudit, { merge: true });
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `students/${student.id}`);
      }
    }

    try {
      const idb = await openDB();
      const tx = idb.transaction(STORE_STUDENTS, 'readwrite');
      tx.objectStore(STORE_STUDENTS).put(studentWithAudit);
    } catch (_) {}

    try {
      const current = paperStorage.loadInitialStudentsSync();
      const idx = current.findIndex(
        (s) => s.id === student.id || s.rollNumber === student.rollNumber
      );
      let updated: StudentRecord[];
      if (idx >= 0) {
        updated = [...current];
        updated[idx] = studentWithAudit;
      } else {
        updated = [studentWithAudit, ...current];
      }
      safeSaveToLocalStorage(STORAGE_KEY_STUDENTS, updated);
    } catch (_) {}
  },

  /**
   * Save all students to Firestore and local cache.
   */
  async saveAllStudents(students: StudentRecord[]): Promise<void> {
    safeSaveToLocalStorage(STORAGE_KEY_STUDENTS, students);

    for (const student of students) {
      await paperStorage.saveStudent(student);
    }
  },

  /**
   * Asynchronously load marking schemes from Firestore (fallback to localStorage).
   */
  async loadAllMarkingSchemes(): Promise<MarkingScheme[]> {
    if (auth.currentUser) {
      try {
        const snap = await getDocs(collection(db, 'markingSchemes'));
        if (!snap.empty) {
          const schemes: MarkingScheme[] = [];
          snap.forEach((docSnap) => {
            schemes.push(docSnap.data() as MarkingScheme);
          });
          safeSaveToLocalStorage(STORAGE_KEY_SCHEMES, schemes);
          return schemes;
        }
      } catch (err) {
        console.warn('[paperStorage] Firestore loadAllMarkingSchemes failed:', err);
      }
    }

    try {
      const saved = localStorage.getItem(STORAGE_KEY_SCHEMES);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (_) {}
    return INITIAL_MOCK_MARKING_SCHEMES;
  },

  /**
   * Save a single marking scheme to Firestore and local cache.
   */
  async saveMarkingScheme(scheme: MarkingScheme): Promise<void> {
    const auditEmail = auth.currentUser?.email || 'system';
    const auditTime = new Date().toISOString();

    const schemeWithAudit = {
      ...scheme,
      updatedBy: auditEmail,
      updatedAt: auditTime,
    };

    if (auth.currentUser) {
      try {
        await setDoc(doc(db, 'markingSchemes', scheme.id), schemeWithAudit, { merge: true });
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `markingSchemes/${scheme.id}`);
      }
    }

    try {
      const saved = localStorage.getItem(STORAGE_KEY_SCHEMES);
      const current: MarkingScheme[] = saved ? JSON.parse(saved) : [];
      const idx = current.findIndex((s) => s.id === scheme.id);
      let updated: MarkingScheme[];
      if (idx >= 0) {
        updated = [...current];
        updated[idx] = schemeWithAudit;
      } else {
        updated = [schemeWithAudit, ...current];
      }
      safeSaveToLocalStorage(STORAGE_KEY_SCHEMES, updated);
    } catch (_) {}
  },

  /**
   * Save all marking schemes to Firestore.
   */
  async saveAllMarkingSchemes(schemes: MarkingScheme[]): Promise<void> {
    safeSaveToLocalStorage(STORAGE_KEY_SCHEMES, schemes);

    for (const scheme of schemes) {
      await paperStorage.saveMarkingScheme(scheme);
    }
  },

  /**
   * Delete a marking scheme from Firestore.
   */
  async deleteMarkingScheme(schemeId: string): Promise<void> {
    if (auth.currentUser) {
      try {
        await deleteDoc(doc(db, 'markingSchemes', schemeId));
      } catch (err) {
        console.warn('[paperStorage] Delete marking scheme error:', err);
      }
    }
    try {
      const saved = localStorage.getItem(STORAGE_KEY_SCHEMES);
      if (saved) {
        const current: MarkingScheme[] = JSON.parse(saved);
        const updated = current.filter((s) => s.id !== schemeId);
        safeSaveToLocalStorage(STORAGE_KEY_SCHEMES, updated);
      }
    } catch (_) {}
  },

  /**
   * Read raw local storage and IndexedDB data for migration and export backup.
   */
  async getLocalDataBackup(): Promise<{
    papers: ExamPaper[];
    students: StudentRecord[];
    markingSchemes: MarkingScheme[];
  }> {
    let papers: ExamPaper[] = [];
    let students: StudentRecord[] = [];
    let markingSchemes: MarkingScheme[] = [];

    try {
      const idb = await openDB();
      papers = await new Promise<ExamPaper[]>((resolve) => {
        const tx = idb.transaction(STORE_PAPERS, 'readonly');
        const req = tx.objectStore(STORE_PAPERS).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      });
      students = await new Promise<StudentRecord[]>((resolve) => {
        const tx = idb.transaction(STORE_STUDENTS, 'readonly');
        const req = tx.objectStore(STORE_STUDENTS).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      });
    } catch (_) {}

    if (papers.length === 0) {
      papers = paperStorage.loadInitialPapersSync();
    }
    if (students.length === 0) {
      students = paperStorage.loadInitialStudentsSync();
    }

    try {
      const savedSchemes = localStorage.getItem(STORAGE_KEY_SCHEMES);
      markingSchemes = savedSchemes ? JSON.parse(savedSchemes) : INITIAL_MOCK_MARKING_SCHEMES;
    } catch (_) {
      markingSchemes = INITIAL_MOCK_MARKING_SCHEMES;
    }

    return { papers, students, markingSchemes };
  },
};
