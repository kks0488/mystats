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
  LayoutDashboard,
  Cpu,
  ChevronDown
} from 'lucide-react';
import { getDB } from '../db/db';
import { 
  getAIConfig, 
  setAIConfig, 
  AI_PROVIDERS, 
  type AIProvider 
} from '../lib/ai-provider';
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
    const [provider, setProvider] = useState<AIProvider>('gemini');
    const [apiKey, setApiKey] = useState('');
    const [selectedModel, setSelectedModel] = useState('');
    const [isSaved, setIsSaved] = useState(false);
    const [stats, setStats] = useState({ entries: 0, skills: 0, insights: 0 });
    const [showProviderDropdown, setShowProviderDropdown] = useState(false);
    const [showModelDropdown, setShowModelDropdown] = useState(false);

    useEffect(() => {
        const config = getAIConfig();
        setProvider(config.provider);
        setApiKey(config.apiKey);
        setSelectedModel(config.model || AI_PROVIDERS[config.provider].defaultModel);

        const loadStats = async () => {
            const db = await getDB();
            const entries = await db.count('journal');
            const skills = await db.count('skills');
            const insights = await db.count('insights');
            setStats({ entries, skills, insights });
        };
        loadStats();
    }, []);

    const handleProviderChange = (newProvider: AIProvider) => {
        setProvider(newProvider);
        setSelectedModel(AI_PROVIDERS[newProvider].defaultModel);
        // Load saved API key for this provider
        const savedKey = localStorage.getItem(`${newProvider.toUpperCase()}_API_KEY`) || '';
        setApiKey(savedKey);
        setShowProviderDropdown(false);
    };

    const handleSaveKey = () => {
        setAIConfig({ 
            provider, 
            apiKey, 
            model: selectedModel 
        });
        setIsSaved(true);
        setTimeout(() => setIsSaved(false), 2000);
    };

    const toggleLanguage = () => {
        setLanguage(language === 'ko' ? 'en' : 'ko');
    };

    const providerInfo = AI_PROVIDERS[provider];

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
                        {/* Provider Selector */}
                        <div className="space-y-3">
                            <label className="text-xs font-black uppercase tracking-widest text-muted-foreground pl-1">
                                AI Provider
                            </label>
                            <div className="relative">
                                <button
                                    onClick={() => setShowProviderDropdown(!showProviderDropdown)}
                                    className="w-full flex items-center justify-between h-12 rounded-xl border border-input bg-background/50 px-4 text-sm font-medium hover:bg-background/80 transition-colors"
                                >
                                    <div className="flex items-center gap-3">
                                        <Cpu className="w-4 h-4 text-primary" />
                                        <span>{providerInfo.name}</span>
                                    </div>
                                    <ChevronDown className={cn(
                                        "w-4 h-4 text-muted-foreground transition-transform",
                                        showProviderDropdown && "rotate-180"
                                    )} />
                                </button>
                                <AnimatePresence>
                                    {showProviderDropdown && (
                                        <motion.div
                                            initial={{ opacity: 0, y: -5 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: -5 }}
                                            transition={{ duration: 0.1 }}
                                            className="absolute z-10 w-full mt-2 bg-background border border-border rounded-xl shadow-xl overflow-hidden"
                                        >
                                            {(Object.keys(AI_PROVIDERS) as AIProvider[]).map((p) => (
                                                <button
                                                    key={p}
                                                    onClick={() => handleProviderChange(p)}
                                                    className={cn(
                                                        "w-full flex items-center gap-3 px-4 py-3 text-sm font-medium hover:bg-secondary transition-colors text-left",
                                                        p === provider && "bg-primary/10 text-primary"
                                                    )}
                                                >
                                                    <Cpu className="w-4 h-4" />
                                                    {AI_PROVIDERS[p].name}
                                                </button>
                                            ))}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        </div>

                        {/* Model Selector */}
                        <div className="space-y-3">
                            <label className="text-xs font-black uppercase tracking-widest text-muted-foreground pl-1">
                                Model
                            </label>
                            <div className="relative">
                                <button
                                    onClick={() => setShowModelDropdown(!showModelDropdown)}
                                    className="w-full flex items-center justify-between h-12 rounded-xl border border-input bg-background/50 px-4 text-sm font-medium hover:bg-background/80 transition-colors"
                                >
                                    <span className="font-mono text-xs">{selectedModel}</span>
                                    <ChevronDown className={cn(
                                        "w-4 h-4 text-muted-foreground transition-transform",
                                        showModelDropdown && "rotate-180"
                                    )} />
                                </button>
                                <AnimatePresence>
                                    {showModelDropdown && (
                                        <motion.div
                                            initial={{ opacity: 0, y: -5 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: -5 }}
                                            transition={{ duration: 0.1 }}
                                            className="absolute z-10 w-full mt-2 bg-background border border-border rounded-xl shadow-xl overflow-hidden max-h-48 overflow-y-auto"
                                        >
                                            {providerInfo.models.map((m) => (
                                                <button
                                                    key={m}
                                                    onClick={() => {
                                                        setSelectedModel(m);
                                                        setShowModelDropdown(false);
                                                    }}
                                                    className={cn(
                                                        "w-full px-4 py-3 text-sm font-mono hover:bg-secondary transition-colors text-left",
                                                        m === selectedModel && "bg-primary/10 text-primary"
                                                    )}
                                                >
                                                    {m}
                                                </button>
                                            ))}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        </div>

                        {/* API Key Input */}
                        <div className="space-y-3">
                            <label className="text-xs font-black uppercase tracking-widest text-muted-foreground pl-1">
                                {providerInfo.name} API Key
                            </label>
                            <div className="relative group">
                                <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground transition-colors group-hover:text-primary" />
                                <input
                                    type="password"
                                    value={apiKey}
                                    onChange={(e) => setApiKey(e.target.value)}
                                    className="w-full flex h-12 rounded-xl border border-input bg-background/50 px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 pl-11 focus:ring-primary/20"
                                    placeholder={provider === 'gemini' ? 'AIza...' : provider === 'openai' ? 'sk-...' : 'Enter API key...'}
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
                    <CardTitle className="text-2xl font-black tracking-tight mb-2">Multi-AI Support</CardTitle>
                    <p className="text-muted-foreground font-medium mb-6 leading-relaxed max-w-xs">
                        Choose your preferred AI: Gemini, OpenAI, Claude, or Grok.
                    </p>
                    <div className="flex flex-wrap gap-2 justify-center mb-6">
                        {(Object.keys(AI_PROVIDERS) as AIProvider[]).map((p) => (
                            <button
                                key={p}
                                onClick={() => handleProviderChange(p)}
                                className={cn(
                                    "px-3 py-1 rounded-full text-xs font-bold cursor-pointer transition-all hover:scale-105 active:scale-95",
                                    p === provider 
                                        ? "bg-primary text-primary-foreground" 
                                        : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                                )}
                            >
                                {AI_PROVIDERS[p].name.split(' ')[0]}
                            </button>
                        ))}
                    </div>
                    <a 
                        href={provider === 'gemini' ? 'https://aistudio.google.com/app/apikey' 
                            : provider === 'openai' ? 'https://platform.openai.com/api-keys'
                            : provider === 'claude' ? 'https://console.anthropic.com/settings/keys'
                            : 'https://console.x.ai/'} 
                        target="_blank" 
                        rel="noreferrer"
                        className="text-sm font-bold text-primary hover:underline underline-offset-4 flex items-center gap-1 group"
                    >
                        Get {providerInfo.name} API Key
                        <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                    </a>
                </Card>
            </div>
        </div>
    );
};
