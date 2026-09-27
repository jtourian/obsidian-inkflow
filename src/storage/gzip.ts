/**
 * Thin wrapper around the standard CompressionStream/DecompressionStream
 * Web APIs (gzip). Deliberately not a bundled zlib/pako dependency — these
 * APIs are available in Electron (desktop) and modern iOS/Android WebViews,
 * consistent with this project's avoidance of heavy third-party libraries
 * (see HandwritingCanvas.ts for the same rationale re: tldraw).
 */

export function isCompressionSupported(): boolean {
	return typeof CompressionStream !== "undefined" && typeof DecompressionStream !== "undefined";
}

async function pipeThroughStream(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
	const blob = new Blob([bytes as unknown as BlobPart]);
	const piped = blob.stream().pipeThrough(stream);
	const buffer = await new Response(piped).arrayBuffer();
	return new Uint8Array(buffer);
}

export async function gzipCompress(bytes: Uint8Array): Promise<Uint8Array> {
	return pipeThroughStream(bytes, new CompressionStream("gzip"));
}

export async function gzipDecompress(bytes: Uint8Array): Promise<Uint8Array> {
	return pipeThroughStream(bytes, new DecompressionStream("gzip"));
}
