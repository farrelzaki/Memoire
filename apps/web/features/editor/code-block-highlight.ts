import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { codeToTokensBase, type BundledLanguage } from 'shiki';

const pluginKey = new PluginKey('codeBlockHighlight');

function isDarkMode(): boolean {
  return typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
}

/** Syntax highlighting for `codeBlock`/`CodeBlockShiki` nodes via ProseMirror
 * *decorations*, not by re-rendering the text — the `contentDOM` stays the
 * real, ProseMirror-owned `<code>` element, so typing/undo/collab-adjacent
 * mechanics (autosave diffing, etc.) all still see plain text. Shiki's
 * per-language grammar loads lazily (`codeToTokensBase`, cached after first
 * use) and highlighting is recomputed asynchronously — recolor lags a
 * transaction or two behind typing, never blocks it.
 *
 * Not a NodeView-rendered copy of the highlighted HTML (the more common
 * "Shiki in Tiptap" recipe): that approach forces the *actual* text node out
 * of `contentDOM` and no longer round-trips correctly through
 * `docToBlocks`/plain-text extraction (§12B.6) without extra plumbing.
 * Decorations avoid that entirely. */
export const CodeBlockHighlight = Extension.create({
  name: 'codeBlockHighlight',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: pluginKey,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, old) {
            const meta = tr.getMeta(pluginKey);
            if (meta) return meta as DecorationSet;
            if (tr.docChanged) return old.map(tr.mapping, tr.doc);
            return old;
          },
        },
        props: {
          decorations(state) {
            return pluginKey.getState(state);
          },
        },
        view(editorView) {
          let destroyed = false;
          let themeObserver: MutationObserver | null = null;

          const recompute = async () => {
            const theme = isDarkMode() ? 'github-dark' : 'github-light';
            const decorations: Decoration[] = [];
            const jobs: Array<Promise<void>> = [];

            editorView.state.doc.descendants((node, pos) => {
              if (node.type.name !== 'codeBlock') return;
              const language = (node.attrs.language as string) || 'plaintext';
              const code = node.textContent;
              if (!code) return;

              jobs.push(
                codeToTokensBase(code, { lang: language as BundledLanguage, theme }).then(
                  (lines) => {
                    let offset = pos + 1;
                    for (const line of lines) {
                      for (const token of line) {
                        const from = offset;
                        const to = offset + token.content.length;
                        if (token.color) {
                          decorations.push(
                            Decoration.inline(from, to, { style: `color: ${token.color}` }),
                          );
                        }
                        offset = to;
                      }
                      offset += 1; // the '\n' ProseMirror collapses each line into
                    }
                  },
                  () => {
                    // Unknown/unsupported language id — leave that block unhighlighted
                    // rather than breaking highlighting for every other block.
                  },
                ),
              );
            });

            await Promise.all(jobs);
            if (destroyed) return;
            const tr = editorView.state.tr.setMeta(
              pluginKey,
              DecorationSet.create(editorView.state.doc, decorations),
            );
            editorView.dispatch(tr);
          };

          void recompute();
          themeObserver = new MutationObserver(() => void recompute());
          themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

          return {
            update(view, prevState) {
              if (!view.state.doc.eq(prevState.doc)) void recompute();
            },
            destroy() {
              destroyed = true;
              themeObserver?.disconnect();
            },
          };
        },
      }),
    ];
  },
});
