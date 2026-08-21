"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCurrency } from "@/lib/calculations";

const COLORS = {
  wod3d: "var(--accent)",
  amazon: "#e47911",
  shopify: "#5e8e3e",
  collected: "#2d6a4f",
  income: "var(--accent)",
  expense: "#9a3412",
  profit: "#2d6a4f",
  loss: "#b91c1c",
};

type IncomeMixPoint = {
  label: string;
  invoicesBase: number;
  amazonBase: number;
  shopifyBase: number;
};

export function IncomeMixChart({ data }: { data: IncomeMixPoint[] }) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: "var(--ink-muted)", fontSize: 11 }}
            axisLine={{ stroke: "var(--line)" }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: "var(--ink-muted)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) =>
              Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : String(v)
            }
          />
          <Tooltip
            formatter={(value) => formatCurrency(Number(value ?? 0))}
            contentStyle={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--line)",
              borderRadius: 8,
              fontSize: 12,
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar
            dataKey="invoicesBase"
            name="Facturas W3D"
            stackId="a"
            fill={COLORS.wod3d}
            radius={[0, 0, 0, 0]}
          />
          <Bar
            dataKey="amazonBase"
            name="Amazon"
            stackId="a"
            fill={COLORS.amazon}
          />
          <Bar
            dataKey="shopifyBase"
            name="Shopify"
            stackId="a"
            fill={COLORS.shopify}
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

type CashPoint = {
  label: string;
  invoicesTotal: number;
  collected: number;
};

export function CashflowChart({ data }: { data: CashPoint[] }) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: "var(--ink-muted)", fontSize: 11 }}
            axisLine={{ stroke: "var(--line)" }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: "var(--ink-muted)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) =>
              Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : String(v)
            }
          />
          <Tooltip
            formatter={(value) => formatCurrency(Number(value ?? 0))}
            contentStyle={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--line)",
              borderRadius: 8,
              fontSize: 12,
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar
            dataKey="invoicesTotal"
            name="Facturado W3D"
            fill={COLORS.wod3d}
            radius={[4, 4, 0, 0]}
            opacity={0.55}
          />
          <Bar
            dataKey="collected"
            name="Cobrado"
            fill={COLORS.collected}
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

type ProfitPoint = {
  label: string;
  incomeBase: number;
  expensesBase: number;
  netBase: number;
};

export function ProfitChart({ data }: { data: ProfitPoint[] }) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: "var(--ink-muted)", fontSize: 11 }}
            axisLine={{ stroke: "var(--line)" }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: "var(--ink-muted)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) =>
              Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : String(v)
            }
          />
          <Tooltip
            formatter={(value) => formatCurrency(Number(value ?? 0))}
            contentStyle={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--line)",
              borderRadius: 8,
              fontSize: 12,
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar
            dataKey="incomeBase"
            name="Ingresos"
            fill={COLORS.income}
            radius={[4, 4, 0, 0]}
            opacity={0.7}
          />
          <Bar
            dataKey="expensesBase"
            name="Gastos"
            fill={COLORS.expense}
            radius={[4, 4, 0, 0]}
            opacity={0.7}
          />
          <Bar dataKey="netBase" name="Beneficio" radius={[4, 4, 0, 0]}>
            {data.map((entry, i) => (
              <Cell
                key={`net-${i}`}
                fill={entry.netBase >= 0 ? COLORS.profit : COLORS.loss}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
