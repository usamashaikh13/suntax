import appTextsDe from '../app_texts_de.json';
import { TranslationDictionary } from '../types';
import { BRAND, interpolateBrandTokens } from '@/lib/brand';

export const de: TranslationDictionary = interpolateBrandTokens(
  appTextsDe as unknown as TranslationDictionary,
  BRAND,
);
