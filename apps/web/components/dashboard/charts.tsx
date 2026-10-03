"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatCompact, formatMs, formatUsdString } from "@/lib/format";

export interface ChartPoint {
  date: string;
  requests: number;
  errors: number;
  tokens: number;
  spendUsd: number;
  latencyMs: number | null;
}

type Metric = "requests" | "tokens" | "spendUsd" | "latencyMs" | "errors";

const COLORS: Record<Metric, string> = {
  requests: "#5cebc0",
  tokens: "#8e96ff",
  spendUsd: "#f5b455",
  latencyMs: "#8e96ff",
  errors: "#ff6b6b",
};

function formatValue(metric: Metric, v: number | null | undefined) {
  if (v === null || v === undefined) return "—";
  if (metric === "spendUsd") return formatUsdString(v);
  if (metric === "latencyMs") return formatMs(v);
  return formatCompact(v);
}

const shortDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

function ChartTooltip({ active, payload, label, metric }: { active?: boolean; payload?: Array<{ value: number }>; label?: string; metric: Metric }) {
  if (!active || !payload?.length || !label) return null;
  return (
    <div className="rounded-md border border-border-strong bg-surface-2 px-2.5 py-1.5 text-xs shadow-xl">
      <div className="text-fg-subtle">{shortDate(label)}</div>
      <div className="font-mono text-fg">{formatValue(metric, payload[0]?.value)}</div>
    </div>
  );
}

export function MetricAreaChart({ data, metric, height = 220 }: { data: ChartPoint[]; metric: Metric; height?: number }) {
  const color = COLORS[metric];
  const id = `grad-${metric}`;
  return (
    <div style={{ height }} className="w-full" role="img" aria-label={`${metric} over time`}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.32} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgb(255 255 255 / 0.05)" vertical={false} />
          <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fill: "#6c7383", fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={24} />
          <YAxis tickFormatter={(v: number) => formatValue(metric, v)} tick={{ fill: "#6c7383", fontSize: 11 }} axisLine={false} tickLine={false} width={metric === "spendUsd" ? 72 : 56} />
          <Tooltip content={<ChartTooltip metric={metric} />} cursor={{ stroke: "rgb(255 255 255 / 0.15)" }} />
          <Area type="monotone" dataKey={metric} stroke={color} strokeWidth={1.75} fill={`url(#${id})`} isAnimationActive={false} connectNulls />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function StackedErrorsChart({ data, height = 200 }: { data: ChartPoint[]; height?: number }) {
  const rows = data.map((d) => ({ date: d.date, ok: d.requests - d.errors, errors: d.errors }));
  return (
    <div style={{ height }} className="w-full" role="img" aria-label="Successful and failed requests per day">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="rgb(255 255 255 / 0.05)" vertical={false} />
          <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fill: "#6c7383", fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={24} />
          <YAxis tickFormatter={(v: number) => formatCompact(v)} tick={{ fill: "#6c7383", fontSize: 11 }} axisLine={false} tickLine={false} width={48} />
          <Tooltip
            cursor={{ fill: "rgb(255 255 255 / 0.03)" }}
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <div className="rounded-md border border-border-strong bg-surface-2 px-2.5 py-1.5 text-xs shadow-xl">
                  <div className="text-fg-subtle">{shortDate(String(label))}</div>
                  <div className="font-mono text-success">{formatCompact(Number(payload[0]?.value ?? 0))} ok</div>
                  <div className="font-mono text-danger">{formatCompact(Number(payload[1]?.value ?? 0))} errors</div>
                </div>
              ) : null
            }
          />
          <Bar dataKey="ok" stackId="a" fill="#4ade9c" fillOpacity={0.7} isAnimationActive={false} />
          <Bar dataKey="errors" stackId="a" fill="#ff6b6b" radius={[3, 3, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
