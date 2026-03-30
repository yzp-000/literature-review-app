import MDEditor from '@uiw/react-md-editor';

interface Props {
  value: string;
  onChange: (val: string) => void;
}

export default function MarkdownEditor({ value, onChange }: Props) {
  return (
    <div data-color-mode="light">
      <MDEditor
        value={value}
        onChange={(val) => onChange(val || '')}
        height="100%"
        style={{ minHeight: 400 }}
        preview="live"
      />
    </div>
  );
}
