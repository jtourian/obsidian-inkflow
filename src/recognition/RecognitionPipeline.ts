import { IRecognizer, RecognitionInput } from "./IRecognizer";
import { RecognitionResult } from "../model/types";
import { detectOcrAmbiguity } from "./issues/OcrAmbiguityDetector";
import { checkContextConsistency } from "./issues/ContextConsistencyChecker";
import { validateMathStructure } from "./issues/MathStructureValidator";

/**
 * OCR (via IRecognizer) -> literal transcription -> issue detection.
 * Never rewrites the recognizer's literal output; only annotates it with
 * issues for the user to resolve via the confirmation UI.
 */
export class RecognitionPipeline {
	constructor(private recognizer: IRecognizer) {}

	async run(input: RecognitionInput): Promise<RecognitionResult> {
		const result = await this.recognizer.recognize(input);

		for (const segment of result.segments) {
			segment.issues = [
				...detectOcrAmbiguity(segment.markdown),
				...checkContextConsistency(segment.markdown),
				...validateMathStructure(segment.markdown),
			];
		}

		return result;
	}
}
