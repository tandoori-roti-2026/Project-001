import React, { createContext, useContext } from 'react';

export type UserRole = 'developer' | 'normal';

export interface UserAccount {
  username: string;
  name: string;
  role: UserRole;
  title: string;
}

export interface UserCredential extends UserAccount {
  password: string;
}

export const USER_ACCOUNTS: UserCredential[] = [
  {
    username: 'Tandoori Roti',
    name: 'Tandoori Roti',
    password: 'S1a2i3f45',
    role: 'developer',
    title: 'Developer',
  },
  {
    username: 'Umar Ali Shah',
    name: 'Umar Ali Shah',
    password: 'U1m2a3r45',
    role: 'normal',
    title: 'Examiner',
  },
];

export const validateCredentials = (
  usernameInput: string,
  passwordInput: string
): UserAccount | null => {
  const trimmedUser = usernameInput.trim().toLowerCase();
  const matched = USER_ACCOUNTS.find(
    (acc) =>
      acc.username.toLowerCase() === trimmedUser && acc.password === passwordInput
  );
  if (!matched) return null;

  return {
    username: matched.username,
    name: matched.name,
    role: matched.role,
    title: matched.title,
  };
};

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
}

export const AuthContext = createContext<AuthContextValue>({
  currentUser: USER_ACCOUNTS[0],
  setCurrentUser: () => {},
  isDeveloper: true,
  isNormal: false,
});

export const useAuth = () => useContext(AuthContext);

