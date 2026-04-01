import { useRef, useEffect, useMemo } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { StreamLanguage } from '@codemirror/language';
import { stex } from '@codemirror/legacy-modes/mode/stex';
import { keymap } from '@codemirror/view';
import type { EditorView } from '@codemirror/view';

interface LaTeXEditorProps {
  value: string;
  onChange: (value: string) => void;
  editorViewRef?: React.MutableRefObject<EditorView | null>;
  onSave?: () => void;
}

export default function LaTeXEditor({ value, onChange, editorViewRef, onSave }: LaTeXEditorProps) {
  const internalRef = useRef<EditorView | null>(null);

  const saveKeymap = useMemo(() => {
    return keymap.of([
      {
        key: 'Mod-s',
        run: () => {
          onSave?.();
          return true;
        },
      },
    ]);
  }, [onSave]);

  const extensions = useMemo(() => {
    return [
      StreamLanguage.define(stex),
      saveKeymap,
    ];
  }, [saveKeymap]);

  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      extensions={extensions}
      height="100%"
      style={{ height: '100%', fontSize: 14 }}
      onCreateEditor={(view) => {
        internalRef.current = view;
        if (editorViewRef) editorViewRef.current = view;
      }}
    />
  );
}
