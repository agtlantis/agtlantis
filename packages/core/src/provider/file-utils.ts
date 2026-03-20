import type { FilePart, ImagePart } from 'ai';

export function isImageMediaType(mediaType: string): boolean {
    return mediaType.startsWith('image/');
}

export function bufferToBlob(buffer: Uint8Array, type?: string): Blob {
    const arrayBuffer = buffer.buffer.slice(
        buffer.byteOffset,
        buffer.byteOffset + buffer.byteLength
    ) as ArrayBuffer;
    return new Blob([arrayBuffer], { type });
}

export function createPartFromURI(uri: string, mediaType: string): FilePart | ImagePart {
    const url = new URL(uri);
    if (isImageMediaType(mediaType)) {
        return { type: 'image', image: url, mediaType };
    }
    return { type: 'file', data: url, mediaType };
}
