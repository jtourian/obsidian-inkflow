import { Stroke, StrokePoint } from "../model/types";

/**
 * Wraps the W3C Pointer Events API so the rest of the plugin never touches
 * a raw PointerEvent. Platform-specific quirks (missing pressure on some
 * Android stylus/driver combos, palm-rejection heuristics, etc.) get
 * patched here, not in the canvas or storage layers.
 */

export type StrokeStartHandler = (stroke: Stroke) => void;
export type StrokeUpdateHandler = (stroke: Stroke) => void;
export type StrokeEndHandler = (stroke: Stroke) => void;

export interface PointerInputAdapterOptions {
	el: HTMLElement;
	color: string;
	width: number;
	/** Ignore touch input while a pen is in use / has been recently used (palm rejection). */
	palmRejection?: boolean;
	onStrokeStart?: StrokeStartHandler;
	onStrokeUpdate?: StrokeUpdateHandler;
	onStrokeEnd?: StrokeEndHandler;
}

const DEFAULT_PRESSURE = 0.5;
const PALM_REJECTION_WINDOW_MS = 500;

let strokeCounter = 0;
function nextStrokeId(): string {
	strokeCounter += 1;
	return `stroke-${Date.now()}-${strokeCounter}`;
}

export class PointerInputAdapter {
	private el: HTMLElement;
	private options: PointerInputAdapterOptions;
	private activeStroke: Stroke | null = null;
	private activePointerId: number | null = null;
	private lastPenActivityAt = 0;
	private regionStart = 0;

	constructor(options: PointerInputAdapterOptions) {
		this.el = options.el;
		this.options = options;
		this.regionStart = Date.now();
		this.attach();
	}

	private attach() {
		this.el.style.touchAction = "none";
		this.el.addEventListener("pointerdown", this.handlePointerDown);
		this.el.addEventListener("pointermove", this.handlePointerMove);
		this.el.addEventListener("pointerup", this.handlePointerUp);
		this.el.addEventListener("pointercancel", this.handlePointerUp);
		this.el.addEventListener("pointerleave", this.handlePointerUp);
	}

	destroy() {
		this.el.removeEventListener("pointerdown", this.handlePointerDown);
		this.el.removeEventListener("pointermove", this.handlePointerMove);
		this.el.removeEventListener("pointerup", this.handlePointerUp);
		this.el.removeEventListener("pointercancel", this.handlePointerUp);
		this.el.removeEventListener("pointerleave", this.handlePointerUp);
	}

	private toPointerType(raw: string): "pen" | "touch" | "mouse" {
		if (raw === "pen") return "pen";
		if (raw === "touch") return "touch";
		return "mouse";
	}

	private handlePointerDown = (e: PointerEvent) => {
		const pointerType = this.toPointerType(e.pointerType);

		if (pointerType === "pen") {
			this.lastPenActivityAt = Date.now();
		}

		if (
			this.options.palmRejection &&
			pointerType === "touch" &&
			Date.now() - this.lastPenActivityAt < PALM_REJECTION_WINDOW_MS
		) {
			// Likely a palm resting on the surface while writing with a pen.
			return;
		}

		if (this.activeStroke) return; // already drawing (ignore multi-touch for now)

		this.activePointerId = e.pointerId;
		this.el.setPointerCapture(e.pointerId);

		const point = this.toStrokePoint(e);
		this.activeStroke = {
			id: nextStrokeId(),
			pointerType,
			points: [point],
			color: this.options.color,
			width: this.options.width,
		};
		this.options.onStrokeStart?.(this.activeStroke);
	};

	private handlePointerMove = (e: PointerEvent) => {
		if (!this.activeStroke || e.pointerId !== this.activePointerId) return;

		const events: PointerEvent[] =
			typeof e.getCoalescedEvents === "function" ? e.getCoalescedEvents() : [e];
		for (const ce of events.length ? events : [e]) {
			this.activeStroke.points.push(this.toStrokePoint(ce));
		}
		this.options.onStrokeUpdate?.(this.activeStroke);
	};

	private handlePointerUp = (e: PointerEvent) => {
		if (!this.activeStroke || e.pointerId !== this.activePointerId) return;
		const finished = this.activeStroke;
		this.activeStroke = null;
		this.activePointerId = null;
		this.options.onStrokeEnd?.(finished);
	};

	private toStrokePoint(e: PointerEvent): StrokePoint {
		const rect = this.el.getBoundingClientRect();
		const pressure = e.pressure > 0 ? e.pressure : DEFAULT_PRESSURE;
		return {
			x: e.clientX - rect.left,
			y: e.clientY - rect.top,
			pressure,
			tiltX: e.tiltX,
			tiltY: e.tiltY,
			t: Date.now() - this.regionStart,
		};
	}
}
