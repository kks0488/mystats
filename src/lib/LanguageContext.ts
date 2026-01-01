import { createContext } from 'react';
import { type TranslationKeys } from './translations';

export type Language = 'en' | 'ko';

export interface LanguageContextType {
    language: Language;
    setLanguage: (lang: Language) => void;
    t: (key: TranslationKeys) => string;
}

export const LanguageContext = createContext<LanguageContextType | undefined>(undefined);
