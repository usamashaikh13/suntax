'use client';

import React, { createContext, useContext, useState, useEffect, useMemo, ReactNode } from 'react';
import { Language, TranslationDictionary } from './types';
import { de } from './translations/de';
import { en } from './translations/en';

const dictionaries: Record<Language, TranslationDictionary> = {
  de,
  en,
};

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (path: string, params?: Record<string, string | number>) => string;
  isGerman: boolean;
  isEnglish: boolean;
  dict: TranslationDictionary;
}

const LanguageContext = createContext<LanguageContextType | null>(null);

const STORAGE_KEY = 'suntax_language_preference';

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>('de');
  const [mounted, setMounted] = useState(false);

  // Synchronize document language on mount & whenever language changes
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as Language | null;
      if (stored === 'de' || stored === 'en') {
        setLanguageState(stored);
        if (typeof document !== 'undefined') {
          document.documentElement.lang = stored === 'de' ? 'de-CH' : 'en';
        }
      } else if (typeof document !== 'undefined') {
        document.documentElement.lang = 'de-CH';
      }
    } catch {
      // Fallback gracefully if localStorage is unavailable
      if (typeof document !== 'undefined') {
        document.documentElement.lang = 'de-CH';
      }
    }
    setMounted(true);
  }, []);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = language === 'de' ? 'de-CH' : 'en';
    }
  }, [language]);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    try {
      localStorage.setItem(STORAGE_KEY, lang);
      if (typeof document !== 'undefined') {
        document.documentElement.lang = lang === 'de' ? 'de-CH' : 'en';
      }
    } catch {
      // Ignore storage errors
    }
  };

  const dict = useMemo(() => dictionaries[language] || de, [language]);

  const t = (path: string, params?: Record<string, string | number>): string => {
    const parts = path.split('.');
    let cur: any = dict;

    for (const part of parts) {
      if (cur && typeof cur === 'object' && part in cur) {
        cur = cur[part];
      } else {
        // Missing key in current dict
        if (process.env.NODE_ENV !== 'production' && language !== 'de') {
          console.warn(`[i18n] Missing translation key "${path}" in "${language}", falling back to German.`);
        }
        // Fallback to German
        let fallback: any = de;
        for (const fPart of parts) {
          if (fallback && typeof fallback === 'object' && fPart in fallback) {
            fallback = fallback[fPart];
          } else {
            fallback = null;
            break;
          }
        }
        cur = fallback !== null && fallback !== undefined ? fallback : path;
        break;
      }
    }

    if (typeof cur !== 'string') {
      return path;
    }

    let text = cur;
    if (params) {
      for (const [key, val] of Object.entries(params)) {
        text = text.replace(new RegExp(`\\{${key}\\}`, 'g'), String(val));
      }
    }
    return text;
  };

  return (
    <LanguageContext.Provider
      value={{
        language,
        setLanguage,
        t,
        isGerman: language === 'de',
        isEnglish: language === 'en',
        dict,
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export function useTranslation() {
  const context = useContext(LanguageContext);
  if (!context) {
    // Return safe fallback if used outside provider
    return {
      language: 'de' as Language,
      setLanguage: () => {},
      t: (path: string, params?: Record<string, string | number>) => {
        const parts = path.split('.');
        let cur: any = de;
        for (const part of parts) {
          if (cur && typeof cur === 'object' && part in cur) {
            cur = cur[part];
          } else {
            return path;
          }
        }
        let text = typeof cur === 'string' ? cur : path;
        if (params) {
          for (const [key, val] of Object.entries(params)) {
            text = text.replace(new RegExp(`\\{${key}\\}`, 'g'), String(val));
          }
        }
        return text;
      },
      isGerman: true,
      isEnglish: false,
      dict: de,
    };
  }
  return context;
}
