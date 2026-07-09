"use client";

import {
  PRESET_OPTIONS,
  PRESET_LABELS,
  formatPeriodRange,
  type PeriodPreset,
  type PeriodValue,
} from "@/lib/periods";

type Props = {
  value: PeriodValue;
  onChange: (next: PeriodValue) => void;
};

export default function PeriodFilter({ value, onChange }: Props) {
  const handlePresetChange = (preset: PeriodPreset) => {
    if (preset === "custom") {
      onChange({ ...value, preset });
    } else {
      onChange({ preset, from: value.from, to: value.to });
    }
  };

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col">
        <label className="mb-2 flex items-center gap-1.5">
          <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/85">
            Data de criação
          </span>
          {value.preset !== "all" && value.preset !== "custom" && (
            <span className="text-[11px] font-medium text-white/60">
              · {formatPeriodRange(value.from, value.to)}
            </span>
          )}
        </label>
        <select
          value={value.preset}
          onChange={(e) => handlePresetChange(e.target.value as PeriodPreset)}
          className="rounded-lg border border-psa-line bg-psa-surface px-3 py-2 text-sm text-psa-ink focus:outline-none focus:border-psa-blue focus:ring-2 focus:ring-psa-blue/10 min-w-[160px]"
        >
          {PRESET_OPTIONS.map((p) => (
            <option key={p} value={p}>
              {PRESET_LABELS[p]}
            </option>
          ))}
        </select>
      </div>

      {value.preset === "custom" && (
        <>
          <div className="flex flex-col">
            <label className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/85 mb-2">
              De
            </label>
            <input
              type="date"
              value={value.from}
              max={value.to}
              onChange={(e) => onChange({ ...value, from: e.target.value })}
              className="rounded-lg border border-psa-line bg-psa-surface px-3 py-2 text-sm text-psa-ink focus:outline-none focus:border-psa-blue focus:ring-2 focus:ring-psa-blue/10"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/85 mb-2">
              Até
            </label>
            <input
              type="date"
              value={value.to}
              min={value.from}
              onChange={(e) => onChange({ ...value, to: e.target.value })}
              className="rounded-lg border border-psa-line bg-psa-surface px-3 py-2 text-sm text-psa-ink focus:outline-none focus:border-psa-blue focus:ring-2 focus:ring-psa-blue/10"
            />
          </div>
        </>
      )}
    </div>
  );
}
