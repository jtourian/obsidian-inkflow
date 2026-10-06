import { App, Notice, TFile } from "obsidian";
import { createEmptyInkPage, InkPage } from "../model/types";

/**
 * Ink strokes for a note live in a sidecar JSON file under this folder,
 * never inside the note's own Markdown source. This keeps the note itself
 * a plain, git-diffable text file — the note's frontmatter only carries a
 * flag (`inkflow: true`) saying a sidecar exists.
 *
 * Folder name starts with "." so Obsidian's file explorer hides it, the
 * same way it already hides ".obsidian".
 */
const SIDECAR_DIR = ".inkflow";

export function sidecarPath(notePath: string): string {
	const safe = notePath.replace(/\//g, "__");
	return `${SIDECAR_DIR}/${safe}.json`;
}

async function ensureSidecarDir(app: App): Promise<void> {
	if (app.vault.getAbstractFileByPath(SIDECAR_DIR)) return;
	try {
		await app.vault.createFolder(SIDECAR_DIR);
	} catch (err) {
		// Another caller may have just created it (e.g. a parallel toggle) — ignore.
	}
}

export async function loadInkPage(app: App, file: TFile, defaultWidth: number, defaultHeight: number): Promise<InkPage> {
	const path = sidecarPath(file.path);
	const existing = app.vault.getAbstractFileByPath(path);
	if (existing instanceof TFile) {
		try {
			const text = await app.vault.read(existing);
			return JSON.parse(text) as InkPage;
		} catch (err) {
			console.error("inkflow: failed to read sidecar, starting with a blank page", err);
			new Notice("inkflow: couldn't read this note's saved handwriting — starting with a blank page. See console for details.");
		}
	}
	return createEmptyInkPage(defaultWidth, defaultHeight);
}

export async function saveInkPage(app: App, file: TFile, page: InkPage): Promise<void> {
	await ensureSidecarDir(app);
	const path = sidecarPath(file.path);
	const text = JSON.stringify(page);
	const existing = app.vault.getAbstractFileByPath(path);
	if (existing instanceof TFile) {
		await app.vault.modify(existing, text);
		return;
	}
	try {
		await app.vault.create(path, text);
	} catch (err) {
		// Another concurrent save may have just created it — fall back to modify
		// rather than losing this write.
		const createdByOther = app.vault.getAbstractFileByPath(path);
		if (createdByOther instanceof TFile) {
			await app.vault.modify(createdByOther, text);
			return;
		}
		throw err;
	}
}

/** Keeps a note's sidecar attached to it when the note is renamed or moved. */
export async function renameSidecar(app: App, oldNotePath: string, newNotePath: string): Promise<void> {
	const oldPath = sidecarPath(oldNotePath);
	const existing = app.vault.getAbstractFileByPath(oldPath);
	if (!(existing instanceof TFile)) return;
	await ensureSidecarDir(app);
	const newPath = sidecarPath(newNotePath);
	await app.vault.rename(existing, newPath);
}
