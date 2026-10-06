import { DEFAULT_GEMINI_MODEL } from "../recognition/GeminiRecognizer";

export interface InkflowSettings {
	geminiApiKey: string;
	geminiModel: string;
	/** Virtual page size for a new note's ink canvas, in px. Scrolls if content overflows. */
	pageWidth: number;
	pageHeight: number;
}

export const DEFAULT_SETTINGS: InkflowSettings = {
	geminiApiKey: "",
	geminiModel: DEFAULT_GEMINI_MODEL,
	pageWidth: 1400,
	pageHeight: 1800,
};
