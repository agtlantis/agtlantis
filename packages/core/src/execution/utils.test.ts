import { describe, it, expect } from 'vitest';
import { getDuration, combineSignals, Deferred } from './utils';

describe('utils', () => {
  describe('getDuration', () => {
    it('should return positive number for past start time', () => {
      const startTime = Date.now() - 100;

      const duration = getDuration(startTime);

      expect(duration).toBeGreaterThanOrEqual(100);
      expect(duration).toBeLessThan(200); // reasonable upper bound
    });

    it('should return approximately 0 for current time', () => {
      const startTime = Date.now();

      const duration = getDuration(startTime);

      expect(duration).toBeGreaterThanOrEqual(0);
      expect(duration).toBeLessThan(10); // allow small delta for execution time
    });

    it('should return negative for future start time', () => {
      const startTime = Date.now() + 1000;

      const duration = getDuration(startTime);

      expect(duration).toBeLessThan(0);
    });
  });

  describe('combineSignals', () => {
    it('should abort when first signal aborts', () => {
      const controller1 = new AbortController();
      const controller2 = new AbortController();

      const combined = combineSignals(controller1.signal, controller2.signal);

      expect(combined.aborted).toBe(false);

      controller1.abort('first abort');

      expect(combined.aborted).toBe(true);
      expect(combined.reason).toBe('first abort');
    });

    it('should abort when second signal aborts', () => {
      const controller1 = new AbortController();
      const controller2 = new AbortController();

      const combined = combineSignals(controller1.signal, controller2.signal);

      expect(combined.aborted).toBe(false);

      controller2.abort('second abort');

      expect(combined.aborted).toBe(true);
      expect(combined.reason).toBe('second abort');
    });

    it('should return already aborted signal when input is already aborted', () => {
      const controller1 = new AbortController();
      const controller2 = new AbortController();

      controller1.abort('pre-aborted');

      const combined = combineSignals(controller1.signal, controller2.signal);

      expect(combined.aborted).toBe(true);
      expect(combined.reason).toBe('pre-aborted');
    });

    it('should handle single signal', () => {
      const controller = new AbortController();

      const combined = combineSignals(controller.signal);

      expect(combined.aborted).toBe(false);

      controller.abort();

      expect(combined.aborted).toBe(true);
    });

    it('should handle multiple signals', () => {
      const controllers = [
        new AbortController(),
        new AbortController(),
        new AbortController(),
      ];

      const combined = combineSignals(...controllers.map((c) => c.signal));

      expect(combined.aborted).toBe(false);

      // Abort the middle one
      controllers[1].abort('middle');

      expect(combined.aborted).toBe(true);
      expect(combined.reason).toBe('middle');
    });

    it('should not abort if no signals abort', () => {
      const controller1 = new AbortController();
      const controller2 = new AbortController();

      const combined = combineSignals(controller1.signal, controller2.signal);

      expect(combined.aborted).toBe(false);
    });

    it('should handle empty signals array', () => {
      const combined = combineSignals();

      expect(combined.aborted).toBe(false);
    });
  });

  describe('Deferred', () => {
    it('should resolve with the provided value', async () => {
      const deferred = new Deferred<string>();

      deferred.resolve('hello');

      const result = await deferred.promise;
      expect(result).toBe('hello');
    });

    it('should reject with the provided error', async () => {
      const deferred = new Deferred<string>();
      const error = new Error('test error');

      deferred.reject(error);

      await expect(deferred.promise).rejects.toThrow('test error');
    });

    it('should work with void type (default)', async () => {
      const deferred = new Deferred();

      deferred.resolve();

      await expect(deferred.promise).resolves.toBeUndefined();
    });

    it('should be awaitable before resolution', async () => {
      const deferred = new Deferred<number>();
      let resolved = false;

      const awaiter = deferred.promise.then((value) => {
        resolved = true;
        return value;
      });

      expect(resolved).toBe(false);

      deferred.resolve(42);

      const result = await awaiter;
      expect(resolved).toBe(true);
      expect(result).toBe(42);
    });

    it('should resolve only once (first value wins)', async () => {
      const deferred = new Deferred<string>();

      deferred.resolve('first');
      deferred.resolve('second'); // This should be ignored

      const result = await deferred.promise;
      expect(result).toBe('first');
    });

    it('should work in async generator pattern', async () => {
      const events: string[] = [];
      let pending = new Deferred<void>();
      let done = false;

      // Simulate producer
      const producer = async () => {
        await new Promise((r) => setTimeout(r, 5));
        events.push('a');
        pending.resolve();

        await new Promise((r) => setTimeout(r, 5));
        events.push('b');
        pending.resolve();

        await new Promise((r) => setTimeout(r, 5));
        done = true;
        pending.resolve();
      };

      // Simulate consumer
      const consumer = async () => {
        const received: string[] = [];
        while (!done || events.length > 0) {
          if (events.length > 0) {
            received.push(events.shift()!);
          } else if (!done) {
            await pending.promise;
            pending = new Deferred<void>();
          }
        }
        return received;
      };

      producer();
      const result = await consumer();

      expect(result).toEqual(['a', 'b']);
    });
  });
});
