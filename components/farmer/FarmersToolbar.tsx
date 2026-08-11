export type FarmerFilter = "todos" | "com_ganhos" | "sem_ganhos";

type Props = {
  search: string;
  onSearch: (v: string) => void;
  filter: FarmerFilter;
  onFilter: (v: FarmerFilter) => void;
};

const FILTERS: { id: FarmerFilter; label: string }[] = [
  { id: "todos", label: "Todos" },
  { id: "com_ganhos", label: "Com ganhos" },
  { id: "sem_ganhos", label: "Sem ganhos" },
];

export default function FarmersToolbar({ search, onSearch, filter, onFilter }: Props) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
      {/* Filtros pílula */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-psa-ink-soft mr-1">Filtrar:</span>
        <div className="inline-flex bg-psa-surface border border-psa-line rounded-xl p-1 gap-1">
          {FILTERS.map((f) => {
            const active = filter === f.id;
            return (
              <button
                key={f.id}
                onClick={() => onFilter(f.id)}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  active ? "bg-psa-blue text-white shadow-sm" : "text-psa-ink-soft hover:text-psa-ink"
                }`}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Busca */}
      <div className="relative">
        <input
          type="search"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Buscar farmer..."
          className="w-56 rounded-xl border border-psa-line bg-psa-surface pl-9 pr-3 py-2 text-sm text-psa-ink placeholder:text-psa-ink-soft focus:outline-none focus:border-psa-blue focus:ring-2 focus:ring-psa-blue/10"
        />
        <svg
          aria-hidden
          viewBox="0 0 20 20"
          fill="none"
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-psa-ink-soft"
        >
          <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.6" />
          <path d="M14 14L17 17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </div>
    </div>
  );
}
