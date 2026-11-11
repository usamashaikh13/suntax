'use client';

import React from 'react';
import { useTranslation } from '@/lib/i18n/LanguageContext';

interface LanguageSwitcherProps {
  className?: string;
}

export function LanguageSwitcher({ className = '' }: LanguageSwitcherProps) {
  const { language, setLanguage } = useTranslation();

  return (
    <div
      role="group"
      aria-label="Language selector"
      className={`inline-flex items-center rounded-full p-0.5 bg-[#F2F2F0] border border-[#E5E5E0] text-xs font-semibold select-none ${className}`}
    >
      <button
        type="button"
        onClick={() => setLanguage('de')}
        aria-pressed={language === 'de'}
        className={`px-2.5 py-1 rounded-full transition-all duration-150 ${
          language === 'de'
            ? 'bg-[#1E7B52] text-white shadow-xs font-bold'
            : 'text-[#666666] hover:text-[#0A0A0A]'
        }`}
      >
        DE
      </button>
      <button
        type="button"
        onClick={() => setLanguage('en')}
        aria-pressed={language === 'en'}
        className={`px-2.5 py-1 rounded-full transition-all duration-150 ${
          language === 'en'
            ? 'bg-[#1E7B52] text-white shadow-xs font-bold'
            : 'text-[#666666] hover:text-[#0A0A0A]'
        }`}
      >
        EN
      </button>
    </div>
  );
}
