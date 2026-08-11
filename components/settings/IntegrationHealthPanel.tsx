type HealthItem = {
  id: string;
  label: string;
  ok: boolean;
  hint: string;
};

export function IntegrationHealthPanel({ items }: { items: HealthItem[] }) {
  return (
    <section className="card-panel space-y-3 p-6">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
        Estado de integraciones
      </h2>
      <p className="text-xs text-ink-muted">
        Solo lectura: se configuran en Vercel / .env.local, no aquí.
      </p>
      <ul className="space-y-2">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-line px-3 py-2.5"
          >
            <div>
              <p className="text-sm font-medium">
                <span className={item.ok ? "text-success" : "text-warning"}>
                  {item.ok ? "✓" : "○"}
                </span>{" "}
                {item.label}
              </p>
              <p className="text-xs text-ink-muted">{item.hint}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
