import { EditorState, RangeSetBuilder } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView, PluginValue, ViewPlugin, ViewUpdate } from "@codemirror/view";
import { editorLivePreviewField } from "obsidian";
import { MARKER_RE } from "../storage/InkflowMarker";

/**
 * Hides `<!--inkflow:v1:...-->` markers in Live Preview (Obsidian's default
 * editing mode) so the user only ever sees the recognized text there, same
 * as in Reading view. In true Source mode (editorLivePreviewField === false)
 * the marker is left fully visible/editable, as requested — there's no
 * cursor-proximity reveal like Obsidian's own syntax hiding, since revealing
 * a multi-KB hex blob on cursor-enter would be worse than just using Source
 * mode to see it.
 */

const globalMarkerRe = new RegExp(MARKER_RE.source, "g");

function isLivePreview(state: EditorState): boolean {
	return state.field(editorLivePreviewField, false) ?? false;
}

function buildDecorations(view: EditorView): DecorationSet {
	if (!isLivePreview(view.state)) return Decoration.none;

	const builder = new RangeSetBuilder<Decoration>();
	for (const { from, to } of view.visibleRanges) {
		const text = view.state.doc.sliceString(from, to);
		globalMarkerRe.lastIndex = 0;
		let match: RegExpExecArray | null;
		while ((match = globalMarkerRe.exec(text))) {
			const start = from + match.index;
			const end = start + match[0].length;
			builder.add(start, end, Decoration.replace({}));
		}
	}
	return builder.finish();
}

class InkflowMarkerHider implements PluginValue {
	decorations: DecorationSet;

	constructor(view: EditorView) {
		this.decorations = buildDecorations(view);
	}

	update(update: ViewUpdate) {
		const livePreviewChanged = isLivePreview(update.state) !== isLivePreview(update.startState);
		if (update.docChanged || update.viewportChanged || livePreviewChanged) {
			this.decorations = buildDecorations(update.view);
		}
	}
}

export const inkflowMarkerHiderExtension = ViewPlugin.fromClass(InkflowMarkerHider, {
	decorations: (plugin) => plugin.decorations,
});
