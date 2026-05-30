import { useEffect, useRef, useState } from 'react';
import { COLOR_PALETTE } from '../types';
import { ColorPicker } from './ColorPicker';

interface Props {
  onCreate: (name: string, color: string) => void;
  onCancel: () => void;
  defaultColor?: string;
  autoFocus?: boolean;
}

export function WorkstreamCreator({ onCreate, onCancel, defaultColor, autoFocus }: Props) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(defaultColor ?? COLOR_PALETTE[Math.floor(Math.random() * (COLOR_PALETTE.length - 1))]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const submit = () => {
    const v = name.trim();
    if (!v) return;
    onCreate(v, color);
  };

  return (
    <div className="workstream-creator">
      <div className="workstream-creator-row">
        <button
          type="button"
          className="section-swatch"
          style={{ background: color, width: 18, height: 18 }}
          aria-label="Color"
        />
        <input
          ref={inputRef}
          className="text-input"
          placeholder="Workstream name…"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
            if (e.key === 'Escape') onCancel();
          }}
        />
      </div>
      <div className="workstream-creator-colors">
        <ColorPicker value={color} onSelect={setColor} />
      </div>
      <div className="workstream-creator-footer">
        <button className="btn" type="button" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary" type="button" onClick={submit} disabled={!name.trim()}>
          Create
        </button>
      </div>
    </div>
  );
}
