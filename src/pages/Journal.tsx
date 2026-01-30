import { useState, useEffect, useCallback, useRef } from 'react';
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
import { getDB, upsertSkill, DB_ERRORS, DB_OP_TIMEOUT_MS, type MyStatsDB, type Skill, type Insight, type JournalEntry } from '../db/db';
import {
    loadFallbackJournalEntries,
    saveFallbackJournalEntry,
    upsertFallbackSkill,
    addFallbackInsight,
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

export const Journal = () => {
    const { t, language } = useLanguage();
    const [content, setContent] = useState('');
    const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
    const [analysisError, setAnalysisError] = useState<string | null>(null);
    const [lastInsight, setLastInsight] = useState<Partial<Insight> | null>(null);
    const [history, setHistory] = useState<JournalEntry[]>([]);
    const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
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
            const allEntries = await db.getAllFromIndex('journal', 'by-date');
            setHistory(allEntries.toReversed());
            setDbNotice(null);
            setAnalysisError(null);
            const recovered = await maybeRecoverFallbackData(db);
            if (recovered) {
                const refreshed = await db.getAllFromIndex('journal', 'by-date');
                setHistory(refreshed.toReversed());
            }
        } catch {
            setHistory(loadFallbackJournalEntries());
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

    const dismissDbNotice = () => {
        setHideDbNotice(true);
        sessionStorage.setItem('MYSTATS_HIDE_DB_NOTICE', '1');
    };

    const handleSave = async () => {
        if (!content.trim()) return;
        setStatus('saving');
        setAnalysisError(null);
        const entryContent = content;
        
        try {
            const entryId = generateId();
            const timestamp = Date.now();
            const entry: JournalEntry = {
                id: entryId,
                content,
                timestamp,
                type: 'journal',
                lastModified: timestamp
            };
            let db: IDBPDatabase<MyStatsDB> | null = null;
            let useFallback = false;

            try {
                db = await getDB();
                setDbNotice(null);
            } catch {
                useFallback = true;
                setAnalysisError(null);
                setHistory(saveFallbackJournalEntry(entry));
                setFallbackNotice();
            }

            if (!useFallback && db) {
                const savePromise = db.put('journal', {
                    id: entryId,
                    content,
                    timestamp,
                    type: 'journal',
                    lastModified: timestamp
                });
                try {
                    await Promise.race([
                        savePromise,
                        new Promise((_, reject) => {
                            setTimeout(() => reject(new Error(DB_ERRORS.timeout)), DB_OP_TIMEOUT_MS);
                        }),
                    ]);
                } catch (error) {
                    if (isDbFailure(error)) {
                        useFallback = true;
                        setAnalysisError(null);
                        setHistory(saveFallbackJournalEntry(entry));
                        setFallbackNotice();
                    } else {
                        throw error;
                    }
                }
            }

            setStatus('saved');
            setContent('');
            if (!useFallback) {
                loadHistory();
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
                        // Also store as structured conversation for v3 memorize (additive)
                        await memuMemorize(
                          [{ role: 'user', content: entryContent }],
                          memuConfig,
                          { userName: 'User', agentName: 'MyStats' },
                        );
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
                void (async () => {
                    try {
                        const result = await analyzeEntryWithAI(entryContent, language);
                        
                        if (result.insight) {
                            const insightData: Insight = {
                                id: generateId(),
                                entryId: entryId,
                                ...result.insight,
                                timestamp: timestamp,
                                lastModified: timestamp
                            };
                            if (useFallback) {
                                addFallbackInsight(insightData);
                                setLastInsight(insightData);
                            } else if (db) {
                                await db.put('insights', insightData);
                                setLastInsight(insightData);
                            }
                        }

                        const categories: Array<{ items?: { name: string, category?: string }[], defaultCategory?: Skill['category'] }> = [
                            { items: result.skills, defaultCategory: 'hard' },
                            { items: result.traits, defaultCategory: 'trait' },
                            { items: result.experiences, defaultCategory: 'experience' },
                            { items: result.interests, defaultCategory: 'interest' }
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
                                    if (useFallback) {
                                        upsertFallbackSkill({ name: normalizedName, category }, entryId);
                                    } else {
                                        await upsertSkill({ name: normalizedName, category }, entryId);
                                    }
                                }
                            }
                        }
                        if (useFallback) {
                            setHistory(loadFallbackJournalEntries());
                        }
                    } catch (err) {
                        console.error("AI Analysis failed", err);
                        setAnalysisError(t('analysisFailed'));
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
                        Memory Rail
                    </div>
                    <div className="space-y-3 max-h-[400px] md:max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                        {history.length === 0 ? (
                            <div className="p-8 text-center border-2 border-dashed border-border rounded-3xl opacity-50">
                                <p className="text-[10px] font-black uppercase tracking-widest leading-relaxed">No pulses<br/>detected</p>
                            </div>
                        ) : (
                            history.map(entry => (
                                <button
                                    key={entry.id}
                                    onClick={() => {
                                        setSelectedEntryId(entry.id);
                                        setContent(entry.content);
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
                                    }}
                                    className="h-7 px-3 rounded-lg hover:bg-primary/10 text-primary border border-primary/20 text-[10px] md:text-xs"
                                >
                                    + NEW
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
                                        ? (isAnalyzing ? t('analyzing') : 'System Ready')
                                        : status.toUpperCase()}
                                </span>
                            </div>
                        </div>

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

                        <div className="p-6 flex items-center justify-end bg-secondary/10 border-t border-border">
                            <Button
                                onClick={handleSave}
                                disabled={!content.trim() || status === 'saving'}
                                className={cn(
                                    "h-14 px-10 rounded-2xl font-black tracking-tight transition-all active:scale-95 group",
                                    status === 'saved' ? "bg-emerald-500 hover:bg-emerald-600" : "bg-primary hover:bg-primary/90"
                                )}
                            >
                                <AnimatePresence mode="wait">
                                    {status === 'saving' ? (
                                        <motion.div key="loading" initial={{opacity:0}} animate={{opacity:1}} className="flex items-center gap-3">
                                            <Loader2 className="w-5 h-5 animate-spin" />
                                            <span>SAVING...</span>
                                        </motion.div>
                                    ) : status === 'saved' ? (
                                        <motion.div key="saved" initial={{opacity:0, scale:0.8}} animate={{opacity:1, scale:1}} className="flex items-center gap-2">
                                            <CheckCircle2 className="w-5 h-5" />
                                            <span>COMPLETE</span>
                                        </motion.div>
                                    ) : (
                                        <motion.div key="idle" initial={{opacity:0}} animate={{opacity:1}} className="flex items-center gap-3">
                                            <Sparkles className="w-5 h-5 group-hover:rotate-12 transition-transform" />
                                            <span>{t('analyzeSave')}</span>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </Button>
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
                                <h3 className="font-black uppercase tracking-widest text-sm">Extracted Archetypes</h3>
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
                                <h3 className="font-black uppercase tracking-widest text-sm">Pattern Analysis</h3>
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
