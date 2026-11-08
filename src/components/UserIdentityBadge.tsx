import React from 'react';
import { User, Code } from 'lucide-react';
import { UserAccount } from '../data/authUsers';

interface UserIdentityBadgeProps {
  user: UserAccount | null;
  compactOnMobile?: boolean;
}

export const UserIdentityBadge: React.FC<UserIdentityBadgeProps> = ({
  user,
  compactOnMobile = true,
}) => {
  if (!user) return null;

  const isDev = user.role === 'developer';

  return (
    <div className="flex items-center gap-2 text-white">
      <div
        className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center shrink-0 ${
          isDev
            ? 'bg-amber-400/20 border border-amber-300/50 text-amber-200 shadow-inner'
            : 'bg-white/20 border border-white/30 text-white'
        }`}
      >
        {isDev ? (
          <Code className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-300" />
        ) : (
          <User className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" />
        )}
      </div>

      <div className={`${compactOnMobile ? 'hidden sm:flex' : 'flex'} flex-col text-left`}>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] sm:text-[11px] font-rounded font-semibold text-white/85">
            {isDev ? 'Developer' : 'Examiner'}
          </span>
          <span
            className={`text-[9px] font-rounded font-extrabold px-1.5 py-0.5 rounded-full uppercase tracking-wider ${
              isDev
                ? 'bg-amber-300 text-slate-900 shadow-2xs'
                : 'bg-white/25 text-white'
            }`}
          >
            {isDev ? 'Developer' : 'Examiner'}
          </span>
        </div>
        <span className="text-xs sm:text-sm font-rounded font-bold text-white leading-tight truncate max-w-[120px] sm:max-w-[180px]">
          {user.name}
        </span>
      </div>
    </div>
  );
};
