import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertCircle, ArrowUp, Eye, EyeOff, KeyRound, Code, UserCheck } from 'lucide-react';
import { UserAccount, validateCredentials, USER_ACCOUNTS } from '../data/authUsers';

interface LoginScreenProps {
  onLoginSuccess: (user: UserAccount) => void;
  onBackToLanding: () => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({
  onLoginSuccess,
  onBackToLanding,
}) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [shakeKey, setShakeKey] = useState(0);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMessage('');
    setIsSubmitting(true);

    // Subtle natural delay for authentic feel
    setTimeout(() => {
      const authenticatedUser = validateCredentials(username, password);
      if (authenticatedUser) {
        setIsSubmitting(false);
        onLoginSuccess(authenticatedUser);
      } else {
        setIsSubmitting(false);
        setErrorMessage('Invalid username or password');
        setPassword(''); // Clear password field as specified
        setShakeKey((prev) => prev + 1); // Trigger subtle card shake
      }
    }, 250);
  };

  const handleFillAccount = (index: number) => {
    const acc = USER_ACCOUNTS[index];
    if (acc) {
      setUsername(acc.username);
      setPassword(acc.password || '');
      setErrorMessage('');
    }
  };

  return (
    <div className="relative w-full h-screen bg-white text-slate-800 flex flex-col justify-between overflow-hidden">
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

          {/* Quick Demo Helper in Header */}
          <div className="absolute right-4 sm:right-8 top-1/2 -translate-y-1/2 flex items-center gap-2">
            <button
              onClick={() => handleFillAccount(0)}
              className="flex items-center gap-1 text-[11px] sm:text-xs font-rounded font-semibold text-white bg-white/20 hover:bg-white/30 backdrop-blur-xs px-2.5 sm:px-3 py-1.5 rounded-full transition-all cursor-pointer shadow-xs"
              title="Auto-fill Developer: Tandoori Roti"
            >
              <Code className="w-3 h-3 text-amber-300" />
              <span className="hidden sm:inline">Dev Mode</span>
            </button>
            <button
              onClick={() => handleFillAccount(1)}
              className="flex items-center gap-1 text-[11px] sm:text-xs font-rounded font-semibold text-white bg-white/20 hover:bg-white/30 backdrop-blur-xs px-2.5 sm:px-3 py-1.5 rounded-full transition-all cursor-pointer shadow-xs"
              title="Auto-fill Normal User: Umar Ali Shah"
            >
              <UserCheck className="w-3 h-3 text-white" />
              <span className="hidden sm:inline">Normal Mode</span>
            </button>
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
          className="w-full max-w-[420px] sm:max-w-[480px] rounded-[28px] sm:rounded-[36px] p-7 sm:p-10 shadow-2xl relative overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, #4DD9E8 0%, #0047AB 100%)',
            boxShadow: '0 20px 45px -10px rgba(0, 71, 171, 0.45)',
          }}
        >
          {/* Subtle Ambient Reflection */}
          <div className="absolute top-0 right-0 w-48 h-48 bg-white/10 rounded-full blur-2xl pointer-events-none" />

          {/* Form */}
          <form onSubmit={handleSubmit} className="flex flex-col items-center w-full">
            {/* "Login" Heading */}
            <h2 className="font-rounded font-bold text-3xl sm:text-4xl text-white mb-6 text-center tracking-wide drop-shadow-sm">
              Login
            </h2>

            {/* Error Message */}
            <AnimatePresence>
              {errorMessage && (
                <motion.div
                  initial={{ opacity: 0, y: -6, height: 0 }}
                  animate={{ opacity: 1, y: 0, height: 'auto' }}
                  exit={{ opacity: 0, y: -6, height: 0 }}
                  className="w-full mb-4 px-4 py-2 bg-red-600/90 text-white rounded-xl text-center text-xs sm:text-sm font-rounded font-semibold flex items-center justify-center gap-2 shadow-md backdrop-blur-xs"
                >
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-200" />
                  <span>{errorMessage}</span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Username Section */}
            <div className="w-full max-w-[320px] flex flex-col items-center mb-5">
              <label
                htmlFor="username-input"
                className="font-rounded font-bold text-base sm:text-lg text-white mb-2 text-center drop-shadow-xs"
              >
                Username
              </label>
              <input
                id="username-input"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  if (errorMessage) setErrorMessage('');
                }}
                placeholder="Enter username"
                className="w-full bg-white text-slate-800 text-center font-rounded font-semibold text-base sm:text-lg rounded-full py-3 px-5 shadow-inner focus:outline-none focus:ring-4 focus:ring-white/50 transition-all placeholder:text-slate-400 placeholder:font-normal"
                required
              />
            </div>

            {/* Password Section */}
            <div className="w-full max-w-[320px] flex flex-col items-center mb-6">
              <label
                htmlFor="password-input"
                className="font-rounded font-bold text-base sm:text-lg text-white mb-2 text-center drop-shadow-xs"
              >
                Password
              </label>
              <div className="relative w-full">
                <input
                  id="password-input"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (errorMessage) setErrorMessage('');
                  }}
                  placeholder="Enter password"
                  className="w-full bg-white text-slate-800 text-center font-rounded font-semibold text-base sm:text-lg rounded-full py-3 px-10 shadow-inner focus:outline-none focus:ring-4 focus:ring-white/50 transition-all placeholder:text-slate-400 placeholder:font-normal"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer p-1"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Implicit / Visible Submit Button (Press Enter works, button also available for tap/click) */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full max-w-[320px] bg-white hover:bg-white/90 text-[#0047AB] font-rounded font-bold text-base sm:text-lg rounded-full py-3 px-6 shadow-lg hover:shadow-xl active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <div className="w-5 h-5 border-2 border-[#0047AB] border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <span>Sign In</span>
                  <KeyRound className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </motion.div>

        {/* Demo Credentials Hint */}
        <div className="mt-4 text-center">
          <p className="text-xs text-slate-400 font-rounded mb-1.5">
            Authorized demo credentials:
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2 text-xs font-rounded">
            <button
              type="button"
              onClick={() => handleFillAccount(0)}
              className="text-[#0047AB] bg-blue-50 hover:bg-blue-100 border border-blue-200 px-3 py-1 rounded-full transition-colors cursor-pointer flex items-center gap-1 font-semibold"
            >
              <Code className="w-3 h-3 text-amber-500" />
              <span>Dev: Tandoori Roti / S1a2i3f45</span>
            </button>
            <button
              type="button"
              onClick={() => handleFillAccount(1)}
              className="text-[#0047AB] bg-slate-50 hover:bg-slate-100 border border-slate-200 px-3 py-1 rounded-full transition-colors cursor-pointer flex items-center gap-1 font-semibold"
            >
              <UserCheck className="w-3 h-3 text-slate-500" />
              <span>Normal: Umar Ali Shah / U1m2a3r45</span>
            </button>
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
