'use client';

import { mergeAttributes, Node } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { useRef } from 'react';
import { api, attachmentContentUrl } from '@/lib/api';

type MediaKind = 'fileBlock' | 'video' | 'audio' | 'pdf';

const ACCEPT: Record<MediaKind, string> = {
  fileBlock: '*/*',
  video: 'video/*',
  audio: 'audio/*',
  pdf: 'application/pdf',
};

/**
 * Shared behavior for the four upload-or-URL media blocks (§12B.2): pick a
 * file, paste a URL, or (once one exists) render it. Only the render step
 * differs per kind, so one node factory covers all four instead of near-
 * identical copies.
 */
function MediaView({ node, updateAttributes, extension }: NodeViewProps) {
  const kind = extension.name as MediaKind;
  const attachmentId = node.attrs.attachmentId as string | null;
  const url = node.attrs.url as string | null;
  const filename = (node.attrs.filename as string) ?? '';
  const pageId = extension.options.pageId as string;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const src = attachmentId ? attachmentContentUrl(attachmentId) : url;

  const onPickFile = async (file: File) => {
    const attachment = await api.uploadAttachment(file, pageId);
    updateAttributes({ attachmentId: attachment.id, url: null, filename: attachment.filename });
  };

  const onPasteUrl = () => {
    const pasted = window.prompt(`${labelFor(kind)} URL`);
    if (pasted) updateAttributes({ url: pasted, attachmentId: null, filename: pasted.split('/').pop() ?? '' });
  };

  if (!src) {
    return (
      <NodeViewWrapper
        className="my-1 flex items-center gap-2 rounded border border-dashed border-zinc-300 p-3 text-sm text-zinc-500 dark:border-zinc-600"
        contentEditable={false}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPT[kind]}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void onPickFile(file);
          }}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="rounded border border-zinc-200 px-2 py-1 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          Upload {labelFor(kind)}
        </button>
        <button
          onClick={onPasteUrl}
          className="rounded border border-zinc-200 px-2 py-1 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          Embed link
        </button>
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper className="my-1" contentEditable={false}>
      <MediaPreview kind={kind} src={src} filename={filename} />
    </NodeViewWrapper>
  );
}

function MediaPreview({ kind, src, filename }: { kind: MediaKind; src: string; filename: string }) {
  switch (kind) {
    case 'video':
      return <video src={src} controls className="max-h-[480px] w-full rounded" />;
    case 'audio':
      return <audio src={src} controls className="w-full" />;
    case 'pdf':
      return <iframe src={src} className="h-[600px] w-full rounded border border-zinc-200 dark:border-zinc-700" />;
    case 'fileBlock':
    default:
      return (
        <a
          href={src}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 rounded border border-zinc-200 p-2 text-sm hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          <span>📎</span>
          <span className="truncate">{filename || 'Download file'}</span>
        </a>
      );
  }
}

function labelFor(kind: MediaKind): string {
  return { fileBlock: 'file', video: 'video', audio: 'audio', pdf: 'PDF' }[kind];
}

function createMediaNode(kind: MediaKind) {
  return Node.create({
    name: kind,
    group: 'block',
    atom: true,
    draggable: true,

    addOptions() {
      return { pageId: '' };
    },

    addAttributes() {
      return {
        attachmentId: { default: null },
        url: { default: null },
        filename: { default: '' },
      };
    },

    parseHTML() {
      return [{ tag: `div[data-type="${kind}"]` }];
    },

    renderHTML({ HTMLAttributes }) {
      return ['div', mergeAttributes(HTMLAttributes, { 'data-type': kind })];
    },

    addNodeView() {
      return ReactNodeViewRenderer(MediaView);
    },
  });
}

export const FileBlock = createMediaNode('fileBlock');
export const VideoBlock = createMediaNode('video');
export const AudioBlock = createMediaNode('audio');
export const PdfBlock = createMediaNode('pdf');
