import { describe, it, expect } from 'vitest';
import { deepMerge } from './deep-merge';

describe('deepMerge', () => {
  it('returns empty object when no sources given', () => {
    expect(deepMerge()).toEqual({});
  });

  it('skips undefined and null sources', () => {
    expect(deepMerge(undefined, { a: 1 }, null)).toEqual({ a: 1 });
  });

  it('merges shallow properties', () => {
    const result = deepMerge({ a: 1 }, { b: 2 });
    expect(result).toEqual({ a: 1, b: 2 });
  });

  it('later source overwrites earlier for same key', () => {
    const result = deepMerge({ a: 1 }, { a: 2 });
    expect(result).toEqual({ a: 2 });
  });

  it('deep-merges nested plain objects (ProviderOptions shape)', () => {
    const defaults = {
      google: { cachedContent: 'abc', temperature: 0.5 },
      openai: { orgId: 'org-1' },
    };
    const perCall = {
      google: { temperature: 0.9, topK: 10 },
    };

    expect(deepMerge(defaults, perCall)).toEqual({
      google: { cachedContent: 'abc', temperature: 0.9, topK: 10 },
      openai: { orgId: 'org-1' },
    });
  });

  it('merges 3-level nested objects', () => {
    const a = { l1: { l2: { l3a: 'keep' } } };
    const b = { l1: { l2: { l3b: 'add' } } };

    expect(deepMerge(a, b)).toEqual({
      l1: { l2: { l3a: 'keep', l3b: 'add' } },
    });
  });

  it('replaces arrays instead of concatenating', () => {
    const result = deepMerge({ tags: [1, 2] }, { tags: [3] });
    expect(result).toEqual({ tags: [3] });
  });

  it('overwrites non-object values', () => {
    const result = deepMerge({ a: 'old' }, { a: 'new' });
    expect(result).toEqual({ a: 'new' });
  });

  it('does not mutate source objects', () => {
    const defaults = { google: { temp: 0.5 } };
    const perCall = { google: { temp: 0.9 } };
    const defaultsCopy = JSON.parse(JSON.stringify(defaults));
    const perCallCopy = JSON.parse(JSON.stringify(perCall));

    deepMerge(defaults, perCall);

    expect(defaults).toEqual(defaultsCopy);
    expect(perCall).toEqual(perCallCopy);
  });

  it('handles three sources correctly', () => {
    const result = deepMerge({ a: 1 }, { b: 2 }, { a: 3, c: 4 });
    expect(result).toEqual({ a: 3, b: 2, c: 4 });
  });
});
