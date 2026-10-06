import { App, TFile } from "obsidian";

const FRONTMATTER_RE = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/;

/** Marks a note as having an InkFlow ink layer, without touching its body. */
export async function ensureInkflowFlag(app: App, file: TFile): Promise<void> {
	await app.fileManager.processFrontMatter(file, (fm) => {
		fm.inkflow = true;
	});
}

/** Replaces everything after the frontmatter block with `newBody`, leaving frontmatter untouched. */
export async function replaceNoteBody(app: App, file: TFile, newBody: string): Promise<void> {
	await app.vault.process(file, (data) => {
		const match = FRONTMATTER_RE.exec(data);
		const frontmatter = match ? match[0] : "";
		return frontmatter + newBody.trim() + "\n";
	});
}
