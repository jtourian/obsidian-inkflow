/**
 * Core data model for a handwriting region.
 *
 * A region's strokes are the source of truth and are never deleted by
 * recognition. `recognizedMarkdown` is a derived, replaceable projection.
 */

export interface StrokePoint {
	x: number;
	y: number;
	pressure: number;
	tiltX?: number;
	tiltY?: number;
	t: number; // ms since region creation
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

export interface RegionRevision {
	timestamp: number;
	markdown: string;
	note?: string;
}

export interface HandwritingRegion {
	id: string;
	createdAt: number;
	updatedAt: number;
	width: number;
	height: number;
	strokes: Stroke[];
	recognizedMarkdown: string | null;
	segments: RecognitionSegment[];
	revisionHistory: RegionRevision[];
}

export function createEmptyRegion(id: string, width: number, height: number): HandwritingRegion {
	const now = Date.now();
	return {
		id,
		createdAt: now,
		updatedAt: now,
		width,
		height,
		strokes: [],
		recognizedMarkdown: null,
		segments: [],
		revisionHistory: [],
	};
}
