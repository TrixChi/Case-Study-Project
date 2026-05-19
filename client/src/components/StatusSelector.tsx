import React from 'react';

type Option = { value: string; label: string };

interface Props {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
}

export default function StatusSelector({ options, value, onChange }: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`seg-btn ${value === opt.value ? 'seg-btn--active' : ''}`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
