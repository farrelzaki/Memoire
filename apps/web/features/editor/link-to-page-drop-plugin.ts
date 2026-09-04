import { Plugin, PluginKey } from '@tiptap/pm/state';

/** Custom `dataTransfer` MIME type the sidebar sets on `dragstart` (§19A.4, Sprint 22). */
export const PAGE_DRAG_MIME_TYPE = 'application/x-memoire-page-id';

/**
 * Crossing from the sidebar's dnd-kit region into the ProseMirror editor DOM
 * goes through a native browser drag + this drop handler — never a shared
 * dnd-kit context reaching into the editor (ADR-11, extended here to a new
 * crossing case: drag *starting* outside the editor, *ending* inside it).
 *
 * A `linkToPage` node is inserted with `pageId` already set — `LinkToPageView`
 * already renders the resolved-link view immediately when `pageId` is
 * truthy, so no picker-bypass flag is needed on the node itself.
 */
export const linkToPageDropPlugin = new Plugin({
  key: new PluginKey('linkToPageDrop'),
  props: {
    handleDOMEvents: {
      drop(view, event) {
        const pageId = event.dataTransfer?.getData(PAGE_DRAG_MIME_TYPE);
        if (!pageId) return false; // not our drag — let ProseMirror's own drag handling proceed

        event.preventDefault();
        const coords = { left: event.clientX, top: event.clientY };
        const pos = view.posAtCoords(coords)?.pos ?? view.state.doc.content.size;
        const node = view.state.schema.nodes.linkToPage.create({ pageId });
        view.dispatch(view.state.tr.insert(pos, node));
        return true;
      },
    },
  },
});
