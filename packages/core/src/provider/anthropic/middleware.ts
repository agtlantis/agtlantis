export const ANTHROPIC_FILE_ID_MARKER_PREFIX = 'agtlantis-anthropic-file-id:';

type FetchInput = Parameters<typeof fetch>[0];
type FetchInit = Parameters<typeof fetch>[1];
type PresentFetchInit = NonNullable<FetchInit>;

export interface RewriteFileIdMiddlewareOptions {
    fetch?: typeof fetch;
    filesBeta?: string;
}

interface RewriteResult {
    value: unknown;
    changed: boolean;
}

export function createAnthropicFileIdMarker(fileId: string): string {
    return `${ANTHROPIC_FILE_ID_MARKER_PREFIX}${fileId}`;
}

export function parseAnthropicFileIdMarker(value: unknown): string | null {
    if (typeof value !== 'string' || !value.startsWith(ANTHROPIC_FILE_ID_MARKER_PREFIX)) {
        return null;
    }

    const fileId = value.slice(ANTHROPIC_FILE_ID_MARKER_PREFIX.length);
    return fileId.length > 0 ? fileId : null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function rewriteAnthropicFileIdMarkers(value: unknown): RewriteResult {
    if (Array.isArray(value)) {
        let changed = false;
        const next = value.map((item) => {
            const result = rewriteAnthropicFileIdMarkers(item);
            changed ||= result.changed;
            return result.value;
        });
        return { value: changed ? next : value, changed };
    }

    if (!isPlainObject(value)) {
        return { value, changed: false };
    }

    const source = value.source;
    if (isPlainObject(source)) {
        const fileId = parseAnthropicFileIdMarker(source.data);
        if (fileId) {
            return {
                value: {
                    ...value,
                    source: {
                        type: 'file',
                        file_id: fileId,
                    },
                },
                changed: true,
            };
        }
    }

    let changed = false;
    const next: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
        const result = rewriteAnthropicFileIdMarkers(child);
        changed ||= result.changed;
        next[key] = result.value;
    }

    return { value: changed ? next : value, changed };
}

function isMessagesEndpoint(input: FetchInput): boolean {
    const url =
        typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;
    try {
        return new URL(url).pathname.endsWith('/messages');
    } catch {
        return false;
    }
}

function addBetaHeader(init: PresentFetchInit, filesBeta: string): PresentFetchInit {
    const headers = new Headers(init.headers);
    const existing = headers.get('anthropic-beta');
    const betas = existing
        ? existing.split(',').map((value) => value.trim()).filter(Boolean)
        : [];

    if (!betas.includes(filesBeta)) {
        betas.push(filesBeta);
        headers.set('anthropic-beta', betas.join(','));
    }

    return { ...init, headers };
}

export function rewriteFileIdMiddleware(options: RewriteFileIdMiddlewareOptions = {}): typeof fetch {
    const fetchImpl = options.fetch ?? fetch;
    const filesBeta = options.filesBeta ?? 'files-api-2025-04-14';

    return (async (input: FetchInput, init?: FetchInit) => {
        if (!init || typeof init.body !== 'string' || !isMessagesEndpoint(input)) {
            return fetchImpl(input, init);
        }

        let body: unknown;
        try {
            body = JSON.parse(init.body);
        } catch {
            return fetchImpl(input, init);
        }

        const result = rewriteAnthropicFileIdMarkers(body);
        if (!result.changed) {
            return fetchImpl(input, init);
        }

        return fetchImpl(input, {
            ...addBetaHeader(init, filesBeta),
            body: JSON.stringify(result.value),
        });
    }) as typeof fetch;
}
