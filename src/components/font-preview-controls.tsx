import { useState, type CSSProperties } from 'react';

export type FontAppearance = {
  tracking: number;
  lineHeight: number;
  alignment: 'left' | 'center' | 'right';
  foreground: string;
  background: string;
};
// Initial specimen colors match the app canvas; user-selected colors remain independent.
export const DEFAULT_FONT_APPEARANCE: FontAppearance = { tracking: 0, lineHeight: 1.6, alignment: 'left', foreground: '#e3dce8', background: '#14101a' };
export function specimenAppearance(value: FontAppearance): CSSProperties {
  return { letterSpacing: `${value.tracking}em`, lineHeight: value.lineHeight, textAlign: value.alignment, color: value.foreground, backgroundColor: value.background };
}

function PreviewNumber({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (value: number) => void }) {
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(false);
  return <label>{label}<input type="number" min={min} max={max} step={step} value={editing ? draft : String(value)}
    onFocus={() => { setDraft(String(value)); setEditing(true); }}
    onChange={event => {
      const input = event.target.value, next = Number(input);
      setDraft(input);
      // Preserve partial input (empty, minus, decimal) while the user types.
      if (input.trim() && Number.isFinite(next) && next >= min && next <= max) onChange(next);
    }}
    onBlur={() => {
      const next = Number(draft);
      if (draft.trim() && Number.isFinite(next)) onChange(Math.min(max, Math.max(min, next)));
      setEditing(false);
    }} /></label>;
}

export function FontPreviewControls({ value, onChange }: { value: FontAppearance; onChange: (value: FontAppearance) => void }) {
  return <fieldset className="font-appearance">
    <legend>Preview appearance</legend>
    <PreviewNumber label="Tracking (em)" value={value.tracking} min={-0.1} max={0.5} step={0.01} onChange={tracking => onChange({ ...value, tracking })} />
    <PreviewNumber label="Line height" value={value.lineHeight} min={0.8} max={3} step={0.1} onChange={lineHeight => onChange({ ...value, lineHeight })} />
    <label>Alignment<select aria-label="Alignment" value={value.alignment} onChange={event => onChange({ ...value, alignment: event.target.value as FontAppearance['alignment'] })}>
      <option value="left">Left</option><option value="center">Center</option><option value="right">Right</option>
    </select></label>
    <label className="preview-color">Text color<input aria-label="Text color" type="color" value={value.foreground} onChange={event => onChange({ ...value, foreground: event.target.value })} /><span>{value.foreground}</span></label>
    <label className="preview-color">Background color<input aria-label="Background color" type="color" value={value.background} onChange={event => onChange({ ...value, background: event.target.value })} /><span>{value.background}</span></label>
    <button type="button" className="secondary-button" onClick={() => onChange({ ...DEFAULT_FONT_APPEARANCE })}>Reset appearance</button>
    <p className="storage-note">Applies to specimens only. Preview settings reset when you leave this page.</p>
  </fieldset>;
}
