import { COLOR_PALETTE } from '../types';

export function ColorPicker({ value, onSelect }: { value: string; onSelect: (color: string) => void }) {
  return (
    <div className="color-picker">
      {COLOR_PALETTE.map((c) => (
        <button
          key={c}
          className={`color-swatch ${c.toLowerCase() === value.toLowerCase() ? 'selected' : ''}`}
          style={{ background: c }}
          onClick={() => onSelect(c)}
          aria-label={`Color ${c}`}
        />
      ))}
    </div>
  );
}
