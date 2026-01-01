import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { 
  getDB, 
  exportAllData, 
  importAllData, 
  upsertSkill,
  DB_NAME,
  type Skill, 
  type Insight,
  type JournalEntry
} from '../db/db';
import { 
  Sparkles, 
  Brain, 
  Target, 
  ShieldAlert, 
  Zap, 
  Code, 
  Cpu, 
  Heart, 
  Lightbulb,
  ArrowUpRight,
  Fingerprint,
  Download,
  Upload,
  Database,
  AlertTriangle
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useLanguage } from '../hooks/useLanguage';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { analyzeEntryWithAI, checkAIStatus } from '../lib/ai-provider';
import {
  loadFallbackSkills,
  loadFallbackInsights,
  loadFallbackJournalEntries,
  upsertFallbackSkill,
  addFallbackInsight,
  replaceFallbackJournalEntries,
  replaceFallbackSkills,
  replaceFallbackInsights,
  clearFallbackData,
  clearFallbackSkills,
  clearFallbackInsights,
  getFallbackStorageMode,
} from '../db/fallback';

interface SkillSummary extends Skill {
    count: number;
}

const normalizeSkillName = (value: string) =>
    value
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/^[\"'`]+|[\"'`]+$/g, '')
        .replace(/[.!?;:]+$/g, '')
        .toLowerCase();

const aggregateSkills = (items: Skill[]): SkillSummary[] => {
    const map = new Map<string, { skill: Skill; sourceIds: Set<string> }>();
    for (const skill of items) {
        const cleanedName = skill.name?.trim();
        if (!cleanedName) continue;
        const key = normalizeSkillName(cleanedName);
        if (!key) continue;
        const sourceIds = new Set(skill.sourceEntryIds ?? []);
        const existing = map.get(key);
        if (!existing) {
            map.set(key, { skill: { ...skill, name: cleanedName }, sourceIds });
            continue;
        }
        for (const id of sourceIds) {
            existing.sourceIds.add(id);
        }
        const existingTime = existing.skill.lastModified ?? existing.skill.createdAt ?? 0;
        const nextTime = skill.lastModified ?? skill.createdAt ?? 0;
        if (nextTime >= existingTime) {
            existing.skill = { ...existing.skill, name: cleanedName, lastModified: skill.lastModified ?? existing.skill.lastModified };
        }
    }

    return Array.from(map.entries())
        .map(([key, value]) => {
            const ids = Array.from(value.sourceIds);
            return {
                ...value.skill,
                id: key,
                sourceEntryIds: ids,
                count: ids.length || 1,
            };
        })
        .sort((a, b) => {
            const countDiff = b.count - a.count;
            if (countDiff !== 0) return countDiff;
            const timeDiff = (b.lastModified ?? b.createdAt ?? 0) - (a.lastModified ?? a.createdAt ?? 0);
            if (timeDiff !== 0) return timeDiff;
            return a.name.localeCompare(b.name);
        });
};

const mergeById = <T extends { id?: string }>(items: T[]) => {
    const map = new Map<string, T>();
    for (const item of items) {
        if (!item || typeof item !== 'object') continue;
        const id = item.id;
        if (typeof id !== 'string' || !id.trim()) continue;
        map.set(id, item);
    }
    return Array.from(map.values());
};

const mergeSkillsByName = (items: Skill[]): Skill[] => {
    const map = new Map<string, { skill: Skill; sourceIds: Set<string> }>();
    for (const item of items) {
        if (!item || typeof item.name !== 'string') continue;
        const key = normalizeSkillName(item.name);
        if (!key) continue;
        const sourceIds = new Set(item.sourceEntryIds ?? []);
        const existing = map.get(key);
        if (!existing) {
            map.set(key, { skill: item, sourceIds });
            continue;
        }
        for (const id of sourceIds) {
            existing.sourceIds.add(id);
        }
        const existingTime = existing.skill.lastModified ?? existing.skill.createdAt ?? 0;
        const nextTime = item.lastModified ?? item.createdAt ?? 0;
        if (nextTime >= existingTime) {
            existing.skill = item;
        }
    }
    return Array.from(map.values()).map((value) => ({
        ...value.skill,
        sourceEntryIds: Array.from(value.sourceIds),
    }));
};

export const Profile = () => {
    const { t, language } = useLanguage();
    const [skills, setSkills] = useState<Skill[]>([]);
    const [insights, setInsights] = useState<Insight[]>([]);
    const [isExporting, setIsExporting] = useState(false);
    const [dbNotice, setDbNotice] = useState<string | null>(null);
    const [isRebuilding, setIsRebuilding] = useState(false);
    const [rebuildProgress, setRebuildProgress] = useState<{ current: number; total: number } | null>(null);
    const [rebuildMessage, setRebuildMessage] = useState<string | null>(null);
    const [isResettingDb, setIsResettingDb] = useState(false);
    const [resetMessage, setResetMessage] = useState<string | null>(null);
    const [showAllArchetypes, setShowAllArchetypes] = useState(false);
    const [showAllPatterns, setShowAllPatterns] = useState(false);
    const [showAllQuestions, setShowAllQuestions] = useState(false);
    const [storageMode, setStorageMode] = useState<'db' | 'fallback' | 'memory'>('db');
    const migrationInProgress = useRef(false);

    const maybeRecoverFallbackData = useCallback(async (db: Awaited<ReturnType<typeof getDB>>) => {
        if (migrationInProgress.current) return false;
        const fallbackEntries = loadFallbackJournalEntries();
        const fallbackSkills = loadFallbackSkills();
        const fallbackInsights = loadFallbackInsights();
        if (!fallbackEntries.length && !fallbackSkills.length && !fallbackInsights.length) return false;
        migrationInProgress.current = true;
        setDbNotice(t('dbRecovering'));
        try {
            const tx = db.transaction(['journal', 'skills', 'insights'], 'readwrite');
            const journalStore = tx.objectStore('journal');
            const skillStore = tx.objectStore('skills');
            const insightStore = tx.objectStore('insights');

            for (const entry of fallbackEntries) {
                await journalStore.put(entry);
            }
            for (const skill of fallbackSkills) {
                await skillStore.put(skill);
            }
            for (const insight of fallbackInsights) {
                await insightStore.put(insight);
            }

            await tx.done;
            clearFallbackData();
            setDbNotice(t('dbRecovered'));
            setTimeout(() => setDbNotice(null), 4000);
            return true;
        } catch (error) {
            console.warn('Failed to recover fallback profile data', error);
            setDbNotice(t('dbProfileFallback'));
            return false;
        } finally {
            migrationInProgress.current = false;
        }
    }, [t]);

    const loadData = useCallback(async () => {
        try {
            const db = await getDB();
            const recovered = await maybeRecoverFallbackData(db);
            const allSkills = await db.getAll('skills');
            const allInsights = await db.getAll('insights');
            setSkills(allSkills);
            setInsights(allInsights);
            setDbNotice(null);
            setStorageMode('db');
            if (recovered) {
                const refreshedSkills = await db.getAll('skills');
                const refreshedInsights = await db.getAll('insights');
                setSkills(refreshedSkills);
                setInsights(refreshedInsights);
            }
        } catch {
            console.warn('Failed to load profile data');
            const fallbackSkills = loadFallbackSkills();
            const fallbackInsights = loadFallbackInsights();
            setSkills(fallbackSkills);
            setInsights(fallbackInsights);
            setStorageMode(getFallbackStorageMode() === 'memory' ? 'memory' : 'fallback');
            setDbNotice(
                fallbackSkills.length || fallbackInsights.length
                    ? t('dbProfileFallback')
                    : t('dbProfileUnavailable')
            );
        }
    }, [maybeRecoverFallbackData, t]);

    const handleRebuildProfile = useCallback(async () => {
        const confirmed = window.confirm(t('rebuildConfirm'));
        if (!confirmed) return;

        const aiStatus = checkAIStatus();
        if (!aiStatus.configured) {
            setRebuildMessage(t('apiKeyRequired'));
            return;
        }

        setIsRebuilding(true);
        setRebuildMessage(t('rebuildRunning'));
        setRebuildProgress(null);

        let entries: JournalEntry[] = [];
        let useFallback = false;
        let db = null as Awaited<ReturnType<typeof getDB>> | null;

        try {
            db = await getDB();
            entries = await db.getAll('journal');
        } catch {
            entries = loadFallbackJournalEntries();
            useFallback = true;
            if (!entries.length) {
                setIsRebuilding(false);
                setRebuildMessage(t('rebuildNoEntries'));
                return;
            }
        }

        if (!entries.length) {
            setIsRebuilding(false);
            setRebuildMessage(t('rebuildNoEntries'));
            return;
        }

        try {
            if (useFallback) {
                clearFallbackSkills();
                clearFallbackInsights();
            } else if (db) {
                const tx = db.transaction(['skills', 'insights'], 'readwrite');
                await tx.objectStore('skills').clear();
                await tx.objectStore('insights').clear();
                await tx.done;
            }

            const total = entries.length;
            let current = 0;
            for (const entry of entries) {
                current += 1;
                setRebuildProgress({ current, total });
                const result = await analyzeEntryWithAI(entry.content, language);

                if (result.insight) {
                    const insightData: Insight = {
                        id: crypto.randomUUID(),
                        entryId: entry.id,
                        ...result.insight,
                        timestamp: entry.timestamp,
                        lastModified: Date.now()
                    };
                    if (useFallback) {
                        addFallbackInsight(insightData);
                    } else if (db) {
                        await db.put('insights', insightData);
                    }
                }

                const categories: Array<{ items?: { name: string, category?: string }[], defaultCategory?: Skill['category'] }> = [
                    { items: result.skills, defaultCategory: 'hard' },
                    { items: result.traits, defaultCategory: 'trait' },
                    { items: result.experiences, defaultCategory: 'experience' },
                    { items: result.interests, defaultCategory: 'interest' }
                ];

                for (const group of categories) {
                    if (group.items) {
                        for (const item of group.items) {
                            const category = (item.category ?? group.defaultCategory) as Skill['category'];
                            if (useFallback) {
                                upsertFallbackSkill({ name: item.name, category }, entry.id);
                            } else {
                                await upsertSkill({ name: item.name, category }, entry.id);
                            }
                        }
                    }
                }
            }

            await loadData();
            setRebuildMessage(t('rebuildDone'));
        } catch (error) {
            console.error('Rebuild failed', error);
            setRebuildMessage(t('rebuildFailed'));
        } finally {
            setIsRebuilding(false);
            setTimeout(() => setRebuildMessage(null), 6000);
        }
    }, [language, loadData, t]);

    const handleResetDb = useCallback(() => {
        const confirmed = window.confirm(t('dbResetConfirm'));
        if (!confirmed) return;
        setIsResettingDb(true);
        setResetMessage(t('dbResetting'));
        try {
            const req = indexedDB.deleteDatabase(DB_NAME);
            req.onsuccess = () => {
                setIsResettingDb(false);
                window.location.reload();
            };
            req.onerror = () => {
                setIsResettingDb(false);
                setResetMessage(t('dbResetFailed'));
                setTimeout(() => setResetMessage(null), 6000);
            };
            req.onblocked = () => {
                setIsResettingDb(false);
                setResetMessage(t('dbResetBlocked'));
                setTimeout(() => setResetMessage(null), 6000);
            };
        } catch {
            setIsResettingDb(false);
            setResetMessage(t('dbResetFailed'));
            setTimeout(() => setResetMessage(null), 6000);
        }
    }, [t]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const handleExport = async () => {
        try {
            setIsExporting(true);
            let data: Record<string, any[]> = { journal: [], skills: [], solutions: [], insights: [] };
            let dbAvailable = true;
            try {
                data = await exportAllData();
            } catch (err) {
                console.warn('Export failed from DB, falling back', err);
                dbAvailable = false;
            }
            const fallback = {
                journal: loadFallbackJournalEntries(),
                skills: loadFallbackSkills(),
                insights: loadFallbackInsights(),
            };
            const hasFallback = fallback.journal.length > 0 || fallback.skills.length > 0 || fallback.insights.length > 0;
            let includeFallback = hasFallback;

            if (!dbAvailable) {
                const confirmExport = window.confirm(t('exportDbUnavailable'));
                if (!confirmExport) {
                    setIsExporting(false);
                    return;
                }
            } else if (hasFallback) {
                const confirmExport = window.confirm(t('exportFallbackWarning'));
                if (!confirmExport) {
                    includeFallback = false;
                }
            }

            const payload = {
                meta: {
                    version: 2,
                    exportedAt: new Date().toISOString(),
                    sources: {
                        indexeddb: dbAvailable,
                        fallback: includeFallback && hasFallback,
                    },
                },
                ...data,
                fallback: includeFallback ? fallback : { journal: [], skills: [], insights: [] },
            };
            const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `mystats_backup_${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error("Export failed:", err);
            alert("Export failed");
        } finally {
            setIsExporting(false);
        }
    };

    const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const confirmImport = window.confirm(
            language === 'ko' 
                ? "데이터를 복원하시겠습니까? 동일한 ID의 데이터는 덮어씌워집니다." 
                : "Are you sure you want to restore data? Existing data with the same IDs will be overwritten."
        );
        if (!confirmImport) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const raw = JSON.parse(event.target?.result as string);
                const data = raw && typeof raw === 'object' ? raw : {};
                const baseData = {
                    journal: Array.isArray(data.journal)
                        ? data.journal
                        : Array.isArray(data.entries)
                            ? data.entries
                            : [],
                    skills: Array.isArray(data.skills) ? data.skills : [],
                    solutions: Array.isArray(data.solutions) ? data.solutions : [],
                    insights: Array.isArray(data.insights) ? data.insights : [],
                };
                const fallbackData = data.fallback && typeof data.fallback === 'object'
                    ? {
                        journal: Array.isArray(data.fallback.journal)
                            ? data.fallback.journal
                            : Array.isArray(data.fallback.entries)
                                ? data.fallback.entries
                                : [],
                        skills: Array.isArray(data.fallback.skills) ? data.fallback.skills : [],
                        insights: Array.isArray(data.fallback.insights) ? data.fallback.insights : [],
                    }
                    : { journal: [], skills: [], insights: [] };
                const hasFallback = fallbackData.journal.length > 0 || fallbackData.skills.length > 0 || fallbackData.insights.length > 0;

                let includeFallback = hasFallback;
                if (hasFallback) {
                    const confirmFallback = window.confirm(t('importFallbackWarning'));
                    includeFallback = confirmFallback;
                }

                const selectedJournal = (includeFallback
                    ? [...baseData.journal, ...fallbackData.journal]
                    : [...baseData.journal]) as JournalEntry[];
                const selectedSkills = (includeFallback
                    ? [...baseData.skills, ...fallbackData.skills]
                    : [...baseData.skills]) as Skill[];
                const selectedInsights = (includeFallback
                    ? [...baseData.insights, ...fallbackData.insights]
                    : [...baseData.insights]) as Insight[];

                const rawJournal = selectedJournal;
                const rawSkills = selectedSkills;
                const rawInsights = selectedInsights;

                let mergedJournal = mergeById<JournalEntry>(selectedJournal);
                let mergedSkills = mergeSkillsByName(selectedSkills);
                let mergedInsights = mergeById<Insight>(selectedInsights);
                const mergedSolutions = mergeById(baseData.solutions as { id?: string }[]);
                const summaryText = t('importSummary')
                    .replace('{entries}', String(mergedJournal.length))
                    .replace('{skills}', String(mergedSkills.length))
                    .replace('{insights}', String(mergedInsights.length));

                try {
                    await importAllData({
                        journal: mergedJournal,
                        skills: mergedSkills,
                        solutions: mergedSolutions,
                        insights: mergedInsights,
                    });
                    alert(
                        mergedJournal.length || mergedSkills.length || mergedInsights.length
                            ? summaryText
                            : t('importEmpty')
                    );
                    loadData();
                    window.dispatchEvent(new Event('mystats-data-updated'));
                } catch (err) {
                    console.warn('DB import failed. Saving to fallback only.', err);
                    replaceFallbackJournalEntries(rawJournal);
                    replaceFallbackSkills(rawSkills);
                    replaceFallbackInsights(rawInsights);
                    setSkills(loadFallbackSkills());
                    setInsights(loadFallbackInsights());
                    setDbNotice(t('dbProfileFallback'));
                    alert(
                        mergedJournal.length || mergedSkills.length || mergedInsights.length
                            ? `${t('importFallbackOnly')}\n${summaryText}`
                            : `${t('importFallbackOnly')}\n${t('importEmpty')}`
                    );
                    loadData();
                    window.dispatchEvent(new Event('mystats-data-updated'));
                }
            } catch (err) {
                console.error("Import failed:", err);
                alert(language === 'ko' ? "파일 형식이 올바르지 않습니다." : "Invalid file format.");
            }
        };
        reader.readAsText(file);
    };

    const safeInsights = Array.isArray(insights) ? insights : [];

    const grouped = useMemo(() => {
        const list = Array.isArray(skills) ? skills : [];
        return {
            hard: aggregateSkills(list.filter(s => s.category === 'hard')),
            soft: aggregateSkills(list.filter(s => s.category === 'soft')),
            experience: aggregateSkills(list.filter(s => s.category === 'experience')),
            interest: aggregateSkills(list.filter(s => s.category === 'interest')),
            trait: aggregateSkills(list.filter(s => ['trait', 'strength', 'weakness'].includes(s.category))),
        };
    }, [skills]);

    const storageLabel =
        storageMode === 'db'
            ? t('storageModeDb')
            : storageMode === 'memory'
                ? t('storageModeMemory')
                : t('storageModeFallback');

    const uniqueArchetypes = Array.from(new Set(safeInsights.flatMap(i => i.archetypes || []))).map(a => a?.trim()).filter(Boolean);
    const uniquePatterns = Array.from(new Set(safeInsights.flatMap(i => i.hiddenPatterns || []))).map(p => p?.trim()).filter(Boolean);
    const uniqueQuestions = Array.from(new Set(safeInsights.flatMap(i => i.criticalQuestions || []))).map(q => q?.trim()).filter(Boolean);
    const listLimit = 10;
    const visibleArchetypes = showAllArchetypes ? uniqueArchetypes : uniqueArchetypes.slice(0, listLimit);
    const visiblePatterns = showAllPatterns ? uniquePatterns : uniquePatterns.slice(0, listLimit);
    const visibleQuestions = showAllQuestions ? uniqueQuestions : uniqueQuestions.slice(0, listLimit);
    const hiddenArchetypeCount = Math.max(uniqueArchetypes.length - visibleArchetypes.length, 0);
    const hiddenPatternCount = Math.max(uniquePatterns.length - visiblePatterns.length, 0);
    const hiddenQuestionCount = Math.max(uniqueQuestions.length - visibleQuestions.length, 0);

    return (
        <div className="max-w-6xl mx-auto space-y-12 pb-20">
            <header className="space-y-4">
                <div className="flex items-center gap-2 text-primary font-mono text-xs font-bold uppercase tracking-[0.3em]">
                    <Fingerprint className="w-4 h-4" />
                    Neural Identity Map
                </div>
                <h1 className="text-5xl font-black tracking-tighter">{t('profileTitle')}</h1>
                <p className="text-xl text-muted-foreground font-medium max-w-2xl leading-relaxed">
                    {t('profileDesc')}
                </p>
            </header>

            {dbNotice && (
                <div className="flex items-center gap-3 p-6 bg-amber-500/10 border border-amber-500/20 rounded-[2rem] text-amber-500">
                    <AlertTriangle className="w-6 h-6" />
                    <p className="font-bold tracking-tight">{dbNotice}</p>
                </div>
            )}
            
            {(uniqueArchetypes.length > 0 || uniquePatterns.length > 0) && (
                <Card className="bg-secondary/20 border-border backdrop-blur-2xl rounded-[3rem] overflow-hidden shadow-2xl">
                    <CardHeader className="p-10 pb-6">
                        <div className="flex items-center gap-4 mb-2">
                            <div className="p-3 bg-amber-500/10 text-amber-500 rounded-2xl ring-1 ring-amber-500/20">
                                 <Sparkles className="w-6 h-6" />
                            </div>
                            <div>
                                <CardTitle className="text-3xl font-black tracking-tight">{t('deepInsights')}</CardTitle>
                                <CardDescription className="text-muted-foreground font-semibold">
                                     {t('deepInsightsDesc')}
                                </CardDescription>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="p-10 pt-4 space-y-12">
                        {/* Phase 3: Deep Existential Core */}
                        {safeInsights.length > 0 && (
                            <div className="relative group">
                                <div className="absolute -inset-4 bg-gradient-to-r from-primary/30 via-primary/15 to-primary/25 rounded-[2.5rem] blur-2xl opacity-60 group-hover:opacity-100 transition duration-1000" />
                                <div className="relative p-8 bg-primary/10 backdrop-blur-3xl border border-primary/25 rounded-[2.5rem] space-y-8 overflow-hidden">
                                     <div className="absolute -top-10 -right-10 w-40 h-40 bg-primary/25 blur-[80px] rounded-full" />
                                     <div className="flex items-start justify-between">
                                         <div className="space-y-2">
                                             <div className="flex items-center gap-2 text-primary font-mono text-[10px] font-black uppercase tracking-[0.4em]">
                                                 <Cpu className="w-3 h-3" />
                                                 Existential Strategist Result
                                             </div>
                                             <h2 className="text-4xl font-black tracking-tighter text-foreground italic">
                                                 {safeInsights[safeInsights.length - 1].archetypes?.[0] || "Root Consciousness"}
                                             </h2>
                                         </div>
                                         <div className="px-4 py-2 bg-primary/10 border border-primary/30 rounded-full text-[10px] font-black uppercase tracking-widest text-primary animate-pulse">
                                             Phase 3 Active
                                         </div>
                                     </div>

                                     <div className="grid md:grid-cols-2 gap-8 relative z-10">
                                         <div className="space-y-4">
                                             <p className="text-sm font-medium text-foreground/70 uppercase tracking-[0.2em] flex items-center gap-2">
                                                 <Fingerprint size={12} className="text-primary" /> Meta-Pattern
                                             </p>
                                             <div className="text-xl font-bold leading-relaxed text-foreground">
                                                 "{safeInsights[safeInsights.length - 1].hiddenPatterns?.[0]}"
                                             </div>
                                         </div>
                                         <div className="space-y-4">
                                             <p className="text-sm font-medium text-foreground/70 uppercase tracking-[0.2em] flex items-center gap-2">
                                                 <Zap size={12} className="text-destructive" /> Core Probe
                                             </p>
                                             <div className="text-xl font-medium italic leading-relaxed text-foreground/80">
                                                 "{safeInsights[safeInsights.length - 1].criticalQuestions?.[0]}"
                                             </div>
                                         </div>
                                     </div>
                                </div>
                            </div>
                        )}

                        <div className="grid md:grid-cols-2 gap-12">
                            {uniqueArchetypes.length > 0 && (
                                <div className="space-y-6">
                                    <div className="flex items-center justify-between gap-3">
                                        <h3 className="text-muted-foreground uppercase text-[10px] font-black tracking-[0.2em] flex items-center gap-2">
                                            <Target size={14} className="text-primary" /> {t('archetypesIdentified')}
                                        </h3>
                                        {hiddenArchetypeCount > 0 && (
                                            <button
                                                type="button"
                                                onClick={() => setShowAllArchetypes(prev => !prev)}
                                                className="text-[10px] font-black uppercase tracking-widest text-primary hover:underline underline-offset-4"
                                            >
                                                {showAllArchetypes ? t('showLess') : `${t('showAll')} (${hiddenArchetypeCount})`}
                                            </button>
                                        )}
                                    </div>
                                    <div className="flex flex-wrap gap-3">
                                        {visibleArchetypes.map(arch => (
                                            <Badge key={arch} variant="secondary" className="px-5 py-2 rounded-xl bg-secondary/50 border-border text-foreground font-bold text-sm hover:bg-secondary transition-colors">
                                                {arch}
                                            </Badge>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {uniquePatterns.length > 0 && (
                                <div className="space-y-6">
                                    <div className="flex items-center justify-between gap-3">
                                        <h3 className="text-muted-foreground uppercase text-[10px] font-black tracking-[0.2em] flex items-center gap-2">
                                            <Brain size={14} className="text-primary" /> {t('hiddenPatterns')}
                                        </h3>
                                        {hiddenPatternCount > 0 && (
                                            <button
                                                type="button"
                                                onClick={() => setShowAllPatterns(prev => !prev)}
                                                className="text-[10px] font-black uppercase tracking-widest text-primary hover:underline underline-offset-4"
                                            >
                                                {showAllPatterns ? t('showLess') : `${t('showAll')} (${hiddenPatternCount})`}
                                            </button>
                                        )}
                                    </div>
                                    <div className="space-y-3">
                                        {visiblePatterns.map(pattern => (
                                            <div key={pattern} className="p-4 bg-background/40 rounded-2xl border border-border group hover:border-primary/30 transition-all font-medium leading-relaxed">
                                                <span className="text-muted-foreground group-hover:text-foreground transition-colors">{pattern}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                         {uniqueQuestions.length > 0 && (
                            <div className="pt-10 border-t border-border">
                                <div className="flex items-center justify-between gap-3 mb-6">
                                    <h3 className="text-destructive/80 uppercase text-[10px] font-black tracking-[0.2em] flex items-center gap-2">
                                        <ShieldAlert size={14} /> {t('criticalQuestions')}
                                    </h3>
                                    {hiddenQuestionCount > 0 && (
                                        <button
                                            type="button"
                                            onClick={() => setShowAllQuestions(prev => !prev)}
                                            className="text-[10px] font-black uppercase tracking-widest text-destructive/80 hover:text-destructive hover:underline underline-offset-4"
                                        >
                                            {showAllQuestions ? t('showLess') : `${t('showAll')} (${hiddenQuestionCount})`}
                                        </button>
                                    )}
                                </div>
                                <div className="grid sm:grid-cols-2 gap-4">
                                    {visibleQuestions.map(q => (
                                        <div key={q} className="p-6 pl-8 bg-destructive/5 border border-destructive/10 text-foreground rounded-2xl text-sm italic leading-relaxed hover:bg-destructive/10 transition-colors relative group">
                                            <div className="absolute left-0 top-0 w-1.5 h-full bg-destructive/20 group-hover:bg-destructive/40 transition-colors rounded-l-2xl" />
                                            {q}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            <div className="grid gap-8 grid-cols-1 md:grid-cols-2">
                <SkillSection 
                    title={t('expRoles')} 
                    items={grouped.experience} 
                    icon={Cpu}
                    iconColor="bg-amber-500/10 text-amber-500"
                    emptyMsg={t('noItemsYet')} 
                />
                <SkillSection 
                    title={t('hardSkills')} 
                    items={grouped.hard} 
                    icon={Code}
                    iconColor="bg-blue-500/10 text-blue-500"
                    emptyMsg={t('noItemsYet')} 
                />
                <SkillSection 
                    title={t('softSkills')} 
                    items={grouped.soft} 
                    icon={Zap}
                    iconColor="bg-emerald-500/10 text-emerald-500"
                    emptyMsg={t('noItemsYet')} 
                />
                <SkillSection 
                    title={t('interestsLikes')} 
                    items={grouped.interest} 
                    icon={Heart}
                    iconColor="bg-pink-500/10 text-pink-500"
                    emptyMsg={t('noItemsYet')} 
                />
                <SkillSection 
                    title={t('traitsChars')} 
                    items={grouped.trait} 
                    icon={Lightbulb}
                    iconColor="bg-violet-500/10 text-violet-500"
                    emptyMsg={t('noItemsYet')} 
                />
            </div>

            {/* Data Management Section */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
            >
                <Card className="bg-secondary/10 border-border rounded-[3rem] overflow-hidden">
                    <CardHeader className="p-10">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-primary/10 text-primary rounded-2xl">
                                 <Database className="w-6 h-6" />
                            </div>
                            <div>
                                <CardTitle className="text-2xl font-black tracking-tight">System Data Management</CardTitle>
                                <CardDescription className="text-muted-foreground font-semibold">
                                    {language === 'ko' ? '데이터 백업 및 복원 관리' : 'Manage your data backups and restoration'}
                                </CardDescription>
                            </div>
                        </div>
                        <div className="mt-4 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                            {t('storageModeLabel')}: {storageLabel}
                        </div>
                    </CardHeader>
                    <CardContent className="p-10 pt-0">
                        <div className="p-8 bg-background/40 rounded-[2rem] border border-border space-y-6 mb-8">
                            <div className="space-y-2">
                                <h4 className="font-bold text-lg flex items-center gap-2">
                                    <Sparkles className="w-5 h-5 text-primary" />
                                    {t('rebuildTitle')}
                                </h4>
                                <p className="text-sm text-muted-foreground leading-relaxed">
                                    {t('rebuildDesc')}
                                </p>
                            </div>
                            <div className="flex items-center justify-between gap-4">
                                <Button
                                    onClick={handleRebuildProfile}
                                    disabled={isRebuilding}
                                    className="h-12 px-6 rounded-xl font-bold tracking-tight bg-primary hover:bg-primary/90 disabled:opacity-50"
                                >
                                    {isRebuilding ? t('rebuildRunning') : t('rebuildAction')}
                                </Button>
                                {rebuildProgress && (
                                    <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                                        {t('rebuildProgress')} {rebuildProgress.current}/{rebuildProgress.total}
                                    </span>
                                )}
                            </div>
                            {rebuildMessage && (
                                <p className="text-xs font-semibold text-muted-foreground">
                                    {rebuildMessage}
                                </p>
                            )}
                        </div>
                        <div className="grid sm:grid-cols-2 gap-6">
                            <div className="p-8 bg-background/40 rounded-[2rem] border border-border space-y-6">
                                <div className="space-y-2">
                                    <h4 className="font-bold text-lg flex items-center gap-2">
                                        <Download className="w-5 h-5 text-primary" />
                                        {language === 'ko' ? '백업 다운로드' : 'Backup Download'}
                                    </h4>
                                    <p className="text-sm text-muted-foreground leading-relaxed">
                                        {language === 'ko' 
                                            ? '모든 데이터를 JSON 백업 파일로 다운로드합니다. 주기적인 백업을 권장합니다.' 
                                            : 'Download a JSON backup of all your data. Regular backups are recommended.'}
                                    </p>
                                    <ul className="text-xs text-muted-foreground space-y-1">
                                        <li>{t('exportIncludes')}</li>
                                        <li>{t('exportFallbackNote')}</li>
                                    </ul>
                                </div>
                                <Button 
                                    onClick={handleExport}
                                    disabled={isExporting}
                                    className="w-full h-12 rounded-xl font-bold tracking-tight bg-primary hover:bg-primary/90 disabled:opacity-50"
                                >
                                    {isExporting 
                                        ? (language === 'ko' ? '처리 중...' : 'Processing...') 
                                        : (language === 'ko' ? '백업 파일 다운로드' : 'Download Backup')}
                                </Button>
                            </div>

                            <div className="p-8 bg-background/40 rounded-[2rem] border border-border space-y-6">
                                <div className="space-y-2">
                                    <h4 className="font-bold text-lg flex items-center gap-2">
                                        <Upload className="w-5 h-5 text-amber-500" />
                                        {language === 'ko' ? '백업 복원' : 'Restore from Backup'}
                                    </h4>
                                    <p className="text-sm text-muted-foreground leading-relaxed">
                                        {language === 'ko' 
                                            ? '백업 JSON 파일을 선택하여 데이터를 복원합니다. 기존 데이터는 업데이트됩니다.' 
                                            : 'Choose a backup JSON file to restore your data. Existing records will be updated.'}
                                    </p>
                                    <ul className="text-xs text-muted-foreground space-y-1">
                                        <li>{t('importMergeNote')}</li>
                                        <li>{t('importFallbackNote')}</li>
                                    </ul>
                                </div>
                                <div className="relative">
                                    <input
                                        type="file"
                                        accept=".json"
                                        onChange={handleImport}
                                        className="hidden"
                                        id="import-upload"
                                    />
                                    <label
                                        htmlFor="import-upload"
                                        className="flex items-center justify-center w-full h-12 rounded-xl font-bold tracking-tight border border-primary/20 bg-primary/5 hover:bg-primary/10 cursor-pointer transition-colors"
                                    >
                                        {language === 'ko' ? '백업 파일 선택' : 'Choose Backup File'}
                                    </label>
                                </div>
                            </div>
                        </div>

                        <div className="mt-6 p-6 bg-background/40 rounded-[2rem] border border-border flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                            <div className="space-y-1">
                                <p className="text-sm font-semibold">
                                    {language === 'ko' ? '로컬 데이터베이스 초기화' : 'Reset Local Database'}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    {language === 'ko'
                                        ? 'DB가 꼬였을 때만 사용하세요. 로컬 데이터가 삭제될 수 있습니다.'
                                        : 'Use only if the DB is stuck. Local data may be removed.'}
                                </p>
                            </div>
                            <Button
                                variant="outline"
                                onClick={handleResetDb}
                                disabled={isResettingDb}
                                className="h-10 px-4 font-bold tracking-tight"
                            >
                                {t('dbReset')}
                            </Button>
                        </div>
                        {resetMessage && (
                            <p className="mt-3 text-xs font-semibold text-muted-foreground">
                                {resetMessage}
                            </p>
                        )}

                        <div className="mt-8 p-6 bg-amber-500/5 border border-amber-500/10 rounded-2xl flex items-start gap-4">
                            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                            <p className="text-xs text-amber-500/80 font-medium leading-relaxed">
                                {language === 'ko'
                                    ? '주의: 데이터 불러오기 시 동일한 ID를 가진 기존 데이터는 덮어씌워집니다. 신중하게 진행해 주세요.'
                                    : 'Caution: Importing data will overwrite existing records with the same IDs. Please proceed with care.'}
                            </p>
                        </div>
                    </CardContent>
                </Card>
            </motion.div>
        </div>
    );
};

interface SkillSectionProps {
    title: string;
    items: SkillSummary[];
    icon: LucideIcon;
    iconColor: string;
    emptyMsg: string;
}

const SkillSection = ({ title, items, icon: Icon, iconColor, emptyMsg }: SkillSectionProps) => {
    const { t } = useLanguage();
    const [expanded, setExpanded] = useState(false);
    const limit = 10;
    const visibleItems = expanded ? items : items.slice(0, limit);
    const hiddenCount = Math.max(items.length - visibleItems.length, 0);
    const totalMarkers = items.reduce((sum, item) => sum + (item.count || 1), 0);

    return (
        <Card className="h-full bg-secondary/20 border-border hover:bg-secondary/30 transition-all duration-300 rounded-[2.5rem] overflow-hidden group">
            <CardHeader className="p-8">
                <div className="flex items-center gap-4">
                    <div className={cn("p-3 rounded-2xl transition-transform duration-500 group-hover:scale-110", iconColor)}>
                        <Icon size={24} />
                    </div>
                    <CardTitle className="text-xl font-bold tracking-tight">{title}</CardTitle>
                </div>
            </CardHeader>
            <CardContent className="px-8 pb-10">
                <div className="flex flex-wrap gap-2.5">
                    {items.length === 0 && <p className="text-muted-foreground italic text-sm py-4">{emptyMsg}</p>}
                    {visibleItems.map((s) => (
                        <Badge
                            key={s.id}
                            variant="outline"
                            className="px-4 py-2 text-xs font-bold rounded-xl border-border bg-background/50 text-foreground hover:bg-background hover:border-primary/30 transition-all flex items-center gap-2"
                        >
                            <span>{s.name}</span>
                            {s.count > 1 && (
                                <span className="text-[10px] font-black uppercase tracking-wide text-muted-foreground">x{s.count}</span>
                            )}
                        </Badge>
                    ))}
                </div>
                {items.length > 0 && (
                  <div className="mt-10 pt-6 border-t border-border flex items-center justify-between text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                      <span>{totalMarkers} {t('intelligenceMarkers')}</span>
                      {hiddenCount > 0 ? (
                          <button
                              type="button"
                              onClick={() => setExpanded(prev => !prev)}
                              className="text-primary hover:underline underline-offset-4"
                          >
                              {expanded ? t('showLess') : `${t('showAll')} (${hiddenCount})`}
                          </button>
                      ) : (
                          <ArrowUpRight className="w-3.5 h-3.5" />
                      )}
                  </div>
                )}
            </CardContent>
        </Card>
    );
};
