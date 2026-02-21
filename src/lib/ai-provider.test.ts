import { beforeEach, describe, expect, it, vi } from 'vitest';

import { checkAIStatus, getAIConfig, setAIConfig } from './ai-provider';

beforeEach(() => {
  localStorage.clear();
});

describe('ai-provider storage', () => {
  it('persists provider, apiKey, and model', () => {
    setAIConfig({ provider: 'openai', apiKey: 'sk-test', model: 'gpt-4o-mini' });
    expect(getAIConfig()).toEqual({ provider: 'openai', apiKey: 'sk-test', model: 'gpt-4o-mini' });

    const status = checkAIStatus();
    expect(status.configured).toBe(true);
    expect(status.provider).toBe('openai');
    expect(status.model).toBe('gpt-4o-mini');
  });

  it('keeps GEMINI_API_KEY in sync for backward compatibility', () => {
    setAIConfig({ provider: 'gemini', apiKey: 'AIza-test' });
    expect(localStorage.getItem('GEMINI_API_KEY')).toBe('AIza-test');
    expect(getAIConfig().apiKey).toBe('AIza-test');
  });

  it('does not throw when localStorage is unavailable (Safari private mode)', () => {
    const getItemSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    expect(() => getAIConfig()).not.toThrow();
    expect(getAIConfig().provider).toBe('openai');
    expect(() => setAIConfig({ provider: 'openai', apiKey: 'x' })).not.toThrow();
    expect(checkAIStatus().configured).toBe(false);

    getItemSpy.mockRestore();
    setItemSpy.mockRestore();
  });
});
