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

const DEMO_JOURNAL_ENTRIES: Omit<JournalEntry, 'id'>[] = [
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

const DEMO_SKILLS: Omit<Skill, 'id'>[] = [
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

const DEMO_INSIGHTS: Omit<Insight, 'id' | 'entryId'>[] = [
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

const buildDemoRecords = () => {
  const entries = DEMO_JOURNAL_ENTRIES.map((entry) => ({
    ...entry,
    id: crypto.randomUUID(),
  }));
  const skills = DEMO_SKILLS.map((skill) => ({
    ...skill,
    id: crypto.randomUUID(),
  }));
  const entryIdForInsights = entries[0]?.id ?? crypto.randomUUID();
  const insights = DEMO_INSIGHTS.map((insight) => ({
    ...insight,
    id: crypto.randomUUID(),
    entryId: entryIdForInsights,
  }));
  return { entries, skills, insights };
};

export const seedDemoDataToFallback = async (): Promise<DemoSeedResult> => {
  try {
    const existingFallback = loadFallbackJournalEntries();
    if (existingFallback.length > 0) {
      console.log('[Demo] Fallback data already exists, skipping seed');
      return 'skipped';
    }
    const { entries, skills, insights } = buildDemoRecords();
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

export const seedDemoData = async (): Promise<DemoSeedResult> => {
  try {
    const db = await getDB();
    
    // Check if data already exists
    const existingJournal = await db.count('journal');
    if (existingJournal > 0) {
      console.log('[Demo] Data already exists, skipping seed');
      return 'skipped';
    }

    console.log('[Demo] Seeding demo data...');
    const { entries, skills, insights } = buildDemoRecords();

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
    return await seedDemoDataToFallback();
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
