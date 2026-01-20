import { describe, it, expect } from 'vitest';
import { getDuration, combineSignals } from './utils';

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
});
