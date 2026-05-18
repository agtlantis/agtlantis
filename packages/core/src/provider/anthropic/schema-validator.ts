import type { OutputSpec } from '../../session/index.js';
import { isRecord } from '../../utils/is-record.js';

interface UnsupportedSchemaLocation {
    path: string;
    discriminator?: string;
}

export class UnsupportedAnthropicSchemaError extends Error {
    constructor(location: UnsupportedSchemaLocation) {
        const suffix = location.discriminator
            ? ` using discriminator "${location.discriminator}"`
            : '';
        super(
            `Anthropic structured output does not support discriminatedUnion schemas at ${location.path}${suffix}. ` +
                'Use a flat schema with post-parse refinement, or split the flow into a free-form reasoning phase and a jsonTool formatting phase.'
        );
        this.name = 'UnsupportedAnthropicSchemaError';
    }
}

function getConstValue(schema: unknown): unknown {
    if (!isRecord(schema)) {
        return undefined;
    }

    if ('const' in schema) {
        return schema.const;
    }

    if (Array.isArray(schema.enum) && schema.enum.length === 1) {
        return schema.enum[0];
    }

    return undefined;
}

function findSharedDiscriminator(oneOf: unknown[]): string | undefined {
    if (oneOf.length < 2 || !oneOf.every(isRecord)) {
        return undefined;
    }

    const [first] = oneOf;
    const firstProperties = isRecord(first.properties) ? first.properties : undefined;
    if (!firstProperties) {
        return undefined;
    }

    for (const propertyName of Object.keys(firstProperties)) {
        if (getConstValue(firstProperties[propertyName]) === undefined) {
            continue;
        }

        const appearsInEveryBranch = oneOf.every((branch) => {
            const properties = isRecord(branch.properties) ? branch.properties : undefined;
            return properties ? getConstValue(properties[propertyName]) !== undefined : false;
        });

        if (appearsInEveryBranch) {
            return propertyName;
        }
    }

    return undefined;
}

function findDiscriminatedUnionSchema(
    schema: unknown,
    path = '$'
): UnsupportedSchemaLocation | null {
    if (Array.isArray(schema)) {
        for (let index = 0; index < schema.length; index += 1) {
            const found = findDiscriminatedUnionSchema(schema[index], `${path}[${index}]`);
            if (found) {
                return found;
            }
        }
        return null;
    }

    if (!isRecord(schema)) {
        return null;
    }

    if (Array.isArray(schema.oneOf)) {
        const discriminator = findSharedDiscriminator(schema.oneOf);
        if (discriminator) {
            return { path, discriminator };
        }
    }

    for (const [key, value] of Object.entries(schema as Record<string, unknown>)) {
        const childPath = /^[A-Za-z_$][\w$]*$/.test(key) ? `${path}.${key}` : `${path}[${JSON.stringify(key)}]`;
        const found = findDiscriminatedUnionSchema(value, childPath);
        if (found) {
            return found;
        }
    }

    return null;
}

export function assertAnthropicResponseFormatSupported(responseFormat: unknown): void {
    const schema = isRecord(responseFormat) ? responseFormat.schema : undefined;
    const unsupported = findDiscriminatedUnionSchema(schema);
    if (unsupported) {
        throw new UnsupportedAnthropicSchemaError(unsupported);
    }
}

export function guardAnthropicOutput<OUTPUT extends OutputSpec | undefined>(
    output: OUTPUT
): OUTPUT {
    if (!output) {
        return output;
    }

    const wrapped = Promise.resolve(output.responseFormat).then((responseFormat) => {
        assertAnthropicResponseFormatSupported(responseFormat);
        return responseFormat;
    });

    (output as unknown as { responseFormat: typeof wrapped }).responseFormat = wrapped;
    return output;
}
