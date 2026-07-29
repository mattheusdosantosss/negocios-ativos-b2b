"use client";

import { type TeamMember } from "@/lib/team";

type Props = {
  value: string; // ownerId ou "all"
  /** Roster do segmento atual (B2B ou B2C — nunca misturados). */
  options: TeamMember[];
  onChange: (v: string) => void;
};

export default function CloserFilter({ value, options, onChange }: Props) {
  return (
    <div className="flex flex-col">
      <label className="mb-2 text-[10px] font-bold uppercase tracking-[0.15em] text-white/85">
        Closer
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-psa-line bg-psa-surface px-3 py-2 text-sm text-psa-ink focus:outline-none focus:border-psa-blue focus:ring-2 focus:ring-psa-blue/10 min-w-[170px]"
      >
        <option value="all">Todos</option>
        {options.map((c) => (
          <option key={c.ownerId} value={c.ownerId}>
            {c.nome}
          </option>
        ))}
      </select>
    </div>
  );
}
