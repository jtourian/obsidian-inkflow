import { requestUrl } from "obsidian";
import { IRecognizer, RecognitionInput } from "./IRecognizer";
import { RecognitionResult } from "../model/types";

// "flash-lite" tends to have far more spare capacity than the full "flash"
// models, so it's much less likely to return 503 (UNAVAILABLE / high demand).
export const DEFAULT_GEMINI_MODEL = "gemini-3.1-flash-lite";

/**
 * Literal-transcription prompt only. The model is explicitly told not to
 * "fix" content — correction/validation is a separate downstream concern
 * (see recognition/issues/*) so the AI never silently rewrites what the
 * user actually wrote.
 */
const SYSTEM_PROMPT = `You transcribe handwritten notes into Markdown and LaTeX.
Rules:
- Transcribe literally. Do not correct spelling, grammar, or mathematical errors.
- Preserve the exact symbols, variable names, and structure as written, even if they look mathematically inconsistent.
- Use LaTeX ($...$ inline, $$...$$ block) for mathematical notation.
- If a character is genuinely illegible or ambiguous (e.g. it could be "x" or a multiplication sign, "0" or "O"), transcribe your best guess and list alternatives separately — do not silently pick one.
- Output only the transcribed Markdown, with no commentary.`;

function extractText(json: any): string {
	const parts = json?.candidates?.[0]?.content?.parts;
	if (!Array.isArray(parts)) return "";
	return parts.map((p: any) => p.text ?? "").join("");
}

function dataUrlToBase64(dataUrl: string): { mimeType: string; base64: string } {
	const match = /^data:(.+);base64,(.*)$/.exec(dataUrl);
	if (!match) throw new Error("inkflow: unexpected image data URL format");
	return { mimeType: match[1], base64: match[2] };
}

const RETRYABLE_STATUSES = new Set([429, 503]);
const MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 1500;

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export class GeminiRecognizer implements IRecognizer {
	readonly id = "gemini";
	readonly label = "Google Gemini";

	constructor(
		private getApiKey: () => string,
		private getModel: () => string = () => DEFAULT_GEMINI_MODEL,
	) {}

	async recognize(input: RecognitionInput): Promise<RecognitionResult> {
		const apiKey = this.getApiKey();
		if (!apiKey) {
			throw new Error("inkflow: Gemini API key is not configured (Settings → InkFlow).");
		}
		const model = this.getModel() || DEFAULT_GEMINI_MODEL;

		const { mimeType, base64 } = dataUrlToBase64(input.imageDataUrl);
		const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

		const body = {
			contents: [
				{
					parts: [
						{ text: SYSTEM_PROMPT },
						...(input.surroundingContext
							? [{ text: `Surrounding note context (for reference only, do not transcribe):\n${input.surroundingContext}` }]
							: []),
						{ inlineData: { mimeType, data: base64 } },
					],
				},
			],
		};

		let response;
		let lastError: Error | null = null;
		for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
			response = await requestUrl({
				url,
				method: "POST",
				contentType: "application/json",
				body: JSON.stringify(body),
				throw: false,
			});

			if (response.status >= 200 && response.status < 300) {
				lastError = null;
				break;
			}

			const bodyText = response.text?.slice(0, 500) ?? "";
			console.error("inkflow: Gemini API error", response.status, bodyText, `attempt ${attempt}/${MAX_ATTEMPTS}`);
			lastError = new Error(`Gemini API error ${response.status}: ${bodyText || "(no response body)"}`);

			const canRetry = RETRYABLE_STATUSES.has(response.status) && attempt < MAX_ATTEMPTS;
			if (!canRetry) break;
			await sleep(RETRY_BASE_DELAY_MS * attempt);
		}

		if (lastError) throw lastError;

		const markdown = extractText(response!.json).trim();
		return {
			markdown,
			segments: [
				{
					id: "seg-0",
					markdown,
					alternatives: [],
					issues: [],
				},
			],
			raw: response!.json,
		};
	}
}
