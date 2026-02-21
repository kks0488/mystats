import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, ChevronDown, Cpu, Key, ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/hooks/useLanguage';
import { cn } from '@/lib/utils';
import {
  AI_PROVIDERS,
  getAIConfig,
  getProviderConfig,
  setAIConfig,
  type AIProvider,
} from '@/lib/ai-provider';

const API_KEY_LINKS: Record<AIProvider, string> = {
  openai: 'https://platform.openai.com/api-keys',
  gemini: 'https://aistudio.google.com/app/apikey',
  claude: 'https://console.anthropic.com/settings/keys',
  grok: 'https://console.x.ai/',
};

export function AISettingsCard() {
  const { t } = useLanguage();
  const [provider, setProvider] = useState<AIProvider>('openai');
  const [apiKey, setApiKey] = useState('');
  const [selectedModel, setSelectedModel] = useState('');
  const [isSaved, setIsSaved] = useState(false);
  const [showProviderDropdown, setShowProviderDropdown] = useState(false);
  const [showModelDropdown, setShowModelDropdown] = useState(false);

  const providerInfo = AI_PROVIDERS[provider];
  const apiKeyLink = API_KEY_LINKS[provider];

  useEffect(() => {
    const config = getAIConfig();
    setProvider(config.provider);
    setApiKey(config.apiKey);
    setSelectedModel(config.model || AI_PROVIDERS[config.provider].defaultModel);
  }, []);

  const handleProviderChange = (newProvider: AIProvider) => {
    const config = getProviderConfig(newProvider);
    setProvider(newProvider);
    setSelectedModel(config.model || AI_PROVIDERS[newProvider].defaultModel);
    setApiKey(config.apiKey);
    setShowProviderDropdown(false);
  };

  const handleSaveKey = () => {
    setAIConfig({
      provider,
      apiKey,
      model: selectedModel,
    });
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  return (
    <Card className="bg-secondary/20 border-border backdrop-blur-xl rounded-[2rem] overflow-hidden">
      <CardHeader className="p-8 pb-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-primary/10 text-primary rounded-xl">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <CardTitle className="text-xl font-bold tracking-tight">{t('configuration')}</CardTitle>
        </div>
        <CardDescription className="font-semibold text-muted-foreground">{t('setupEnv')}</CardDescription>
      </CardHeader>
      <CardContent className="p-8 pt-4 space-y-6">
        <div className="space-y-3">
          <label
            htmlFor="ai-provider-select"
            className="text-xs font-black uppercase tracking-widest text-muted-foreground pl-1"
          >
            AI Provider
          </label>
          <div className="relative">
            <button
              id="ai-provider-select"
              onClick={() => setShowProviderDropdown(!showProviderDropdown)}
              aria-haspopup="listbox"
              aria-expanded={showProviderDropdown}
              className="w-full flex items-center justify-between h-12 rounded-xl border border-input bg-background/50 px-4 text-sm font-medium hover:bg-background/80 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Cpu className="w-4 h-4 text-primary" />
                <span>{providerInfo.name}</span>
              </div>
              <ChevronDown
                className={cn(
                  'w-4 h-4 text-muted-foreground transition-transform',
                  showProviderDropdown && 'rotate-180'
                )}
              />
            </button>
            <AnimatePresence>
              {showProviderDropdown && (
                <motion.div
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  transition={{ duration: 0.1 }}
                  role="listbox"
                  className="absolute z-10 w-full mt-2 bg-background border border-border rounded-xl shadow-xl overflow-hidden"
                >
                  {(Object.keys(AI_PROVIDERS) as AIProvider[]).map((p) => (
                    <button
                      key={p}
                      role="option"
                      aria-selected={p === provider}
                      onClick={() => handleProviderChange(p)}
                      className={cn(
                        'w-full flex items-center gap-3 px-4 py-3 text-sm font-medium hover:bg-secondary transition-colors text-left',
                        p === provider && 'bg-primary/10 text-primary'
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

        <div className="space-y-3">
          <label
            htmlFor="ai-model-select"
            className="text-xs font-black uppercase tracking-widest text-muted-foreground pl-1"
          >
            Model
          </label>
          <div className="relative">
            <button
              id="ai-model-select"
              onClick={() => setShowModelDropdown(!showModelDropdown)}
              aria-haspopup="listbox"
              aria-expanded={showModelDropdown}
              className="w-full flex items-center justify-between h-12 rounded-xl border border-input bg-background/50 px-4 text-sm font-medium hover:bg-background/80 transition-colors"
            >
              <span className="font-mono text-xs">{selectedModel}</span>
              <ChevronDown
                className={cn(
                  'w-4 h-4 text-muted-foreground transition-transform',
                  showModelDropdown && 'rotate-180'
                )}
              />
            </button>
            <AnimatePresence>
              {showModelDropdown && (
                <motion.div
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  transition={{ duration: 0.1 }}
                  role="listbox"
                  className="absolute z-10 w-full mt-2 bg-background border border-border rounded-xl shadow-xl overflow-hidden max-h-48 overflow-y-auto"
                >
                  {providerInfo.models.map((m) => (
                    <button
                      key={m}
                      role="option"
                      aria-selected={m === selectedModel}
                      onClick={() => {
                        setSelectedModel(m);
                        setShowModelDropdown(false);
                      }}
                      className={cn(
                        'w-full px-4 py-3 text-sm font-mono hover:bg-secondary transition-colors text-left',
                        m === selectedModel && 'bg-primary/10 text-primary'
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

        <div className="space-y-3">
          <label
            htmlFor="api-key-input"
            className="text-xs font-black uppercase tracking-widest text-muted-foreground pl-1"
          >
            {providerInfo.name} API Key
          </label>
          <div className="relative group">
            <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground transition-colors group-hover:text-primary" />
            <input
              id="api-key-input"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="w-full flex h-12 rounded-xl border border-input bg-background/50 px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 pl-11 focus:ring-primary/20"
              placeholder={
                provider === 'openai' ? 'sk-...' : provider === 'gemini' ? 'AIza...' : 'Enter API key...'
              }
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
                <motion.div
                  key="saved"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {t('saved')}
                </motion.div>
              ) : (
                <motion.div
                  key="save"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-2"
                >
                  <ShieldCheck className="w-4 h-4" />
                  {t('saveKey')}
                </motion.div>
              )}
            </AnimatePresence>
          </Button>
          <div className="space-y-2 text-center">
            <p className="text-xs text-muted-foreground leading-relaxed px-4">{t('apiKeyNote')}</p>
            <a
              href={apiKeyLink}
              target="_blank"
              rel="noreferrer"
              className="text-xs font-bold text-primary hover:underline underline-offset-4"
            >
              {t('getApiKey')}
            </a>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

