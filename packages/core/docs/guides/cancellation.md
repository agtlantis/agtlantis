# Cancellation Guide

> How to cancel in-progress LLM operations in @agtlantis/core.

## Overview

Cancellation allows you to stop LLM operations that are in progress. This is useful for:

- **User cancellation**: Stop generation when user clicks "Cancel"
- **Timeout handling**: Abort long-running requests
- **Resource management**: Free up resources when results are no longer needed
- **Rate limiting**: Cancel requests when approaching limits

## Quick Start

```typescript
import { createGoogleProvider } from '@agtlantis/core';

const provider = createGoogleProvider({
  apiKey: process.env.GOOGLE_AI_API_KEY,
});

// Start execution
const execution = provider.simpleExecution(async (session) => {
  const result = await session.generateText({ prompt: 'Write a long story' });
  return result.text;
});

// Cancel after 5 seconds
setTimeout(() => execution.cancel(), 5000);

// Handle result or cancellation
try {
  const text = await execution.toResult();
  console.log(text);
} catch (error) {
  if (error.name === 'AbortError') {
    console.log('Request was cancelled');
  }
}
```

## Cancellation Methods

### Method 1: execution.cancel()

The simplest way to cancel - call `cancel()` on the execution object.

```typescript
const execution = provider.simpleExecution(async (session) => {
  return session.generateText({ prompt: 'Hello' });
});

// Cancel at any point
execution.cancel();
```

### Method 2: External AbortSignal

Pass an `AbortSignal` via execution options for more control.

```typescript
const controller = new AbortController();

const execution = provider.simpleExecution(
  async (session) => {
    return session.generateText({ prompt: 'Hello' });
  },
  { signal: controller.signal }
);

// Cancel using the external controller
controller.abort();
```

### Method 3: Combined Cancellation

Both methods work together - either one can trigger cancellation.

```typescript
const timeoutController = new AbortController();
setTimeout(() => timeoutController.abort(), 30000); // 30s timeout

const execution = provider.simpleExecution(
  async (session) => {
    return session.generateText({ prompt: 'Hello' });
  },
  { signal: timeoutController.signal }
);

// Either of these will cancel:
// - timeoutController.abort() (after 30 seconds)
// - execution.cancel() (immediate)

// User clicks cancel button
cancelButton.onclick = () => execution.cancel();
```

## Cancellation Patterns

### Pattern 1: Timeout

```typescript
import { createGoogleProvider } from '@agtlantis/core';

async function generateWithTimeout(prompt: string, timeoutMs: number) {
  const provider = createGoogleProvider({ apiKey: process.env.GOOGLE_AI_API_KEY });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const execution = provider.simpleExecution(
      async (session) => {
        const result = await session.generateText({ prompt });
        return result.text;
      },
      { signal: controller.signal }
    );

    return await execution.toResult();
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

// Usage
const text = await generateWithTimeout('Write a haiku', 10000);
```

### Pattern 2: User Cancellation in React

```typescript
import { useEffect, useRef, useState } from 'react';
import { createGoogleProvider, type SimpleExecution } from '@agtlantis/core';

function GenerateButton() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const executionRef = useRef<SimpleExecution<string> | null>(null);

  const provider = createGoogleProvider({
    apiKey: process.env.GOOGLE_AI_API_KEY,
  });

  const handleGenerate = async () => {
    setLoading(true);
    setResult(null);

    executionRef.current = provider.simpleExecution(async (session) => {
      const response = await session.generateText({ prompt: 'Write a story' });
      return response.text;
    });

    try {
      const text = await executionRef.current.toResult();
      setResult(text);
    } catch (error) {
      if (error.name === 'AbortError') {
        setResult('Cancelled');
      }
    } finally {
      setLoading(false);
      executionRef.current = null;
    }
  };

  const handleCancel = () => {
    executionRef.current?.cancel();
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      executionRef.current?.cancel();
    };
  }, []);

  return (
    <div>
      {!loading ? (
        <button onClick={handleGenerate}>Generate</button>
      ) : (
        <button onClick={handleCancel}>Cancel</button>
      )}
      {result && <p>{result}</p>}
    </div>
  );
}
```

### Pattern 3: Request Racing

Cancel slower requests when a faster one completes.

```typescript
async function raceProviders(prompt: string) {
  const googleProvider = createGoogleProvider({ apiKey: process.env.GOOGLE_AI_API_KEY });
  const openaiProvider = createOpenAIProvider({ apiKey: process.env.OPENAI_API_KEY });

  const googleExec = googleProvider.simpleExecution(async (session) => {
    const result = await session.generateText({ prompt });
    return { provider: 'google', text: result.text };
  });

  const openaiExec = openaiProvider.simpleExecution(async (session) => {
    const result = await session.generateText({ prompt });
    return { provider: 'openai', text: result.text };
  });

  // Race the executions
  const winner = await Promise.race([
    googleExec.toResult(),
    openaiExec.toResult(),
  ]);

  // Cancel the loser
  googleExec.cancel();
  openaiExec.cancel();

  return winner;
}
```

### Pattern 4: Streaming Cancellation

For streaming executions, cancel when you have enough data.

```typescript
import { createGoogleProvider } from '@agtlantis/core';
import type { EventMetrics } from '@agtlantis/core';

type ChunkEvent = {
  type: 'chunk' | 'complete' | 'error';
  text?: string;
  metrics: EventMetrics;
};

async function generateUntilEnough() {
  const provider = createGoogleProvider({ apiKey: process.env.GOOGLE_AI_API_KEY });

  const execution = provider.streamingExecution<ChunkEvent, string>(
    async function* (session) {
      const result = session.streamText({ prompt: 'Write a very long essay' });
      let fullText = '';

      for await (const chunk of result.textStream) {
        fullText += chunk;
        yield session.emit({ type: 'chunk', text: chunk });
      }

      return session.done(fullText);
    }
  );

  let collected = '';

  for await (const event of execution) {
    if (event.type === 'chunk' && event.text) {
      collected += event.text;

      // Stop when we have 1000 characters
      if (collected.length >= 1000) {
        execution.cancel();
        break;
      }
    }
  }

  return collected;
}
```

## Error Handling

### Detecting Cancellation

Check for `AbortError` to distinguish cancellation from other errors.

```typescript
try {
  const result = await execution.toResult();
} catch (error) {
  if (error instanceof Error) {
    if (error.name === 'AbortError') {
      // Cancellation - expected, handle gracefully
      console.log('Request cancelled');
    } else {
      // Other error - may need to retry or report
      console.error('Request failed:', error.message);
    }
  }
}
```

### Getting Partial Data After Cancellation

Use `getSummary()` to get metadata even after cancellation.

```typescript
const execution = provider.simpleExecution(async (session) => {
  const result = await session.generateText({ prompt: 'Hello' });
  return result.text;
});

setTimeout(() => execution.cancel(), 1000);

try {
  await execution.toResult();
} catch (error) {
  // Even after error, we can get summary
  const summary = await execution.getSummary();
  console.log('Duration before cancel:', summary.totalDuration, 'ms');
  console.log('Tokens used:', summary.totalLLMUsage.totalTokens);
}
```

## How It Works

### Signal Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      SimpleExecutionHost                     │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────────┐    ┌──────────────────┐              │
│  │ Internal         │    │ User Signal      │              │
│  │ AbortController  │    │ (optional)       │              │
│  └────────┬─────────┘    └────────┬─────────┘              │
│           │                       │                         │
│           └───────────┬───────────┘                         │
│                       │                                     │
│                       ▼                                     │
│            ┌──────────────────┐                            │
│            │ combineSignals() │                            │
│            └────────┬─────────┘                            │
│                     │                                       │
│                     ▼                                       │
│            ┌──────────────────┐                            │
│            │ effectiveSignal  │                            │
│            └────────┬─────────┘                            │
│                     │                                       │
│                     ▼                                       │
│            ┌──────────────────┐                            │
│            │ SimpleSession    │                            │
│            │ ├─ generateText()│──────▶ AI SDK (abortSignal)│
│            │ └─ streamText()  │                            │
│            └──────────────────┘                            │
└─────────────────────────────────────────────────────────────┘
```

### Cancellation Flow

1. **Signal Creation**: Execution creates internal `AbortController`
2. **Signal Combination**: If user provides signal, both are combined with `combineSignals()`
3. **Signal Passing**: Combined signal flows to `SimpleSession` → AI SDK calls
4. **Cancellation Trigger**: Either `cancel()` or user signal abort triggers the combined signal
5. **Abort Propagation**: AI SDK receives abort, terminates the HTTP request
6. **Error Handling**: `AbortError` bubbles up to `toResult()`

### Session Lifecycle

- **onDone hooks**: Always run, even after cancellation
- **cleanup()**: Safe to call, handles resource cleanup
- **getSummary()**: Available even after cancellation (may have partial data)

## Automatic Termination on Terminal Events

When a streaming execution emits a terminal event (`complete` or `error`), the execution automatically aborts the signal. This provides a safety mechanism that prevents additional AI API calls after the execution has logically completed.

### Why This Matters

```typescript
// Without auto-abort, this could make unnecessary API calls
const execution = provider.streamingExecution(async function* (session) {
  const result = await session.generateText({ prompt: 'First' });
  yield session.done(result.text);  // Execution is "done"

  // BUG: Developer forgot to return after done()
  // Without auto-abort, this would still make an API call!
  const extra = await session.generateText({ prompt: 'Second' });
  yield session.emit({ type: 'extra', text: extra.text });
});
```

With auto-abort enabled, the second `generateText()` call will immediately fail with an `AbortError` because the signal was aborted after the `complete` event.

### Behavior

1. **Terminal events trigger abort**: After yielding a `complete` or `error` event, the internal `AbortController` is aborted
2. **Event delivery is guaranteed**: The terminal event is yielded to the consumer before abort
3. **Subsequent yields are ignored**: Any `yield` after the terminal event will not be collected
4. **AI calls are blocked**: New AI SDK calls will fail with `AbortError`

```
Timeline:
─────────────────────────────────────────────────────────────
Generator                    Host                    AI SDK
─────────────────────────────────────────────────────────────
yield done(result)
                             yield complete event ───▶ Consumer
                             abort() triggered
                             break from loop

(further code runs)
    │
    └─▶ generateText()
            └─▶ AI SDK checks signal ───▶ AbortError (blocked!)
─────────────────────────────────────────────────────────────
```

### Best Practice

Even with auto-abort protection, always `return` after `done()` or `fail()`:

```typescript
// ✅ Recommended: explicit return
const execution = provider.streamingExecution(async function* (session) {
  const result = await session.generateText({ prompt: 'Hello' });
  return session.done(result.text);  // Clear intent, immediate exit
});

// ⚠️ Works but less clear: rely on auto-abort
const execution = provider.streamingExecution(async function* (session) {
  const result = await session.generateText({ prompt: 'Hello' });
  yield session.done(result.text);
  // Auto-abort will catch this, but return is cleaner
});
```

## Best Practices

### Do

- ✅ Always handle `AbortError` in try/catch
- ✅ Cancel executions when component unmounts (React)
- ✅ Use timeouts for production LLM calls
- ✅ Clean up resources with `execution.cleanup()` or `await using`

### Don't

- ❌ Ignore cancellation errors (distinguish from real errors)
- ❌ Forget to cancel when result is no longer needed
- ❌ Assume cancelled operations return partial results (they throw)

## See Also

- [Execution API Reference](../api/execution.md) - Detailed type documentation
- [Session API Reference](../api/session.md) - Session interfaces
- [Streaming Guide](./streaming-guide.md) - Event streaming patterns
