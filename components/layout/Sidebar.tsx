"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useEffect,
  useState,
  type ReactNode,
  type SVGProps,
} from "react";

const STORAGE_KEY = "vexo-sidebar-collapsed";

function Icon({
  children,
  ...props
}: SVGProps<SVGSVGElement> & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="h-5 w-5 shrink-0"
      {...props}
    >
      {children}
    </svg>
  );
}

type NavChild = { href: string; label: string; heading?: boolean };

type NavItem = {
  href: string;
  label: string;
  icon: ReactNode;
  children?: NavChild[];
};

const NAV: NavItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: (
      <Icon>
        <rect x="3" y="3" width="7" height="9" rx="1.5" />
        <rect x="14" y="3" width="7" height="5" rx="1.5" />
        <rect x="14" y="12" width="7" height="9" rx="1.5" />
        <rect x="3" y="16" width="7" height="5" rx="1.5" />
      </Icon>
    ),
  },
  {
    href: "/clients",
    label: "Clientes",
    icon: (
      <Icon>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </Icon>
    ),
  },
  {
    href: "/catalog",
    label: "Conceptos",
    icon: (
      <Icon>
        <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
        <rect x="9" y="3" width="6" height="4" rx="1" />
        <path d="M9 12h6" />
        <path d="M9 16h4" />
      </Icon>
    ),
  },
  {
    href: "/quotes",
    label: "Presupuestos",
    icon: (
      <Icon>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6" />
        <path d="M8 13h8" />
        <path d="M8 17h5" />
      </Icon>
    ),
  },
  {
    href: "/invoices",
    label: "Facturas",
    icon: (
      <Icon>
        <path d="M4 2v20l3-2 3 2 3-2 3 2 3-2 3 2V2l-3 2-3-2-3 2-3-2-3 2z" />
        <path d="M8 10h8" />
        <path d="M8 14h5" />
      </Icon>
    ),
  },
  {
    href: "/recurring",
    label: "Periódicas",
    icon: (
      <Icon>
        <path d="M3 12a9 9 0 1 0 3-6.7" />
        <path d="M3 4v5h5" />
        <path d="M12 7v5l3 2" />
      </Icon>
    ),
  },
  {
    href: "/fiscal",
    label: "Fiscal",
    icon: (
      <Icon>
        <path d="M12 3v18" />
        <path d="M17 8H9.5a2.5 2.5 0 0 0 0 5H14a2.5 2.5 0 0 1 0 5H6" />
      </Icon>
    ),
    children: [
      { href: "/fiscal", label: "Resumen" },
      { href: "/fiscal/guide", label: "Guía presentación" },
      { href: "#", label: "Operativa", heading: true },
      { href: "/fiscal/expenses", label: "Gastos" },
      { href: "/fiscal/income", label: "Marketplace" },
      { href: "/fiscal/books", label: "Libros registro" },
      { href: "/fiscal/assets", label: "Bienes inversión" },
      { href: "#", label: "Modelos", heading: true },
      { href: "/fiscal/303", label: "303 IVA" },
      { href: "/fiscal/130", label: "130 IRPF" },
      { href: "/fiscal/349", label: "349 Intracom" },
      { href: "/fiscal/390", label: "390 Anual IVA" },
      { href: "/fiscal/347", label: "347 Terceros" },
      { href: "/fiscal/036", label: "Censo 036" },
      { href: "/fiscal/annual", label: "Resumen anual" },
      { href: "#", label: "Cumplimiento", heading: true },
      { href: "/fiscal/filings", label: "Presentados" },
      { href: "/fiscal/payments", label: "Pagos / NRC" },
      { href: "/fiscal/archive", label: "Archivo" },
      { href: "/fiscal/aeat", label: "Comunicaciones AEAT" },
      { href: "/fiscal/verifactu", label: "Veri*Factu" },
    ],
  },
  {
    href: "/stats",
    label: "Estadísticas",
    icon: (
      <Icon>
        <path d="M4 19h16" />
        <path d="M6 16V9" />
        <path d="M10 16V5" />
        <path d="M14 16v-3" />
        <path d="M18 16V7" />
      </Icon>
    ),
  },
  {
    href: "/settings",
    label: "Ajustes",
    icon: (
      <Icon>
        <circle cx="12" cy="12" r="3" />
        <path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
      </Icon>
    ),
  },
];

function childActive(pathname: string, href: string) {
  if (href === "/fiscal") {
    return pathname === "/fiscal";
  }
  return pathname === href || pathname.startsWith(href + "/");
}

function NavItemRow({
  item,
  collapsed,
  pathname,
  onNavigate,
}: {
  item: NavItem;
  collapsed: boolean;
  pathname: string;
  onNavigate: () => void;
}) {
  const routeActive =
    pathname === item.href || pathname.startsWith(item.href + "/");
  const hasChildren = Boolean(item.children?.length);
  const [open, setOpen] = useState(routeActive);
  const [hover, setHover] = useState(false);

  useEffect(() => {
    if (routeActive) setOpen(true);
  }, [routeActive]);

  const showInline = hasChildren && !collapsed && (open || hover || routeActive);
  const showFlyout = hasChildren && collapsed && hover;

  if (!hasChildren) {
    return (
      <Link
        href={item.href}
        title={item.label}
        className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${
          collapsed ? "lg:justify-center lg:px-0" : ""
        } ${
          routeActive
            ? "bg-white/15 text-white"
            : "text-white/65 hover:bg-white/8 hover:text-white"
        }`}
        onClick={onNavigate}
      >
        <span
          className={
            routeActive
              ? "text-white"
              : "text-white/55 group-hover:text-white/90"
          }
        >
          {item.icon}
        </span>
        <span className={collapsed ? "lg:hidden" : ""}>{item.label}</span>
      </Link>
    );
  }

  return (
    <div
      className="relative"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div
        className={`flex items-center rounded-lg transition ${
          routeActive
            ? "bg-white/15 text-white"
            : "text-white/65 hover:bg-white/8 hover:text-white"
        }`}
      >
        <Link
          href={item.href}
          title={item.label}
          className={`group flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-sm ${
            collapsed ? "lg:justify-center lg:px-0" : ""
          }`}
          onClick={onNavigate}
        >
          <span
            className={
              routeActive
                ? "text-white"
                : "text-white/55 group-hover:text-white/90"
            }
          >
            {item.icon}
          </span>
          <span className={collapsed ? "lg:hidden" : ""}>{item.label}</span>
        </Link>
        <button
          type="button"
          className={`mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-white/60 hover:bg-white/10 hover:text-white ${
            collapsed ? "lg:hidden" : ""
          }`}
          aria-label={open ? "Cerrar submenú" : "Abrir submenú"}
          aria-expanded={open || hover}
          onClick={(e) => {
            e.preventDefault();
            setOpen((v) => !v);
          }}
        >
          <Icon
            className={`h-4 w-4 transition ${showInline || open ? "rotate-90" : ""}`}
          >
            <path d="m9 18 6-6-6-6" />
          </Icon>
        </button>
      </div>

      {showInline ? (
        <div className="mt-0.5 ml-3 space-y-0.5 border-l border-white/15 pl-2">
          {item.children!.map((child, idx) => {
            if (child.heading) {
              return (
                <p
                  key={`h-${child.label}-${idx}`}
                  className="px-3 pb-0.5 pt-2 text-[10px] font-medium uppercase tracking-wide text-white/35"
                >
                  {child.label}
                </p>
              );
            }
            const active = childActive(pathname, child.href);
            return (
              <Link
                key={child.href}
                href={child.href}
                className={`block rounded-md px-3 py-2 text-sm transition ${
                  active
                    ? "bg-white/12 text-white"
                    : "text-white/55 hover:bg-white/8 hover:text-white"
                }`}
                onClick={onNavigate}
              >
                {child.label}
              </Link>
            );
          })}
        </div>
      ) : null}

      {showFlyout ? (
        <div className="absolute left-full top-0 z-[60] ml-2 hidden w-48 rounded-lg border border-white/10 bg-sidebar py-1.5 shadow-xl lg:block">
          <p className="px-3 pb-1 pt-1 text-[10px] font-medium uppercase tracking-wide text-white/40">
            {item.label}
          </p>
          {item.children!.map((child, idx) => {
            if (child.heading) {
              return (
                <p
                  key={`fh-${child.label}-${idx}`}
                  className="px-3 pb-0.5 pt-2 text-[10px] font-medium uppercase tracking-wide text-white/35"
                >
                  {child.label}
                </p>
              );
            }
            const active = childActive(pathname, child.href);
            return (
              <Link
                key={child.href}
                href={child.href}
                className={`block px-3 py-2 text-sm transition ${
                  active
                    ? "bg-white/12 text-white"
                    : "text-white/65 hover:bg-white/8 hover:text-white"
                }`}
                onClick={onNavigate}
              >
                {child.label}
              </Link>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export function Sidebar({
  companyName,
  signOutSlot,
}: {
  companyName: string;
  signOutSlot?: ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  return (
    <>
      <div className="sticky top-0 z-30 flex items-center gap-2 border-b border-line/70 bg-transparent px-3 py-2.5 backdrop-blur-md lg:hidden">
        <button
          type="button"
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-line text-ink"
          aria-label="Abrir menú"
          aria-expanded={open}
          onClick={() => setOpen(true)}
        >
          <Icon className="h-5 w-5">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </Icon>
        </button>
        <Link href="/dashboard" className="min-w-0 flex-1">
          <Image
            src="/brand/logo.png"
            alt="Vexo"
            width={120}
            height={22}
            className="h-6 w-auto object-contain"
            priority
          />
        </Link>
        <Link
          href="/invoices/new"
          className="btn-primary shrink-0 px-2.5 py-1.5 text-xs"
        >
          Factura
        </Link>
        {signOutSlot ? <div className="shrink-0">{signOutSlot}</div> : null}
      </div>

      <button
        type="button"
        className={`fixed inset-0 z-40 bg-ink/45 transition-opacity duration-300 ease-out lg:hidden ${
          open
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0"
        }`}
        aria-label="Cerrar menú"
        aria-hidden={!open}
        tabIndex={open ? 0 : -1}
        onClick={() => setOpen(false)}
      />

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex flex-col bg-sidebar text-sidebar-text shadow-xl transition-[width,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform lg:static lg:z-auto lg:translate-x-0 lg:shadow-none lg:transition-[width] ${
          open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        } ${
          collapsed
            ? "w-[min(18rem,85vw)] lg:w-[4.5rem]"
            : "w-[min(18rem,85vw)] lg:w-56"
        } lg:shrink-0`}
      >
        <div
          className={`flex items-start justify-between gap-2 border-b border-white/10 py-5 ${
            collapsed ? "px-3 lg:px-2 lg:justify-center" : "px-5"
          }`}
        >
          <div className={`min-w-0 ${collapsed ? "lg:hidden" : ""}`}>
            <Link
              href="/dashboard"
              className="block"
              onClick={() => setOpen(false)}
            >
              <Image
                src="/brand/logo-on-dark.png"
                alt="Vexo"
                width={160}
                height={26}
                className="h-7 w-auto object-contain"
                priority
              />
            </Link>
            <p className="mt-2 truncate text-xs text-white/50">
              {companyName || "Mi empresa"}
            </p>
          </div>
          {collapsed ? (
            <Link
              href="/dashboard"
              className="hidden lg:block"
              title="Vexo"
              onClick={() => setOpen(false)}
            >
              <Image
                src="/brand/logo-on-dark.png"
                alt="Vexo"
                width={32}
                height={32}
                className="mx-auto h-8 w-8 object-contain"
                priority
              />
            </Link>
          ) : null}
          <button
            type="button"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-white/70 hover:bg-white/10 hover:text-white lg:hidden"
            aria-label="Cerrar menú"
            onClick={() => setOpen(false)}
          >
            <Icon className="h-5 w-5">
              <path d="M18 6 6 18M6 6l12 12" />
            </Icon>
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto overflow-x-visible p-2.5">
          {NAV.map((item) => (
            <NavItemRow
              key={item.href}
              item={item}
              collapsed={collapsed}
              pathname={pathname}
              onNavigate={() => setOpen(false)}
            />
          ))}
        </nav>

        <div className="hidden border-t border-white/10 p-2.5 lg:block">
          <button
            type="button"
            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-white/65 transition hover:bg-white/8 hover:text-white ${
              collapsed ? "justify-center px-0" : ""
            }`}
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Expandir menú" : "Contraer menú"}
            title={collapsed ? "Expandir menú" : "Contraer menú"}
          >
            <Icon className="h-5 w-5">
              {collapsed ? (
                <>
                  <path d="M4 12h12" />
                  <path d="m10 6 6 6-6 6" />
                  <path d="M20 4v16" />
                </>
              ) : (
                <>
                  <path d="M20 12H8" />
                  <path d="m14 6-6 6 6 6" />
                  <path d="M4 4v16" />
                </>
              )}
            </Icon>
            {!collapsed ? <span>Contraer</span> : null}
          </button>
        </div>
      </aside>
    </>
  );
}
