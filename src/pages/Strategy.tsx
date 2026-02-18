import React, { useCallback, useEffect, useMemo, useRef, useState, Suspense } from 'react';
import {
  Loader2,
  Sparkles,
  Target,
  Globe,
  BrainCircuit,
  MessageSquareQuote,
  Zap,
  Check,
  AlertTriangle,
  Search,
  Plus,
  Save,
  Trash2,
  Copy,
  PencilLine,
  Eye,
  Layers3,
} from 'lucide-react';

const ReactMarkdown = React.lazy(() => import('react-markdown'));
import { getDB, DB_ERRORS, type JournalEntry, type Skill, type Insight, type Solution } from '../db/db';
import { getFallbackStorageMode, loadFallbackJournalEntries, loadFallbackSkills, loadFallbackInsights, loadFallbackSolutions, saveFallbackSolution, deleteFallbackSolution } from '../db/fallback';
import { generateStrategy, checkAIStatus } from '../lib/ai-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useLanguage } from '../hooks/useLanguage';
import { motion, AnimatePresence } from 'framer-motion';
import { cn, generateId } from '@/lib/utils';
import { getMemuConfig, memuRetrieveV3, type MemuEngine, type MemuRetrieveItem } from '@/lib/memu';
import { upsertTombstone } from '@/lib/tombstones';

export const Strategy = () => {
	    const { t, language } = useLanguage();
	    const [problem, setProblem] = useState('');
	    const [solution, setSolution] = useState('');
	    const [status, setStatus] = useState<'idle' | 'generating' | 'completed' | 'error'>('idle');
	    const [errorMessage, setErrorMessage] = useState<string | null>(null);
	    const [memuRunInfo, setMemuRunInfo] = useState<{ engine: MemuEngine; hits: number; failed: boolean } | null>(null);
	    const [memuSources, setMemuSources] = useState<{ personal: MemuRetrieveItem[]; projects: MemuRetrieveItem[] } | null>(null);
	    const [storageMode, setStorageMode] = useState<'db' | 'fallback' | 'memory'>('db');
	    const [vaultQuery, setVaultQuery] = useState('');
	    const [vaultSolutions, setVaultSolutions] = useState<Solution[]>([]);
	    const [selectedSolution, setSelectedSolution] = useState<Solution | null>(null);
	    const selectedSolutionBase = useRef<Solution | null>(null);
	    const [outputMode, setOutputMode] = useState<'preview' | 'edit'>('preview');
	    const [isSaving, setIsSaving] = useState(false);
	
	    const [contextEntries, setContextEntries] = useState<JournalEntry[]>([]);
	    const [contextSkills, setContextSkills] = useState<Skill[]>([]);
	    const [contextInsights, setContextInsights] = useState<Insight[]>([]);
	    const [showContextBuilder, setShowContextBuilder] = useState(false);
	    const [entryQuery, setEntryQuery] = useState('');
	    const [selectedEntryIds, setSelectedEntryIds] = useState<string[]>([]);
	    const [selectedSkillNames, setSelectedSkillNames] = useState<string[]>([]);
	    const [selectedArchetypes, setSelectedArchetypes] = useState<string[]>([]);
	
	    const loadStrategyData = useCallback(async () => {
	        try {
	            const db = await getDB();
	            const [skills, insights, solutions, journal] = await Promise.all([
	                db.getAll('skills'),
	                db.getAll('insights'),
	                db.getAll('solutions'),
	                db.getAllFromIndex('journal', 'by-date'),
	            ]);
	            setContextSkills(skills);
	            setContextInsights(insights);
	            setVaultSolutions(solutions.slice().sort((a, b) => (b.lastModified ?? b.timestamp) - (a.lastModified ?? a.timestamp)));
	            setContextEntries(journal.toReversed());
	            setStorageMode('db');
	        } catch {
	            const mode = getFallbackStorageMode() === 'memory' ? 'memory' : 'fallback';
	            setContextSkills(loadFallbackSkills());
	            setContextInsights(loadFallbackInsights());
	            setVaultSolutions(loadFallbackSolutions());
	            setContextEntries(loadFallbackJournalEntries());
	            setStorageMode(mode);
	        }
	    }, []);
	
	    useEffect(() => {
	        void loadStrategyData();
	    }, [loadStrategyData]);
	
	    useEffect(() => {
	        const onUpdate = () => void loadStrategyData();
	        window.addEventListener('mystats-data-updated', onUpdate);
	        return () => window.removeEventListener('mystats-data-updated', onUpdate);
	    }, [loadStrategyData]);
	
	    const filteredVault = useMemo(() => {
	        const q = vaultQuery.trim().toLowerCase();
	        if (!q) return vaultSolutions;
	        return vaultSolutions.filter((item) => {
	            const hay = `${item.problem}\n${item.solution}`.toLowerCase();
	            return hay.includes(q);
	        });
	    }, [vaultQuery, vaultSolutions]);
	
	    const topSkills = useMemo(() => {
	        const map = new Map<string, { name: string; category: Skill['category']; count: number; last: number }>();
	        for (const skill of contextSkills) {
	            const name = (skill.name || '').trim();
	            if (!name) continue;
	            const key = name.toLowerCase();
	            const count = Array.isArray(skill.sourceEntryIds) && skill.sourceEntryIds.length > 0 ? skill.sourceEntryIds.length : 1;
	            const last = skill.lastModified ?? skill.createdAt ?? 0;
	            const existing = map.get(key);
	            if (!existing) {
	                map.set(key, { name, category: skill.category, count, last });
	                continue;
	            }
	            existing.count += count;
	            if (last >= existing.last) {
	                existing.last = last;
	                existing.category = skill.category;
	                existing.name = name;
	            }
	        }
	        return Array.from(map.values())
	            .sort((a, b) => b.count - a.count || b.last - a.last || a.name.localeCompare(b.name))
	            .slice(0, 16);
	    }, [contextSkills]);
	
	    const uniqueArchetypes = useMemo(() => {
	        const set = new Set<string>();
	        for (const insight of contextInsights) {
	            for (const raw of insight.archetypes || []) {
	                const value = String(raw || '').trim();
	                if (!value) continue;
	                set.add(value);
	            }
	        }
	        return Array.from(set);
	    }, [contextInsights]);
	
	    const entryResults = useMemo(() => {
	        const q = entryQuery.trim().toLowerCase();
	        const base = Array.isArray(contextEntries) ? contextEntries : [];
	        const filtered = q
	            ? base.filter((item) => (item.content || '').toLowerCase().includes(q))
	            : base;
	        return filtered.slice(0, 10);
	    }, [contextEntries, entryQuery]);
	
	    const normalizeList = useCallback((items: string[] | undefined | null) => {
	        return (items || [])
	            .map((v) => String(v || '').trim())
	            .filter(Boolean)
	            .sort((a, b) => a.localeCompare(b));
	    }, []);
	
	    const isDirty = useMemo(() => {
	        const base = selectedSolutionBase.current;
	        const current = {
	            problem: problem,
	            solution: solution,
	            entryIds: normalizeList(selectedEntryIds),
	            skillNames: normalizeList(selectedSkillNames),
	            archetypes: normalizeList(selectedArchetypes),
	        };
	        if (!base) {
	            return Boolean(current.problem.trim() || current.solution.trim() || current.entryIds.length || current.skillNames.length || current.archetypes.length);
	        }
	        const baseEntryIds = normalizeList(base.sourceEntryIds);
	        const baseSkillNames = normalizeList(base.sourceSkillNames);
	        const baseArchetypes = normalizeList(base.sourceArchetypes);
	        return (
	            current.problem !== base.problem ||
	            current.solution !== base.solution ||
	            JSON.stringify(current.entryIds) !== JSON.stringify(baseEntryIds) ||
	            JSON.stringify(current.skillNames) !== JSON.stringify(baseSkillNames) ||
	            JSON.stringify(current.archetypes) !== JSON.stringify(baseArchetypes)
	        );
	    }, [normalizeList, problem, selectedArchetypes, selectedEntryIds, selectedSkillNames, solution]);
	
	    const handleNew = useCallback(() => {
	        selectedSolutionBase.current = null;
	        setSelectedSolution(null);
	        setProblem('');
	        setSolution('');
	        setStatus('idle');
	        setErrorMessage(null);
	        setMemuRunInfo(null);
	        setMemuSources(null);
	        setSelectedEntryIds([]);
	        setSelectedSkillNames([]);
	        setSelectedArchetypes([]);
	        setOutputMode('preview');
	    }, []);
	
	    const handleLoadSolution = useCallback((item: Solution) => {
	        selectedSolutionBase.current = item;
	        setSelectedSolution(item);
	        setProblem(item.problem);
	        setSolution(item.solution);
	        setSelectedEntryIds(item.sourceEntryIds ?? []);
	        setSelectedSkillNames(item.sourceSkillNames ?? []);
	        setSelectedArchetypes(item.sourceArchetypes ?? []);
	        setStatus('completed');
	        setErrorMessage(null);
	        setOutputMode('preview');
	    }, []);
	
	    const toggleString = useCallback((value: string, setter: (fn: (prev: string[]) => string[]) => void) => {
	        const clean = (value || '').trim();
	        if (!clean) return;
	        setter((prev) => (prev.includes(clean) ? prev.filter((v) => v !== clean) : [...prev, clean]));
	    }, []);

	    const clearContextSelections = useCallback(() => {
	        setSelectedEntryIds([]);
	        setSelectedSkillNames([]);
	        setSelectedArchetypes([]);
	    }, []);

	    const handleCopySolution = useCallback(async () => {
	        const text = (solution || '').trim();
	        if (!text) return;
	        try {
	            await navigator.clipboard.writeText(text);
	            alert(t('strategyVaultCopied'));
	        } catch (error) {
	            console.warn('Failed to copy strategy', error);
	            alert(t('strategyVaultCopyFailed'));
	        }
	    }, [solution, t]);

	    const handleSaveSolution = useCallback(
	        async (mode: 'overwrite' | 'new') => {
	            const trimmedProblem = (problem || '').trim();
	            const trimmedSolution = (solution || '').trim();
	            if (!trimmedProblem || !trimmedSolution) {
	                alert(t('strategyVaultSaveValidation'));
	                return;
	            }

	            setIsSaving(true);
	            try {
	                const now = Date.now();
	                const base = selectedSolutionBase.current;
	                const overwrite = mode === 'overwrite' && Boolean(base);
	                const id = overwrite && base ? base.id : generateId();
	                const timestamp = overwrite && base ? base.timestamp : now;

	                const next: Solution = {
	                    id,
	                    problem: trimmedProblem,
	                    solution: trimmedSolution,
	                    timestamp,
	                    lastModified: now,
	                };

	                const entryIds = normalizeList(selectedEntryIds);
	                const skillNames = normalizeList(selectedSkillNames);
	                const archetypes = normalizeList(selectedArchetypes);
	                if (entryIds.length) next.sourceEntryIds = entryIds;
	                if (skillNames.length) next.sourceSkillNames = skillNames;
	                if (archetypes.length) next.sourceArchetypes = archetypes;

	                if (memuRunInfo) {
	                    next.memuContext = {
	                        engine: memuRunInfo.engine,
	                        personalHits: memuSources?.personal?.length ?? 0,
	                        projectHits: memuSources?.projects?.length ?? 0,
	                        failed: memuRunInfo.failed ? true : undefined,
	                    };
	                }

	                if (storageMode === 'db') {
	                    try {
	                        const db = await getDB();
	                        await db.put('solutions', next);
	                    } catch (error) {
	                        console.warn('DB unavailable; saving strategy to fallback', error);
	                        const mode = getFallbackStorageMode() === 'memory' ? 'memory' : 'fallback';
	                        setStorageMode(mode);
	                        saveFallbackSolution(next);
	                        alert(t('strategyVaultSavedToFallback'));
	                    }
	                } else {
	                    saveFallbackSolution(next);
	                }

	                selectedSolutionBase.current = next;
	                setSelectedSolution(next);
	                setStatus('completed');
	                window.dispatchEvent(new Event('mystats-data-updated'));
	            } catch (error) {
	                console.error('Failed to save solution', error);
	                alert(t('strategyVaultSaveFailed'));
	            } finally {
	                setIsSaving(false);
	            }
	        },
	        [
	            memuRunInfo,
	            memuSources,
	            normalizeList,
	            problem,
	            selectedArchetypes,
	            selectedEntryIds,
	            selectedSkillNames,
	            solution,
	            storageMode,
	            t,
	        ]
	    );

	    const handleDeleteSolution = useCallback(async () => {
	        const base = selectedSolutionBase.current;
	        if (!base) return;
	        const ok = window.confirm(t('strategyVaultDeleteConfirm'));
	        if (!ok) return;

	        setIsSaving(true);
	        try {
	            const ts = Date.now();
	            if (storageMode === 'db') {
	                try {
	                    const db = await getDB();
	                    await db.delete('solutions', base.id);
	                    upsertTombstone('solutions', base.id, ts);
	                } catch (error) {
	                    console.warn('DB delete failed; falling back', error);
	                    const mode = getFallbackStorageMode() === 'memory' ? 'memory' : 'fallback';
	                    setStorageMode(mode);
	                    deleteFallbackSolution(base.id);
	                    alert(t('strategyVaultDeletedFromFallback'));
	                }
	            } else {
	                deleteFallbackSolution(base.id);
	            }
	            window.dispatchEvent(new Event('mystats-data-updated'));
	            handleNew();
	        } finally {
	            setIsSaving(false);
	        }
	    }, [handleNew, storageMode, t]);

    const handleGenerate = async () => {
        if (!problem.trim()) return;
        setStatus('generating');
        setSolution('');
        setErrorMessage(null);
        setMemuRunInfo(null);
        setMemuSources(null);

	        try {
	            let skills: Skill[] = [];
	            let insights: Insight[] = [];
	            let journal: JournalEntry[] = [];
	            try {
	                const db = await getDB();
	                [skills, insights, journal] = await Promise.all([
	                    db.getAll('skills'),
	                    db.getAll('insights'),
	                    db.getAllFromIndex('journal', 'by-date'),
	                ]);
	            } catch (error) {
	                journal = loadFallbackJournalEntries().toReversed();
	                skills = loadFallbackSkills();
	                insights = loadFallbackInsights();
	                if (!skills.length && !insights.length) {
	                    throw error;
	                }
	            }

	            if (skills.length === 0) {
	                alert(t('notEnoughData'));
	                setStatus('idle');
	                return;
	            }

            let aiConfigured = false;
            try {
                aiConfigured = checkAIStatus().configured;
            } catch {
                aiConfigured = false;
            }
            if (!aiConfigured) {
                setErrorMessage(t('apiKeyRequired'));
                setStatus('error');
                return;
            }

	            const skillMeta = (() => {
	                const map = new Map<string, { name: string; category: Skill['category']; count: number; last: number }>();
	                for (const s of skills) {
	                    const name = (s.name || '').trim();
	                    if (!name) continue;
	                    const key = name.toLowerCase();
	                    const count = Array.isArray(s.sourceEntryIds) && s.sourceEntryIds.length > 0 ? s.sourceEntryIds.length : 1;
	                    const last = s.lastModified ?? s.createdAt ?? 0;
	                    const existing = map.get(key);
	                    if (!existing) {
	                        map.set(key, { name, category: s.category, count, last });
	                        continue;
	                    }
	                    existing.count += count;
	                    if (last >= existing.last) {
	                        existing.last = last;
	                        existing.category = s.category;
	                        existing.name = name;
	                    }
	                }
	                return Array.from(map.values()).sort((a, b) => b.count - a.count || b.last - a.last || a.name.localeCompare(b.name));
	            })();
	
	            const baseSkillLines = skillMeta
	                .slice(0, 40)
	                .map((s) => `- ${s.name} (${s.category})`)
	                .join('\n');
	
	            let context = `=== SKILLS ===\n${baseSkillLines}`;

	            if (insights.length > 0) {
	                const archetypes = Array.from(new Set(insights.flatMap(i => i.archetypes)));
	                const patterns = Array.from(new Set(insights.flatMap(i => i.hiddenPatterns)));
	                
	                context += `\n\n=== DEEP INTELLIGENCE PROFILES ===\n`;
	                if (archetypes.length) context += `Core Archetypes: ${archetypes.join(', ')}\n`;
	                if (patterns.length) context += `Operational Patterns:\n${patterns.slice(0, 20).map(p => `- ${p}`).join('\n')}`;
	            }
	
	            const selectedSkills = selectedSkillNames.map((s) => s.trim()).filter(Boolean);
	            const selectedArchetypeList = selectedArchetypes.map((s) => s.trim()).filter(Boolean);
	            const selectedEntryList = selectedEntryIds.map((s) => s.trim()).filter(Boolean);
	
	            if (selectedSkills.length || selectedArchetypeList.length || selectedEntryList.length) {
	                context += `\n\n=== SELECTED CONTEXT ===\n`;
	                if (selectedSkills.length) {
	                    context += `Selected Skills:\n${selectedSkills.map((s) => `- ${s}`).join('\n')}\n`;
	                }
	                if (selectedArchetypeList.length) {
	                    context += `\nSelected Archetypes:\n${selectedArchetypeList.map((s) => `- ${s}`).join('\n')}\n`;
	                }
	
	                if (selectedEntryList.length) {
	                    const insightByEntryId = new Map<string, Insight>();
	                    for (const item of insights) {
	                        if (!item?.entryId) continue;
	                        const existing = insightByEntryId.get(item.entryId);
	                        const existingTime = existing ? existing.lastModified ?? existing.timestamp ?? 0 : 0;
	                        const nextTime = item.lastModified ?? item.timestamp ?? 0;
	                        if (!existing || nextTime >= existingTime) {
	                            insightByEntryId.set(item.entryId, item);
	                        }
	                    }
	
	                    const MAX_ENTRY_CHARS = 1200;
	                    const MAX_TOTAL_CHARS = 4500;
	                    let total = 0;
	                    let block = '';
	
	                    for (const entryId of selectedEntryList) {
	                        const entry = journal.find((j) => j.id === entryId);
	                        if (!entry) continue;
	                        const header = `\n--- Journal Entry (${new Date(entry.timestamp).toISOString()}) ---\n`;
	                        const excerpt = (entry.content || '').trim().slice(0, MAX_ENTRY_CHARS);
	                        if (!excerpt) continue;
	
	                        let entryBlock = `${header}${excerpt}\n`;
	
	                        const insight = insightByEntryId.get(entryId);
	                        const evidence = insight?.evidenceQuotes?.slice(0, 5).map((q) => String(q || '').trim()).filter(Boolean) ?? [];
	                        if (evidence.length) {
	                            entryBlock += `Evidence Quotes:\n${evidence.map((q) => `- "${q}"`).join('\n')}\n`;
	                        }
	
	                        if (total + entryBlock.length > MAX_TOTAL_CHARS) break;
	                        block += entryBlock;
	                        total += entryBlock.length;
	                    }
	
	                    if (block.trim()) {
	                        context += `\nSelected Journal Evidence:\n${block}`;
	                    }
	                }
	            }

	            const memuConfig = getMemuConfig();
	            if (memuConfig.enabled && memuConfig.useInStrategy) {
	                const engine = memuConfig.engine;
	                let memuHits = 0;
                let memuFailed = false;
                let personalItems: MemuRetrieveItem[] = [];
                let projectItems: MemuRetrieveItem[] = [];

                const memuPersonal = await memuRetrieveV3(problem, memuConfig, { topK: 4, method: 'rag', timeoutMs: 4000 });
                if (!memuPersonal) memuFailed = true;
                personalItems = memuPersonal?.items || [];
                const personalLines = (memuPersonal?.items || [])
                    .map((item) => {
                        const summary = (item.summary || '').replace(/\s+/g, ' ').trim();
                        const score = typeof item.score === 'number' ? item.score.toFixed(2) : undefined;
                        const label = score ? `(${score}) ` : '';
                        return summary ? `- ${label}${summary.slice(0, 240)}` : null;
                    })
                    .filter(Boolean) as string[];
                memuHits += personalLines.length;

                let computedProjectLines: string[] = [];
	                if (memuConfig.includeProjectRegistryInStrategy) {
	                    const memuProjects = await memuRetrieveV3(problem, memuConfig, { userId: 'project-registry', topK: 3, method: 'rag', timeoutMs: 3000 });
	                    if (!memuProjects) memuFailed = true;
	                    projectItems = memuProjects?.items || [];
	                    computedProjectLines = (memuProjects?.items || [])
                        .map((item) => {
                            const summary = (item.summary || '').replace(/\s+/g, ' ').trim();
                            return summary ? `- ${summary.slice(0, 240)}` : null;
                        })
                        .filter(Boolean) as string[];
                }
	                memuHits += computedProjectLines.length;
	                setMemuRunInfo({ engine, hits: memuHits, failed: memuFailed });
	                setMemuSources({ personal: personalItems, projects: projectItems });

                if (personalLines.length || (computedProjectLines?.length ?? 0)) {
                    context += `\n\n=== My Memory CONTEXT ===\n`;
                    if (personalLines.length) {
                        context += `My Memory:\n${personalLines.join('\n')}\n`;
                    }
                    if (computedProjectLines?.length) {
                        context += `\nProject Registry:\n${computedProjectLines.join('\n')}\n`;
                    }
                }
            }

            const result = await generateStrategy(context, problem, language);
            setSolution(result);
            setStatus('completed');
            
        } catch (error) {
            console.error("Strategy generation failed", error);
            setStatus('error');
            if (error instanceof Error) {
                if (error.message === DB_ERRORS.blocked) {
                    setErrorMessage(t('dbBlocked'));
                } else if (error.message === DB_ERRORS.timeout) {
                    setErrorMessage(t('dbTimeout'));
                } else if (error.name === 'NotFoundError' || error.message.includes('object stores')) {
                    setErrorMessage(t('dbMissingStore'));
                } else {
                    setErrorMessage(error.message || t('strategyFailed'));
                }
            } else {
                setErrorMessage(t('strategyFailed'));
            }
        }
    };

	    return (
	        <div className="max-w-6xl mx-auto space-y-12 pb-20">
            <header className="space-y-4">
                <div className="flex items-center gap-2 text-primary font-mono text-xs font-bold uppercase tracking-[0.3em]">
                    <Globe className="w-4 h-4" />
                    {t('neuralStrategyEngine')}
                </div>
                <h1 className="text-5xl font-black tracking-tighter text-foreground">
                  {t('strategistTitle')}
                </h1>
                <p className="text-xl text-muted-foreground font-medium max-w-2xl leading-relaxed">
                  {t('strategistDesc')}
                </p>
            </header>

	            <div className="space-y-8">
	                {/* Strategy Vault */}
	                <div className="space-y-6">
	                    <Card className="bg-secondary/20 border-border backdrop-blur-2xl rounded-[2rem] overflow-clip shadow-2xl">
	                        <CardHeader className="p-8 pb-4">
	                            <div className="flex items-start justify-between gap-3">
	                                <div className="flex items-start gap-3">
	                                    <div className="p-3 bg-indigo-500/10 text-indigo-500 rounded-2xl ring-1 ring-indigo-500/20">
	                                        <Layers3 className="w-5 h-5" />
	                                    </div>
	                                    <div className="space-y-1">
	                                        <CardTitle className="text-lg font-black tracking-tight">{t('strategyVaultTitle')}</CardTitle>
	                                        <CardDescription className="text-muted-foreground font-semibold text-xs">
	                                            {t('strategyVaultDesc')}
	                                        </CardDescription>
	                                    </div>
	                                </div>
	                                <Button
	                                    variant="secondary"
	                                    size="icon"
	                                    onClick={handleNew}
	                                    className="rounded-2xl"
	                                    title={t('strategyVaultNew')}
	                                >
	                                    <Plus className="w-5 h-5" />
	                                </Button>
	                            </div>

	                            <div className="mt-5 flex items-center gap-2 flex-wrap">
	                                <Badge className="px-3 py-1 rounded-full text-[10px] font-black tracking-widest uppercase bg-background/40 border-border text-muted-foreground">
	                                    {storageMode === 'db'
	                                        ? t('strategyStorageDb')
	                                        : storageMode === 'fallback'
	                                            ? t('strategyStorageFallback')
	                                            : t('strategyStorageMemory')}
	                                </Badge>
	                                <Badge className="px-3 py-1 rounded-full text-[10px] font-black tracking-widest uppercase bg-background/40 border-border text-muted-foreground">
	                                    {t('strategyVaultCount').replace('{count}', String(vaultSolutions.length))}
	                                </Badge>
	                            </div>
	                        </CardHeader>
	                        <CardContent className="p-8 pt-0 space-y-4">
	                            <div className="relative">
	                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/70" />
	                                <Input
	                                    value={vaultQuery}
	                                    onChange={(e) => setVaultQuery(e.target.value)}
	                                    placeholder={t('strategyVaultSearch')}
	                                    className="pl-9 rounded-2xl bg-background/40 border-border focus-visible:ring-primary/20"
	                                />
	                            </div>

	                            <div className="flex gap-4 overflow-x-auto custom-scrollbar pb-2">
	                                {filteredVault.length === 0 ? (
	                                    <div className="p-6 text-center text-sm text-muted-foreground">
	                                        {t('strategyVaultEmpty')}
	                                    </div>
	                                ) : (
	                                    filteredVault.map((item) => {
	                                        const selected = item.id === selectedSolution?.id;
	                                        const entryCount = item.sourceEntryIds?.length ?? 0;
	                                        const skillCount = item.sourceSkillNames?.length ?? 0;
	                                        const archetypeCount = item.sourceArchetypes?.length ?? 0;
	                                        const labelDate = new Date(item.lastModified ?? item.timestamp).toLocaleDateString(
	                                            language === 'ko' ? 'ko-KR' : 'en-US'
	                                        );
	                                        return (
	                                            <button
	                                                key={item.id}
	                                                type="button"
	                                                onClick={() => handleLoadSolution(item)}
	                                                className={cn(
	                                                    "min-w-[240px] flex-shrink-0 text-left p-4 rounded-[1.75rem] border transition-colors",
	                                                    selected
	                                                        ? "bg-primary/10 border-primary/30"
	                                                        : "bg-background/30 border-border hover:bg-background/40"
	                                                )}
	                                            >
	                                                <p className="text-sm font-black tracking-tight leading-snug line-clamp-2">
	                                                    {item.problem}
	                                                </p>
	                                                <div className="mt-2 flex items-center gap-2 flex-wrap">
	                                                    <span className="text-[10px] font-mono text-muted-foreground/70">{labelDate}</span>
	                                                    {entryCount > 0 && (
	                                                        <Badge className="px-2 py-0.5 rounded-full text-[10px] font-black tracking-widest uppercase bg-background/40 border-border text-muted-foreground">
	                                                            {t('strategyVaultTagEntries').replace('{count}', String(entryCount))}
	                                                        </Badge>
	                                                    )}
	                                                    {skillCount > 0 && (
	                                                        <Badge className="px-2 py-0.5 rounded-full text-[10px] font-black tracking-widest uppercase bg-background/40 border-border text-muted-foreground">
	                                                            {t('strategyVaultTagSkills').replace('{count}', String(skillCount))}
	                                                        </Badge>
	                                                    )}
	                                                    {archetypeCount > 0 && (
	                                                        <Badge className="px-2 py-0.5 rounded-full text-[10px] font-black tracking-widest uppercase bg-background/40 border-border text-muted-foreground">
	                                                            {t('strategyVaultTagArchetypes').replace('{count}', String(archetypeCount))}
	                                                        </Badge>
	                                                    )}
	                                                </div>
	                                            </button>
	                                        );
	                                    })
	                                )}
	                            </div>
	                        </CardContent>
	                    </Card>
	                </div>

	                <div className="grid gap-8 lg:grid-cols-2">
	                {/* Input Workspace */}
	                <div className="space-y-6">
	                    <Card className="bg-secondary/20 border-border backdrop-blur-2xl rounded-[3rem] overflow-hidden shadow-2xl transition-all duration-500 hover:bg-secondary/30">
	                        <CardHeader className="p-10 pb-6">
	                            <div className="flex items-center gap-4 mb-2">
	                                <div className="p-3 bg-primary/10 text-primary rounded-2xl ring-1 ring-primary/20">
	                                    <Target className="w-6 h-6" />
                                </div>
                                <CardTitle className="text-2xl font-black tracking-tight">{t('problemGoalTitle')}</CardTitle>
                            </div>
                            <CardDescription className="text-muted-foreground font-semibold">{t('problemGoalDesc')}</CardDescription>
	                        </CardHeader>
	                        <CardContent className="p-10 pt-4 space-y-8">
	                            <textarea
	                                value={problem}
	                                onChange={(e) => setProblem(e.target.value)}
	                                placeholder={t('problemPlaceholder')}
	                                disabled={status === 'generating'}
	                                className="w-full min-h-[350px] p-6 bg-background/50 border border-border rounded-[2rem] text-lg font-medium leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all custom-scrollbar placeholder:text-muted-foreground/30"
	                            />

	                            <div className="space-y-4">
	                                <button
	                                    type="button"
	                                    onClick={() => setShowContextBuilder((prev) => !prev)}
	                                    className="w-full flex items-center justify-between gap-4 px-5 py-4 rounded-[1.75rem] border border-border bg-background/30 hover:bg-background/40 transition-colors"
	                                >
	                                    <div className="flex items-center gap-3 text-left">
	                                        <div className="p-2 bg-indigo-500/10 text-indigo-500 rounded-xl ring-1 ring-indigo-500/20">
	                                            <Layers3 className="w-4 h-4" />
	                                        </div>
	                                        <div className="space-y-0.5">
	                                            <p className="text-sm font-black tracking-tight text-foreground">
	                                                {t('strategyContextBuilderTitle')}
	                                            </p>
	                                            <p className="text-xs text-muted-foreground font-semibold">
	                                                {t('strategyContextBuilderDesc')}
	                                            </p>
	                                        </div>
	                                    </div>
	                                    <div className="flex items-center gap-2">
	                                        {(selectedEntryIds.length + selectedSkillNames.length + selectedArchetypes.length) > 0 && (
	                                            <Badge className="px-3 py-1 rounded-full text-[10px] font-black tracking-widest uppercase bg-background/40 border-border text-muted-foreground">
	                                                {t('strategyContextSelectedCount').replace(
	                                                    '{count}',
	                                                    String(selectedEntryIds.length + selectedSkillNames.length + selectedArchetypes.length)
	                                                )}
	                                            </Badge>
	                                        )}
	                                        <span className="text-muted-foreground font-black">{showContextBuilder ? '–' : '+'}</span>
	                                    </div>
	                                </button>

	                                <AnimatePresence initial={false}>
	                                    {showContextBuilder && (
	                                        <motion.div
	                                            key="context"
	                                            initial={{ opacity: 0, height: 0 }}
	                                            animate={{ opacity: 1, height: 'auto' }}
	                                            exit={{ opacity: 0, height: 0 }}
	                                            className="overflow-hidden"
	                                        >
	                                            <div className="space-y-6 p-6 bg-secondary/10 border border-border rounded-[2rem]">
	                                                <div className="flex items-center justify-between gap-3">
	                                                    <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">
	                                                        {t('strategyContextSelected')}
	                                                    </p>
	                                                    <Button
	                                                        variant="ghost"
	                                                        size="sm"
	                                                        onClick={clearContextSelections}
	                                                        disabled={
	                                                            selectedEntryIds.length === 0 &&
	                                                            selectedSkillNames.length === 0 &&
	                                                            selectedArchetypes.length === 0
	                                                        }
	                                                        className="h-8 px-3 rounded-full"
	                                                    >
	                                                        {t('clear')}
	                                                    </Button>
	                                                </div>

	                                                {(selectedSkillNames.length > 0 || selectedArchetypes.length > 0 || selectedEntryIds.length > 0) && (
	                                                    <div className="flex flex-wrap gap-2">
	                                                        {normalizeList(selectedSkillNames).map((name) => (
	                                                            <button
	                                                                key={`skill:${name}`}
	                                                                type="button"
	                                                                onClick={() => toggleString(name, setSelectedSkillNames)}
	                                                                className="px-3 py-1.5 rounded-full text-[11px] font-bold border border-border bg-background/40 hover:bg-background/60 transition-colors"
	                                                            >
	                                                                {name} <span className="opacity-60">×</span>
	                                                            </button>
	                                                        ))}
	                                                        {normalizeList(selectedArchetypes).map((name) => (
	                                                            <button
	                                                                key={`arch:${name}`}
	                                                                type="button"
	                                                                onClick={() => toggleString(name, setSelectedArchetypes)}
	                                                                className="px-3 py-1.5 rounded-full text-[11px] font-bold border border-border bg-background/40 hover:bg-background/60 transition-colors"
	                                                            >
	                                                                {name} <span className="opacity-60">×</span>
	                                                            </button>
	                                                        ))}
	                                                        {normalizeList(selectedEntryIds).map((entryId) => (
	                                                            <button
	                                                                key={`entry:${entryId}`}
	                                                                type="button"
	                                                                onClick={() => toggleString(entryId, setSelectedEntryIds)}
	                                                                className="px-3 py-1.5 rounded-full text-[11px] font-mono font-bold border border-border bg-background/40 hover:bg-background/60 transition-colors"
	                                                                title={t('strategyContextEntryRemove')}
	                                                            >
	                                                                {entryId.slice(0, 8)} <span className="opacity-60">×</span>
	                                                            </button>
	                                                        ))}
	                                                    </div>
	                                                )}

	                                                <div className="space-y-2">
	                                                    <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">
	                                                        {t('strategyContextSkills')}
	                                                    </p>
	                                                    <div className="flex flex-wrap gap-2">
	                                                        {topSkills.map((item) => {
	                                                            const selected = selectedSkillNames.includes(item.name);
	                                                            return (
	                                                                <button
	                                                                    key={item.name}
	                                                                    type="button"
	                                                                    onClick={() => toggleString(item.name, setSelectedSkillNames)}
	                                                                    className={cn(
	                                                                        "px-3 py-1.5 rounded-full text-[11px] font-bold border transition-colors",
	                                                                        selected
	                                                                            ? "bg-primary text-primary-foreground border-primary/40"
	                                                                            : "bg-background/40 border-border hover:bg-background/60"
	                                                                    )}
	                                                                >
	                                                                    {item.name}
	                                                                </button>
	                                                            );
	                                                        })}
	                                                    </div>
	                                                </div>

	                                                <div className="space-y-2">
	                                                    <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">
	                                                        {t('strategyContextArchetypes')}
	                                                    </p>
	                                                    <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto custom-scrollbar pr-1">
	                                                        {uniqueArchetypes.length === 0 ? (
	                                                            <p className="text-sm text-muted-foreground">{t('strategyContextArchetypesEmpty')}</p>
	                                                        ) : (
	                                                            uniqueArchetypes.map((value) => {
	                                                                const selected = selectedArchetypes.includes(value);
	                                                                return (
	                                                                    <button
	                                                                        key={value}
	                                                                        type="button"
	                                                                        onClick={() => toggleString(value, setSelectedArchetypes)}
	                                                                        className={cn(
	                                                                            "px-3 py-1.5 rounded-full text-[11px] font-bold border transition-colors",
	                                                                            selected
	                                                                                ? "bg-primary text-primary-foreground border-primary/40"
	                                                                                : "bg-background/40 border-border hover:bg-background/60"
	                                                                        )}
	                                                                    >
	                                                                        {value}
	                                                                    </button>
	                                                                );
	                                                            })
	                                                        )}
	                                                    </div>
	                                                </div>

	                                                <div className="space-y-3">
	                                                    <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">
	                                                        {t('strategyContextEntries')}
	                                                    </p>
	                                                    <div className="relative">
	                                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/70" />
	                                                        <Input
	                                                            value={entryQuery}
	                                                            onChange={(e) => setEntryQuery(e.target.value)}
	                                                            placeholder={t('strategyContextEntrySearch')}
	                                                            className="pl-9 rounded-2xl bg-background/40 border-border focus-visible:ring-primary/20"
	                                                        />
	                                                    </div>
	                                                    <div className="space-y-2 max-h-56 overflow-y-auto custom-scrollbar pr-1">
	                                                        {entryResults.length === 0 ? (
	                                                            <p className="text-sm text-muted-foreground">{t('strategyContextEntriesEmpty')}</p>
	                                                        ) : (
	                                                            entryResults.map((entry) => {
	                                                                const selected = selectedEntryIds.includes(entry.id);
	                                                                const excerpt = (entry.content || '')
	                                                                    .replace(/\s+/g, ' ')
	                                                                    .trim()
	                                                                    .slice(0, 140);
	                                                                const labelDate = new Date(entry.timestamp).toLocaleDateString(
	                                                                    language === 'ko' ? 'ko-KR' : 'en-US'
	                                                                );
	                                                                return (
	                                                                    <button
	                                                                        key={entry.id}
	                                                                        type="button"
	                                                                        onClick={() => toggleString(entry.id, setSelectedEntryIds)}
	                                                                        className={cn(
	                                                                            "w-full text-left p-4 rounded-2xl border transition-colors",
	                                                                            selected
	                                                                                ? "bg-primary/10 border-primary/30"
	                                                                                : "bg-background/30 border-border hover:bg-background/40"
	                                                                        )}
	                                                                    >
	                                                                        <div className="flex items-start gap-3">
	                                                                            <span
	                                                                                className={cn(
	                                                                                    "mt-0.5 inline-flex h-4 w-4 rounded border items-center justify-center",
	                                                                                    selected
	                                                                                        ? "bg-primary border-primary text-primary-foreground"
	                                                                                        : "border-border text-transparent"
	                                                                                )}
	                                                                            >
	                                                                                <Check className="w-3 h-3" />
	                                                                            </span>
	                                                                            <div className="min-w-0 flex-1">
	                                                                                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
	                                                                                    {labelDate}
	                                                                                </p>
	                                                                                <p className="text-sm font-medium text-foreground leading-snug">
	                                                                                    {excerpt || t('strategyContextEntryNoText')}
	                                                                                </p>
	                                                                            </div>
	                                                                        </div>
	                                                                    </button>
	                                                                );
	                                                            })
	                                                        )}
	                                                    </div>
	                                                </div>
	                                            </div>
	                                        </motion.div>
	                                    )}
	                                </AnimatePresence>
	                            </div>
	                            
	                            <Button
	                                onClick={handleGenerate}
	                                disabled={!problem.trim() || status === 'generating'}
                                className={cn(
                                    "w-full h-16 rounded-[1.5rem] text-base font-black tracking-tight transition-all active:scale-[0.98] shadow-xl",
                                    status === 'completed' ? "bg-emerald-500 hover:bg-emerald-600" : "bg-primary hover:bg-primary/90"
                                )}
                            >
                                <AnimatePresence mode="wait">
                                    {status === 'generating' ? (
                                        <motion.div key="loading" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="flex items-center gap-3">
                                            <Loader2 className="h-6 w-6 animate-spin" />
                                            <span>{t('thinking')}</span>
                                        </motion.div>
                                    ) : (
                                        <motion.div key="idle" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="flex items-center gap-3">
                                            <Sparkles className="w-6 h-6" />
                                            <span>{t('generateStrategy')}</span>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </Button>
                        </CardContent>
                    </Card>

	                </div>

	                {/* Output Workspace */}
	                <div>
	                    <Card className="h-full min-h-[600px] flex flex-col bg-secondary/10 border-border backdrop-blur-3xl rounded-[3rem] overflow-hidden shadow-2xl relative">
	                        <CardHeader className="p-10 border-b border-border bg-secondary/5 flex flex-row items-center justify-between">
	                             <div className="flex items-center gap-4">
	                                <div className="p-3 bg-amber-500/10 text-amber-500 rounded-2xl ring-1 ring-amber-500/20">
                                    <Sparkles className="w-6 h-6" />
                                </div>
	                                <CardTitle className="text-2xl font-black tracking-tight">{t('strategyOutput')}</CardTitle>
	                             </div>
	                             <div className="flex items-center gap-2 flex-wrap justify-end">
	                                {isDirty && (
	                                    <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20 px-4 py-1.5 rounded-full text-[10px] font-black tracking-widest uppercase">
	                                        {t('strategyVaultUnsaved')}
	                                    </Badge>
	                                )}
	                                {memuRunInfo && (
	                                    <Badge
	                                        className={cn(
	                                            "px-4 py-1.5 rounded-full text-[10px] font-black tracking-widest uppercase",
                                            memuRunInfo.failed
                                                ? "bg-amber-500/10 text-amber-500 border-amber-500/20"
                                                : "bg-blue-500/10 text-blue-500 border-blue-500/20"
                                        )}
                                    >
                                        {(memuRunInfo.failed ? t('memuContextFailed') : t('memuContextBadge'))
                                            .replace('{engine}', memuRunInfo.engine === 'embedded' ? t('memuBadgeEmbedded') : t('memuBadgeApi'))
                                            .replace('{count}', String(memuRunInfo.hits))}
	                                    </Badge>
	                                )}
	                                {status === 'completed' && (
	                                    <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 px-4 py-1.5 rounded-full text-[10px] font-black tracking-widest uppercase">
	                                        {t('optimized')}
	                                    </Badge>
	                                )}
	                                <div className="w-px h-6 bg-border mx-1 opacity-70" />
	                                <Button
	                                    variant="ghost"
	                                    size="icon"
	                                    onClick={() => setOutputMode((prev) => (prev === 'preview' ? 'edit' : 'preview'))}
	                                    className="rounded-full"
	                                    title={outputMode === 'preview' ? t('strategyVaultEdit') : t('strategyVaultPreview')}
	                                >
	                                    {outputMode === 'preview' ? <PencilLine className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
	                                </Button>
	                                <Button
	                                    variant="ghost"
	                                    size="icon"
	                                    onClick={() => void handleCopySolution()}
	                                    className="rounded-full"
	                                    disabled={!solution.trim()}
	                                    title={t('strategyVaultCopy')}
	                                >
	                                    <Copy className="w-4 h-4" />
	                                </Button>
	                                <Button
	                                    variant="secondary"
	                                    size="icon"
	                                    onClick={() => void handleSaveSolution(selectedSolutionBase.current ? 'overwrite' : 'new')}
	                                    className="rounded-full"
	                                    disabled={isSaving || !problem.trim() || !solution.trim() || (selectedSolutionBase.current !== null && !isDirty)}
	                                    title={t('strategyVaultSave')}
	                                >
	                                    <Save className="w-4 h-4" />
	                                </Button>
	                                <Button
	                                    variant="secondary"
	                                    size="icon"
	                                    onClick={() => void handleSaveSolution('new')}
	                                    className="rounded-full"
	                                    disabled={isSaving || !problem.trim() || !solution.trim()}
	                                    title={t('strategyVaultSaveAsNew')}
	                                >
	                                    <Plus className="w-4 h-4" />
	                                </Button>
	                                <Button
	                                    variant="destructive"
	                                    size="icon"
	                                    onClick={() => void handleDeleteSolution()}
	                                    className="rounded-full"
	                                    disabled={isSaving || !selectedSolutionBase.current}
	                                    title={t('strategyVaultDelete')}
	                                >
	                                    <Trash2 className="w-4 h-4" />
	                                </Button>
	                             </div>
	                        </CardHeader>
                        
                        <CardContent className="flex-1 overflow-y-auto p-12 custom-scrollbar relative">
                            <AnimatePresence mode="wait">
                                {status === 'generating' ? (
                                    <motion.div 
                                        key="generating"
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        className="h-full flex flex-col items-center justify-center space-y-8 text-center"
                                    >
                                        <div className="relative">
                                            <div className="w-24 h-24 border-2 border-primary/20 rounded-full animate-ping absolute inset-0" />
                                            <div className="w-24 h-24 border-t-2 border-primary rounded-full animate-spin relative z-10" />
                                            <BrainCircuit className="w-10 h-10 text-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                                        </div>
                                        <div className="space-y-3">
                                            <p className="text-2xl font-black text-foreground tracking-tight">{t('assemblingIntelligence')}</p>
                                            <p className="text-xs text-muted-foreground font-black tracking-widest uppercase">{t('processingIdentity')}</p>
                                        </div>
                                    </motion.div>
                                ) : status === 'error' ? (
                                    <motion.div
                                        key="error"
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className="h-full flex flex-col items-center justify-center text-center space-y-4"
                                    >
                                        <div className="w-16 h-16 bg-destructive/10 text-destructive rounded-full flex items-center justify-center">
                                            <AlertTriangle className="w-8 h-8" />
                                        </div>
                                        <div className="max-w-md space-y-2">
                                            <p className="text-lg font-bold text-foreground">{t('strategyUnavailableTitle')}</p>
                                            <p className="text-sm text-muted-foreground">
                                                {errorMessage || t('strategyFailed')}
                                            </p>
                                        </div>
                                    </motion.div>
		                                ) : outputMode === 'edit' ? (
		                                    <motion.div
	                                        key="editor"
	                                        initial={{ opacity: 0, y: 10 }}
	                                        animate={{ opacity: 1, y: 0 }}
	                                        className="h-full flex flex-col gap-6"
	                                    >
	                                        {memuSources && (memuSources.personal.length > 0 || memuSources.projects.length > 0) && (
	                                            <div className="not-prose">
	                                                <details className="rounded-2xl border border-border bg-background/40 p-4">
	                                                    <summary className="cursor-pointer text-xs font-black uppercase tracking-widest text-muted-foreground">
	                                                        {language === 'ko' ? '기억 근거 보기' : 'View Memory Sources'}
	                                                    </summary>
	                                                    <div className="mt-4 space-y-4">
	                                                        {memuSources.personal.length > 0 && (
	                                                            <div className="space-y-2">
	                                                                <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">
	                                                                    {language === 'ko' ? '내 기억' : 'My Memory'}
	                                                                </p>
	                                                                <ul className="space-y-2">
	                                                                    {memuSources.personal.map((item) => (
	                                                                        <li key={item.id} className="text-sm text-muted-foreground">
	                                                                            <span className="font-mono text-xs text-muted-foreground/80">
	                                                                                {typeof item.score === 'number' ? `${item.score.toFixed(2)} · ` : ''}
	                                                                            </span>
	                                                                            {(item.summary || '').replace(/\s+/g, ' ').trim().slice(0, 180)}
	                                                                        </li>
	                                                                    ))}
	                                                                </ul>
	                                                            </div>
	                                                        )}
	                                                        {memuSources.projects.length > 0 && (
	                                                            <div className="space-y-2">
	                                                                <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">
	                                                                    {language === 'ko' ? '프로젝트 레지스트리' : 'Project Registry'}
	                                                                </p>
	                                                                <ul className="space-y-2">
	                                                                    {memuSources.projects.map((item) => (
	                                                                        <li key={item.id} className="text-sm text-muted-foreground">
	                                                                            {(item.summary || '').replace(/\s+/g, ' ').trim().slice(0, 180)}
	                                                                        </li>
	                                                                    ))}
	                                                                </ul>
	                                                            </div>
	                                                        )}
	                                                    </div>
	                                                </details>
	                                            </div>
	                                        )}

		                                        <textarea
		                                            value={solution}
		                                            onChange={(e) => setSolution(e.target.value)}
		                                            placeholder={t('strategyVaultEditorPlaceholder')}
		                                            className="flex-1 w-full min-h-[420px] p-6 bg-background/50 border border-border rounded-[2rem] text-base font-medium leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all custom-scrollbar placeholder:text-muted-foreground/30"
		                                        />
	                                    </motion.div>
	                                ) : solution ? (
	                                    <motion.div 
	                                        key="solution"
	                                        initial={{ opacity: 0, y: 20 }}
	                                        animate={{ opacity: 1, y: 0 }}
	                                        className="prose prose-slate dark:prose-invert max-w-none prose-headings:font-black prose-headings:tracking-tight prose-p:text-lg prose-p:leading-relaxed prose-strong:text-primary"
                                    >
                                        {memuSources && (memuSources.personal.length > 0 || memuSources.projects.length > 0) && (
                                            <div className="not-prose mb-6">
                                                <details className="rounded-2xl border border-border bg-background/40 p-4">
                                                    <summary className="cursor-pointer text-xs font-black uppercase tracking-widest text-muted-foreground">
                                                        {language === 'ko' ? '기억 근거 보기' : 'View Memory Sources'}
                                                    </summary>
                                                    <div className="mt-4 space-y-4">
                                                        {memuSources.personal.length > 0 && (
                                                            <div className="space-y-2">
                                                                <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                                                                    {language === 'ko' ? '내 기억' : 'My Memory'}
                                                                </p>
                                                                <ul className="space-y-2">
                                                                    {memuSources.personal.map((item) => (
                                                                        <li key={item.id} className="text-sm text-muted-foreground">
                                                                            <span className="font-mono text-xs text-muted-foreground/80">
                                                                                {typeof item.score === 'number' ? `${item.score.toFixed(2)} · ` : ''}
                                                                            </span>
                                                                            {(item.summary || '').replace(/\s+/g, ' ').trim().slice(0, 180)}
                                                                        </li>
                                                                    ))}
                                                                </ul>
                                                            </div>
                                                        )}
                                                        {memuSources.projects.length > 0 && (
                                                            <div className="space-y-2">
                                                                <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                                                                    {language === 'ko' ? '프로젝트 레지스트리' : 'Project Registry'}
                                                                </p>
                                                                <ul className="space-y-2">
                                                                    {memuSources.projects.map((item) => (
                                                                        <li key={item.id} className="text-sm text-muted-foreground">
                                                                            {(item.summary || '').replace(/\s+/g, ' ').trim().slice(0, 180)}
                                                                        </li>
                                                                    ))}
                                                                </ul>
                                                            </div>
                                                        )}
                                                    </div>
                                                </details>
                                            </div>
                                        )}
                                        <Suspense fallback={<div className="animate-pulse text-muted-foreground">{t('thinking')}</div>}>
                                            <ReactMarkdown>{solution}</ReactMarkdown>
                                        </Suspense>
                                    </motion.div>
                                ) : (
                                    <div className="h-full flex flex-col items-center justify-center text-center space-y-8">
                                        <div className="w-24 h-24 bg-secondary/20 rounded-full flex items-center justify-center relative">
                                            <Sparkles size={48} className="text-muted-foreground/30" />
                                            <div className="absolute -top-1 -right-1 w-5 h-5 bg-primary/20 rounded-full animate-pulse" />
                                        </div>
                                        <div className="max-w-xs space-y-3">
                                            <p className="text-xl font-bold text-muted-foreground">
                                                <span className="hidden lg:inline">{t('strategistEmptyStateDesktop')}</span>
                                                <span className="lg:hidden">{t('strategistEmptyStateMobile')}</span>
                                            </p>
                                            <p className="text-sm text-muted-foreground/60 leading-relaxed font-medium">
                                                {t('strategyEmptyHint')}
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </AnimatePresence>
                        </CardContent>

                        <div className="px-10 py-6 bg-secondary/5 border-t border-border flex items-center justify-between text-[10px] font-black text-muted-foreground tracking-widest uppercase">
                            <div className="flex items-center gap-6">
                                <span className="flex items-center gap-2"><Zap size={12} className="text-primary" /> {t('realTimeEvolution')}</span>
                                <span className="flex items-center gap-2"><MessageSquareQuote size={12} /> {t('verifiedLogic')}</span>
                            </div>
                            <span className="font-mono opacity-50">v{__APP_VERSION__}</span>
                        </div>
                    </Card>
                </div>
                </div>
            </div>
        </div>
    );
};
