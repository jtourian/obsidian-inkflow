import { FileView, Notice, TFile, WorkspaceLeaf } from "obsidian";
import { HandwritingCanvas } from "../canvas/HandwritingCanvas";
import { RecognitionIssue } from "../model/types";
import { GeminiRecognizer } from "../recognition/GeminiRecognizer";
import { RecognitionPipeline } from "../recognition/RecognitionPipeline";
import { loadInkPage, saveInkPage } from "../storage/sidecar";
import { replaceNoteBody } from "../storage/noteBody";
import { ConfirmationModal } from "../ui/ConfirmationModal";
import { InkflowSettings } from "../settings/InkflowSettings";

export const INKFLOW_VIEW_TYPE = "inkflow-canvas-view";

export interface InkflowViewHost {
	settings: InkflowSettings;
}

/**
 * Full-page ink view for a note. Strokes are persisted to the note's
 * sidecar (see storage/sidecar.ts) in real time — every stroke is written
 * to disk as soon as it's committed, no debounce — so there's no window
 * where a toggle to Markdown mode can race an unsaved stroke. Writes are
 * chained onto `saveQueue` so two strokes committed close together don't
 * race each other as concurrent create/modify calls.
 *
 * The note's own Markdown body is only touched when the user explicitly
 * converts the page.
 */
export class InkCanvasView extends FileView {
	private plugin: InkflowViewHost;
	private canvas: HandwritingCanvas | null = null;
	private statusEl: HTMLElement | null = null;
	private convertBtn: HTMLButtonElement | null = null;
	private saveQueue: Promise<void> = Promise.resolve();

	constructor(leaf: WorkspaceLeaf, plugin: InkflowViewHost) {
		super(leaf);
		this.plugin = plugin;
		this.icon = "pencil";
	}

	getViewType(): string {
		return INKFLOW_VIEW_TYPE;
	}

	getDisplayText(): string {
		return this.file?.basename ?? "InkFlow";
	}

	canAcceptExtension(extension: string): boolean {
		return extension === "md";
	}

	async onLoadFile(file: TFile): Promise<void> {
		this.canvas?.destroy();
		this.canvas = null;

		this.contentEl.empty();
		this.contentEl.addClass("inkflow-view");

		const toolbar = this.contentEl.createDiv({ cls: "inkflow-view-toolbar" });
		const clearBtn = toolbar.createEl("button", { text: "Clear page" });
		const convertBtn = toolbar.createEl("button", { text: "Convert page", cls: "mod-cta" });
		const markdownBtn = toolbar.createEl("button", { text: "View as Markdown" });
		this.statusEl = toolbar.createSpan({ cls: "inkflow-status" });
		this.convertBtn = convertBtn;

		const scrollEl = this.contentEl.createDiv({ cls: "inkflow-view-scroll" });
		const canvasContainer = scrollEl.createDiv({ cls: "inkflow-canvas-container" });

		const page = await loadInkPage(this.app, file, this.plugin.settings.pageWidth, this.plugin.settings.pageHeight);

		this.canvas = new HandwritingCanvas(canvasContainer, page, () => {
			this.queueSave(file);
		});

		clearBtn.onclick = () => {
			this.canvas?.clear();
			this.queueSave(file);
		};

		markdownBtn.onclick = () => {
			void (async () => {
				// Wait for every queued stroke write to land before asking
				// Obsidian to swap the view type.
				await this.saveQueue;
				await this.leaf.setViewState({ type: "markdown", state: { file: file.path } });
			})();
		};

		convertBtn.onclick = () => void this.convert(file);
	}

	/** Waits for every stroke write queued so far to land on disk. Exposed so
	 * callers that are about to switch this leaf away from the ink view
	 * (e.g. the plugin's "Toggle handwriting mode" command) can await it
	 * first. */
	async saveNow(): Promise<void> {
		await this.saveQueue;
	}

	async onUnloadFile(_file: TFile): Promise<void> {
		await this.saveQueue;
		this.canvas?.destroy();
		this.canvas = null;
	}

	async onClose(): Promise<void> {
		await this.saveQueue;
		this.canvas?.destroy();
		this.canvas = null;
	}

	/** Queues an immediate, serialized write of the current page to the
	 * sidecar. Chaining onto `saveQueue` (rather than firing independent
	 * writes) means two strokes committed back-to-back can't race each
	 * other as concurrent create/modify calls. */
	private queueSave(file: TFile) {
		const page = this.canvas?.getPage();
		if (!page) return;
		this.saveQueue = this.saveQueue.then(async () => {
			try {
				await saveInkPage(this.app, file, page);
				this.statusEl?.setText(`Saved ${new Date().toLocaleTimeString()}`);
			} catch (err) {
				console.error("inkflow: failed to save ink page", err);
				new Notice(`inkflow: failed to save handwriting for "${file.basename}" — ${(err as Error).message}`);
			}
		});
	}

	private async convert(file: TFile): Promise<void> {
		if (!this.canvas || !this.statusEl || !this.convertBtn) return;
		if (this.canvas.isEmpty()) {
			new Notice("inkflow: nothing to convert — write something first.");
			return;
		}

		this.statusEl.setText("Recognizing…");
		this.convertBtn.disabled = true;
		try {
			const imageDataUrl = this.canvas.toPngDataUrl();
			const recognizer = new GeminiRecognizer(
				() => this.plugin.settings.geminiApiKey,
				() => this.plugin.settings.geminiModel,
			);
			const pipeline = new RecognitionPipeline(recognizer);
			const result = await pipeline.run({ imageDataUrl });
			const allIssues: RecognitionIssue[] = result.segments.flatMap((s) => s.issues);

			const applyResult = async () => {
				await replaceNoteBody(this.app, file, result.markdown);
				this.statusEl!.setText("Converted.");
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
			this.statusEl.setText("Recognition failed.");
			new Notice(`inkflow: recognition failed — ${(err as Error).message}`);
		} finally {
			this.convertBtn.disabled = false;
		}
	}
}
