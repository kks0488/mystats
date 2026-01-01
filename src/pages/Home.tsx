import { useState, useEffect } from 'react';
import { 
  Key, 
  BarChart3, 
  BookOpen, 
  Sparkles, 
  ChevronRight,
  ShieldCheck,
  CheckCircle2,
  Settings2,
  LayoutDashboard
} from 'lucide-react';
import { getDB } from '../db/db';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useLanguage } from '../hooks/useLanguage';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

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
    const [apiKey, setApiKey] = useState(() => {
        return localStorage.getItem('GEMINI_API_KEY') || '';
    });
    const [isSaved, setIsSaved] = useState(false);
    const [stats, setStats] = useState({ entries: 0, skills: 0, insights: 0 });

    useEffect(() => {
        const loadStats = async () => {
            const db = await getDB();
            const entries = await db.count('journal');
            const skills = await db.count('skills');
            const insights = await db.count('insights');
            setStats({ entries, skills, insights });
        };
        loadStats();
    }, []);

    const handleSaveKey = () => {
        localStorage.setItem('GEMINI_API_KEY', apiKey);
        setIsSaved(true);
        setTimeout(() => setIsSaved(false), 2000);
    };

    const toggleLanguage = () => {
        setLanguage(language === 'ko' ? 'en' : 'ko');
    };

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
                    <button 
                        onClick={toggleLanguage}
                        className="px-6 py-2.5 bg-secondary text-sm font-bold rounded-full border border-border hover:bg-muted transition-colors active:scale-95"
                    >
                        {language === 'ko' ? 'Switch to English' : '한국어로 변경'}
                    </button>
                </div>
            </header>

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

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="bg-secondary/20 border-border backdrop-blur-xl rounded-[2rem] overflow-hidden">
                    <CardHeader className="p-8 pb-4">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2 bg-primary/10 text-primary rounded-xl">
                                <Settings2 className="w-5 h-5" />
                            </div>
                            <CardTitle className="text-xl font-bold tracking-tight">{t('configuration')}</CardTitle>
                        </div>
                        <CardDescription className="font-semibold text-muted-foreground">{t('setupEnv')}</CardDescription>
                    </CardHeader>
                    <CardContent className="p-8 pt-4 space-y-6">
                        <div className="space-y-3">
                            <label className="text-xs font-black uppercase tracking-widest text-muted-foreground pl-1">
                                {t('enterApiKey')}
                            </label>
                            <div className="relative group">
                                <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground transition-colors group-hover:text-primary" />
                                <input
                                    type="password"
                                    value={apiKey}
                                    onChange={(e) => setApiKey(e.target.value)}
                                    className="w-full flex h-12 rounded-xl border border-input bg-background/50 px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 pl-11 focus:ring-primary/20"
                                    placeholder="sk-..."
                                />
                            </div>
                        </div>

                        <div className="space-y-4">
                            <Button 
                                onClick={handleSaveKey} 
                                className="w-full h-12 rounded-xl font-bold tracking-tight transition-all active:scale-[0.98]"
                            >
                                <AnimatePresence mode="wait">
                                    {isSaved ? (
                                        <motion.div key="saved" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="flex items-center gap-2">
                                            <CheckCircle2 className="w-4 h-4" />
                                            {t('saved')}
                                        </motion.div>
                                    ) : (
                                        <motion.div key="save" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="flex items-center gap-2">
                                            <ShieldCheck className="w-4 h-4" />
                                            {t('saveKey')}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </Button>
                            
                            <p className="text-xs text-center text-muted-foreground leading-relaxed px-4">
                                {t('apiKeyNote')}
                            </p>
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-primary/5 border-primary/10 backdrop-blur-xl rounded-[2rem] flex flex-col items-center justify-center p-8 text-center border-dashed border-2">
                    <div className="w-16 h-16 bg-primary/10 text-primary rounded-full flex items-center justify-center mb-6 ring-8 ring-primary/5">
                        <Sparkles className="w-8 h-8" />
                    </div>
                    <CardTitle className="text-2xl font-black tracking-tight mb-2">Ready for Strategy?</CardTitle>
                    <p className="text-muted-foreground font-medium mb-8 leading-relaxed max-w-xs">
                        Your insights and skills are being processed by our neural engine.
                    </p>
                    <a 
                        href="https://aistudio.google.com/app/apikey" 
                        target="_blank" 
                        rel="noreferrer"
                        className="text-sm font-bold text-primary hover:underline underline-offset-4 flex items-center gap-1 group"
                    >
                        {t('getApiKey')}
                        <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                    </a>
                </Card>
            </div>
        </div>
    );
};
