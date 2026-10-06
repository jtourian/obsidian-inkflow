import { InkPage, Stroke } from "../model/types";
import { PointerInputAdapter } from "../input/PointerInputAdapter";

/**
 * Plain Canvas2D renderer for a note's full-page ink layer. Deliberately
 * has no dependency on a third-party canvas framework so we keep full
 * control over stylus-specific behavior (see Ink's tldraw-coupling risk).
 */
export class HandwritingCanvas {
	readonly containerEl: HTMLElement;
	private canvasEl: HTMLCanvasElement;
	private ctx: CanvasRenderingContext2D;
	private adapter: PointerInputAdapter;
	private region: InkPage;
	private onChange: (region: InkPage) => void;
	private dpr = window.devicePixelRatio || 1;
	private activeStroke: Stroke | null = null;

	constructor(containerEl: HTMLElement, region: InkPage, onChange: (region: InkPage) => void) {
		this.containerEl = containerEl;
		this.region = region;
		this.onChange = onChange;

		this.canvasEl = containerEl.createEl("canvas", { cls: "inkflow-canvas" });
		const ctx = this.canvasEl.getContext("2d");
		if (!ctx) throw new Error("inkflow: 2D canvas context unavailable");
		this.ctx = ctx;

		this.resize(region.width, region.height);
		this.redraw();

		this.adapter = new PointerInputAdapter({
			el: this.canvasEl,
			color: "var(--text-normal)",
			width: 2.5,
			palmRejection: true,
			onStrokeStart: (stroke) => {
				this.activeStroke = stroke;
				this.redraw();
			},
			onStrokeUpdate: (stroke) => {
				this.activeStroke = stroke;
				this.redraw();
			},
			onStrokeEnd: (stroke) => {
				this.activeStroke = null;
				this.commitStroke(stroke);
			},
		});
	}

	private resize(width: number, height: number) {
		this.canvasEl.width = width * this.dpr;
		this.canvasEl.height = height * this.dpr;
		this.canvasEl.style.width = `${width}px`;
		this.canvasEl.style.height = `${height}px`;
		this.ctx.scale(this.dpr, this.dpr);
	}

	private commitStroke(stroke: Stroke) {
		this.region.strokes.push(stroke);
		this.region.updatedAt = Date.now();
		this.redraw();
		this.onChange(this.region);
	}

	redraw() {
		const c = this.ctx;
		c.clearRect(0, 0, this.region.width, this.region.height);
		const resolvedColor = getComputedStyle(this.containerEl).getPropertyValue("--text-normal") || "#000";
		for (const stroke of this.region.strokes) {
			if (stroke.erased) continue;
			this.paintStroke(stroke, resolvedColor);
		}
		if (this.activeStroke) {
			this.paintStroke(this.activeStroke, resolvedColor);
		}
	}

	private paintStroke(stroke: Stroke, fallbackColor: string) {
		const c = this.ctx;
		if (stroke.points.length < 2) return;
		c.lineCap = "round";
		c.lineJoin = "round";
		c.strokeStyle = fallbackColor;
		for (let i = 1; i < stroke.points.length; i++) {
			const p0 = stroke.points[i - 1];
			const p1 = stroke.points[i];
			c.lineWidth = stroke.width * (0.4 + p1.pressure);
			c.beginPath();
			c.moveTo(p0.x, p0.y);
			c.lineTo(p1.x, p1.y);
			c.stroke();
		}
	}

	/** Rasterize the region to a PNG data URL for sending to a recognizer. */
	toPngDataUrl(): string {
		return this.canvasEl.toDataURL("image/png");
	}

	clear() {
		this.region.strokes = [];
		this.region.updatedAt = Date.now();
		this.redraw();
		this.onChange(this.region);
	}

	getPage(): InkPage {
		return this.region;
	}

	isEmpty(): boolean {
		return this.region.strokes.length === 0;
	}

	destroy() {
		this.adapter.destroy();
		this.canvasEl.remove();
	}
}
