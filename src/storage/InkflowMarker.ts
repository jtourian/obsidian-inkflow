import { HandwritingRegion } from "../model/types";
import { gzipCompress, gzipDecompress, isCompressionSupported } from "./gzip";

/**
 * Encodes/decodes a HandwritingRegion to/from the literal HTML-comment
 * marker embedded directly in the note's Markdown source, e.g.:
 *
 *   The eigenvalues of $A$ satisfy $\det(A - \lambda I) = 0$.
 *   <!--inkflow:v1:region-123:1f8b0800...-->
 *
 * Hex (not base64) is used for the payload because an HTML comment is
 * terminated by a literal "--" sequence; base64's alphabet can produce
 * "--" in a long-enough blob (stroke data is often several KB), while
 * hex's alphabet (0-9a-f) can never contain a "-" at all. This costs ~50%
 * more bytes than base64 would, which is accepted deliberately — do not
 * "optimize" this back to base64 without re-deriving that risk.
 *
 * This module is a pure, stateless codec — no vault/file I/O. All
 * persistence happens by the caller writing the returned marker text
 * directly into the note (see main.ts's writeRegionBack).
 */

const FORMAT_VERSION = 1;

// Payload byte 0 is a flag: 1 = gzip-compressed, 0 = raw JSON bytes.
// This lets a region authored on a compression-capable runtime still be
// read on one without CompressionStream/DecompressionStream, and vice versa.
const FLAG_GZIP = 0x01;
const FLAG_RAW = 0x00;

export interface InkflowMarkerPayloadV1 {
	v: 1;
	id: string;
	createdAt: number;
	updatedAt: number;
	width: number;
	height: number;
	strokes: HandwritingRegion["strokes"];
}

export const MARKER_RE = /<!--inkflow:v(\d+):([A-Za-z0-9_-]+):([0-9a-f]+)-->/;

function bytesToHex(bytes: Uint8Array): string {
	return Array.from(bytes)
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

function hexToBytes(hex: string): Uint8Array {
	const bytes = new Uint8Array(hex.length / 2);
	for (let i = 0; i < bytes.length; i++) {
		bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
	}
	return bytes;
}

export interface InkflowMarkerOptions {
	/** Force the raw (uncompressed) encoding path even when compression is available — for QA/testing the fallback. */
	forceUncompressed?: boolean;
}

export async function encode(region: HandwritingRegion, options: InkflowMarkerOptions = {}): Promise<string> {
	const payload: InkflowMarkerPayloadV1 = {
		v: 1,
		id: region.id,
		createdAt: region.createdAt,
		updatedAt: region.updatedAt,
		width: region.width,
		height: region.height,
		strokes: region.strokes,
	};
	const jsonBytes = new TextEncoder().encode(JSON.stringify(payload));

	const useCompression = !options.forceUncompressed && isCompressionSupported();
	const bodyBytes = useCompression ? await gzipCompress(jsonBytes) : jsonBytes;
	const flag = useCompression ? FLAG_GZIP : FLAG_RAW;

	const flagged = new Uint8Array(bodyBytes.length + 1);
	flagged[0] = flag;
	flagged.set(bodyBytes, 1);

	const hex = bytesToHex(flagged);
	return `<!--inkflow:v${FORMAT_VERSION}:${region.id}:${hex}-->`;
}

export async function decode(markerText: string): Promise<HandwritingRegion | null> {
	const match = MARKER_RE.exec(markerText);
	if (!match) return null;

	const [, versionStr, , hex] = match;
	if (versionStr !== "1") return null; // unknown future format version — don't guess

	try {
		const flagged = hexToBytes(hex);
		const flag = flagged[0];
		const bodyBytes = flagged.slice(1);

		let jsonBytes: Uint8Array;
		if (flag === FLAG_GZIP) {
			if (!isCompressionSupported()) return null; // can't decode a compressed payload here
			jsonBytes = await gzipDecompress(bodyBytes);
		} else {
			jsonBytes = bodyBytes;
		}

		const payload = JSON.parse(new TextDecoder().decode(jsonBytes)) as InkflowMarkerPayloadV1;

		return {
			id: payload.id,
			createdAt: payload.createdAt,
			updatedAt: payload.updatedAt,
			width: payload.width,
			height: payload.height,
			strokes: payload.strokes,
			recognizedMarkdown: null,
			segments: [],
			revisionHistory: [],
		};
	} catch (err) {
		console.error("inkflow: failed to decode marker", err);
		return null;
	}
}
