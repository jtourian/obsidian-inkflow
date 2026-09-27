import { RecognitionIssue } from "../../model/types";

/**
 * Checks LaTeX/Markdown *structure* only (unbalanced braces, unclosed
 * delimiters, malformed \frac, etc). Never judges mathematical truth —
 * "d/dx sin x = sin x" is structurally valid LaTeX and must NOT be flagged
 * here, even though it's mathematically wrong. That distinction belongs to
 * a future math-validity checker, kept as a separate issue category.
 */

let issueCounter = 0;
function nextIssueId(): string {
	issueCounter += 1;
	return `issue-${Date.now()}-${issueCounter}`;
}

function checkBalancedDelimiters(text: string, open: string, close: string, label: string): RecognitionIssue | null {
	let depth = 0;
	for (const ch of text) {
		if (ch === open) depth++;
		else if (ch === close) depth--;
		if (depth < 0) break;
	}
	if (depth !== 0) {
		return {
			id: nextIssueId(),
			category: "math-structure",
			message: `Unbalanced ${label} in the recognized text.`,
			recognized: text,
			candidates: [],
			resolved: false,
		};
	}
	return null;
}

export function validateMathStructure(markdown: string): RecognitionIssue[] {
	const issues: RecognitionIssue[] = [];

	const braces = checkBalancedDelimiters(markdown, "{", "}", "braces { }");
	if (braces) issues.push(braces);

	const parens = checkBalancedDelimiters(markdown, "(", ")", "parentheses ( )");
	if (parens) issues.push(parens);

	const dollarCount = (markdown.match(/(?<!\\)\$/g) || []).length;
	if (dollarCount % 2 !== 0) {
		issues.push({
			id: nextIssueId(),
			category: "math-structure",
			message: "Odd number of unescaped '$' delimiters — a math region may not be closed.",
			recognized: markdown,
			candidates: [],
			resolved: false,
		});
	}

	const fracMatches = markdown.match(/\\frac(?![{\\])/g);
	if (fracMatches) {
		issues.push({
			id: nextIssueId(),
			category: "math-structure",
			message: "'\\frac' found without the expected '{numerator}{denominator}' braces.",
			recognized: markdown,
			candidates: [],
			resolved: false,
		});
	}

	return issues;
}
