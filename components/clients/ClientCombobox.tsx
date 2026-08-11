"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
} from "react";
import { CreateClientModal } from "@/components/clients/CreateClientModal";

export type ClientOption = {
  id: string;
  name: string;
  nif?: string | null;
  email?: string | null;
  countryCode?: string | null;
};

type Props = {
  name?: string;
  required?: boolean;
  defaultClient?: ClientOption | null;
  label?: string;
  id?: string;
  onClientChange?: (client: ClientOption | null) => void;
};

type SearchResponse = { clients: ClientOption[] };

export function ClientCombobox({
  name = "clientId",
  required = true,
  defaultClient = null,
  label = "Cliente",
  id: idProp,
  onClientChange,
}: Props) {
  const autoId = useId();
  const inputId = idProp ?? `client-search-${autoId}`;
  const listId = `${inputId}-list`;

  const [query, setQuery] = useState(defaultClient?.name ?? "");
  const [selected, setSelected] = useState<ClientOption | null>(
    defaultClient ?? null
  );
  const [results, setResults] = useState<ClientOption[]>([]);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipSearchRef = useRef(false);

  const search = useCallback((term: string) => {
    startTransition(() => {
      void fetch(`/api/clients/search?q=${encodeURIComponent(term)}&limit=12`)
        .then(async (res) => {
          if (!res.ok) throw new Error("No se pudo buscar");
          return res.json() as Promise<SearchResponse>;
        })
        .then((data) => {
          setResults(data.clients);
          setHighlight(0);
          setError(null);
        })
        .catch(() => {
          setResults([]);
          setError("Error al buscar clientes");
        });
    });
  }, []);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  useEffect(() => {
    if (skipSearchRef.current) {
      skipSearchRef.current = false;
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(query.trim()), 220);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, search]);

  function pick(client: ClientOption) {
    skipSearchRef.current = true;
    setSelected(client);
    setQuery(client.name);
    setOpen(false);
    setResults([]);
    setError(null);
    onClientChange?.(client);
  }

  function clearSelection() {
    setSelected(null);
    setQuery("");
    setOpen(true);
    search("");
    onClientChange?.(null);
  }

  function onInputChange(value: string) {
    setQuery(value);
    if (selected && value !== selected.name) {
      setSelected(null);
      onClientChange?.(null);
    }
    setOpen(true);
  }

  function openCreateModal() {
    setOpen(false);
    setCreateOpen(true);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter")) {
      setOpen(true);
      return;
    }
    if (!open) return;

    const createIndex = results.length;
    const maxIndex = results.length; // create option is last

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, maxIndex));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlight === createIndex || results.length === 0) {
        openCreateModal();
        return;
      }
      const item = results[highlight];
      if (item) pick(item);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const showCreateOption = !pending;

  return (
    <div ref={wrapRef} className="relative">
      <label className="label" htmlFor={inputId}>
        {label}
      </label>
      <input
        type="text"
        name={name}
        value={selected?.id ?? ""}
        required={required}
        tabIndex={-1}
        aria-hidden
        className="pointer-events-none absolute h-0 w-0 opacity-0"
        onChange={() => {}}
      />
      <div className="relative">
        <input
          id={inputId}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={
            open
              ? highlight === results.length
                ? `${listId}-create`
                : results[highlight]
                  ? `${listId}-opt-${results[highlight].id}`
                  : undefined
              : undefined
          }
          className="input pr-20"
          placeholder="Escribe nombre, NIF o email…"
          value={query}
          autoComplete="off"
          onChange={(e) => onInputChange(e.target.value)}
          onFocus={() => {
            setOpen(true);
            if (results.length === 0) search(query.trim());
          }}
          onKeyDown={onKeyDown}
        />
        <div className="absolute inset-y-0 right-2 flex items-center gap-1">
          {selected ? (
            <button
              type="button"
              className="btn-ghost px-1.5 py-0.5 text-xs"
              onClick={clearSelection}
              title="Quitar"
            >
              ×
            </button>
          ) : null}
          {pending ? (
            <span className="text-[10px] text-ink-muted">…</span>
          ) : null}
        </div>
      </div>

      {required && !selected ? (
        <p className="mt-1 text-xs text-ink-muted">
          Selecciona un cliente de la lista
        </p>
      ) : null}
      {error ? (
        <p className="mt-1 text-xs text-danger">{error}</p>
      ) : null}

      {open ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-40 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-line bg-bg-elevated py-1 shadow-lg"
        >
          {pending && results.length === 0 ? (
            <li className="px-3 py-2.5 text-sm text-ink-muted">Buscando…</li>
          ) : null}

          {!pending && results.length === 0 ? (
            <li className="px-3 py-2 text-sm text-ink-muted">
              {query.trim() ? "Sin coincidencias" : "No hay clientes todavía"}
            </li>
          ) : null}

          {results.map((c, i) => (
            <li
              key={c.id}
              id={`${listId}-opt-${c.id}`}
              role="option"
              aria-selected={i === highlight}
              className={`cursor-pointer px-3 py-2 text-sm ${
                i === highlight
                  ? "bg-accent-soft text-ink"
                  : "hover:bg-accent-soft/50"
              }`}
              onMouseEnter={() => setHighlight(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(c);
              }}
            >
              <span className="font-medium">{c.name}</span>
              <span className="mt-0.5 block text-xs text-ink-muted">
                {[c.nif, c.email].filter(Boolean).join(" · ") ||
                  "Sin NIF / email"}
              </span>
            </li>
          ))}

          {showCreateOption ? (
            <li
              id={`${listId}-create`}
              role="option"
              aria-selected={highlight === results.length}
              className={`cursor-pointer border-t border-line px-3 py-2.5 text-sm font-medium text-accent ${
                highlight === results.length
                  ? "bg-accent-soft"
                  : "hover:bg-accent-soft/50"
              }`}
              onMouseEnter={() => setHighlight(results.length)}
              onMouseDown={(e) => {
                e.preventDefault();
                openCreateModal();
              }}
            >
              + Crear cliente
              {query.trim() ? (
                <span className="font-normal text-ink-muted">
                  {" "}
                  «{query.trim()}»
                </span>
              ) : null}
            </li>
          ) : null}
        </ul>
      ) : null}

      <CreateClientModal
        open={createOpen}
        initialName={query.trim()}
        onClose={() => setCreateOpen(false)}
        onCreated={(client) => pick(client)}
      />
    </div>
  );
}
