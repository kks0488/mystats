import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { 
  Sparkles, 
  Loader2, 
  CheckCircle2, 
  AlertCircle,
  Hash,
  Clock,
  BrainCircuit,
  Wand2,
  BookOpen,
  Zap
} from 'lucide-react';
import type { IDBPDatabase } from 'idb';
import {
    getDB,
    upsertSkill,
    updateJournalEntry,
    upsertInsightByEntryId,
    deleteJournalEntryCascade,
    DB_ERRORS,
    DB_OP_TIMEOUT_MS,
    type MyStatsDB,
    type Skill,
    type Insight,
    type JournalEntry
} from '../db/db';
	import {
	    loadFallbackJournalEntries,
	    loadFallbackSkills,
	    loadFallbackInsights,
	    saveFallbackJournalEntry,
	    updateFallbackJournalEntry,
	    deleteFallbackJournalEntryCascade,
	    upsertFallbackSkill,
	    upsertFallbackInsightByEntryId,
    getFallbackStorageMode,
} from '../db/fallback';
import { analyzeEntryWithAI, checkAIStatus } from '../lib/ai-provider';
import { generateId, normalizeSkillName } from '../lib/utils';
import { Button } from '@/components/ui/button';
import { useLanguage } from '../hooks/useLanguage';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
	import { getMemuConfig, memuCheckSimilar, memuCreateItem, memuMemorize } from '@/lib/memu';
	import { useDbRecovery } from '../hooks/useDbRecovery';
	import { safeClearDraft, safeLoadDraft, safeSaveDraft, type JournalDraft } from './journal/draftStorage';
	import {
	    buildJournalExplorerIndex,
	    filterJournalEntries,
	    isJournalExplorerFiltersActive,
	    JOURNAL_EXPLORER_DEFAULT_FILTERS,
	    type JournalExplorerFilters,
	} from '@/lib/journalExplorer';

export const Journal = () => {
    const { t, language } = useLanguage();
    const [content, setContent] = useState('');
    const [baseContent, setBaseContent] = useState('');
    const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
	    const [analysisError, setAnalysisError] = useState<string | null>(null);
	    const [lastInsight, setLastInsight] = useState<Partial<Insight> | null>(null);
	    const [history, setHistory] = useState<JournalEntry[]>([]);
	    const [allSkills, setAllSkills] = useState<Skill[]>([]);
	    const [allInsights, setAllInsights] = useState<Insight[]>([]);
	    const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
	    const [draftNotice, setDraftNotice] = useState<JournalDraft | null>(() => safeLoadDraft());
	    const [explorerFilters, setExplorerFilters] = useState<JournalExplorerFilters>(JOURNAL_EXPLORER_DEFAULT_FILTERS);
	    const [showExplorerFilters, setShowExplorerFilters] = useState(false);
	    const [aiConfigured, setAiConfigured] = useState(false);
	    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const analysisRunId = useRef(0);
    const [dbNotice, setDbNotice] = useState<string | null>(null);
    const [hideDbNotice, setHideDbNotice] = useState(() => {
        return sessionStorage.getItem('MYSTATS_HIDE_DB_NOTICE') === '1';
    });

    const setFallbackNotice = useCallback(() => {
        setDbNotice(getFallbackStorageMode() === 'memory' ? t('dbFallbackSession') : t('dbFallbackMode'));
    }, [t]);

	    const { maybeRecoverFallbackData } = useDbRecovery(setDbNotice, setFallbackNotice);
	
	    const explorerIndex = useMemo(() => {
	        return buildJournalExplorerIndex(history, allSkills, allInsights);
	    }, [allInsights, allSkills, history]);
	
	    const filteredHistory = useMemo(() => {
	        return filterJournalEntries(history, explorerIndex, explorerFilters);
	    }, [explorerFilters, explorerIndex, history]);
	
	    const explorerActive = useMemo(() => isJournalExplorerFiltersActive(explorerFilters), [explorerFilters]);
	
	    const clearExplorer = useCallback(() => {
	        setExplorerFilters({ ...JOURNAL_EXPLORER_DEFAULT_FILTERS });
	        setShowExplorerFilters(false);
	    }, []);
	
	    const skillCategoryOptions = useMemo(
	        () =>
	            [
	                { key: 'hard', label: t('skillCatHard') },
	                { key: 'soft', label: t('skillCatSoft') },
	                { key: 'experience', label: t('skillCatExperience') },
	                { key: 'interest', label: t('skillCatInterest') },
	                { key: 'trait', label: t('skillCatTrait') },
	                { key: 'strength', label: t('skillCatStrength') },
	                { key: 'weakness', label: t('skillCatWeakness') },
	            ] as Array<{ key: Skill['category']; label: string }>,
	        [t]
	    );
	
	    const toggleExplorerCategory = useCallback((category: Skill['category']) => {
	        setExplorerFilters((prev) => {
	            const next = new Set(prev.categories);
	            if (next.has(category)) {
	                next.delete(category);
	            } else {
	                next.add(category);
	            }
	            return { ...prev, categories: Array.from(next) };
	        });
	    }, []);
	
	    const selectedContextSkills = useMemo(() => {
	        if (!selectedEntryId) return [];
	        return explorerIndex.skillsByEntryId.get(selectedEntryId) ?? [];
	    }, [explorerIndex.skillsByEntryId, selectedEntryId]);
	
	    const selectedContextInsight = useMemo(() => {
	        if (!selectedEntryId) return null;
	        return explorerIndex.insightByEntryId.get(selectedEntryId) ?? null;
	    }, [explorerIndex.insightByEntryId, selectedEntryId]);
	
	    const selectedEntryMeta = useMemo(() => {
	        if (!selectedEntryId) return null;
	        return history.find((item) => item.id === selectedEntryId) ?? null;
	    }, [history, selectedEntryId]);
	
	    const hasSelectedContext = Boolean(selectedEntryId && (selectedContextSkills.length > 0 || selectedContextInsight));
	
	    const copyToClipboard = useCallback(async (text: string) => {
	        const value = (text || '').trim();
	        if (!value) return;
	        try {
	            await navigator.clipboard.writeText(value);
	        } catch {
	            // ignore
	        }
	    }, []);

    const isDbFailure = (error: unknown): boolean => {
        if (!(error instanceof Error)) return false;
        return (
            error.message === DB_ERRORS.blocked ||
            error.message === DB_ERRORS.timeout ||
            error.name === 'NotFoundError' ||
            error.name === 'VersionError' ||
            error.name === 'QuotaExceededError' ||
            error.message.includes('object stores')
        );
    };

	    const loadHistory = useCallback(async () => {
	        try {
	            const db = await getDB();
	            const [allEntries, skills, insights] = await Promise.all([
	                db.getAllFromIndex('journal', 'by-date'),
	                db.getAll('skills'),
	                db.getAll('insights'),
	            ]);
	            setHistory(allEntries.toReversed());
	            setAllSkills(skills);
	            setAllInsights(insights);
	            setDbNotice(null);
	            setAnalysisError(null);
	            const recovered = await maybeRecoverFallbackData(db);
	            if (recovered) {
	                const [refreshed, refreshedSkills, refreshedInsights] = await Promise.all([
	                    db.getAllFromIndex('journal', 'by-date'),
	                    db.getAll('skills'),
	                    db.getAll('insights'),
	                ]);
	                setHistory(refreshed.toReversed());
	                setAllSkills(refreshedSkills);
	                setAllInsights(refreshedInsights);
	            }
	        } catch {
	            setHistory(loadFallbackJournalEntries());
	            setAllSkills(loadFallbackSkills());
	            setAllInsights(loadFallbackInsights());
	            setFallbackNotice();
	            setAnalysisError(null);
	        }
	    }, [maybeRecoverFallbackData, setFallbackNotice]);

    useEffect(() => {
        loadHistory();
        try {
            setAiConfigured(checkAIStatus().configured);
        } catch {
            setAiConfigured(false);
        }
    }, [loadHistory]);

    useEffect(() => {
        const handleUpdate = () => {
            loadHistory();
        };
        window.addEventListener('mystats-data-updated', handleUpdate);
        return () => window.removeEventListener('mystats-data-updated', handleUpdate);
    }, [loadHistory]);

    useEffect(() => {
        if (!content.trim()) return;
        if (content === baseContent) return;
        const mode: JournalDraft['mode'] = selectedEntryId ? 'edit' : 'new';
        const entryId = selectedEntryId ?? undefined;
        const timeoutId = window.setTimeout(() => {
            safeSaveDraft({
                mode,
                entryId,
                content,
                updatedAt: Date.now(),
            });
        }, 300);
        return () => window.clearTimeout(timeoutId);
    }, [baseContent, content, selectedEntryId]);

    useEffect(() => {
        if (content.trim()) return;
        if (draftNotice) return;
        const existing = safeLoadDraft();
        if (existing) setDraftNotice(existing);
    }, [content, draftNotice]);

    const dismissDbNotice = () => {
        setHideDbNotice(true);
        sessionStorage.setItem('MYSTATS_HIDE_DB_NOTICE', '1');
    };

    const handleRestoreDraft = useCallback(() => {
        const draft = draftNotice ?? safeLoadDraft();
        if (!draft) return;
        if (draft.mode === 'edit' && draft.entryId) {
            const original = history.find((item) => item.id === draft.entryId)?.content ?? '';
            setSelectedEntryId(draft.entryId);
            setContent(draft.content);
            setBaseContent(original);
        } else {
            setSelectedEntryId(null);
            setContent(draft.content);
            setBaseContent('');
        }
        setDraftNotice(null);
    }, [draftNotice, history]);

    const handleDiscardDraft = useCallback(() => {
        safeClearDraft();
        setDraftNotice(null);
    }, []);

    type SaveAction = 'new' | 'overwrite' | 'copy';

    const checkDuplicateIfNeeded = useCallback(
        async (text: string, ignoreId?: string): Promise<boolean> => {
            try {
                const memuConfig = getMemuConfig();
                if (!memuConfig.enabled || !memuConfig.storeJournal) return true;
                const check = await memuCheckSimilar(text, memuConfig, {
                    threshold: memuConfig.dedupeThreshold,
                    userId: memuConfig.userId,
                    timeoutMs: 2500,
                });
                if (!check?.is_similar) return true;
                const similar = (check.similar_items || []).filter((item) => item && item.id && item.id !== ignoreId);
                if (!similar.length) return true;
                return window.confirm(t('journalDupConfirm').replace('{count}', String(similar.length)));
            } catch {
                return true;
            }
        },
        [t]
    );

    const handleSave = async (action?: SaveAction) => {
        if (!content.trim()) return;
        setStatus('saving');
        setAnalysisError(null);

        const requested: SaveAction = action ?? (selectedEntryId ? 'overwrite' : 'new');
        const entryContent = content;
        const now = Date.now();

        const proceed = await checkDuplicateIfNeeded(entryContent, requested === 'overwrite' ? selectedEntryId ?? undefined : undefined);
        if (!proceed) {
            setStatus('idle');
            return;
        }

        let effectiveAction: SaveAction = requested;
        const selectedEntry = selectedEntryId ? history.find((item) => item.id === selectedEntryId) : null;

        let entryId = effectiveAction === 'overwrite' ? (selectedEntryId || '') : generateId();
        let timestamp = effectiveAction === 'overwrite' ? (selectedEntry?.timestamp ?? now) : now;

        if (effectiveAction === 'overwrite' && !selectedEntryId) {
            effectiveAction = 'new';
            entryId = generateId();
            timestamp = now;
        }

        let entry: JournalEntry = {
            id: entryId,
            content: entryContent,
            timestamp,
            type: 'journal',
            lastModified: now,
        };

        let db: IDBPDatabase<MyStatsDB> | null = null;
        let useFallback = false;

        try {
            try {
                db = await getDB();
                setDbNotice(null);
            } catch {
                useFallback = true;
            }

            const saveToFallback = () => {
                setAnalysisError(null);
                if (effectiveAction === 'overwrite') {
                    const updated = updateFallbackJournalEntry(entryId, entryContent, now);
                    if (updated.some((item) => item.id === entryId)) {
                        setHistory(updated);
                    } else {
                        setHistory(saveFallbackJournalEntry(entry));
                    }
                } else {
                    setHistory(saveFallbackJournalEntry(entry));
                }
                setFallbackNotice();
            };

            if (useFallback || !db) {
                saveToFallback();
            } else {
                const timeoutPromise = new Promise<never>((_, reject) => {
                    setTimeout(() => reject(new Error(DB_ERRORS.timeout)), DB_OP_TIMEOUT_MS);
                });

                try {
                    if (effectiveAction === 'overwrite') {
                        const updatedEntry = await Promise.race([updateJournalEntry(db, entryId, entryContent, now), timeoutPromise]);
                        if (!updatedEntry) {
                            effectiveAction = 'copy';
                            entryId = generateId();
                            timestamp = now;
                            const next: JournalEntry = { ...entry, id: entryId, timestamp, lastModified: now };
                            entry = next;
                            await Promise.race([db.put('journal', next), timeoutPromise]);
                        } else {
                            timestamp = updatedEntry.timestamp;
                        }
                    } else {
                        await Promise.race([db.put('journal', entry), timeoutPromise]);
                    }
                } catch (error) {
                    if (isDbFailure(error)) {
                        useFallback = true;
                        saveToFallback();
                    } else {
                        throw error;
                    }
                }

                if (!useFallback) {
                    void loadHistory();
                }
            }

            setStatus('saved');
            safeClearDraft();
            setDraftNotice(null);
            window.dispatchEvent(new Event('mystats-data-updated'));

            if (effectiveAction === 'new') {
                setSelectedEntryId(null);
                setContent('');
                setBaseContent('');
            } else if (effectiveAction === 'copy') {
                setSelectedEntryId(entryId);
                setContent(entryContent);
                setBaseContent(entryContent);
            } else {
                setSelectedEntryId(entryId);
                setContent(entryContent);
                setBaseContent(entryContent);
            }

            const memuConfig = getMemuConfig();
            if (memuConfig.enabled && memuConfig.engine === 'api' && memuConfig.storeJournal) {
                const memuContent = `[mystats] type=journal entry_id=${entryId} ts=${new Date(timestamp).toISOString()}\n\n${entryContent}`;
                void (async () => {
                    try {
                        if (memuConfig.dedupeBeforeStore) {
                            const check = await memuCheckSimilar(memuContent, memuConfig, {
                                threshold: memuConfig.dedupeThreshold,
                                timeoutMs: 4000,
                            });
                            if (check?.is_similar) return;
                        }
                        await memuCreateItem(memuContent, memuConfig, { memoryType: 'journal', timeoutMs: 6000 });
                        await memuMemorize([{ role: 'user', content: entryContent }], memuConfig, {
                            userName: 'User',
                            agentName: 'MyStats',
                        });
                    } catch {
                        // Ignore memU errors (graceful degradation)
                    }
                })();
            }

            let isAIConfigured = false;
            try {
                isAIConfigured = checkAIStatus().configured;
                setAiConfigured(isAIConfigured);
            } catch {
                isAIConfigured = false;
                setAiConfigured(false);
            }

            if (isAIConfigured) {
                analysisRunId.current += 1;
                const currentRun = analysisRunId.current;
                setIsAnalyzing(true);
                const analysisEntryId = entryId;
                const analysisTimestamp = timestamp;
                const analysisDb = useFallback ? null : db;
                const analysisFallback = useFallback;

                void (async () => {
                    try {
                        const result = await analyzeEntryWithAI(entryContent, language);
                        if (analysisRunId.current !== currentRun) return;

                        if (result.insight) {
                            const insightLastModified = Date.now();
                            if (analysisFallback) {
                                upsertFallbackInsightByEntryId(
                                    analysisEntryId,
                                    result.insight,
                                    analysisTimestamp,
                                    insightLastModified
                                );
                                setLastInsight({
                                    entryId: analysisEntryId,
                                    ...result.insight,
                                    timestamp: analysisTimestamp,
                                    lastModified: insightLastModified,
                                } as Insight);
                            } else if (analysisDb) {
                                const stored = await upsertInsightByEntryId(
                                    analysisDb,
                                    analysisEntryId,
                                    result.insight,
                                    analysisTimestamp,
                                    insightLastModified
                                );
                                setLastInsight(stored);
                            }
                        }

                        const categories: Array<{ items?: { name: string; category?: string }[]; defaultCategory?: Skill['category'] }> =
                            [
                                { items: result.skills, defaultCategory: 'hard' },
                                { items: result.traits, defaultCategory: 'trait' },
                                { items: result.experiences, defaultCategory: 'experience' },
                                { items: result.interests, defaultCategory: 'interest' },
                            ];

                        for (const group of categories) {
                            const seen = new Set<string>();
                            if (group.items) {
                                for (const item of group.items) {
                                    const normalizedName = normalizeSkillName(item.name || '');
                                    if (!normalizedName || normalizedName.length < 2) continue;
                                    const key = normalizedName.toLowerCase();
                                    if (seen.has(key)) continue;
                                    seen.add(key);
                                    const category = (item.category ?? group.defaultCategory) as Skill['category'];
                                    if (analysisFallback) {
                                        upsertFallbackSkill({ name: normalizedName, category }, analysisEntryId);
                                    } else {
                                        await upsertSkill({ name: normalizedName, category }, analysisEntryId);
                                    }
                                }
                            }
                        }

                        if (analysisFallback) {
                            setHistory(loadFallbackJournalEntries());
                        }

                        window.dispatchEvent(new Event('mystats-data-updated'));
                    } catch (err) {
                        console.error('AI Analysis failed', err);
                        if (analysisRunId.current === currentRun) {
                            setAnalysisError(t('analysisFailed'));
                        }
                    } finally {
                        if (analysisRunId.current === currentRun) {
                            setIsAnalyzing(false);
                        }
                    }
                })();
            }

            setTimeout(() => {
                setStatus('idle');
                setLastInsight(null);
                setAnalysisError(null);
            }, 5000);
        } catch (error) {
            console.error('Failed to save', error);
            setStatus('error');
            if (isDbFailure(error)) {
                setFallbackNotice();
                setAnalysisError(null);
            } else if (error instanceof Error) {
                setAnalysisError(error.message || t('saveFailed'));
            } else {
                setAnalysisError(t('saveFailed'));
            }
        }
    };

    const handleDelete = async () => {
        if (!selectedEntryId) return;
        const confirmed = window.confirm(t('journalDeleteConfirm'));
        if (!confirmed) return;

        analysisRunId.current += 1;
        setIsAnalyzing(false);
        setStatus('saving');
        setAnalysisError(null);

        const entryId = selectedEntryId;
        const now = Date.now();

        try {
            let db: IDBPDatabase<MyStatsDB> | null = null;
            let useFallback = false;

            try {
                db = await getDB();
                setDbNotice(null);
            } catch {
                useFallback = true;
            }

            const applyFallbackDelete = () => {
                const result = deleteFallbackJournalEntryCascade(entryId, now);
                setHistory(result.journal);
                setFallbackNotice();
            };

            if (useFallback || !db) {
                applyFallbackDelete();
            } else {
                const timeoutPromise = new Promise<never>((_, reject) => {
                    setTimeout(() => reject(new Error(DB_ERRORS.timeout)), DB_OP_TIMEOUT_MS);
                });
                try {
                    await Promise.race([deleteJournalEntryCascade(db, entryId, now), timeoutPromise]);
                } catch (error) {
                    if (isDbFailure(error)) {
                        useFallback = true;
                        applyFallbackDelete();
                    } else {
                        throw error;
                    }
                }
                if (!useFallback) {
                    void loadHistory();
                }
            }

            safeClearDraft();
            setDraftNotice(null);
            setSelectedEntryId(null);
            setContent('');
            setBaseContent('');
            setLastInsight(null);
            setStatus('idle');
            window.dispatchEvent(new Event('mystats-data-updated'));
        } catch (error) {
            console.error('Failed to delete entry', error);
            setStatus('error');
            setAnalysisError(t('journalDeleteFailed'));
        }
    };

    return (
        <div className="max-w-6xl mx-auto space-y-12 pb-20">
            <header className="space-y-4">
                <div className="flex items-center gap-2 text-primary font-mono text-xs font-bold uppercase tracking-[0.3em]">
                    <BookOpen className="w-4 h-4" />
                    {t('neuralMemoryBridge')}
                </div>
                <h1 className="text-5xl font-black tracking-tighter">{t('journalTitle')}</h1>
                <p className="text-xl text-muted-foreground font-medium max-w-2xl leading-relaxed">
                    {t('journalDesc')}
                </p>
            </header>

            <div className="grid lg:grid-cols-12 gap-8">
	                {/* Neural Memory Rail (History) */}
	                <aside className="lg:col-span-3 space-y-4">
	                    <div className="flex items-center gap-2 px-2 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground pb-2 border-b border-border/50">
	                        <Clock className="w-3 h-3" />
	                        {t('journalMemoryRail')}
	                    </div>
	                    <div className="px-2 space-y-3">
	                        <input
	                            value={explorerFilters.query}
	                            onChange={(e) => setExplorerFilters((prev) => ({ ...prev, query: e.target.value }))}
	                            placeholder={t('journalSearchPlaceholder')}
	                            className="w-full flex h-10 rounded-xl border border-input bg-background/40 px-3 py-2 text-xs font-semibold ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
	                        />
	                        <div className="flex items-center justify-between gap-3 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
	                            <button
	                                type="button"
	                                onClick={() => setShowExplorerFilters((v) => !v)}
	                                className="hover:text-foreground transition-colors"
	                            >
	                                {t('journalFilters')}
	                            </button>
	                            <div className="flex items-center gap-3">
	                                <span>{t('journalResults').replace('{count}', String(filteredHistory.length))}</span>
	                                {explorerActive && (
	                                    <button
	                                        type="button"
	                                        onClick={clearExplorer}
	                                        className="text-primary hover:underline decoration-primary/30"
	                                    >
	                                        {t('journalClear')}
	                                    </button>
	                                )}
	                            </div>
	                        </div>
	
	                        {showExplorerFilters && (
	                            <div className="p-4 rounded-2xl border border-border bg-background/30 space-y-4">
	                                <div className="space-y-2">
	                                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
	                                        {t('journalFilterDate')}
	                                    </p>
	                                    <div className="grid grid-cols-2 gap-2">
	                                        {(
	                                            [
	                                                { key: 'all', label: t('journalFilterAllTime') },
	                                                { key: '7d', label: t('journalFilter7d') },
	                                                { key: '30d', label: t('journalFilter30d') },
	                                                { key: 'custom', label: t('journalFilterCustom') },
	                                            ] as const
	                                        ).map((opt) => (
	                                            <button
	                                                key={opt.key}
	                                                type="button"
	                                                onClick={() =>
	                                                    setExplorerFilters((prev) => ({
	                                                        ...prev,
	                                                        datePreset: opt.key,
	                                                        startDate: opt.key === 'custom' ? prev.startDate : '',
	                                                        endDate: opt.key === 'custom' ? prev.endDate : '',
	                                                    }))
	                                                }
	                                                className={cn(
	                                                    'h-9 rounded-xl border text-[11px] font-extrabold tracking-tight transition-colors',
	                                                    explorerFilters.datePreset === opt.key
	                                                        ? 'bg-primary text-primary-foreground border-primary/30'
	                                                        : 'bg-background/40 border-border hover:bg-background/60'
	                                                )}
	                                            >
	                                                {opt.label}
	                                            </button>
	                                        ))}
	                                    </div>
	                                    {explorerFilters.datePreset === 'custom' && (
	                                        <div className="grid grid-cols-2 gap-2">
	                                            <input
	                                                type="date"
	                                                value={explorerFilters.startDate}
	                                                onChange={(e) => setExplorerFilters((prev) => ({ ...prev, startDate: e.target.value }))}
	                                                className="w-full h-9 rounded-xl border border-input bg-background/40 px-2 text-[11px] font-semibold"
	                                            />
	                                            <input
	                                                type="date"
	                                                value={explorerFilters.endDate}
	                                                onChange={(e) => setExplorerFilters((prev) => ({ ...prev, endDate: e.target.value }))}
	                                                className="w-full h-9 rounded-xl border border-input bg-background/40 px-2 text-[11px] font-semibold"
	                                            />
	                                        </div>
	                                    )}
	                                </div>
	
	                                <div className="grid grid-cols-2 gap-3">
	                                    <div className="space-y-2">
	                                        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
	                                            {t('journalFilterType')}
	                                        </p>
	                                        <select
	                                            value={explorerFilters.entryType}
	                                            onChange={(e) =>
	                                                setExplorerFilters((prev) => ({
	                                                    ...prev,
	                                                    entryType: (e.target.value as JournalExplorerFilters['entryType']) || 'all',
	                                                }))
	                                            }
	                                            className="w-full h-9 rounded-xl border border-input bg-background/40 px-2 text-[11px] font-semibold"
	                                        >
	                                            <option value="all">{t('journalFilterAll')}</option>
	                                            <option value="journal">{t('journalFilterJournalType')}</option>
	                                            <option value="project">{t('journalFilterProjectType')}</option>
	                                        </select>
	                                    </div>
	                                    <div className="space-y-2">
	                                        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
	                                            {t('journalFilterHasInsight')}
	                                        </p>
	                                        <select
	                                            value={explorerFilters.hasInsight}
	                                            onChange={(e) =>
	                                                setExplorerFilters((prev) => ({
	                                                    ...prev,
	                                                    hasInsight: (e.target.value as JournalExplorerFilters['hasInsight']) || 'all',
	                                                }))
	                                            }
	                                            className="w-full h-9 rounded-xl border border-input bg-background/40 px-2 text-[11px] font-semibold"
	                                        >
	                                            <option value="all">{t('journalFilterAll')}</option>
	                                            <option value="yes">{t('journalFilterYes')}</option>
	                                            <option value="no">{t('journalFilterNo')}</option>
	                                        </select>
	                                    </div>
	                                </div>
	
	                                <div className="space-y-2">
	                                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
	                                        {t('journalFilterCategories')}
	                                    </p>
	                                    <div className="flex flex-wrap gap-2">
	                                        {skillCategoryOptions.map((opt) => {
	                                            const active = explorerFilters.categories.includes(opt.key);
	                                            return (
	                                                <button
	                                                    key={opt.key}
	                                                    type="button"
	                                                    onClick={() => toggleExplorerCategory(opt.key)}
	                                                    className={cn(
	                                                        'px-3 py-1.5 rounded-xl border text-[11px] font-extrabold tracking-tight transition-colors',
	                                                        active
	                                                            ? 'bg-primary text-primary-foreground border-primary/30'
	                                                            : 'bg-background/40 border-border hover:bg-background/60'
	                                                    )}
	                                                >
	                                                    {opt.label}
	                                                </button>
	                                            );
	                                        })}
	                                    </div>
	                                </div>
	                            </div>
	                        )}
	                    </div>
	                    <div className="space-y-3 max-h-[400px] md:max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
	                        {history.length === 0 ? (
	                            <div className="p-8 text-center border-2 border-dashed border-border rounded-3xl opacity-50">
	                                <p className="text-[10px] font-black uppercase tracking-widest leading-relaxed">{t('journalNoPulses')}</p>
	                            </div>
	                        ) : filteredHistory.length === 0 ? (
	                            <div className="p-8 text-center border-2 border-dashed border-border rounded-3xl opacity-50">
	                                <p className="text-[10px] font-black uppercase tracking-widest leading-relaxed">
	                                    {t('journalNoResults')}
	                                </p>
	                            </div>
	                        ) : (
	                            filteredHistory.map(entry => (
	                                <button
	                                    key={entry.id}
	                                    onClick={() => {
	                                        setSelectedEntryId(entry.id);
	                                        setContent(entry.content);
                                        setBaseContent(entry.content);
                                    }}
                                    className={cn(
                                        "journal-entry-item w-full p-4 rounded-2xl text-left transition-all group relative overflow-hidden",
                                        selectedEntryId === entry.id ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20" : "bg-secondary/20 hover:bg-secondary/40 border border-border"
                                    )}
                                >
                                    <div className="flex items-center justify-between gap-2 mb-2">
                                        <span className="text-[8px] font-black uppercase tracking-widest opacity-70">
                                            {new Date(entry.timestamp).toLocaleDateString()}
                                        </span>
                                        {entry.type === 'project' && <Zap size={10} className="text-amber-500" />}
                                    </div>
                                    <p className="text-xs font-bold line-clamp-2 leading-relaxed tracking-tight group-hover:underline decoration-primary/30">
                                        {entry.content}
                                    </p>
                                </button>
                            ))
                        )}
                    </div>
                </aside>

                <div className="lg:col-span-9 relative group">
                    <div className="absolute -inset-1 bg-gradient-to-r from-primary/20 to-secondary/20 rounded-[3rem] blur-2xl opacity-0 group-focus-within:opacity-100 transition duration-1000" />
                    <div className="relative bg-secondary/30 backdrop-blur-2xl border border-border rounded-[2.5rem] overflow-hidden">
                        <div className="flex flex-wrap items-center justify-between gap-2 px-4 md:px-8 py-4 border-b border-border bg-secondary/20">
                            <div className="flex flex-wrap items-center gap-2 md:gap-4 text-xs font-black uppercase tracking-widest text-muted-foreground">
                                <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    onClick={() => {
                                        setSelectedEntryId(null);
                                        setContent('');
                                        setBaseContent('');
                                    }}
                                    className="h-7 px-3 rounded-lg hover:bg-primary/10 text-primary border border-primary/20 text-[10px] md:text-xs"
                                >
                                    {t('journalNew')}
                                </Button>
                                <span className="hidden md:flex items-center gap-1.5 border-r border-border pr-4 pl-2">
                                    <Clock className="w-3.5 h-3.5" />
                                    {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                                <span className="flex items-center gap-1.5">
                                    <Hash className="w-3.5 h-3.5" />
                                    {content.length} {t('charCount')}
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                            <div className={cn(
                                    "w-2 h-2 rounded-full",
                                    status === 'saving' ? "bg-blue-500 animate-pulse" : 
                                    status === 'error' ? "bg-destructive animate-pulse" :
                                    isAnalyzing ? "bg-amber-500 animate-pulse" :
                                    "bg-emerald-500"
                                )} />
                                <span className="text-[10px] font-bold uppercase tracking-tighter text-muted-foreground">
                                    {status === 'idle'
                                        ? (isAnalyzing ? t('analyzing') : t('systemReady'))
                                        : status.toUpperCase()}
                                </span>
                            </div>
                        </div>

                        {draftNotice && !content.trim() && (
                            <div className="px-8 py-4 border-b border-border bg-background/30">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                    <div className="text-xs font-semibold text-muted-foreground">
                                        {t('journalDraftFound')} · {new Date(draftNotice.updatedAt).toLocaleString()}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={handleRestoreDraft}
                                            className="h-9 px-3 rounded-xl font-bold"
                                        >
                                            {t('journalDraftRestore')}
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={handleDiscardDraft}
                                            className="h-9 px-3 rounded-xl font-bold"
                                        >
                                            {t('journalDraftDiscard')}
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {(!aiConfigured || analysisError || (dbNotice && !hideDbNotice)) && (
                            <div className="px-8 py-4 border-b border-border bg-background/40 space-y-2">
                                {!aiConfigured && (
                                    <div className="flex items-start gap-2 text-xs font-semibold text-amber-500">
                                        <AlertCircle className="w-4 h-4 mt-0.5" />
                                        <span>{t('noApiKeyWarning')}</span>
                                    </div>
                                )}
                                {dbNotice && !hideDbNotice && (
                                    <div className="flex items-center justify-between gap-3 text-xs font-semibold text-amber-500">
                                        <div className="flex items-start gap-2">
                                            <AlertCircle className="w-4 h-4 mt-0.5" />
                                            <span>{dbNotice}</span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={dismissDbNotice}
                                            className="text-[10px] font-black uppercase tracking-widest text-amber-500 hover:text-amber-400"
                                        >
                                            {t('dbNoticeHide')}
                                        </button>
                                    </div>
                                )}
                                {analysisError && (
                                    <div className="flex items-start gap-2 text-xs font-semibold text-destructive">
                                        <AlertCircle className="w-4 h-4 mt-0.5" />
                                        <span>{analysisError}</span>
                                    </div>
                                )}
                            </div>
                        )}

	                        <textarea
	                            value={content}
	                            onChange={(e) => setContent(e.target.value)}
	                            onKeyDown={(e) => {
	                                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
	                                    e.preventDefault();
	                                    handleSave();
	                                }
	                            }}
	                            placeholder={t('journalPlaceholder')}
	                            disabled={status === 'saving'}
	                            className="w-full min-h-[500px] p-10 bg-transparent resize-none focus:outline-none text-xl font-medium leading-relaxed placeholder:text-muted-foreground/30 custom-scrollbar"
	                        />
	
	                        {hasSelectedContext && (
	                            <div className="px-8 py-6 border-t border-border bg-background/20 space-y-6">
	                                <div className="flex items-center justify-between gap-3">
	                                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
	                                        {t('journalContext')}
	                                    </p>
	                                    {selectedEntryMeta && (
	                                        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
	                                            {new Date(selectedEntryMeta.timestamp).toLocaleString()}
	                                        </p>
	                                    )}
	                                </div>
	
	                                <div className="space-y-2">
	                                    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
	                                        <Hash className="w-3.5 h-3.5" />
	                                        {t('journalLinkedSkills')}
	                                    </div>
	                                    {selectedContextSkills.length === 0 ? (
	                                        <p className="text-xs text-muted-foreground">{t('journalNoSkills')}</p>
	                                    ) : (
	                                        <div className="flex flex-wrap gap-2">
	                                            {selectedContextSkills.map((skill) => (
	                                                <button
	                                                    key={skill.id}
	                                                    type="button"
	                                                    onClick={() =>
	                                                        setExplorerFilters((prev) => ({
	                                                            ...prev,
	                                                            query: skill.name,
	                                                        }))
	                                                    }
	                                                    className="px-3 py-1.5 rounded-xl bg-primary/10 text-primary border border-primary/20 text-xs font-bold hover:bg-primary/15 transition-colors"
	                                                >
	                                                    {skill.name}
	                                                </button>
	                                            ))}
	                                        </div>
	                                    )}
	                                </div>
	
	                                <div className="space-y-2">
	                                    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
	                                        <BrainCircuit className="w-3.5 h-3.5" />
	                                        {t('journalEvidence')}
	                                    </div>
	                                    {!selectedContextInsight ? (
	                                        <p className="text-xs text-muted-foreground">{t('journalNoInsight')}</p>
	                                    ) : (selectedContextInsight.evidenceQuotes ?? []).length === 0 ? (
	                                        <p className="text-xs text-muted-foreground">{t('journalNoEvidence')}</p>
	                                    ) : (
	                                        <ul className="space-y-2">
	                                            {(selectedContextInsight.evidenceQuotes ?? []).slice(0, 5).map((quote, idx) => (
	                                                <li
	                                                    key={`${idx}-${quote}`}
	                                                    className="flex items-start justify-between gap-3 p-3 rounded-2xl border border-border bg-background/40"
	                                                >
	                                                    <p className="text-xs font-semibold leading-relaxed whitespace-pre-wrap">{quote}</p>
	                                                    <button
	                                                        type="button"
	                                                        onClick={() => void copyToClipboard(quote)}
	                                                        className="shrink-0 text-[10px] font-black uppercase tracking-widest text-primary hover:underline decoration-primary/30"
	                                                    >
	                                                        {t('copy')}
	                                                    </button>
	                                                </li>
	                                            ))}
	                                        </ul>
	                                    )}
	                                </div>
	
	                                {selectedContextInsight && (selectedContextInsight.archetypes ?? []).length > 0 && (
	                                    <div className="space-y-2">
	                                        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
	                                            <Sparkles className="w-3.5 h-3.5" />
	                                            {t('journalExtractedArchetypes')}
	                                        </div>
	                                        <div className="flex flex-wrap gap-2">
	                                            {(selectedContextInsight.archetypes ?? []).slice(0, 8).map((a, i) => (
	                                                <span
	                                                    key={`${i}-${a}`}
	                                                    className="px-3 py-1.5 rounded-xl bg-secondary/30 border border-border text-xs font-bold"
	                                                >
	                                                    {a}
	                                                </span>
	                                            ))}
	                                        </div>
	                                    </div>
	                                )}
	                            </div>
	                        )}

	                        <div
	                            className={cn(
	                                "p-6 flex flex-wrap items-center gap-3 bg-secondary/10 border-t border-border",
                                selectedEntryId ? "justify-between" : "justify-end"
                            )}
                        >
                            {selectedEntryId && (
                                <Button
                                    variant="outline"
                                    onClick={handleDelete}
                                    disabled={status === 'saving'}
                                    className="h-11 px-4 rounded-2xl font-bold text-destructive border-destructive/30 hover:bg-destructive/10"
                                >
                                    {t('journalDelete')}
                                </Button>
                            )}
                            <div className="flex flex-wrap items-center gap-3 justify-end">
                                {selectedEntryId && (
                                    <Button
                                        variant="outline"
                                        onClick={() => handleSave('copy')}
                                        disabled={!content.trim() || status === 'saving'}
                                        className="h-14 px-6 rounded-2xl font-black tracking-tight"
                                    >
                                        {t('journalSaveAsNew')}
                                    </Button>
                                )}
                                <Button
                                    onClick={() => handleSave(selectedEntryId ? 'overwrite' : 'new')}
                                    disabled={!content.trim() || status === 'saving'}
                                    className={cn(
                                        "h-14 px-10 rounded-2xl font-black tracking-tight transition-all active:scale-95 group",
                                        status === 'saved' ? "bg-emerald-500 hover:bg-emerald-600" : "bg-primary hover:bg-primary/90"
                                    )}
                                >
                                    <AnimatePresence mode="wait">
                                        {status === 'saving' ? (
                                            <motion.div
                                                key="loading"
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: 1 }}
                                                className="flex items-center gap-3"
                                            >
                                                <Loader2 className="w-5 h-5 animate-spin" />
                                                <span>{t('journalSaving')}</span>
                                            </motion.div>
                                        ) : status === 'saved' ? (
                                            <motion.div
                                                key="saved"
                                                initial={{ opacity: 0, scale: 0.8 }}
                                                animate={{ opacity: 1, scale: 1 }}
                                                className="flex items-center gap-2"
                                            >
                                                <CheckCircle2 className="w-5 h-5" />
                                                <span>{t('journalComplete')}</span>
                                            </motion.div>
                                        ) : (
                                            <motion.div
                                                key="idle"
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: 1 }}
                                                className="flex items-center gap-3"
                                            >
                                                <Sparkles className="w-5 h-5 group-hover:rotate-12 transition-transform" />
                                                <span>{selectedEntryId ? t('journalSaveChanges') : t('analyzeSave')}</span>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <AnimatePresence>
                {lastInsight && (
                    <motion.div
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="grid grid-cols-1 md:grid-cols-2 gap-8"
                    >
                        <div className="bg-secondary/20 backdrop-blur-xl border border-border rounded-[2rem] p-8 space-y-6">
                            <div className="flex items-center gap-3 text-primary">
                                <BrainCircuit className="w-6 h-6" />
                                <h3 className="font-black uppercase tracking-widest text-sm">{t('journalExtractedArchetypes')}</h3>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {lastInsight.archetypes?.map((a, i) => (
                                    <span key={i} className="px-4 py-2 bg-primary/10 text-primary rounded-xl text-sm font-bold border border-primary/20">
                                        {a}
                                    </span>
                                ))}
                            </div>
                        </div>
                        <div className="bg-secondary/20 backdrop-blur-xl border border-border rounded-[2rem] p-8 space-y-6">
                            <div className="flex items-center gap-3 text-muted-foreground">
                                <Wand2 className="w-6 h-6" />
                                <h3 className="font-black uppercase tracking-widest text-sm">{t('journalPatternAnalysis')}</h3>
                            </div>
                            <ul className="space-y-4">
                                {lastInsight.hiddenPatterns?.slice(0, 3).map((p, i) => (
                                    <li key={i} className="flex gap-3 text-sm font-semibold leading-relaxed">
                                        <span className="text-primary mt-1">•</span>
                                        {p}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {status === 'error' && (
                <div className="flex items-center gap-3 p-6 bg-destructive/10 border border-destructive/20 rounded-[2rem] text-destructive">
                    <AlertCircle className="w-6 h-6" />
                    <p className="font-bold tracking-tight">{analysisError || t('saveFailed')}</p>
                </div>
            )}
        </div>
    );
};
