/**
 * Core data model for InkFlow.
 *
 * Strokes are the source of truth and are never deleted by recognition.
 * The recognized Markdown lives in the note's own body; it is a derived,
 * replaceable projection, not stored alongside the strokes.
 */

export interface StrokePoint {
	x: number;
	y: number;
	pressure: number;
	tiltX?: number;
	tiltY?: number;
	t: number; // ms since page creation
}

export interface Stroke {
	id: string;
	pointerType: "pen" | "touch" | "mouse";
	points: StrokePoint[];
	color: string;
	width: number;
	erased?: boolean;
}

export type IssueCategory =
	| "ocr-ambiguity"
	| "context-inconsistency"
	| "math-structure"
	| "math-validity";

export interface RecognitionIssue {
	id: string;
	category: IssueCategory;
	message: string;
	recognized: string;
	candidates: string[];
	resolved: boolean;
	resolution?: string;
}

export interface RecognitionSegment {
	id: string;
	markdown: string;
	confidence?: number;
	alternatives: string[];
	issues: RecognitionIssue[];
}

export interface RecognitionResult {
	markdown: string;
	segments: RecognitionSegment[];
	raw?: unknown;
}

/**
 * The full-page ink layer for a single note, persisted in a sidecar file
 * (see storage/sidecar.ts) rather than inside the note's Markdown source.
 */
export interface InkPage {
	version: 1;
	createdAt: number;
	updatedAt: number;
	width: number;
	height: number;
	strokes: Stroke[];
}

export function createEmptyInkPage(width: number, height: number): InkPage {
	const now = Date.now();
	return {
		version: 1,
		createdAt: now,
		updatedAt: now,
		width,
		height,
		strokes: [],
	};
}
