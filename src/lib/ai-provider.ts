/**
 * Multi AI Provider Support
 * Supports: Gemini, OpenAI, Claude, Grok
 */

import { z } from 'zod';

// --- Types ---

export type AIProvider = 'openai' | 'gemini' | 'claude' | 'grok';

export interface AIConfig {
  provider: AIProvider;
  apiKey: string;
  model?: string;
}

export const AI_PROVIDERS: Record<AIProvider, { name: string; models: string[]; defaultModel: string; apiUrl: string }> = {
  openai: {
    name: 'OpenAI',
    models: ['gpt-5.2', 'gpt-5.1', 'gpt-5', 'gpt-5-mini', 'gpt-4.1', 'o4-mini', 'gpt-4o'],
    defaultModel: 'gpt-4o',
    apiUrl: 'https://api.openai.com/v1',
  },
  gemini: {
    name: 'Google Gemini',
    models: ['gemini-3.1-pro-preview', 'gemini-3-flash-preview', 'gemini-3-pro-preview', 'gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'],
    defaultModel: 'gemini-2.5-flash',
    apiUrl: 'https://generativelanguage.googleapis.com/v1beta',
  },
  claude: {
    name: 'Anthropic Claude',
    models: ['claude-sonnet-4-5-20250514', 'claude-haiku-4-5-20251001', 'claude-sonnet-4-20250514'],
    defaultModel: 'claude-sonnet-4-5-20250514',
    apiUrl: 'https://api.anthropic.com/v1',
  },
  grok: {
    name: 'xAI Grok',
    models: ['grok-4-1-fast-reasoning', 'grok-4', 'grok-4-fast-reasoning', 'grok-3'],
    defaultModel: 'grok-4-1-fast-reasoning',
    apiUrl: 'https://api.x.ai/v1',
  },
};

// --- Storage ---

const STORAGE_KEYS = {
  provider: 'AI_PROVIDER',
  apiKey: (provider: AIProvider) => `${provider.toUpperCase()}_API_KEY`,
  model: (provider: AIProvider) => `${provider.toUpperCase()}_MODEL`,
};

function safeLocalStorageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeLocalStorageSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

export const getProviderConfig = (provider: AIProvider): AIConfig => {
  let apiKey = '';
  let model = AI_PROVIDERS[provider].defaultModel;
  apiKey =
    safeLocalStorageGet(STORAGE_KEYS.apiKey(provider)) ||
    (provider === 'gemini' ? safeLocalStorageGet('GEMINI_API_KEY') : '') ||
    '';
  model = safeLocalStorageGet(STORAGE_KEYS.model(provider)) || model;

  return { provider, apiKey, model };
};

export const getAIConfig = (): AIConfig => {
  const provider = (safeLocalStorageGet(STORAGE_KEYS.provider) as AIProvider) || 'openai';
  return getProviderConfig(provider);
};

export const setAIConfig = (config: Partial<AIConfig>) => {
  if (config.provider) {
    safeLocalStorageSet(STORAGE_KEYS.provider, config.provider);
  }
  
  const provider = config.provider || getAIConfig().provider;
  
  if (config.apiKey !== undefined) {
    safeLocalStorageSet(STORAGE_KEYS.apiKey(provider), config.apiKey);
    // Backward compatibility for Gemini
    if (provider === 'gemini') {
      safeLocalStorageSet('GEMINI_API_KEY', config.apiKey);
    }
  }
  
  if (config.model) {
    safeLocalStorageSet(STORAGE_KEYS.model(provider), config.model);
  }
};

// --- Prompts ---

const buildAnalysisPrompt = (language: 'en' | 'ko') => {
  const languageDirective =
    language === 'ko'
      ? 'Respond in KOREAN.'
      : 'Respond in ENGLISH only. Do NOT include Korean.';
  const insightRequirement =
    language === 'ko'
      ? `**Language Requirement**:
ALL output must be in Korean only. Do NOT include English translations in parentheses.`
      : `**Language Requirement**:
All output must be English only. Do NOT include Korean.`;
  const archetypeFormat =
    language === 'ko'
      ? "String (한국어로만 작성)"
      : 'String (English only)';
  const patternFormat =
    language === 'ko'
      ? "String (한국어로만 작성)"
      : 'String (English only)';
	const questionFormat =
	  language === 'ko'
	    ? "String (한국어로만 작성)"
	    : 'String (English only)';
	const evidenceFormat =
	  language === 'ko'
	    ? "String (Direct quote from the input text; keep the original language)"
	    : 'String (Direct quote from the input text)';

  return `
You are an Existential Strategist and Meta-Cognitive Profiler.
Your task is to decode the "Meta-Strategy" of the user's soul and operational theory.
Do NOT describe actions. UNMASK intent.

${insightRequirement}

**Classification Rules**:
- Hard Skills: technical tools, languages, frameworks.
- Soft Skills: communication, leadership, collaboration.
- Experiences: concrete roles, positions, projects, or responsibilities.
- Interests: topics or domains the user is drawn to.
- Traits: personality qualities (strengths/weaknesses).
Only use information explicitly present in the input. Avoid poetic or abstract phrases.

Analyze the user through these existential lenses:
1.  **Semantic Legacy**: What is the "Defining Word" or "Core Equation" that the user is trying to solve across their lifetime?
2.  **The Paradox of Choice**: How does their obsession with building "Perfect Systems" actually limit their ability to experience the "Unstructured Breakthrough"?
3.  **The Non-Linear Ghost**: Where in their career did they encounter a problem that logic could NOT solve, and how did they mutate their identity to survive it?

Analyze the text and return a JSON object with this EXACT structure:

{
  "skills": [ { "name": "String", "category": "hard" | "soft" } ],
  "experiences": [ { "name": "String", "category": "experience" } ],
  "interests": [ { "name": "String", "category": "interest" } ],
  "traits": [ { "name": "String", "category": "trait" | "strength" | "weakness" } ],
	  "insight": {
	    "archetypes": [
	      "${archetypeFormat}"
	    ],
	    "hiddenPatterns": [
	      "${patternFormat}"
	    ],
	    "criticalQuestions": [
	      "${questionFormat}"
	    ],
	    "evidenceQuotes": [
	      "${evidenceFormat}"
	    ]
	  }
	}

	Be RUTHLESSLY META-ANALYTICAL. Do not settle for surface-level traits.
	Target the "Silent Core"—the part of the user that remains unchanged.
	For "evidenceQuotes", include up to 5 short quotes that are directly supported by the input text (verbatim).

	Language: ${languageDirective}
	`;
	};

export const STRATEGY_PROMPT_EN = `
You are "The Strategist", a ruthless but supportive AI mentor.
The User has a Problem. You generally know their Profile.
Your goal is to give them a "Crazy Good" solution that they wouldn't have thought of.

**Instructions**:
1. **Identify the Unfair Advantage**: What does THIS specific user have that makes this problem easier for them?
2. **Apply a Mental Model**: Use a concept like "First Principles", "80/20 Rule", "Inversion", or "Gamification" to solve this.
3. **Be Specific**: Don't say "improve communication". Say "Send a 3-bullet point email every Friday".

Output Format (Markdown):
## ⚡ The Unfair Advantage
(Why YOU are uniquely positioned to solve this)

## 🧠 The Strategy (Mental Model: [Name])
(The core approach)

## 👣 Action Plan
1. Step 1
2. Step 2

## 🛡️ Critical Warning
(What will likely trip you up based on your profile)
`;

export const STRATEGY_PROMPT_KO = `
당신은 "전략가"입니다. 냉철하지만 든든한 AI 멘토입니다.
사용자에게 문제가 있고, 당신은 그들의 프로필을 파악하고 있습니다.
사용자가 스스로 생각하지 못했을 "놀라운 해결책"을 제시하세요.

**지시사항**:
1. **비대칭 우위 파악**: 이 사용자만이 가진 강점으로 문제를 더 쉽게 풀 수 있는 지점을 찾으세요.
2. **멘탈 모델 적용**: "제1원칙 사고", "80/20 법칙", "역전 사고", "게이미피케이션" 등의 프레임워크를 활용하세요.
3. **구체적으로**: "소통을 개선하라"가 아니라 "매주 금요일 3줄 요약 이메일을 보내라"처럼 구체적으로 적으세요.

모든 출력은 반드시 한국어로만 작성하세요.

출력 형식 (Markdown):
## ⚡ 나만의 비대칭 우위
(이 문제를 풀기에 당신이 유리한 이유)

## 🧠 핵심 전략 (멘탈 모델: [이름])
(핵심 접근법)

## 👣 실행 계획
1. 1단계
2. 2단계

## 🛡️ 주의 사항
(프로필 기반으로 당신이 빠지기 쉬운 함정)
`;

// --- Zod Schemas ---

const SkillSchema = z.object({
  name: z.string(),
  category: z.enum(["hard", "soft"]),
});

const ExperienceSchema = z.object({
  name: z.string(),
  category: z.literal("experience"),
});

const InterestSchema = z.object({
  name: z.string(),
  category: z.literal("interest"),
});

const TraitSchema = z.object({
  name: z.string(),
  category: z.enum(["trait", "strength", "weakness"]),
});

	const InsightSchema = z.object({
	  archetypes: z.array(z.string()).optional().default([]),
	  hiddenPatterns: z.array(z.string()).optional().default([]),
	  criticalQuestions: z.array(z.string()).optional().default([]),
	  evidenceQuotes: z.array(z.string()).optional().default([]),
	});

export const AnalysisResultSchema = z.object({
  skills: z.array(SkillSchema).default([]),
  experiences: z.array(ExperienceSchema).default([]),
  interests: z.array(InterestSchema).default([]),
  traits: z.array(TraitSchema).default([]),
  insight: InsightSchema.optional(),
});

export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;

// --- API Calls ---

const callGemini = async (prompt: string, apiKey: string, model: string): Promise<string> => {
  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(apiKey);
  const geminiModel = genAI.getGenerativeModel({ model });
  const result = await geminiModel.generateContent(prompt);
  return result.response.text();
};

const callOpenAI = async (prompt: string, apiKey: string, model: string): Promise<string> => {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
    }),
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'OpenAI API error');
  }
  
  const data = await response.json();
  return data.choices[0].message.content;
};

const callClaude = async (prompt: string, apiKey: string, model: string): Promise<string> => {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Claude API error');
  }
  
  const data = await response.json();
  return data.content[0].text;
};

const callGrok = async (prompt: string, apiKey: string, model: string): Promise<string> => {
  // Grok uses OpenAI-compatible API
  const response = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Grok API error');
  }
  
  const data = await response.json();
  return data.choices[0].message.content;
};

// --- Main API ---

export const callAI = async (prompt: string): Promise<string> => {
  const config = getAIConfig();
  
  if (!config.apiKey) {
    throw new Error('No API key configured. Please add your API key in Settings.');
  }
  
  const model = config.model || AI_PROVIDERS[config.provider].defaultModel;
  
  switch (config.provider) {
    case 'gemini':
      return callGemini(prompt, config.apiKey, model);
    case 'openai':
      return callOpenAI(prompt, config.apiKey, model);
    case 'claude':
      return callClaude(prompt, config.apiKey, model);
    case 'grok':
      return callGrok(prompt, config.apiKey, model);
    default:
      throw new Error(`Unknown provider: ${config.provider}`);
  }
};

export const analyzeEntryWithAI = async (text: string, language: 'en' | 'ko' = 'en'): Promise<AnalysisResult> => {
  const finalPrompt = `${buildAnalysisPrompt(language)}\n\nInput Text:\n${text}`;
  
  try {
    const response = await callAI(finalPrompt);
    const cleanedText = response.replace(/^```json\n|```$/g, "").trim();
    const parsed = JSON.parse(cleanedText);
    const validated = AnalysisResultSchema.parse(parsed);
    
	    return {
	      skills: validated.skills.map(s => ({ ...s, name: s.name.trim() })),
	      experiences: validated.experiences.map(e => ({ ...e, name: e.name.trim() })),
	      interests: validated.interests.map(i => ({ ...i, name: i.name.trim() })),
	      traits: validated.traits.map(t => ({ ...t, name: t.name.trim() })),
	      insight: validated.insight ? {
	        archetypes: validated.insight.archetypes.map(a => a.trim()),
	        hiddenPatterns: validated.insight.hiddenPatterns.map(p => p.trim()),
	        criticalQuestions: validated.insight.criticalQuestions.map(q => q.trim()),
	        evidenceQuotes: validated.insight.evidenceQuotes.map(q => q.trim()).filter(Boolean),
	      } : undefined
	    };
	  } catch (error) {
    console.error("Error analyzing entry:", error);
    if (error instanceof z.ZodError) {
      console.error("Validation Failed:", error.issues);
      throw new Error("AI response format invalid");
    }
    throw error;
  }
};

export const generateStrategy = async (
  userProfileContext: string, 
  problem: string, 
  language: 'en' | 'ko' = 'en'
): Promise<string> => {
  const isKo = language === 'ko';
  const strategyPrompt = isKo ? STRATEGY_PROMPT_KO : STRATEGY_PROMPT_EN;
  const profileLabel = isKo ? '사용자 프로필' : 'User Profile';
  const problemLabel = isKo ? '문제' : 'Problem';

  const finalPrompt = `${strategyPrompt}

${profileLabel}:
${userProfileContext}

${problemLabel}:
${problem}`;
  
  return callAI(finalPrompt);
};

// --- Status Check ---

export const checkAIStatus = (): { configured: boolean; provider: AIProvider; model: string } => {
  const config = getAIConfig();
  return {
    configured: !!config.apiKey,
    provider: config.provider,
    model: config.model || AI_PROVIDERS[config.provider].defaultModel,
  };
};
