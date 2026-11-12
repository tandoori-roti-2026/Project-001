import { doc, getDoc, setDoc, getDocs, collection } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { UserAccount } from '../data/authUsers';

export const SEED_USERS: Record<string, UserAccount> = {
  'tandooriroti2026@gmail.com': {
    username: 'Tandoori Roti',
    name: 'Tandoori Roti',
    email: 'tandooriroti2026@gmail.com',
    role: 'developer',
    title: 'Developer',
  },
  'umaralishah.examiner@gmail.com': {
    username: 'Umar Ali Shah',
    name: 'Umar Ali Shah',
    email: 'umaralishah.examiner@gmail.com',
    role: 'normal',
    title: 'Examiner',
  },
  'examiner@fbise.edu.pk': {
    username: 'Lead Examiner',
    name: 'Lead Examiner',
    email: 'examiner@fbise.edu.pk',
    role: 'normal',
    title: 'Examiner',
  },
};

/**
 * Checks if a given email is registered in Firestore 'users' collection.
 * If the user is one of the designated seed users (e.g. developer), ensures
 * the document is initialized in Firestore so they can immediately sign in.
 */
export async function getAuthorizedUserByEmail(email: string): Promise<UserAccount | null> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return null;

  const userDocRef = doc(db, 'users', normalizedEmail);

  try {
    const snap = await getDoc(userDocRef);

    if (snap.exists()) {
      const data = snap.data();
      return {
        username: data.username || data.name || normalizedEmail.split('@')[0],
        name: data.name || normalizedEmail.split('@')[0],
        email: normalizedEmail,
        role: data.role === 'developer' ? 'developer' : 'normal',
        title: data.title || (data.role === 'developer' ? 'Developer' : 'Examiner'),
        photoURL: data.photoURL,
      };
    }

    // Check if matching predefined seed users
    const seed = SEED_USERS[normalizedEmail];
    if (seed) {
      // Auto-provision the seed user document in Firestore
      try {
        await setDoc(userDocRef, {
          ...seed,
          email: normalizedEmail,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      } catch (seedErr) {
        console.warn('Could not auto-write seed user to Firestore:', seedErr);
      }
      return seed;
    }

    return null;
  } catch (error) {
    // If permission or offline error, check seed fallback
    const seed = SEED_USERS[normalizedEmail];
    if (seed) return seed;

    handleFirestoreError(error, OperationType.GET, `users/${normalizedEmail}`);
  }
}

/**
 * Seed all predefined initial users in Firestore.
 */
export async function seedInitialUsers(): Promise<void> {
  for (const [email, user] of Object.entries(SEED_USERS)) {
    try {
      const userDocRef = doc(db, 'users', email);
      const snap = await getDoc(userDocRef);
      if (!snap.exists()) {
        await setDoc(userDocRef, {
          ...user,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
    } catch (err) {
      console.warn(`[Seed] Could not seed user ${email}:`, err);
    }
  }
}

/**
 * Fetch all users from Firestore (accessible to authorized users)
 */
export async function listAllUsers(): Promise<UserAccount[]> {
  try {
    const snap = await getDocs(collection(db, 'users'));
    const users: UserAccount[] = [];
    snap.forEach((d) => {
      const data = d.data();
      users.push({
        username: data.username || data.name || d.id,
        name: data.name || d.id,
        email: data.email || d.id,
        role: data.role === 'developer' ? 'developer' : 'normal',
        title: data.title || (data.role === 'developer' ? 'Developer' : 'Examiner'),
        photoURL: data.photoURL,
      });
    });
    return users.length > 0 ? users : Object.values(SEED_USERS);
  } catch (err) {
    console.warn('[listAllUsers] Falling back to seed users:', err);
    return Object.values(SEED_USERS);
  }
}

/**
 * Add or update an authorized user (restricted to developer role via Firestore rules)
 */
export async function saveAuthorizedUser(user: UserAccount): Promise<void> {
  if (!user.email) throw new Error('User email is required.');
  const normalizedEmail = user.email.trim().toLowerCase();
  const userDocRef = doc(db, 'users', normalizedEmail);

  try {
    await setDoc(
      userDocRef,
      {
        username: user.username || user.name,
        name: user.name,
        email: normalizedEmail,
        role: user.role,
        title: user.title,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `users/${normalizedEmail}`);
  }
}
