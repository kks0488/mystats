import { useState, useEffect, useCallback } from 'react';
import {
  BarChart3,
  BookOpen,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  LayoutDashboard,
  Circle,
  ChevronRight,
} from 'lucide-react';
import { getDB } from '../db/db';
import { checkAIStatus } from '../lib/ai-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useLanguage } from '../hooks/useLanguage';
import { cn } from '@/lib/utils';
import { loadFallbackJournalEntries, loadFallbackSkills, loadFallbackInsights, getFallbackStorageMode } from '../db/fallback';
import { Link } from 'react-router-dom';
import type { JournalEntry, Insight } from '../db/db';

interface StatWidgetProps {
    title: string;
    value: number;
    icon: React.ElementType;
    color: string;
}

const StatWidget = ({ title, value, icon: Icon, color }: StatWidgetProps) => (
    <Card className="bg-secondary/40 border-border backdrop-blur-xl rounded-[2rem] overflow-hidden group hover:bg-secondary/60 transition-colors duration-300">
        <CardContent className="p-8">
            <div className="flex items-center justify-between mb-4">
                <div className={cn("p-3 rounded-2xl", color)}>
                    <Icon className="w-6 h-6" />
                </div>
            </div>
            <div className="space-y-1">
                <p className="text-3xl font-black tracking-tighter">{value}</p>
                <p className="text-sm font-semibold text-muted-foreground tracking-tight">{title}</p>
            </div>
        </CardContent>
    </Card>
);

export const Home = () => {
    const { t, language, setLanguage } = useLanguage();
    const [stats, setStats] = useState({ entries: 0, skills: 0, insights: 0 });
    const [aiConfigured, setAiConfigured] = useState(false);
    const [storageMode, setStorageMode] = useState<'db' | 'fallback' | 'memory'>('db');
    const [recentEntries, setRecentEntries] = useState<JournalEntry[]>([]);
    const [latestInsight, setLatestInsight] = useState<Insight | null>(null);

    const loadDashboard = useCallback(async () => {
        const status = checkAIStatus();
        setAiConfigured(status.configured);
        try {
            const db = await getDB();
            const entries = await db.getAllFromIndex('journal', 'by-date');
            const skills = await db.getAll('skills');
            const insights = await db.getAll('insights');
            setStats({ entries: entries.length, skills: skills.length, insights: insights.length });
            setRecentEntries(entries.slice(-3).reverse());
            const latest = [...insights].sort((a, b) => b.timestamp - a.timestamp)[0];
            setLatestInsight(latest || null);
            setStorageMode('db');
        } catch (error) {
            console.warn('Failed to load stats', error);
            const fallbackEntries = loadFallbackJournalEntries();
            const fallbackSkills = loadFallbackSkills();
            const fallbackInsights = loadFallbackInsights();
            setStats({
                entries: fallbackEntries.length,
                skills: fallbackSkills.length,
                insights: fallbackInsights.length,
            });
            setRecentEntries(fallbackEntries.slice(0, 3));
            setLatestInsight(fallbackInsights[0] || null);
            setStorageMode(getFallbackStorageMode() === 'memory' ? 'memory' : 'fallback');
        }
    }, []);

    useEffect(() => {
        loadDashboard();
    }, [loadDashboard]);

    useEffect(() => {
        const handleUpdate = () => {
            loadDashboard();
        };
        window.addEventListener('mystats-data-updated', handleUpdate);
        return () => window.removeEventListener('mystats-data-updated', handleUpdate);
    }, [loadDashboard]);
    const quickSteps = [
        {
            key: 'api',
            label: t('quickStartApi'),
            done: aiConfigured,
        },
        {
            key: 'entry',
            label: t('quickStartEntry'),
            done: stats.entries > 0,
        },
        {
            key: 'profile',
            label: t('quickStartProfile'),
            done: stats.skills > 0 || stats.insights > 0,
        },
    ];
    const completedSteps = quickSteps.filter(step => step.done).length;
    const storageLabel =
        storageMode === 'db'
            ? t('storageModeDb')
            : storageMode === 'memory'
                ? t('storageModeMemory')
                : t('storageModeFallback');


    return (
        <div className="max-w-6xl mx-auto space-y-12 pb-20">
            <header className="space-y-4">
                <div className="flex items-center gap-2 text-primary font-mono text-xs font-bold uppercase tracking-[0.3em]">
                    <LayoutDashboard className="w-4 h-4" />
                    Neural Command Center
                </div>
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                    <div className="space-y-2">
                        <h1 className="text-5xl font-black tracking-tighter">{t('dashboardTitle')}</h1>
                        <p className="text-xl text-muted-foreground font-medium max-w-xl leading-relaxed">
                            {t('dashboardDesc')}
                        </p>
                    </div>
                </div>
            </header>

            {(!aiConfigured || storageMode !== 'db') && (
                <div className="flex flex-wrap items-center gap-3">
                    {!aiConfigured && (
                        <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold uppercase tracking-widest border border-amber-500/30 text-amber-500 bg-amber-500/10">
                            {t('aiStatusMissing')}
                        </span>
                    )}
                    {storageMode !== 'db' && (
                        <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold uppercase tracking-widest border border-amber-500/30 text-amber-500 bg-amber-500/10">
                            {t('storageModeLabel')}: {storageLabel}
                        </span>
                    )}
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <StatWidget 
                    title={t('totalEntries')} 
                    value={stats.entries} 
                    icon={BookOpen} 
                    color="bg-blue-500/10 text-blue-500"
                />
                <StatWidget 
                    title={t('skillsTraits')} 
                    value={stats.skills} 
                    icon={BarChart3} 
                    color="bg-emerald-500/10 text-emerald-500"
                />
                <StatWidget 
                    title={t('aiInsights')} 
                    value={stats.insights} 
                    icon={Sparkles} 
                    color="bg-amber-500/10 text-amber-500"
                />
            </div>

            {completedSteps < quickSteps.length && (
                <Card className="bg-primary/5 border-primary/10 backdrop-blur-xl rounded-[2rem] overflow-hidden">
                    <CardHeader className="p-8 pb-4">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2 bg-primary/10 text-primary rounded-xl">
                                <ShieldCheck className="w-5 h-5" />
                            </div>
                            <div>
                                <CardTitle className="text-xl font-black tracking-tight">{t('quickStartTitle')}</CardTitle>
                                <CardDescription className="text-muted-foreground font-semibold">
                                    {t('quickStartDesc')}
                                </CardDescription>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="p-8 pt-2 space-y-6">
                        <div className="space-y-3">
                            {quickSteps.map(step => (
                                <div key={step.key} className="flex items-center gap-3">
                                    {step.done ? (
                                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                                    ) : (
                                        <Circle className="w-4 h-4 text-muted-foreground/50" />
                                    )}
                                    <span className={cn("text-sm font-semibold", step.done ? "text-foreground" : "text-muted-foreground")}>
                                        {step.label}
                                    </span>
                                </div>
                            ))}
                        </div>
                        <div className="flex items-center justify-between text-xs font-black uppercase tracking-widest text-muted-foreground">
                            <span>{t('quickStartProgress')}</span>
                            <span>{completedSteps}/3</span>
                        </div>
                        <div className="flex flex-wrap gap-3">
                            <Button asChild className="h-10 px-4 rounded-xl font-bold">
                                <Link to="/journal">{t('quickStartGoJournal')}</Link>
                            </Button>
                            <Button asChild variant="outline" className="h-10 px-4 rounded-xl font-bold">
                                <Link to="/profile">{t('quickStartGoProfile')}</Link>
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="bg-secondary/20 border-border backdrop-blur-xl rounded-[2rem] overflow-hidden">
                    <CardHeader className="p-8 pb-4">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2 bg-blue-500/10 text-blue-500 rounded-xl">
                                <BookOpen className="w-5 h-5" />
                            </div>
                            <div>
                                <CardTitle className="text-xl font-black tracking-tight">{t('recentJournalTitle')}</CardTitle>
                                <CardDescription className="text-muted-foreground font-semibold">
                                    {t('recentJournalDesc')}
                                </CardDescription>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="p-8 pt-2 space-y-4">
                        {recentEntries.length === 0 ? (
                            <p className="text-sm text-muted-foreground">{t('recentJournalEmpty')}</p>
                        ) : (
                            <div className="space-y-3">
                                {recentEntries.map(entry => (
                                    <div key={entry.id} className="p-4 bg-background/40 rounded-2xl border border-border">
                                        <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">
                                            {new Date(entry.timestamp).toLocaleDateString()}
                                        </div>
                                        <p className="text-sm font-semibold line-clamp-2">{entry.content}</p>
                                    </div>
                                ))}
                            </div>
                        )}
                        <Button asChild className="h-10 px-4 rounded-xl font-bold">
                            <Link to="/journal" className="inline-flex items-center gap-2">
                                {t('openJournal')}
                                <ChevronRight className="w-4 h-4" />
                            </Link>
                        </Button>
                    </CardContent>
                </Card>

                <Card className="bg-secondary/20 border-border backdrop-blur-xl rounded-[2rem] overflow-hidden">
                    <CardHeader className="p-8 pb-4">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2 bg-amber-500/10 text-amber-500 rounded-xl">
                                <Sparkles className="w-5 h-5" />
                            </div>
                            <div>
                                <CardTitle className="text-xl font-black tracking-tight">{t('latestInsightTitle')}</CardTitle>
                                <CardDescription className="text-muted-foreground font-semibold">
                                    {t('latestInsightDesc')}
                                </CardDescription>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="p-8 pt-2 space-y-4">
                        {latestInsight ? (
                            <div className="space-y-4">
                                <div className="text-lg font-black tracking-tight">
                                    {latestInsight.archetypes?.[0] || t('latestInsightTitle')}
                                </div>
                                {latestInsight.hiddenPatterns?.[0] && (
                                    <p className="text-sm text-muted-foreground line-clamp-3">
                                        {latestInsight.hiddenPatterns[0]}
                                    </p>
                                )}
                                {latestInsight.criticalQuestions?.[0] && (
                                    <p className="text-sm font-semibold italic text-foreground/80 line-clamp-2">
                                        "{latestInsight.criticalQuestions[0]}"
                                    </p>
                                )}
                            </div>
                        ) : (
                            <p className="text-sm text-muted-foreground">{t('latestInsightEmpty')}</p>
                        )}
                        <Button asChild variant="outline" className="h-10 px-4 rounded-xl font-bold">
                            <Link to="/profile" className="inline-flex items-center gap-2">
                                {t('openProfile')}
                                <ChevronRight className="w-4 h-4" />
                            </Link>
                        </Button>
                    </CardContent>
                </Card>
            </div>

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 px-6 py-5 bg-secondary/20 border border-border rounded-[2rem]">
                <div className="text-xs font-black uppercase tracking-[0.3em] text-muted-foreground">
                    {t('language')}
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => setLanguage('en')}
                        aria-pressed={language === 'en'}
                        className={cn(
                            "h-10 px-4 rounded-full text-sm font-bold border transition-colors active:scale-95",
                            language === 'en'
                                ? "bg-primary text-primary-foreground border-primary/40"
                                : "bg-background/60 text-muted-foreground border-border hover:bg-muted"
                        )}
                    >
                        EN
                    </button>
                    <button
                        type="button"
                        onClick={() => setLanguage('ko')}
                        aria-pressed={language === 'ko'}
                        className={cn(
                            "h-10 px-4 rounded-full text-sm font-bold border transition-colors active:scale-95",
                            language === 'ko'
                                ? "bg-primary text-primary-foreground border-primary/40"
                                : "bg-background/60 text-muted-foreground border-border hover:bg-muted"
                        )}
                    >
                        KO
                    </button>
                </div>
            </div>
        </div>
    );
};
