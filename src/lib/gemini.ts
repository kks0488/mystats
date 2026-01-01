import { GoogleGenerativeAI, GenerativeModel } from "@google/generative-ai";
import { z } from "zod";

let genAI: GoogleGenerativeAI | null = null;
let model: GenerativeModel | null = null;

export const initGemini = (apiKey: string) => {
  if (!apiKey) {
    console.error("No API key provided to initGemini");
    return;
  }
  try {
    genAI = new GoogleGenerativeAI(apiKey);
    model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });
    console.log("Gemini initialized successfully with gemini-3-flash-preview");
  } catch (error) {
    console.error("Failed to initialize Gemini:", error);
    throw error;
  }
};

export const checkGeminiStatus = () => {
  return !!model;
};

const buildAnalysisPrompt = (language: 'en' | 'ko') => {
  const languageDirective =
    language === 'ko'
      ? 'Respond in KOREAN.'
      : 'Respond in ENGLISH only. Do NOT include Korean.';
  const insightRequirement =
    language === 'ko'
      ? `**Bilingual Requirement**: 
ALL output strings in "insight" (archetypes, hiddenPatterns, criticalQuestions) MUST follow the format: 
"Korean Description (English Translation)"`
      : `**Language Requirement**:
All output must be English only. Do NOT include Korean.`;
  const archetypeFormat =
    language === 'ko'
      ? "String (Format: '한글 명칭 (English Title)')"
      : 'String (English only)';
  const patternFormat =
    language === 'ko'
      ? "String (Format: '당신의 존재는... (Your existence is...)')"
      : 'String (English only)';
  const questionFormat =
    language === 'ko'
      ? "String (Format: '한글 질문? (English Question?)')"
      : 'String (English only)';

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
    ]
  }
}

Be RUTHLESSLY META-ANALYTICAL. Do not settle for surface-level traits.
Target the "Silent Core"—the part of the user that remains unchanged between the JSON and the BBQ.

Language: ${languageDirective}

Input Text:
`;
};

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
});

// Main Analysis Schema
export const AnalysisResultSchema = z.object({
  skills: z.array(SkillSchema).default([]),
  experiences: z.array(ExperienceSchema).default([]),
  interests: z.array(InterestSchema).default([]),
  traits: z.array(TraitSchema).default([]),
  insight: InsightSchema.optional(),
});

export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;

export const analyzeEntryWithAI = async (text: string, language: 'en' | 'ko' = 'en'): Promise<AnalysisResult> => {
  if (!model) {
    const savedKey = localStorage.getItem('GEMINI_API_KEY');
    if (savedKey) {
      initGemini(savedKey);
    }
  }
  
  if (!model) throw new Error("Gemini API not initialized. Please provide an API Key in settings.");

  const finalPrompt = `${buildAnalysisPrompt(language)}\n\n${text}`;

  try {
    const result = await model.generateContent(finalPrompt);
    const response = await result.response;
    const textResponse = response.text();
    
    const cleanedText = textResponse.replace(/^```json\n|```$/g, "").trim();
    
    const parsed = JSON.parse(cleanedText);
    const validated = AnalysisResultSchema.parse(parsed);

    // Data-level trimming for high-quality output
    return {
      skills: validated.skills.map(s => ({ ...s, name: s.name.trim() })),
      experiences: validated.experiences.map(e => ({ ...e, name: e.name.trim() })),
      interests: validated.interests.map(i => ({ ...i, name: i.name.trim() })),
      traits: validated.traits.map(t => ({ ...t, name: t.name.trim() })),
      insight: validated.insight ? {
        archetypes: validated.insight.archetypes.map(a => a.trim()),
        hiddenPatterns: validated.insight.hiddenPatterns.map(p => p.trim()),
        criticalQuestions: validated.insight.criticalQuestions.map(q => q.trim()),
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

export const generateStrategy = async (userProfileContext: string, problem: string, language: 'en' | 'ko' = 'en') => {
  if (!model) {
    const savedKey = localStorage.getItem('GEMINI_API_KEY');
    if (savedKey) {
      initGemini(savedKey);
    }
  }

  if (!model) throw new Error("Gemini API not initialized.");

  const languagePrompt = language === 'ko' ? "Respond in KOREAN." : "Respond in ENGLISH.";

  const STRATEGY_PROMPT = `
You are "The Strategist", a ruthless but supportive AI mentor.
The User has a Problem. You generally know their Profile.
Your goal is to give them a "Crazy Good" solution that they wouldn't have thought of.

Language Instruction: ${languagePrompt}

User Profile:
${userProfileContext}

Problem:
${problem}

---
**Instructions**:
1. **Identify the Unfair Advantage**: What does THIS specific user have that makes this problem easier for them?
2. **Apply a Mental Model**: Use a concept like "First Principles", "80/20 Rule", "Inversion", or "Gamification" to solve this.
3. **Be Specific**: Don't say "improve communication". Say "Send a 3-bullet point email every Friday".

Output Format (Markdown, but translated to the target language):
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

  try {
     const result = await model.generateContent(STRATEGY_PROMPT);
     return result.response.text();
  } catch (error) {
    console.error("Error generating strategy:", error);
    throw error;
  }
};
