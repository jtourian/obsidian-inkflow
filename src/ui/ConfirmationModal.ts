import { App, Modal } from "obsidian";
import { RecognitionIssue } from "../model/types";

const CATEGORY_LABEL: Record<RecognitionIssue["category"], string> = {
	"ocr-ambiguity": "OCR ambiguity",
	"context-inconsistency": "Context inconsistency",
	"math-structure": "Math structure",
	"math-validity": "Math validity (not automatically checked)",
};

/**
 * Shows only the issues flagged by the pipeline — never the full
 * recognized text — so the user isn't asked to confirm every character,
 * only what's genuinely uncertain.
 */
export class ConfirmationModal extends Modal {
	constructor(
		app: App,
		private issues: RecognitionIssue[],
		private onResolve: (resolved: RecognitionIssue[]) => void,
	) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.addClass("inkflow-confirmation-modal");
		contentEl.createEl("h2", { text: `${this.issues.length} item(s) to confirm` });

		for (const issue of this.issues) {
			const card = contentEl.createDiv({ cls: "inkflow-issue-card" });
			card.createEl("div", { cls: "inkflow-issue-category", text: CATEGORY_LABEL[issue.category] });
			card.createEl("div", { cls: "inkflow-issue-message", text: issue.message });
			card.createEl("div", { cls: "inkflow-issue-recognized", text: `Recognized: "${issue.recognized}"` });

			if (issue.candidates.length > 0) {
				const optionsEl = card.createDiv({ cls: "inkflow-issue-options" });
				const keepBtn = optionsEl.createEl("button", { text: `Keep "${issue.recognized}"` });
				keepBtn.onclick = () => {
					issue.resolved = true;
					issue.resolution = issue.recognized;
					card.addClass("inkflow-issue-resolved");
				};
				for (const candidate of issue.candidates) {
					const btn = optionsEl.createEl("button", { text: `Use "${candidate}"` });
					btn.onclick = () => {
						issue.resolved = true;
						issue.resolution = candidate;
						card.addClass("inkflow-issue-resolved");
					};
				}
			} else {
				const ackBtn = card.createEl("button", { text: "Acknowledge" });
				ackBtn.onclick = () => {
					issue.resolved = true;
					card.addClass("inkflow-issue-resolved");
				};
			}
		}

		const footer = contentEl.createDiv({ cls: "inkflow-modal-footer" });
		const doneBtn = footer.createEl("button", { text: "Apply and insert", cls: "mod-cta" });
		doneBtn.onclick = () => {
			this.onResolve(this.issues);
			this.close();
		};
	}

	onClose() {
		this.contentEl.empty();
	}
}
