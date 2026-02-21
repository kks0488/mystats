export type JournalDraft = {
  mode: 'new' | 'edit';
  entryId?: string;
  content: string;
  updatedAt: number;
};

const DRAFT_STORAGE_KEY = 'MYSTATS_JOURNAL_DRAFT_V1';

export const safeLoadDraft = (): JournalDraft | null => {
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    const record = parsed as Record<string, unknown>;
    const mode = record.mode === 'edit' ? 'edit' : record.mode === 'new' ? 'new' : null;
    if (!mode) return null;
    const content = typeof record.content === 'string' ? record.content : '';
    if (!content.trim()) return null;
    const updatedAt = typeof record.updatedAt === 'number' ? record.updatedAt : Number(record.updatedAt);
    if (!Number.isFinite(updatedAt) || updatedAt <= 0) return null;
    const entryId = typeof record.entryId === 'string' && record.entryId.trim() ? record.entryId.trim() : undefined;
    return { mode, entryId, content, updatedAt };
  } catch {
    return null;
  }
};

export const safeSaveDraft = (draft: JournalDraft): void => {
  try {
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // ignore
  }
};

export const safeClearDraft = (): void => {
  try {
    localStorage.removeItem(DRAFT_STORAGE_KEY);
  } catch {
    // ignore
  }
};
