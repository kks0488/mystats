import { useState, useEffect, type ReactNode } from 'react';
import { translations, type TranslationKeys } from './translations';
import { LanguageContext, type Language } from './LanguageContext';

export const LanguageProvider = ({ children }: { children: ReactNode }) => {
    const [language, setLanguageState] = useState<Language>(() => {
        let saved: string | null = null;
        try { saved = localStorage.getItem('app_lang'); } catch { /* private mode */ }
        return (saved as Language) || 'en';
    });

    useEffect(() => {
        localStorage.setItem('app_lang', language);
    }, [language]);

    const setLanguage = (lang: Language) => {
        setLanguageState(lang);
    };

    const t = (key: TranslationKeys): string => {
        const translation = translations[language][key] || translations['en'][key] || key;
        return translation;
    };

    return (
        <LanguageContext.Provider value={{ language, setLanguage, t }}>
            {children}
        </LanguageContext.Provider>
    );
};
