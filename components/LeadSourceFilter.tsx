"use client";

import { LEAD_SOURCES, type LeadSourceId } from "@/lib/leadSource";

type Props = {
  value: LeadSourceId;
  onChange: (v: LeadSourceId) => void;
};

export default function LeadSourceFilter({ value, onChange }: Props) {
  return (
    <div className="flex flex-col">
      <label className="mb-2 text-[10px] font-bold uppercase tracking-[0.15em] text-white/85">
        Origem do lead
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as LeadSourceId)}
        className="w-full sm:w-[150px] rounded-lg border border-psa-line bg-psa-surface px-3 py-2 text-sm text-psa-ink focus:outline-none focus:border-psa-blue focus:ring-2 focus:ring-psa-blue/10"
      >
        {LEAD_SOURCES.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
          </option>
        ))}
      </select>
    </div>
  );
}
