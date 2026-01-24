import { useState } from 'react';
import { 
  Loader2, 
  Sparkles, 
  Target, 
  Globe,
  BrainCircuit,
  MessageSquareQuote,
  Zap,
  ShieldCheck,
  AlertTriangle
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { getDB, DB_ERRORS, type Skill, type Insight } from '../db/db';
import { loadFallbackSkills, loadFallbackInsights } from '../db/fallback';
import { generateStrategy, checkAIStatus } from '../lib/ai-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useLanguage } from '../hooks/useLanguage';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { getMemuConfig, memuRetrieve, type MemuEngine } from '@/lib/memu';

export const Strategy = () => {
    const { t, language } = useLanguage();
    const [problem, setProblem] = useState('');
    const [solution, setSolution] = useState('');
    const [status, setStatus] = useState<'idle' | 'generating' | 'completed' | 'error'>('idle');
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [memuRunInfo, setMemuRunInfo] = useState<{ engine: MemuEngine; hits: number; failed: boolean } | null>(null);

    const handleGenerate = async () => {
        if (!problem.trim()) return;
        setStatus('generating');
        setSolution('');
        setErrorMessage(null);
        setMemuRunInfo(null);

        try {
            let skills: Skill[] = [];
            let insights: Insight[] = [];
            try {
                const db = await getDB();
                skills = await db.getAll('skills');
                insights = await db.getAll('insights');
            } catch (error) {
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

            let context = skills.map(s => 
                `- ${s.name} (${s.category})`
            ).join('\n');

            if (insights.length > 0) {
                const archetypes = Array.from(new Set(insights.flatMap(i => i.archetypes)));
                const patterns = Array.from(new Set(insights.flatMap(i => i.hiddenPatterns)));
                
                context += `\n\n=== DEEP INTELLIGENCE PROFILES ===\n`;
                if (archetypes.length) context += `Core Archetypes: ${archetypes.join(', ')}\n`;
                if (patterns.length) context += `Operational Patterns:\n${patterns.map(p => `- ${p}`).join('\n')}`;
            }

            const memuConfig = getMemuConfig();
            if (memuConfig.enabled && memuConfig.useInStrategy) {
                const engine = memuConfig.engine;
                let memuHits = 0;
                let memuFailed = false;

                const memuPersonal = await memuRetrieve(problem, memuConfig, { topK: 4, timeoutMs: 4000 });
                if (!memuPersonal) memuFailed = true;
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
                    const memuProjects = await memuRetrieve(problem, memuConfig, { userId: 'project-registry', topK: 3, timeoutMs: 3000 });
                    if (!memuProjects) memuFailed = true;
                    computedProjectLines = (memuProjects?.items || [])
                        .map((item) => {
                            const summary = (item.summary || '').replace(/\s+/g, ' ').trim();
                            return summary ? `- ${summary.slice(0, 240)}` : null;
                        })
                        .filter(Boolean) as string[];
                }
                memuHits += computedProjectLines.length;
                setMemuRunInfo({ engine, hits: memuHits, failed: memuFailed });

                if (personalLines.length || (computedProjectLines?.length ?? 0)) {
                    context += `\n\n=== memU CONTEXT ===\n`;
                    if (personalLines.length) {
                        context += `Personal Memory:\n${personalLines.join('\n')}\n`;
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
                    Neural Strategy Engine
                </div>
                <h1 className="text-5xl font-black tracking-tighter text-foreground">
                  {t('strategistTitle')}
                </h1>
                <p className="text-xl text-muted-foreground font-medium max-w-2xl leading-relaxed">
                  {t('strategistDesc')}
                </p>
            </header>

            <div className="grid gap-8 lg:grid-cols-12">
                {/* Input Workspace */}
                <div className="lg:col-span-5 space-y-6">
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

                    <div className="hidden md:grid grid-cols-2 gap-4">
                        <div className="p-4 bg-secondary/10 border border-border rounded-2xl flex items-center gap-3 group">
                            <div className="p-2 bg-blue-500/10 text-blue-500 rounded-lg group-hover:scale-110 transition-transform"><BrainCircuit size={16} /></div>
                            <div className="text-[9px] font-black text-muted-foreground uppercase tracking-widest leading-none">Neural<br/><span className="text-foreground text-[10px] font-bold">Sync</span></div>
                        </div>
                        <div className="p-4 bg-secondary/10 border border-border rounded-2xl flex items-center gap-3 group">
                            <div className="p-2 bg-emerald-500/10 text-emerald-500 rounded-lg group-hover:scale-110 transition-transform"><ShieldCheck size={16} /></div>
                            <div className="text-[9px] font-black text-muted-foreground uppercase tracking-widest leading-none">Intel<br/><span className="text-foreground text-[10px] font-bold">Verified</span></div>
                        </div>
                    </div>
                </div>

                {/* Output Workspace */}
                <div className="lg:col-span-7">
                    <Card className="h-full min-h-[600px] flex flex-col bg-secondary/10 border-border backdrop-blur-3xl rounded-[3rem] overflow-hidden shadow-2xl relative">
                        <CardHeader className="p-10 border-b border-border bg-secondary/5 flex flex-row items-center justify-between">
                             <div className="flex items-center gap-4">
                                <div className="p-3 bg-amber-500/10 text-amber-500 rounded-2xl ring-1 ring-amber-500/20">
                                    <Sparkles className="w-6 h-6" />
                                </div>
                                <CardTitle className="text-2xl font-black tracking-tight">Strategy Output</CardTitle>
                             </div>
                             <div className="flex items-center gap-2">
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
                                        Optimized
                                    </Badge>
                                )}
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
                                            <p className="text-2xl font-black text-foreground tracking-tight">Assembling Intelligence...</p>
                                            <p className="text-xs text-muted-foreground font-black tracking-widest uppercase">Processing identity markers & patterns</p>
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
                                ) : solution ? (
                                    <motion.div 
                                        key="solution"
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className="prose prose-slate dark:prose-invert max-w-none prose-headings:font-black prose-headings:tracking-tight prose-p:text-lg prose-p:leading-relaxed prose-strong:text-primary"
                                    >
                                        <ReactMarkdown>{solution}</ReactMarkdown>
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
                                                Provide a core challenge to begin strategic alignment with your unique capability profile.
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </AnimatePresence>
                        </CardContent>

                        <div className="px-10 py-6 bg-secondary/5 border-t border-border flex items-center justify-between text-[10px] font-black text-muted-foreground tracking-widest uppercase">
                            <div className="flex items-center gap-6">
                                <span className="flex items-center gap-2"><Zap size={12} className="text-primary" /> Real-time Evolution</span>
                                <span className="flex items-center gap-2"><MessageSquareQuote size={12} /> Verified Logic</span>
                            </div>
                            <span className="font-mono opacity-50">v1.1.0</span>
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    );
};
