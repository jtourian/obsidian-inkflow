import { App, PluginSettingTab, Setting } from "obsidian";
import { InkflowSettings } from "./InkflowSettings";
import { DEFAULT_GEMINI_MODEL } from "../recognition/GeminiRecognizer";

export interface InkflowSettingsHost {
	settings: InkflowSettings;
	saveSettings(): Promise<void>;
}

export class InkflowSettingTab extends PluginSettingTab {
	constructor(app: App, private plugin: InkflowSettingsHost) {
		super(app, plugin as any);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("h2", { text: "InkFlow settings" });

		new Setting(containerEl)
			.setName("Gemini API key")
			.setDesc("Used to recognize handwriting into Markdown/LaTeX. Stored in this vault's plugin data.")
			.addText((text) =>
				text
					.setPlaceholder("API key")
					.setValue(this.plugin.settings.geminiApiKey)
					.onChange(async (value) => {
						this.plugin.settings.geminiApiKey = value.trim();
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Gemini model")
			.setDesc(`Model id used for recognition. Google occasionally retires models; if Recognize starts returning 404, check the error message for the replacement model name and update this field. Default: ${DEFAULT_GEMINI_MODEL}`)
			.addText((text) =>
				text
					.setPlaceholder(DEFAULT_GEMINI_MODEL)
					.setValue(this.plugin.settings.geminiModel)
					.onChange(async (value) => {
						this.plugin.settings.geminiModel = value.trim() || DEFAULT_GEMINI_MODEL;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Default canvas height (px)")
			.setDesc("Height of a newly inserted handwriting region.")
			.addText((text) =>
				text
					.setPlaceholder("400")
					.setValue(String(this.plugin.settings.canvasHeight))
					.onChange(async (value) => {
						const n = Number(value);
						if (!Number.isNaN(n) && n > 0) {
							this.plugin.settings.canvasHeight = n;
							await this.plugin.saveSettings();
						}
					}),
			);

		new Setting(containerEl)
			.setName("Force uncompressed markers (debug)")
			.setDesc("Skip gzip compression when embedding handwriting data in notes. Useful for testing the fallback path used on runtimes without CompressionStream support.")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.forceUncompressedMarkers).onChange(async (value) => {
					this.plugin.settings.forceUncompressedMarkers = value;
					await this.plugin.saveSettings();
				}),
			);
	}
}
