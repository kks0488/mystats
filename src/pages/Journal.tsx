import { useState, useEffect, useCallback } from 'react';
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
import { getDB, upsertSkill, type Skill, type Insight, type JournalEntry } from '../db/db';
import { analyzeEntryWithAI } from '../lib/gemini';
import { generateId } from '../lib/utils';
import { Button } from '@/components/ui/button';
import { useLanguage } from '../hooks/useLanguage';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

export const Journal = () => {
    const { t, language } = useLanguage();
    const [content, setContent] = useState('');
    const [status, setStatus] = useState<'idle' | 'saving' | 'processing' | 'saved' | 'error'>('idle');
    const [lastInsight, setLastInsight] = useState<Partial<Insight> | null>(null);
    const [history, setHistory] = useState<JournalEntry[]>([]);
    const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);

    const loadHistory = useCallback(async () => {
        const db = await getDB();
        const allEntries = await db.getAllFromIndex('journal', 'by-date');
        setHistory(allEntries.reverse());
    }, []);

    useEffect(() => {
        loadHistory();
    }, [loadHistory]);

    const handleSave = async () => {
        if (!content.trim()) return;
        setStatus('saving');
        
        try {
            const db = await getDB();
            const entryId = generateId();
            const timestamp = Date.now();

            await db.put('journal', {
                id: entryId,
                content,
                timestamp,
                type: 'journal',
                lastModified: timestamp
            });

            const apiKey = localStorage.getItem('GEMINI_API_KEY');
            if (apiKey) {
                setStatus('processing');
                try {
                    const result = await analyzeEntryWithAI(content, language);
                    
                    if (result.insight) {
                        const insightData: Insight = {
                            id: generateId(),
                            entryId: entryId,
                            ...result.insight,
                            timestamp: timestamp,
                            lastModified: timestamp
                        };
                        await db.put('insights', insightData);
                        setLastInsight(insightData);
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
                                await upsertSkill({
                                    name: item.name,
                                    category: (group.defaultCategory || item.category) as Skill['category']
                                }, entryId);
                            }
                        }
                    }
                } catch (err) {
                    console.error("AI Analysis failed", err);
                }
            }

            setStatus('saved');
            setContent('');
            loadHistory();
            setTimeout(() => {
              setStatus('idle');
              setLastInsight(null);
            }, 5000);

        } catch (error) {
            console.error('Failed to save', error);
            setStatus('error');
        }
    };

    return (
        <div className="max-w-6xl mx-auto space-y-12 pb-20">
            <header className="space-y-4">
                <div className="flex items-center gap-2 text-primary font-mono text-xs font-bold uppercase tracking-[0.3em]">
                    <BookOpen className="w-4 h-4" />
                    Neural Memory Bridge
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
                    <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
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
                                        "w-full p-4 rounded-2xl text-left transition-all group relative overflow-hidden",
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
                        <div className="flex items-center justify-between px-8 py-4 border-b border-border bg-secondary/20">
                            <div className="flex items-center gap-4 text-xs font-black uppercase tracking-widest text-muted-foreground">
                                <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    onClick={() => {
                                        setSelectedEntryId(null);
                                        setContent('');
                                    }}
                                    className="h-7 px-3 rounded-lg hover:bg-primary/10 text-primary border border-primary/20"
                                >
                                    + NEW RECORD
                                </Button>
                                <span className="flex items-center gap-1.5 border-r border-border pr-4 pl-2">
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
                                    status === 'processing' ? "bg-amber-500 animate-pulse" : 
                                    status === 'saving' ? "bg-blue-500 animate-pulse" : 
                                    "bg-emerald-500"
                                )} />
                                <span className="text-[10px] font-bold uppercase tracking-tighter text-muted-foreground">
                                    {status === 'idle' ? 'System Ready' : status.toUpperCase()}
                                </span>
                            </div>
                        </div>

                        <textarea
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            placeholder={t('journalPlaceholder')}
                            disabled={status === 'saving' || status === 'processing'}
                            className="w-full min-h-[500px] p-10 bg-transparent resize-none focus:outline-none text-xl font-medium leading-relaxed placeholder:text-muted-foreground/30 custom-scrollbar"
                        />

                        <div className="p-6 flex items-center justify-end bg-secondary/10 border-t border-border">
                            <Button
                                onClick={handleSave}
                                disabled={!content.trim() || status === 'saving' || status === 'processing'}
                                className={cn(
                                    "h-14 px-10 rounded-2xl font-black tracking-tight transition-all active:scale-95 group",
                                    status === 'saved' ? "bg-emerald-500 hover:bg-emerald-600" : "bg-primary hover:bg-primary/90"
                                )}
                            >
                                <AnimatePresence mode="wait">
                                    {status === 'saving' || status === 'processing' ? (
                                        <motion.div key="loading" initial={{opacity:0}} animate={{opacity:1}} className="flex items-center gap-3">
                                            <Loader2 className="w-5 h-5 animate-spin" />
                                            <span>{status === 'processing' ? t('analyzing') : 'SAVING...'}</span>
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
                    <p className="font-bold tracking-tight">An error occurred while saving your entry. Please try again.</p>
                </div>
            )}
        </div>
    );
};
