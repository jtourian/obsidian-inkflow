import { DEFAULT_GEMINI_MODEL } from "../recognition/GeminiRecognizer";

export interface InkflowSettings {
	geminiApiKey: string;
	geminiModel: string;
	canvasHeight: number;
	/** QA/debug: force the uncompressed marker fallback path even when CompressionStream is available. */
	forceUncompressedMarkers: boolean;
}

export const DEFAULT_SETTINGS: InkflowSettings = {
	geminiApiKey: "",
	geminiModel: DEFAULT_GEMINI_MODEL,
	canvasHeight: 400,
	forceUncompressedMarkers: false,
};
