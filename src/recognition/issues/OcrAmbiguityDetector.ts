import { RecognitionIssue } from "../../model/types";

/**
 * Flags characters/tokens that are commonly confused by handwriting OCR
 * (visual lookalikes), distinct from context or math-structure problems.
 * This is a lightweight MVP heuristic scan over the model's own output;
 * it does not re-run OCR or compare against the source image.
 */

let issueCounter = 0;
function nextIssueId(): string {
	issueCounter += 1;
	return `issue-${Date.now()}-${issueCounter}`;
}

const CONFUSABLE_GROUPS: { pattern: RegExp; candidates: string[]; note: string }[] = [
	{ pattern: /\bO\b/g, candidates: ["0"], note: "'O' (letter) vs '0' (zero)" },
	{ pattern: /(?<![A-Za-z\\])l(?![A-Za-z])/g, candidates: ["1", "I"], note: "'l' vs '1' vs 'I'" },
	{ pattern: /\\alpha/g, candidates: ["a"], note: "'\\alpha' vs 'a'" },
	{ pattern: /\\beta/g, candidates: ["B"], note: "'\\beta' vs 'B'" },
	{ pattern: /d\\alpha\b/g, candidates: ["dx", "d\\theta"], note: "'d\\alpha' vs a differential like 'dx'" },
];

export function detectOcrAmbiguity(markdown: string): RecognitionIssue[] {
	const issues: RecognitionIssue[] = [];

	for (const group of CONFUSABLE_GROUPS) {
		const matches = markdown.match(group.pattern);
		if (matches && matches.length > 0) {
			issues.push({
				id: nextIssueId(),
				category: "ocr-ambiguity",
				message: `Possible OCR ambiguity: ${group.note}.`,
				recognized: matches[0],
				candidates: group.candidates,
				resolved: false,
			});
		}
	}

	return issues;
}
