import { ExamPaper, StudentRecord, INITIAL_MOCK_PAPERS, INITIAL_MOCK_STUDENTS } from '../data/mockPapers';

const DB_NAME = 'project001_papers_db';
const DB_VERSION = 1;
const STORE_PAPERS = 'papers';
const STORE_STUDENTS = 'students';
const STORAGE_KEY_PAPERS = 'project001_papers_v1';
const STORAGE_KEY_STUDENTS = 'project001_students';

/**
 * Open or initialize the browser's IndexedDB database.
 */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not supported in this environment'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_PAPERS)) {
        db.createObjectStore(STORE_PAPERS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_STUDENTS)) {
        db.createObjectStore(STORE_STUDENTS, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Safely writes to localStorage with fallback for quota limits.
 * If base64 page images exceed localStorage ~5MB quota, it strips pageImages for localStorage
 * while IndexedDB preserves the complete high-res images.
 */
function safeSaveToLocalStorage(key: string, data: any) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (err: any) {
    // If QuotaExceededError and key is papers, strip heavy pageImages for localStorage backup
    if (key === STORAGE_KEY_PAPERS && Array.isArray(data)) {
      try {
        const lightweight = data.map((p: ExamPaper) => ({
          ...p,
          pageImages: p.pageImages ? p.pageImages.map((_, idx) => `[indexeddb-stored-image-${idx}]`) : [],
        }));
        localStorage.setItem(key, JSON.stringify(lightweight));
      } catch (_) {
        // Silently continue since IndexedDB holds the authoritative data
      }
    }
  }
}

/**
 * Paper & Student Persistent Storage Utility
 * Supports both IndexedDB (multi-megabyte image storage) and synchronous localStorage.
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
   * Asynchronously load all full papers from IndexedDB (with complete full-resolution page images).
   */
  async loadAllPapers(): Promise<ExamPaper[]> {
    try {
      const db = await openDB();
      return new Promise<ExamPaper[]>((resolve) => {
        const tx = db.transaction(STORE_PAPERS, 'readonly');
        const store = tx.objectStore(STORE_PAPERS);
        const req = store.getAll();

        req.onsuccess = () => {
          const results = req.result as ExamPaper[];
          if (Array.isArray(results) && results.length > 0) {
            resolve(results);
          } else {
            // Fallback to sync localStorage or initial mock
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
   * Asynchronously load all students from IndexedDB / localStorage.
   */
  async loadAllStudents(): Promise<StudentRecord[]> {
    try {
      const db = await openDB();
      return new Promise<StudentRecord[]>((resolve) => {
        const tx = db.transaction(STORE_STUDENTS, 'readonly');
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
   * Delete a paper from IndexedDB and localStorage mirror by paperId or studentId.
   */
  async deletePaper(paperIdOrStudentId: string): Promise<void> {
    try {
      const db = await openDB();
      const tx = db.transaction(STORE_PAPERS, 'readwrite');
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
   * Save a single paper immediately to IndexedDB and sync to localStorage.
   */
  async savePaper(paper: ExamPaper): Promise<void> {
    try {
      const db = await openDB();
      const tx = db.transaction(STORE_PAPERS, 'readwrite');
      tx.objectStore(STORE_PAPERS).put(paper);
    } catch (_) {}

    // Update localStorage mirror
    try {
      const current = paperStorage.loadInitialPapersSync();
      const idx = current.findIndex((p) => p.id === paper.id);
      let updated: ExamPaper[];
      if (idx >= 0) {
        updated = [...current];
        updated[idx] = paper;
      } else {
        updated = [paper, ...current];
      }
      safeSaveToLocalStorage(STORAGE_KEY_PAPERS, updated);
    } catch (_) {}
  },

  /**
   * Save all papers to IndexedDB and sync to localStorage.
   */
  async saveAllPapers(papers: ExamPaper[]): Promise<void> {
    // 1. Immediately update localStorage mirror for fast synchronous retrieval
    safeSaveToLocalStorage(STORAGE_KEY_PAPERS, papers);

    // 2. Persist full papers (including full pageImages) to IndexedDB
    try {
      const db = await openDB();
      const tx = db.transaction(STORE_PAPERS, 'readwrite');
      const store = tx.objectStore(STORE_PAPERS);

      for (const paper of papers) {
        store.put(paper);
      }
    } catch (_) {}
  },

  /**
   * Save a single student to IndexedDB and sync to localStorage.
   */
  async saveStudent(student: StudentRecord): Promise<void> {
    try {
      const db = await openDB();
      const tx = db.transaction(STORE_STUDENTS, 'readwrite');
      tx.objectStore(STORE_STUDENTS).put(student);
    } catch (_) {}

    try {
      const current = paperStorage.loadInitialStudentsSync();
      const idx = current.findIndex((s) => s.id === student.id || s.rollNumber === student.rollNumber);
      let updated: StudentRecord[];
      if (idx >= 0) {
        updated = [...current];
        updated[idx] = student;
      } else {
        updated = [student, ...current];
      }
      safeSaveToLocalStorage(STORAGE_KEY_STUDENTS, updated);
    } catch (_) {}
  },

  /**
   * Save all students to IndexedDB and sync to localStorage.
   */
  async saveAllStudents(students: StudentRecord[]): Promise<void> {
    safeSaveToLocalStorage(STORAGE_KEY_STUDENTS, students);

    try {
      const db = await openDB();
      const tx = db.transaction(STORE_STUDENTS, 'readwrite');
      const store = tx.objectStore(STORE_STUDENTS);

      for (const student of students) {
        store.put(student);
      }
    } catch (_) {}
  },
};
