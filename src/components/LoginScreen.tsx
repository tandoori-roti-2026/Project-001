import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertCircle, ArrowUp, Code, UserCheck, ShieldCheck, Loader2 } from 'lucide-react';
import { signInWithPopup, signOut } from 'firebase/auth';
import { auth, googleProvider } from '../firebase';
import { UserAccount, SEED_USERS } from '../data/authUsers';
import { getAuthorizedUserByEmail } from '../utils/userManagement';

interface LoginScreenProps {
  onLoginSuccess: (user: UserAccount) => void;
  onBackToLanding: () => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({
  onLoginSuccess,
  onBackToLanding,
}) => {
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [shakeKey, setShakeKey] = useState(0);

  const handleGoogleSignIn = async () => {
    setErrorMessage('');
    setIsSubmitting(true);

    try {
      const result = await signInWithPopup(auth, googleProvider);
      const email = result.user?.email;

      if (!email) {
        throw new Error('Google Sign-In did not provide a valid email address.');
      }

      // Check if user is in Firestore "users" collection
      const authorizedUser = await getAuthorizedUserByEmail(email);

      if (authorizedUser) {
        setIsSubmitting(false);
        onLoginSuccess(authorizedUser);
      } else {
        // Not in authorized users collection -> reject and sign out immediately
        await signOut(auth);
        setIsSubmitting(false);
        setErrorMessage(
          `Access Restricted: "${email}" is not registered in the authorized users database. Only approved examiner and developer emails can access PROJECT-001.`
        );
        setShakeKey((prev) => prev + 1);
      }
    } catch (err: any) {
      console.error('[Google Sign-In Error]', err);
      setIsSubmitting(false);

      if (err.code === 'auth/popup-closed-by-user') {
        // User closed popup without signing in
        return;
      }

      setErrorMessage(
        err?.message || 'Failed to authenticate with Google. Please try again.'
      );
      setShakeKey((prev) => prev + 1);
    }
  };

  return (
    <div className="relative w-full h-screen bg-white text-slate-800 flex flex-col justify-between overflow-hidden select-none">
      {/* ════════ TOP BANNER ════════ */}
      <header className="relative w-full z-20">
        <div
          className="w-full h-20 sm:h-24 md:h-28 rounded-b-[24px] sm:rounded-b-[32px] md:rounded-b-[40px] flex items-center justify-center shadow-md relative overflow-hidden"
          style={{
            background: 'linear-gradient(90deg, #4DD9E8 0%, #0047AB 100%)',
          }}
        >
          {/* Subtle Top Gloss Accent */}
          <div className="absolute inset-x-0 top-0 h-1/3 bg-white/10 pointer-events-none" />

          {/* Centered Brand Title */}
          <h1 className="font-rounded font-bold text-2xl sm:text-3xl md:text-4xl text-white tracking-widest uppercase drop-shadow-md">
            PROJECT-001
          </h1>

          {/* Return to Landing Button */}
          <button
            onClick={onBackToLanding}
            className="absolute left-4 sm:left-8 top-1/2 -translate-y-1/2 flex items-center gap-1.5 text-xs sm:text-sm font-rounded font-semibold text-white/80 hover:text-white bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-full transition-all cursor-pointer"
            title="Return to Welcome Screen"
          >
            <ArrowUp className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Landing</span>
          </button>

          {/* Authorized Roles Badges in Header */}
          <div className="absolute right-4 sm:right-8 top-1/2 -translate-y-1/2 flex items-center gap-2">
            <span
              className="flex items-center gap-1 text-[11px] sm:text-xs font-rounded font-semibold text-white bg-white/20 backdrop-blur-xs px-2.5 sm:px-3 py-1.5 rounded-full shadow-xs"
              title="Authorized Developer role: tandooriroti2026@gmail.com"
            >
              <Code className="w-3 h-3 text-amber-300" />
              <span className="hidden sm:inline">Developer Access</span>
            </span>
            <span
              className="flex items-center gap-1 text-[11px] sm:text-xs font-rounded font-semibold text-white bg-white/20 backdrop-blur-xs px-2.5 sm:px-3 py-1.5 rounded-full shadow-xs"
              title="Authorized Examiner role: umaralishah.examiner@gmail.com"
            >
              <UserCheck className="w-3 h-3 text-white" />
              <span className="hidden sm:inline">Examiner Access</span>
            </span>
          </div>
        </div>
      </header>

      {/* ════════ CENTER CONTENT AREA ════════ */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-4 z-10 w-full overflow-y-auto">
        <motion.div
          key={shakeKey}
          initial={{ opacity: 0, scale: 0.96 }}
          animate={
            shakeKey > 0
              ? {
                  x: [0, -10, 10, -8, 8, -4, 4, 0],
                  opacity: 1,
                  scale: 1,
                }
              : { opacity: 1, scale: 1 }
          }
          transition={{ duration: 0.45, ease: 'easeOut' }}
          className="w-full max-w-[420px] sm:max-w-[480px] rounded-[28px] sm:rounded-[36px] p-7 sm:p-10 shadow-2xl relative overflow-hidden flex flex-col items-center"
          style={{
            background: 'linear-gradient(135deg, #4DD9E8 0%, #0047AB 100%)',
            boxShadow: '0 20px 45px -10px rgba(0, 71, 171, 0.45)',
          }}
        >
          {/* Subtle Ambient Reflection */}
          <div className="absolute top-0 right-0 w-48 h-48 bg-white/10 rounded-full blur-2xl pointer-events-none" />

          {/* "Login" Heading */}
          <h2 className="font-rounded font-bold text-3xl sm:text-4xl text-white mb-2 text-center tracking-wide drop-shadow-sm">
            Sign In
          </h2>
          <p className="text-white/80 text-xs sm:text-sm font-rounded mb-6 text-center">
            Sign in with your authorized Google Account to access the FBISE Grading & Verification Studio.
          </p>

          {/* Error Message */}
          <AnimatePresence>
            {errorMessage && (
              <motion.div
                initial={{ opacity: 0, y: -6, height: 0 }}
                animate={{ opacity: 1, y: 0, height: 'auto' }}
                exit={{ opacity: 0, y: -6, height: 0 }}
                className="w-full mb-5 px-4 py-3 bg-red-600/90 text-white rounded-2xl text-center text-xs sm:text-sm font-rounded font-semibold flex items-start justify-center gap-2 shadow-md backdrop-blur-xs"
              >
                <AlertCircle className="w-4 h-4 shrink-0 text-red-200 mt-0.5" />
                <span className="text-left">{errorMessage}</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Google Sign-In Button */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={isSubmitting}
            className="w-full max-w-[320px] bg-white hover:bg-slate-50 text-slate-800 font-rounded font-bold text-base sm:text-lg rounded-full py-3.5 px-6 shadow-xl hover:shadow-2xl active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-3 border border-slate-200 disabled:opacity-60"
          >
            {isSubmitting ? (
              <div className="flex items-center gap-2 text-[#0047AB]">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm font-semibold">Verifying account...</span>
              </div>
            ) : (
              <>
                {/* Official Google 'G' icon */}
                <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <span>Sign in with Google</span>
              </>
            )}
          </button>

          {/* Security & Access Notice */}
          <div className="mt-6 flex items-center gap-1.5 text-white/90 text-xs font-rounded">
            <ShieldCheck className="w-4 h-4 text-emerald-300" />
            <span>Role-Based Access Control enforced via Firestore</span>
          </div>
        </motion.div>

        {/* Demo Credentials Hint */}
        <div className="mt-4 text-center max-w-md">
          <p className="text-xs text-slate-400 font-rounded mb-1.5">
            Authorized Google accounts pre-configured in Firestore:
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2 text-xs font-rounded">
            <span className="text-[#0047AB] bg-blue-50 border border-blue-200 px-3 py-1 rounded-full flex items-center gap-1 font-semibold">
              <Code className="w-3 h-3 text-amber-500" />
              <span>Dev: {SEED_USERS[0].email}</span>
            </span>
            <span className="text-[#0047AB] bg-slate-50 border border-slate-200 px-3 py-1 rounded-full flex items-center gap-1 font-semibold">
              <UserCheck className="w-3 h-3 text-slate-500" />
              <span>Examiner: {SEED_USERS[1].email}</span>
            </span>
          </div>
        </div>
      </main>

      {/* ════════ BOTTOM BANNER ════════ */}
      <footer className="relative w-full z-20">
        <div
          className="w-full h-16 sm:h-20 md:h-24 rounded-t-[24px] sm:rounded-t-[32px] md:rounded-t-[40px] shadow-lg relative overflow-hidden"
          style={{
            background: 'linear-gradient(90deg, #4DD9E8 0%, #0047AB 100%)',
          }}
        >
          {/* Decorative mirror bar */}
          <div className="absolute inset-x-0 bottom-0 h-1/3 bg-black/10 pointer-events-none" />
        </div>
      </footer>
    </div>
  );
};
