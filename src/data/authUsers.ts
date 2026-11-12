import { createContext, useContext } from 'react';

export type UserRole = 'developer' | 'normal';

export interface UserAccount {
  username: string;
  name: string;
  email?: string;
  role: UserRole;
  title: string;
  photoURL?: string;
}

// Pre-defined seed user configurations (passwords removed completely)
export const SEED_USERS: UserAccount[] = [
  {
    username: 'Tandoori Roti',
    name: 'Tandoori Roti',
    email: 'tandooriroti2026@gmail.com',
    role: 'developer',
    title: 'Developer',
  },
  {
    username: 'Umar Ali Shah',
    name: 'Umar Ali Shah',
    email: 'umaralishah.examiner@gmail.com',
    role: 'normal',
    title: 'Examiner',
  },
  {
    username: 'Lead Examiner',
    name: 'Lead Examiner',
    email: 'examiner@fbise.edu.pk',
    role: 'normal',
    title: 'Examiner',
  },
];

// Default fallback account for non-authenticated initial views
export const USER_ACCOUNTS: UserAccount[] = SEED_USERS;

export const isDeveloper = (user: UserAccount | null | undefined): boolean => {
  return user?.role === 'developer';
};

export const isNormal = (user: UserAccount | null | undefined): boolean => {
  return user?.role === 'normal';
};

export interface AuthContextValue {
  currentUser: UserAccount | null;
  setCurrentUser: (user: UserAccount | null) => void;
  isDeveloper: boolean;
  isNormal: boolean;
  signOutUser?: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue>({
  currentUser: SEED_USERS[0],
  setCurrentUser: () => {},
  isDeveloper: true,
  isNormal: false,
});

export const useAuth = () => useContext(AuthContext);
