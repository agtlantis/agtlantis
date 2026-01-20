import { describe, it, expect } from 'vitest';
import { generateText, streamText } from 'ai';
import { mock } from './mock';

describe('mock.text', () => {
  it('should create model that returns text', async () => {
    const result = await generateText({
      model: mock.text('Hello, world!'),
      prompt: 'Say hello',
    });

    expect(result.text).toBe('Hello, world!');
  });

  it('should include usage in result', async () => {
    const result = await generateText({
      model: mock.text('Hello'),
      prompt: 'test',
    });

    expect(result.usage).toBeDefined();
  });

  it('should allow custom options', async () => {
    const result = await generateText({
      model: mock.text('Hello', {
        usage: {
          inputTokens: { total: 100, noCache: 100, cacheRead: undefined, cacheWrite: undefined },
          outputTokens: { total: 50, text: 50, reasoning: undefined },
        },
      }),
      prompt: 'test',
    });

    expect(result.text).toBe('Hello');
  });

  it('should allow custom finishReason', async () => {
    const result = await generateText({
      model: mock.text('Truncated...', {
        finishReason: { unified: 'length', raw: 'max_tokens' },
      }),
      prompt: 'test',
    });

    expect(result.finishReason).toBe('length');
  });
});

describe('mock.json', () => {
  it('should create model that returns JSON string', async () => {
    const data = { name: 'Alice', age: 30 };
    const result = await generateText({
      model: mock.json(data),
      prompt: 'Get user',
    });

    expect(result.text).toBe(JSON.stringify(data));
  });

  it('should handle nested objects', async () => {
    const data = {
      user: { name: 'Alice' },
      items: [{ id: 1 }, { id: 2 }],
    };
    const result = await generateText({
      model: mock.json(data),
      prompt: 'Get data',
    });

    expect(JSON.parse(result.text)).toEqual(data);
  });

  it('should handle arrays', async () => {
    const result = await generateText({
      model: mock.json([1, 2, 3]),
      prompt: 'Get numbers',
    });

    expect(JSON.parse(result.text)).toEqual([1, 2, 3]);
  });

  it('should pass options through', async () => {
    const result = await generateText({
      model: mock.json({ value: 'test' }, {
        finishReason: { unified: 'length', raw: 'max_tokens' },
      }),
      prompt: 'test',
    });

    expect(result.finishReason).toBe('length');
  });
});

describe('mock.stream', () => {
  it('should create model that streams chunks', async () => {
    const result = streamText({
      model: mock.stream(['Hello', ', ', 'world!']),
      prompt: 'Say hello',
    });

    const text = await result.text;
    expect(text).toBe('Hello, world!');
  });

  it('should stream individual deltas', async () => {
    const chunks: string[] = [];
    const result = streamText({
      model: mock.stream(['A', 'B', 'C']),
      prompt: 'test',
    });

    for await (const chunk of result.textStream) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual(['A', 'B', 'C']);
  });

  it('should complete without error', async () => {
    const result = streamText({
      model: mock.stream(['Hello', ' World']),
      prompt: 'test',
    });

    const text = await result.text;
    expect(text).toBe('Hello World');
  });
});

describe('mock.error', () => {
  it('should create model that throws on generateText', async () => {
    const error = new Error('Rate limit exceeded');

    await expect(
      generateText({
        model: mock.error(error),
        prompt: 'test',
      })
    ).rejects.toThrow('Rate limit exceeded');
  });

  it('should create model that throws on streamText', async () => {
    const error = new Error('API Error');

    const result = streamText({
      model: mock.error(error),
      prompt: 'test',
    });

    await expect(result.text).rejects.toThrow();
  });

  it('should preserve error properties', async () => {
    expect.assertions(2);

    const error = new Error('Custom error');
    (error as Error & { code: string }).code = 'RATE_LIMIT';

    try {
      await generateText({
        model: mock.error(error),
        prompt: 'test',
      });
    } catch (e) {
      expect((e as Error).message).toBe('Custom error');
      expect((e as Error & { code: string }).code).toBe('RATE_LIMIT');
    }
  });
});
