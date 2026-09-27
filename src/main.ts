import { Editor, MarkdownPostProcessorContext, MarkdownRenderChild, MarkdownView, Notice, Plugin, TFile } from "obsidian";
import { DEFAULT_SETTINGS, InkflowSettings } from "./settings/InkflowSettings";
import { InkflowSettingTab } from "./settings/SettingsTab";
import { HandwritingCanvas } from "./canvas/HandwritingCanvas";
import { createEmptyRegion, HandwritingRegion, RecognitionIssue } from "./model/types";
import { GeminiRecognizer } from "./recognition/GeminiRecognizer";
import { RecognitionPipeline } from "./recognition/RecognitionPipeline";
import { ConfirmationModal } from "./ui/ConfirmationModal";
import * as InkflowMarker from "./storage/InkflowMarker";
import { inkflowMarkerHiderExtension } from "./editor/hideMarkerExtension";

let regionCounter = 0;
function nextRegionId(): string {
	regionCounter += 1;
	return `region-${Date.now()}-${regionCounter}`;
}

/** Owns the live HandwritingCanvas mounted for a block; destroys it when Obsidian tears down the DOM node. */
class HandwritingBlockChild extends MarkdownRenderChild {
	constructor(containerEl: HTMLElement, private canvas: HandwritingCanvas) {
		super(containerEl);
	}
	onunload() {
		this.canvas.destroy();
	}
}

export default class InkflowPlugin extends Plugin {
	settings: InkflowSettings = DEFAULT_SETTINGS;
	private handwritingModeNotes = new Set<string>();

	async onload() {
		await this.loadSettings();

		this.addSettingTab(new InkflowSettingTab(this.app, this));
		this.registerEditorExtension(inkflowMarkerHiderExtension);

		this.registerMarkdownPostProcessor((el, ctx) => {
			this.processMarkdownBlock(el, ctx);
		});

		this.addCommand({
			id: "insert-handwriting-region",
			name: "Insert handwriting region",
			editorCallback: (editor: Editor) => {
				const file = this.app.workspace.getActiveFile();
				if (file) void this.insertNewRegion(editor, file);
			},
		});

		this.addCommand({
			id: "toggle-handwriting-mode",
			name: "Toggle handwriting mode for this note",
			checkCallback: (checking: boolean) => {
				const file = this.app.workspace.getActiveFile();
				if (!file) return false;
				if (!checking) this.toggleHandwritingMode(file);
				return true;
			},
		});

		this.addRibbonIcon("pencil", "Toggle handwriting mode", () => {
			const file = this.app.workspace.getActiveFile();
			if (file) this.toggleHandwritingMode(file);
		});
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	private toggleHandwritingMode(file: TFile) {
		if (this.handwritingModeNotes.has(file.path)) {
			this.handwritingModeNotes.delete(file.path);
		} else {
			this.handwritingModeNotes.add(file.path);
		}
		this.rerenderActiveMarkdownView();
	}

	private rerenderActiveMarkdownView() {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view) return;
		if (view.getMode() !== "preview") {
			new Notice("inkflow: switch to Reading view to see handwriting mode.");
		}
		view.previewMode.rerender(true);
	}

	private async insertNewRegion(editor: Editor, file: TFile) {
		const region = createEmptyRegion(nextRegionId(), 600, this.settings.canvasHeight);
		const markerText = await InkflowMarker.encode(region, {
			forceUncompressed: this.settings.forceUncompressedMarkers,
		});
		editor.replaceSelection(`\n${markerText}\n`);

		this.handwritingModeNotes.add(file.path);
		this.rerenderActiveMarkdownView();
	}

	private processMarkdownBlock(el: HTMLElement, ctx: MarkdownPostProcessorContext) {
		const file = this.app.vault.getAbstractFileByPath(ctx.sourcePath);
		if (!(file instanceof TFile)) return;
		if (!this.handwritingModeNotes.has(file.path)) return; // Markdown mode: leave rendering untouched

		const section = ctx.getSectionInfo(el);
		if (!section) return;

		const match = InkflowMarker.MARKER_RE.exec(section.text);
		if (!match) return; // ordinary block, no handwriting marker

		void this.mountHandwritingBlock(el, file, ctx, match[0]);
	}

	private async mountHandwritingBlock(el: HTMLElement, file: TFile, ctx: MarkdownPostProcessorContext, oldMarkerText: string) {
		const region = await InkflowMarker.decode(oldMarkerText);
		if (!region) {
			el.createDiv({ text: "inkflow: failed to decode handwriting data for this block." });
			return;
		}

		el.empty();
		const wrapper = el.createDiv({ cls: "inkflow-region" });
		const toolbar = wrapper.createDiv({ cls: "inkflow-toolbar" });
		const canvasContainer = wrapper.createDiv({ cls: "inkflow-canvas-container" });

		const canvas = new HandwritingCanvas(canvasContainer, region, () => {
			// Strokes only need to be persisted to the note when the user clicks
			// Recognize — there's no sidecar to keep in sync on every stroke anymore.
		});
		ctx.addChild(new HandwritingBlockChild(el, canvas));

		const recognizeBtn = toolbar.createEl("button", { text: "Recognize" });
		const clearBtn = toolbar.createEl("button", { text: "Clear" });
		const statusEl = toolbar.createSpan({ cls: "inkflow-status" });

		clearBtn.onclick = () => canvas.clear();

		recognizeBtn.onclick = async () => {
			if (region.strokes.length === 0) {
				new Notice("inkflow: nothing to recognize — write something first.");
				return;
			}
			statusEl.setText("Recognizing…");
			recognizeBtn.disabled = true;
			try {
				const imageDataUrl = canvas.toPngDataUrl();
				const recognizer = new GeminiRecognizer(
					() => this.settings.geminiApiKey,
					() => this.settings.geminiModel,
				);
				const pipeline = new RecognitionPipeline(recognizer);
				const result = await pipeline.run({ imageDataUrl });
				const allIssues: RecognitionIssue[] = result.segments.flatMap((s) => s.issues);

				const applyResult = async () => {
					region.recognizedMarkdown = result.markdown;
					region.updatedAt = Date.now();

					const wrote = await this.writeRegionBack(file, oldMarkerText, region, result.markdown);
					if (wrote) {
						statusEl.setText("Recognized.");
						// Exit handwriting mode so the freshly-written marker isn't
						// immediately re-mounted as a fresh (blank-looking) canvas by
						// this same post-processor pass.
						this.handwritingModeNotes.delete(file.path);
						this.rerenderActiveMarkdownView();
					} else {
						statusEl.setText("Recognition failed to save — see notice.");
					}
				};

				if (allIssues.length > 0) {
					new ConfirmationModal(this.app, allIssues, async () => {
						await applyResult();
					}).open();
				} else {
					await applyResult();
				}
			} catch (err) {
				console.error("inkflow: recognition failed", err);
				statusEl.setText("Recognition failed.");
				new Notice(`inkflow: recognition failed — ${(err as Error).message}`);
			} finally {
				recognizeBtn.disabled = false;
			}
		};
	}

	/**
	 * Replaces the exact old marker substring with the new text+marker.
	 * Finding the old marker by its literal text (rather than by line-number
	 * splicing) sidesteps any ambiguity in how Obsidian's block parser groups
	 * the recognized text and its trailing HTML comment into sections — the
	 * old marker's hex payload is unique enough to locate unambiguously.
	 *
	 * If the note is currently open in an editor, write through the Editor
	 * API (`replaceRange`) rather than `vault.process` (a direct disk write).
	 * Writing straight to disk while the same file is open live races
	 * against Obsidian's own editor state for that file — this was observed
	 * to intermittently glue the recognized text and the marker onto the
	 * same line with no separating newline, non-deterministically, because
	 * the editor's in-memory buffer and the on-disk write could interleave.
	 * Going through the open editor keeps a single source of truth.
	 *
	 * Returns true if the write succeeded, false if it was aborted because the
	 * note changed underneath us (old marker no longer found).
	 */
	private async writeRegionBack(
		file: TFile,
		oldMarkerText: string,
		region: HandwritingRegion,
		recognizedMarkdown: string,
	): Promise<boolean> {
		const newMarkerText = await InkflowMarker.encode(region, {
			forceUncompressed: this.settings.forceUncompressedMarkers,
		});
		const replacement = `${recognizedMarkdown}\n${newMarkerText}`;

		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (activeView && activeView.file?.path === file.path) {
			const editor = activeView.editor;
			const content = editor.getValue();
			const idx = content.indexOf(oldMarkerText);
			if (idx === -1) {
				new Notice("inkflow: this note changed since the block was rendered — write aborted to avoid corrupting content. Please try Recognize again.");
				return false;
			}
			const from = editor.offsetToPos(idx);
			const to = editor.offsetToPos(idx + oldMarkerText.length);
			editor.replaceRange(replacement, from, to);
			return true;
		}

		let wrote = true;
		await this.app.vault.process(file, (data) => {
			const idx = data.indexOf(oldMarkerText);
			if (idx === -1) {
				wrote = false;
				return data;
			}
			return data.slice(0, idx) + replacement + data.slice(idx + oldMarkerText.length);
		});

		if (!wrote) {
			new Notice("inkflow: this note changed since the block was rendered — write aborted to avoid corrupting content. Please try Recognize again.");
		}
		return wrote;
	}

	onunload() {}
}
