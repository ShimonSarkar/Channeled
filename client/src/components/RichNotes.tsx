import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { Markdown } from 'tiptap-markdown';
import { useEffect, useRef } from 'react';

interface Props {
  value: string;
  onChange: (markdown: string) => void;
  placeholder?: string;
}

export function RichNotes({ value, onChange, placeholder }: Props) {
  const lastEmittedRef = useRef<string>(value);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // StarterKit already includes most things we need
        heading: { levels: [1, 2, 3] },
      }),
      Placeholder.configure({
        placeholder: placeholder ?? "Type '# ' for a heading, '- ' for a list, '[] ' for a to-do…",
        showOnlyWhenEditable: true,
        showOnlyCurrent: true,
      }),
      Link.configure({
        openOnClick: true,
        autolink: true,
        HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Markdown.configure({
        html: false,
        tightLists: true,
        bulletListMarker: '-',
        linkify: true,
        breaks: true,
        transformPastedText: true,
        transformCopiedText: true,
      }),
    ],
    content: value || '',
    editorProps: {
      attributes: {
        class: 'tiptap-editor',
      },
    },
    onUpdate: ({ editor }) => {
      // @ts-expect-error - markdown storage added by extension
      const md: string = editor.storage.markdown.getMarkdown();
      if (md !== lastEmittedRef.current) {
        lastEmittedRef.current = md;
        onChange(md);
      }
    },
  });

  // Sync external value changes (e.g. switching tasks) into the editor
  useEffect(() => {
    if (!editor) return;
    // @ts-expect-error - markdown storage added by extension
    const current = editor.storage.markdown.getMarkdown();
    if (value !== current) {
      lastEmittedRef.current = value;
      editor.commands.setContent(value || '', { emitUpdate: false });
    }
  }, [value, editor]);

  return <EditorContent editor={editor} className="rich-notes" />;
}
