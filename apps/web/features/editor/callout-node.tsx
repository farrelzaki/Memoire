'use client';

import { mergeAttributes, Node } from '@tiptap/core';
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { useState } from 'react';
import { EmojiPicker } from '@/features/shell/emoji-picker';

const DEFAULT_ICON = '💡';

/** Callout (§12B.1): icon + a background from the theme token palette, never
 * a hardcoded color — same rule as the text/highlight marks (§12A.1). */
function CalloutView({ node, updateAttributes, editor, getPos }: NodeViewProps) {
  const icon = (node.attrs.icon as string) || DEFAULT_ICON;
  const [pickerOpen, setPickerOpen] = useState(false);

  // Picking an icon interacts with a button outside the ProseMirror content
  // DOM (`contentEditable={false}`), which steals focus from the editor —
  // without refocusing, the next keystroke the user types goes nowhere
  // (confirmed by hand: typing right after picking an icon silently did
  // nothing until this was added).
  const refocusContent = () => {
    const pos = getPos();
    const insideContent = typeof pos === 'number' ? pos + node.nodeSize - 1 : undefined;
    editor.chain().focus(insideContent).run();
  };

  return (
    <NodeViewWrapper className="my-1 flex gap-2 rounded-lg border border-border bg-muted/60 p-3">
      <div className="relative shrink-0" contentEditable={false}>
        <button
          onClick={() => setPickerOpen((v) => !v)}
          className="h-6 w-6 rounded text-lg leading-none hover:bg-muted"
          title="Change icon"
        >
          {icon}
        </button>
        {pickerOpen && (
          <EmojiPicker
            onPick={(emoji) => {
              updateAttributes({ icon: emoji });
              setPickerOpen(false);
              refocusContent();
            }}
            onRemove={() => {
              updateAttributes({ icon: DEFAULT_ICON });
              setPickerOpen(false);
              refocusContent();
            }}
            onClose={() => {
              setPickerOpen(false);
              refocusContent();
            }}
          />
        )}
      </div>
      <NodeViewContent className="min-w-0 flex-1 [&>*:last-child]:mb-0" />
    </NodeViewWrapper>
  );
}

export const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'block+',
  draggable: true,

  addAttributes() {
    return {
      icon: { default: DEFAULT_ICON },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="callout"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'callout' }), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(CalloutView);
  },
});
