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
			.setName("Page width (px)")
			.setDesc("Virtual size of a new note's ink canvas. The page scrolls if you write past it.")
			.addText((text) =>
				text
					.setPlaceholder("1400")
					.setValue(String(this.plugin.settings.pageWidth))
					.onChange(async (value) => {
						const n = Number(value);
						if (!Number.isNaN(n) && n > 0) {
							this.plugin.settings.pageWidth = n;
							await this.plugin.saveSettings();
						}
					}),
			);

		new Setting(containerEl)
			.setName("Page height (px)")
			.addText((text) =>
				text
					.setPlaceholder("1800")
					.setValue(String(this.plugin.settings.pageHeight))
					.onChange(async (value) => {
						const n = Number(value);
						if (!Number.isNaN(n) && n > 0) {
							this.plugin.settings.pageHeight = n;
							await this.plugin.saveSettings();
						}
					}),
			);
	}
}
