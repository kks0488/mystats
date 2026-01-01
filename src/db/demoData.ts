/**
 * Demo Data Seeder for MyStats
 * 
 * This script populates the app with sample data so new users
 * can immediately see the app's capabilities.
 * 
 * Usage: Import and call seedDemoData() from browser console
 * Or: It auto-runs on first visit if no data exists
 */

import { getDB, type JournalEntry, type Skill, type Insight } from './db';
import {
  loadFallbackJournalEntries,
  saveFallbackJournalEntry,
  upsertFallbackSkill,
  addFallbackInsight,
} from './fallback';

export type DemoSeedResult = 'db' | 'fallback' | 'skipped' | 'failed';
export type DemoLanguage = 'en' | 'ko';

const DEMO_JOURNAL_ENTRIES_EN: Omit<JournalEntry, 'id'>[] = [
  {
    content: `I've been working as a software developer for 5 years now. Started with Python, then moved to JavaScript/TypeScript. I really enjoy building user interfaces and seeing immediate visual feedback. 

My strengths: Problem-solving, quick learner, good at breaking down complex problems.
My weaknesses: Sometimes I spend too much time on perfectionism. I struggle with public speaking.

Recently interested in: AI/ML, particularly in how it can enhance developer productivity. Been using Cursor and Claude for pair programming.`,
    timestamp: Date.now() - 7 * 24 * 60 * 60 * 1000, // 7 days ago
    type: 'journal',
    lastModified: Date.now() - 7 * 24 * 60 * 60 * 1000
  },
  {
    content: `Thinking about my career path. I've always been drawn to building tools that help other developers. The idea of "developer experience" really resonates with me.

Key experiences:
- Built an internal CLI tool that saved my team 10+ hours per week
- Led a frontend rewrite from jQuery to React
- Mentored 3 junior developers

I notice I get energized when I'm teaching or explaining complex concepts. Maybe I should explore developer advocacy or technical writing?`,
    timestamp: Date.now() - 3 * 24 * 60 * 60 * 1000, // 3 days ago
    type: 'journal',
    lastModified: Date.now() - 3 * 24 * 60 * 60 * 1000
  },
  {
    content: `Had a breakthrough today! I realized that my "perfectionism" isn't actually about perfection - it's about fear of criticism. When I think about WHY I obsess over details, it's because I'm scared of someone pointing out a flaw.

This connects to my fear of public speaking too. It's all about being judged.

Action plan:
1. Ship things faster, accept imperfection
2. Start a small blog to practice putting ideas out there
3. Give one internal tech talk this quarter`,
    timestamp: Date.now() - 1 * 24 * 60 * 60 * 1000, // Yesterday
    type: 'journal',
    lastModified: Date.now() - 1 * 24 * 60 * 60 * 1000
  }
];

const DEMO_JOURNAL_ENTRIES_KO: Omit<JournalEntry, 'id'>[] = [
  {
    content: `저는 5년째 소프트웨어 개발자로 일하고 있습니다. 처음엔 Python으로 시작했고 지금은 JavaScript/TypeScript에 집중하고 있어요.
사용자 인터페이스를 만들고 바로 피드백을 보는 과정이 가장 즐겁습니다.

강점: 문제 해결, 빠른 학습, 복잡한 문제를 구조화하는 능력
약점: 완벽주의로 시간이 오래 걸림, 발표 불안`,
    timestamp: Date.now() - 7 * 24 * 60 * 60 * 1000,
    type: 'journal',
    lastModified: Date.now() - 7 * 24 * 60 * 60 * 1000
  },
  {
    content: `커리어 방향을 고민 중입니다. 저는 늘 다른 개발자를 돕는 도구를 만들 때 에너지가 올라옵니다.
"개발자 경험"이라는 키워드가 특히 마음에 들어요.

경험:
- 팀 시간을 주당 10시간 절약한 내부 CLI 도구 제작
- jQuery에서 React로 프론트엔드 리라이트 리드
- 주니어 개발자 3명 멘토링`,
    timestamp: Date.now() - 3 * 24 * 60 * 60 * 1000,
    type: 'journal',
    lastModified: Date.now() - 3 * 24 * 60 * 60 * 1000
  },
  {
    content: `오늘 깨달은 점: 제 완벽주의는 사실 비판에 대한 두려움에서 나오는 것 같습니다.
디테일에 집착하는 이유는 누군가 결점을 지적할까 봐서였어요.

실행 계획:
1) 더 빠르게 출시하고 불완전함을 허용하기
2) 짧은 블로그 글로 생각을 공개하는 훈련
3) 이번 분기 내부 기술 발표 1회`,
    timestamp: Date.now() - 1 * 24 * 60 * 60 * 1000,
    type: 'journal',
    lastModified: Date.now() - 1 * 24 * 60 * 60 * 1000
  }
];

const DEMO_SKILLS_EN: Omit<Skill, 'id'>[] = [
  { name: 'TypeScript', category: 'hard', sourceEntryIds: [], createdAt: Date.now(), lastModified: Date.now() },
  { name: 'React', category: 'hard', sourceEntryIds: [], createdAt: Date.now(), lastModified: Date.now() },
  { name: 'Python', category: 'hard', sourceEntryIds: [], createdAt: Date.now(), lastModified: Date.now() },
  { name: 'Problem Solving', category: 'soft', sourceEntryIds: [], createdAt: Date.now(), lastModified: Date.now() },
  { name: 'Teaching & Mentoring', category: 'soft', sourceEntryIds: [], createdAt: Date.now(), lastModified: Date.now() },
  { name: 'Quick Learner', category: 'trait', sourceEntryIds: [], createdAt: Date.now(), lastModified: Date.now() },
  { name: 'Perfectionist', category: 'weakness', sourceEntryIds: [], createdAt: Date.now(), lastModified: Date.now() },
  { name: 'Fear of Public Speaking', category: 'weakness', sourceEntryIds: [], createdAt: Date.now(), lastModified: Date.now() },
  { name: 'Software Development', category: 'experience', sourceEntryIds: [], createdAt: Date.now(), lastModified: Date.now() },
  { name: 'Frontend Architecture', category: 'experience', sourceEntryIds: [], createdAt: Date.now(), lastModified: Date.now() },
  { name: 'AI/ML Tools', category: 'interest', sourceEntryIds: [], createdAt: Date.now(), lastModified: Date.now() },
  { name: 'Developer Experience', category: 'interest', sourceEntryIds: [], createdAt: Date.now(), lastModified: Date.now() },
];

const DEMO_SKILLS_KO: Omit<Skill, 'id'>[] = [
  { name: '타입스크립트', category: 'hard', sourceEntryIds: [], createdAt: Date.now(), lastModified: Date.now() },
  { name: '리액트', category: 'hard', sourceEntryIds: [], createdAt: Date.now(), lastModified: Date.now() },
  { name: '파이썬', category: 'hard', sourceEntryIds: [], createdAt: Date.now(), lastModified: Date.now() },
  { name: '문제 해결', category: 'soft', sourceEntryIds: [], createdAt: Date.now(), lastModified: Date.now() },
  { name: '교육 및 멘토링', category: 'soft', sourceEntryIds: [], createdAt: Date.now(), lastModified: Date.now() },
  { name: '빠른 학습', category: 'trait', sourceEntryIds: [], createdAt: Date.now(), lastModified: Date.now() },
  { name: '완벽주의', category: 'weakness', sourceEntryIds: [], createdAt: Date.now(), lastModified: Date.now() },
  { name: '발표 불안', category: 'weakness', sourceEntryIds: [], createdAt: Date.now(), lastModified: Date.now() },
  { name: '소프트웨어 개발', category: 'experience', sourceEntryIds: [], createdAt: Date.now(), lastModified: Date.now() },
  { name: '프론트엔드 아키텍처', category: 'experience', sourceEntryIds: [], createdAt: Date.now(), lastModified: Date.now() },
  { name: 'AI/ML 도구', category: 'interest', sourceEntryIds: [], createdAt: Date.now(), lastModified: Date.now() },
  { name: '개발자 경험', category: 'interest', sourceEntryIds: [], createdAt: Date.now(), lastModified: Date.now() },
];

const DEMO_INSIGHTS_EN: Omit<Insight, 'id' | 'entryId'>[] = [
  {
    archetypes: [
      'The Architect of Systems',
      'The Reflective Grower'
    ],
    hiddenPatterns: [
      'Your perfectionism is actually a mask for fear of criticism.',
      'You gain energy from teaching and explaining complex topics.',
      'You are drawn to tool-building because it maximizes impact leverage.'
    ],
    criticalQuestions: [
      'What would you build if no one could criticize it?',
      'If your teaching scaled 10x, what form would it take?'
    ],
    timestamp: Date.now() - 1 * 24 * 60 * 60 * 1000,
    lastModified: Date.now()
  }
];

const DEMO_INSIGHTS_KO: Omit<Insight, 'id' | 'entryId'>[] = [
  {
    archetypes: [
      '시스템의 설계자 (The Architect of Systems)',
      '성찰적 성장자 (The Reflective Grower)'
    ],
    hiddenPatterns: [
      '당신의 "완벽주의"는 실제로 "비판에 대한 두려움"의 가면입니다 (Your perfectionism is actually a mask for fear of criticism)',
      '교육과 설명에서 에너지를 얻는 패턴이 있습니다 (You gain energy from teaching and explaining)',
      '도구 제작에 대한 끌림은 "영향력의 레버리지"를 추구하는 것입니다 (Your attraction to tool-building seeks leverage of impact)'
    ],
    criticalQuestions: [
      '만약 아무도 비판하지 않는다면, 당신은 무엇을 만들겠습니까? (What would you build if no one could criticize it?)',
      '당신의 "가르치는 능력"을 10배로 확장한다면 어떤 형태가 되겠습니까? (What form would your teaching take if scaled 10x?)'
    ],
    timestamp: Date.now() - 1 * 24 * 60 * 60 * 1000,
    lastModified: Date.now()
  }
];

const resolveLanguage = (language?: DemoLanguage) => {
  if (language === 'ko' || language === 'en') return language;
  const stored = localStorage.getItem('app_lang');
  return stored === 'ko' ? 'ko' : 'en';
};

const buildDemoRecords = (language?: DemoLanguage) => {
  const resolvedLanguage = resolveLanguage(language);
  const journalEntries = resolvedLanguage === 'ko' ? DEMO_JOURNAL_ENTRIES_KO : DEMO_JOURNAL_ENTRIES_EN;
  const skillsList = resolvedLanguage === 'ko' ? DEMO_SKILLS_KO : DEMO_SKILLS_EN;
  const insightsList = resolvedLanguage === 'ko' ? DEMO_INSIGHTS_KO : DEMO_INSIGHTS_EN;

  const entries = journalEntries.map((entry) => ({
    ...entry,
    id: crypto.randomUUID(),
  }));
  const skills = skillsList.map((skill) => ({
    ...skill,
    id: crypto.randomUUID(),
  }));
  const entryIdForInsights = entries[0]?.id ?? crypto.randomUUID();
  const insights = insightsList.map((insight) => ({
    ...insight,
    id: crypto.randomUUID(),
    entryId: entryIdForInsights,
  }));
  return { entries, skills, insights };
};

export const seedDemoDataToFallback = async (language?: DemoLanguage): Promise<DemoSeedResult> => {
  try {
    const existingFallback = loadFallbackJournalEntries();
    if (existingFallback.length > 0) {
      console.log('[Demo] Fallback data already exists, skipping seed');
      return 'skipped';
    }
    const { entries, skills, insights } = buildDemoRecords(language);
    for (const entry of entries) {
      saveFallbackJournalEntry(entry);
    }
    const entryIdForSkills = entries[0]?.id;
    for (const skill of skills) {
      upsertFallbackSkill({ name: skill.name, category: skill.category }, entryIdForSkills);
    }
    for (const insight of insights) {
      addFallbackInsight(insight);
    }
    console.log('[Demo] ✅ Demo data seeded to fallback successfully!');
    return 'fallback';
  } catch (error) {
    console.error('[Demo] Failed to seed fallback demo data:', error);
    return 'failed';
  }
};

export const seedDemoData = async (language?: DemoLanguage): Promise<DemoSeedResult> => {
  try {
    const db = await getDB();
    
    // Check if data already exists
    const existingJournal = await db.count('journal');
    if (existingJournal > 0) {
      console.log('[Demo] Data already exists, skipping seed');
      return 'skipped';
    }

    console.log('[Demo] Seeding demo data...');
    const { entries, skills, insights } = buildDemoRecords(language);

    // Seed journal entries
    for (const entry of entries) {
      await db.put('journal', entry);
    }

    // Seed skills
    for (const skill of skills) {
      await db.put('skills', skill);
    }

    // Seed insights
    for (const insight of insights) {
      await db.put('insights', insight);
    }

    console.log('[Demo] ✅ Demo data seeded successfully!');
    console.log('[Demo] - 3 journal entries');
    console.log('[Demo] - 12 skills/traits');
    console.log('[Demo] - 1 deep insight with archetypes');
    
    return 'db';
  } catch (error) {
    console.error('[Demo] Failed to seed demo data:', error);
    return await seedDemoDataToFallback(language);
  }
};

export const clearDemoData = async (): Promise<void> => {
  const db = await getDB();
  const stores = ['journal', 'skills', 'solutions', 'insights'] as const;
  
  for (const store of stores) {
    const tx = db.transaction(store, 'readwrite');
    await tx.objectStore(store).clear();
    await tx.done;
  }
  
  console.log('[Demo] All data cleared');
};
