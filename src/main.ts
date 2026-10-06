import { FileView, moment, Notice, Plugin, TFile } from "obsidian";
import { DEFAULT_SETTINGS, InkflowSettings } from "./settings/InkflowSettings";
import { InkflowSettingTab } from "./settings/SettingsTab";
import { InkCanvasView, INKFLOW_VIEW_TYPE } from "./view/InkCanvasView";
import { ensureInkflowFlag } from "./storage/noteBody";
import { renameSidecar } from "./storage/sidecar";

export default class InkflowPlugin extends Plugin {
	settings: InkflowSettings = DEFAULT_SETTINGS;

	async onload() {
		await this.loadSettings();

		this.addSettingTab(new InkflowSettingTab(this.app, this));

		this.registerView(INKFLOW_VIEW_TYPE, (leaf) => new InkCanvasView(leaf, this));

		this.registerEvent(
			this.app.vault.on("rename", (file, oldPath) => {
				if (file instanceof TFile && file.extension === "md") {
					void renameSidecar(this.app, oldPath, file.path);
				}
			}),
		);

		this.addCommand({
			id: "toggle-handwriting-mode",
			name: "Toggle handwriting mode for this note",
			checkCallback: (checking: boolean) => {
				const file = this.app.workspace.getActiveFile();
				if (!file || file.extension !== "md") return false;
				if (!checking) void this.toggleHandwritingMode(file);
				return true;
			},
		});

		this.addCommand({
			id: "new-handwriting-note",
			name: "New handwriting note",
			callback: () => void this.createHandwritingNote(),
		});

		this.addRibbonIcon("pencil", "Toggle handwriting mode", () => {
			const file = this.app.workspace.getActiveFile();
			if (file && file.extension === "md") void this.toggleHandwritingMode(file);
			else new Notice("inkflow: open a note first.");
		});
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	private async toggleHandwritingMode(file: TFile) {
		const leaf = this.app.workspace.getActiveViewOfType(FileView)?.leaf ?? this.app.workspace.getLeaf(false);

		if (leaf.view instanceof InkCanvasView) {
			// Flush strokes to the sidecar before asking Obsidian to swap the
			// view type — don't rely on onClose/onUnloadFile saving in time.
			await leaf.view.saveNow();
			await leaf.setViewState({ type: "markdown", state: { file: file.path } });
			return;
		}

		await ensureInkflowFlag(this.app, file);
		await leaf.setViewState({ type: INKFLOW_VIEW_TYPE, state: { file: file.path } });
	}

	private async createHandwritingNote() {
		const name = `Handwriting ${moment().format("YYYY-MM-DD HHmmss")}.md`;
		const file = await this.app.vault.create(name, "---\ninkflow: true\n---\n");
		const leaf = this.app.workspace.getLeaf(false);
		await leaf.setViewState({ type: INKFLOW_VIEW_TYPE, state: { file: file.path } });
	}

	onunload() {}
}
