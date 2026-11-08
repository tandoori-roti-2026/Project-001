import React, { useEffect } from 'react';
import { motion } from 'motion/react';

interface LandingScreenProps {
  onContinue: () => void;
}

export const LandingScreen: React.FC<LandingScreenProps> = ({ onContinue }) => {
  // Wheel, touch, and keyboard listeners for smooth scroll-to-continue
  useEffect(() => {
    let touchStartY = 0;

    const handleWheel = (e: WheelEvent) => {
      if (e.deltaY > 10) {
        onContinue();
      }
    };

    const handleTouchStart = (e: TouchEvent) => {
      touchStartY = e.touches[0].clientY;
    };

    const handleTouchEnd = (e: TouchEvent) => {
      const touchEndY = e.changedTouches[0].clientY;
      if (touchStartY - touchEndY > 25) {
        onContinue();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (['ArrowDown', 'PageDown', ' ', 'Enter'].includes(e.key)) {
        onContinue();
      }
    };

    window.addEventListener('wheel', handleWheel, { passive: true });
    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchend', handleTouchEnd, { passive: true });
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('wheel', handleWheel);
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onContinue]);

  return (
    <div
      onClick={onContinue}
      role="button"
      tabIndex={0}
      aria-label="Welcome to Project-001. Scroll or click anywhere to continue"
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          onContinue();
        }
      }}
      className="relative w-full h-screen bg-black text-white flex flex-col justify-between items-center px-4 py-8 sm:py-12 overflow-hidden select-none cursor-pointer outline-none"
    >
      {/* Empty top spacing block to balance vertical alignment */}
      <div className="w-full shrink-0 h-10 sm:h-16" />

      {/* ──── Exact Center Title: "Welcome To Project-001" ──── */}
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className="flex items-center justify-center text-center px-4 my-auto"
      >
        <h1 className="font-script text-white text-5xl sm:text-7xl md:text-8xl lg:text-[6.5rem] xl:text-[7.5rem] tracking-wide font-normal leading-tight drop-shadow-md">
          Welcome To Project-001
        </h1>
      </motion.div>

      {/* ──── Bottom Section: Solid White Line + "Scroll To Continue" ──── */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.2, ease: 'easeOut' }}
        className="w-full flex flex-col items-center pb-6 sm:pb-10 md:pb-14"
      >
        {/* Solid White Horizontal Line */}
        <div className="w-[280px] sm:w-[420px] md:w-[520px] lg:w-[600px] max-w-[88vw] h-[3px] bg-white mb-3 sm:mb-4" />

        {/* Cursive Subtitle */}
        <span className="font-script text-white text-2xl sm:text-3xl md:text-4xl lg:text-[2.6rem] tracking-wide font-normal">
          Scroll To Continue
        </span>
      </motion.div>
    </div>
  );
};
