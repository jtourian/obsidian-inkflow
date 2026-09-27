import { RecognitionIssue } from "../../model/types";

/**
 * Detects notation that's inconsistent with itself within the same region
 * (e.g. a differential variable that changes mid-expression). This is a
 * hint for the user to check, never an automatic correction.
 */

let issueCounter = 0;
function nextIssueId(): string {
	issueCounter += 1;
	return `issue-${Date.now()}-${issueCounter}`;
}

export function checkContextConsistency(markdown: string): RecognitionIssue[] {
	const issues: RecognitionIssue[] = [];

	const differentials = Array.from(markdown.matchAll(/\bd([a-zA-Z\\]+)/g)).map((m) => m[1]);
	const uniqueDifferentials = new Set(differentials);
	if (uniqueDifferentials.size > 1) {
		issues.push({
			id: nextIssueId(),
			category: "context-inconsistency",
			message: `Multiple differential variables found in the same region (${Array.from(uniqueDifferentials).join(", ")}). Confirm this is intentional.`,
			recognized: markdown,
			candidates: [],
			resolved: false,
		});
	}

	return issues;
}
