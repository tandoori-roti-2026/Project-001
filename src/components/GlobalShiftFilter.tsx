import React from 'react';

export type ShiftFilterType = 'morning' | 'evening';

export const matchesShiftFilter = (shiftVal?: string, filter: ShiftFilterType = 'morning'): boolean => {
  if (!shiftVal) {
    return filter === 'morning';
  }
  const s = shiftVal.trim().toLowerCase();
  if (filter === 'morning') {
    return (
      s.includes('morn') ||
      s.includes('group 1') ||
      s.includes('group i') ||
      s === 'g1' ||
      s === 'am' ||
      s === 'morning'
    );
  } else {
    return (
      s.includes('eve') ||
      s.includes('group 2') ||
      s.includes('group ii') ||
      s === 'g2' ||
      s === 'pm' ||
      s === 'evening'
    );
  }
};

interface GlobalShiftFilterProps {
  shiftFilter: ShiftFilterType;
  onShiftFilterChange: (shift: ShiftFilterType) => void;
}

export const GlobalShiftFilter: React.FC<GlobalShiftFilterProps> = ({
  shiftFilter,
  onShiftFilterChange,
}) => {
  return (
    <div className="w-full bg-white border-b border-slate-200/80 py-2 sm:py-2.5 flex items-center justify-center z-10 shrink-0">
      <div className="flex items-center bg-slate-100 p-1 rounded-full border border-slate-200/80 shadow-2xs">
        <button
          type="button"
          onClick={() => onShiftFilterChange('morning')}
          className={`w-28 sm:w-32 py-1.5 rounded-full text-xs font-rounded font-bold transition-all cursor-pointer text-center ${
            shiftFilter === 'morning'
              ? 'bg-white text-[#0047AB] shadow-md'
              : 'text-slate-600 hover:text-slate-900 bg-transparent'
          }`}
        >
          Morning
        </button>
        <button
          type="button"
          onClick={() => onShiftFilterChange('evening')}
          className={`w-28 sm:w-32 py-1.5 rounded-full text-xs font-rounded font-bold transition-all cursor-pointer text-center ${
            shiftFilter === 'evening'
              ? 'bg-white text-[#0047AB] shadow-md'
              : 'text-slate-600 hover:text-slate-900 bg-transparent'
          }`}
        >
          Evening
        </button>
      </div>
    </div>
  );
};
