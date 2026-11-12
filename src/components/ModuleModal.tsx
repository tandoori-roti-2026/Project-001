import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Clock, UploadCloud, Edit3, Award, Users, Bot, MessageSquare } from 'lucide-react';

export interface ModuleItem {
  id: string;
  title: string;
  body: string;
  iconName: 'upload' | 'edit' | 'award' | 'users' | 'bot' | 'message-square';
  mockDetails: string;
}

interface ModuleModalProps {
  module: ModuleItem | null;
  onClose: () => void;
}

export const ModuleModal: React.FC<ModuleModalProps> = ({ module, onClose }) => {
  if (!module) return null;

  const renderIcon = () => {
    switch (module.iconName) {
      case 'upload':
        return <UploadCloud className="w-10 h-10 text-white" />;
      case 'edit':
        return <Edit3 className="w-10 h-10 text-white" />;
      case 'award':
        return <Award className="w-10 h-10 text-white" />;
      case 'users':
        return <Users className="w-10 h-10 text-white" />;
      case 'bot':
        return <Bot className="w-10 h-10 text-white" />;
      case 'message-square':
        return <MessageSquare className="w-10 h-10 text-white" />;
      default:
        return <MessageSquare className="w-10 h-10 text-white" />;
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
        {/* Backdrop click */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0"
        />

        {/* Modal Card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="relative w-full max-w-lg rounded-[28px] p-6 sm:p-8 text-white shadow-2xl z-10 overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, #4DD9E8 0%, #0047AB 100%)',
            boxShadow: '0 25px 50px -12px rgba(0, 71, 171, 0.5)',
          }}
        >
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-5 right-5 w-9 h-9 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-colors cursor-pointer"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Module Icon and Title */}
          <div className="flex flex-col items-center text-center">
            <div className="w-20 h-20 rounded-2xl bg-white/20 flex items-center justify-center mb-4 shadow-inner">
              {renderIcon()}
            </div>

            <h3 className="font-rounded font-bold text-3xl sm:text-4xl text-white mb-2 tracking-wide drop-shadow-sm">
              {module.title}
            </h3>

            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/20 rounded-full text-xs font-rounded font-semibold text-white/95 mb-4">
              <Clock className="w-3.5 h-3.5" />
              <span>Shell Preview · Module Coming Soon</span>
            </div>

            {/* Description from prompt */}
            <p className="font-rounded text-base sm:text-lg text-white/95 leading-relaxed max-w-md mb-6">
              "{module.body}"
            </p>

            {/* Shell Details / Functional Preview */}
            <div className="w-full bg-white/10 rounded-2xl p-4 text-left border border-white/20 mb-6">
              <span className="text-xs uppercase font-rounded font-bold tracking-wider text-white/80 block mb-1">
                Planned Features:
              </span>
              <p className="font-rounded text-sm text-white/90">
                {module.mockDetails}
              </p>
            </div>

            {/* Action Button */}
            <button
              onClick={onClose}
              className="w-full bg-white text-[#0047AB] font-rounded font-bold text-base py-3 px-6 rounded-full shadow-lg hover:bg-white/95 active:scale-[0.98] transition-all cursor-pointer"
            >
              Back to Menu
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
