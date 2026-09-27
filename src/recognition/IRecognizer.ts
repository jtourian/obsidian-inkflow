import { RecognitionResult } from "../model/types";

export interface RecognitionInput {
	/** PNG data URL of the rasterized handwriting region. */
	imageDataUrl: string;
	/** Markdown already present around the region, for context (not sent for correction). */
	surroundingContext?: string;
}

/**
 * Strategy interface for handwriting -> Markdown/LaTeX recognition.
 * Implementations must return literal transcription only; contextual /
 * mathematical analysis happens downstream in RecognitionPipeline, not here.
 */
export interface IRecognizer {
	readonly id: string;
	readonly label: string;
	recognize(input: RecognitionInput): Promise<RecognitionResult>;
}
