"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  getDashboardStats,
  type DashboardStats,
  type DashboardPeriod,
  type NfeStatus,
} from "@/lib/storage";

const STATUS_LABEL: Record<NfeStatus, string> = {
  pendente: "Pendente",
  em_rota: "Em rota",
  entregue: "Entregue",
  cancelado: "Cancelado",
  devolvido: "Devolvido",
};

const STATUS_DOT: Record<NfeStatus, string> = {
  pendente: "bg-slate-400",
  em_rota: "bg-amber-400",
  entregue: "bg-emerald-500",
  cancelado: "bg-red-400",
  devolvido: "bg-purple-400",
};

const DONUT_COLOR: Record<NfeStatus, string> = {
  pendente: "#94a3b8",
  em_rota: "#fbbf24",
  entregue: "#10b981",
  cancelado: "#f87171",
  devolvido: "#a78bfa",
};

const PERIODS: { id: DashboardPeriod; label: string }[] = [
  { id: "7d", label: "7 dias" },
  { id: "1m", label: "Último mês" },
  { id: "6m", label: "6 meses" },
  { id: "1y", label: "1 ano" },
];

function toNumber(v: string | null | undefined): number {
  if (!v) return 0;
  const clean = String(v).replace(/\./g, "").replace(",", ".");
  const n = parseFloat(clean);
  return isNaN(n) ? 0 : n;
}

function formatMoney(v: number): string {
  return v.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });
}

function buildDonutStyle(
  items: { status: NfeStatus; total: number }[],
): string {
  const total = items.reduce((a, i) => a + i.total, 0) || 1;
  let acc = 0;
  const parts = items.map((i) => {
    const start = (acc / total) * 360;
    acc += i.total;
    const end = (acc / total) * 360;
    return `${DONUT_COLOR[i.status]} ${start}deg ${end}deg`;
  });
  return `conic-gradient(${parts.join(", ")})`;
}

export default function DashboardPage() {
  const [period, setPeriod] = useState<DashboardPeriod>("7d");
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ativo = true;
    setLoading(true);
    getDashboardStats(period).then((s) => {
      if (!ativo) return;
      setStats(s);
      setLoading(false);
    });
    return () => {
      ativo = false;
    };
  }, [period]);

  if (loading || !stats) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto mb-2"></div>
        <p className="text-sm text-gray-500">Carregando dashboard...</p>
      </div>
    );
  }

  const maxTotal = Math.max(1, ...stats.entregasPorData.map((p) => p.total));
  const totalPeriodo = stats.entregasPorData.reduce((a, p) => a + p.total, 0);
  const totalStatus = stats.statusAtual.reduce((a, s) => a + s.total, 0);
  const donutStyle = buildDonutStyle(stats.statusAtual);

  const kpis = [
    { label: "NF-es hoje", value: String(stats.kpis.nfesHoje), icon: "📄" },
    { label: "Concluídas hoje", value: String(stats.kpis.concluidasHoje), icon: "✅" },
    { label: "Em rota", value: String(stats.kpis.emRota), icon: "🚚" },
    { label: "Pendentes", value: String(stats.kpis.pendentes), icon: "⏳" },
    { label: "Valor em rota", value: formatMoney(stats.kpis.valorEmRota), icon: "💰" },
    { label: "Canceladas", value: String(stats.kpis.canceladas), icon: "❌" },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">
          Dashboard
        </h1>
        <p className="mt-2 text-sm text-gray-600">
          Visão geral das NF-es e entregas em tempo real.
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        {kpis.map((k) => (
          <div key={k.label} className="card !p-4">
            <span className="text-xl">{k.icon}</span>
            <p className="mt-2 text-xl sm:text-2xl font-bold text-gray-900 truncate">
              {k.value}
            </p>
            <p className="text-xs text-gray-500">{k.label}</p>
          </div>
        ))}
      </div>

      {/* Gráfico (2/3) + Status (1/3) — desktop · largura total no tablet/celular */}
      <div className="grid lg:grid-cols-3 gap-6 mt-6">
        <div className="lg:col-span-2 card">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
            <div>
              <h3 className="font-semibold text-gray-900">
                Entregas por data
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                {totalPeriodo} entrega(s) no período · NF-es com status
                &quot;entregue&quot;
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {PERIODS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPeriod(p.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                    period === p.id
                      ? "bg-primary-600 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            {stats.entregasPorData.map((p) => (
              <div key={p.key} className="flex items-center gap-2 sm:gap-3">
                <span className="w-14 flex-shrink-0 text-xs font-medium text-gray-600">
                  {p.label}
                </span>
                <div className="flex-1 h-5 bg-gray-100 rounded-md overflow-hidden">
                  <div
                    className={`h-full rounded-md transition-all duration-500 ${
                      p.hoje ? "bg-primary-700" : "bg-primary-600"
                    }`}
                    style={{
                      width: `${Math.max(
                        p.total > 0 ? 4 : 0,
                        (p.total / maxTotal) * 100,
                      )}%`,
                    }}
                  />
                </div>
                <span className="w-8 flex-shrink-0 text-right text-sm font-semibold text-gray-900">
                  {p.total}
                </span>
                {p.hoje && (
                  <span className="flex-shrink-0 text-[10px] font-semibold text-primary-700 bg-primary-50 rounded px-1.5 py-0.5">
                    hoje
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h3 className="font-semibold text-gray-900 mb-4">Status atual</h3>
          {stats.statusAtual.length === 0 ? (
            <p className="text-sm text-gray-500">
              Nenhuma NF-e cadastrada ainda.
            </p>
          ) : (
            <>
              <div className="flex items-center justify-center">
                <div
                  className="relative w-36 h-36 rounded-full"
                  style={{ background: donutStyle }}
                >
                  <div className="absolute inset-4 rounded-full bg-white grid place-items-center">
                    <div className="text-center">
                      <p className="text-2xl font-bold text-gray-900">
                        {totalStatus}
                      </p>
                      <p className="text-[10px] text-gray-500 uppercase tracking-wide">
                        NF-es
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="mt-5 space-y-2">
                {stats.statusAtual.map((s) => (
                  <div
                    key={s.status}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="flex items-center gap-2 text-gray-600">
                      <span
                        className={`w-2.5 h-2.5 rounded-full ${STATUS_DOT[s.status]}`}
                      />
                      {STATUS_LABEL[s.status]}
                    </span>
                    <span className="font-semibold text-gray-900">
                      {s.total} (
                      {Math.round((s.total / totalStatus) * 100)}%)
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Rota de hoje (2/3) + Ações rápidas (1/3) */}
      <div className="grid lg:grid-cols-3 gap-6 mt-6">
        <div className="lg:col-span-2 card">
          <h3 className="font-semibold text-gray-900 mb-4">Rota de hoje</h3>
          {stats.rotaHoje.length === 0 ? (
            <p className="text-sm text-gray-500">
              Nenhuma NF-e em rota no momento. Envie NF-es para a entrega pela
              lista de NF-es.
            </p>
          ) : (
            <ul className="space-y-2">
              {stats.rotaHoje.map((n, i) => {
                const d = n.data as unknown as {
                  numero?: string;
                  destinatario?: { nome?: string; bairro?: string };
                };
                return (
                  <li
                    key={n.id}
                    className="flex items-start gap-3 p-3 rounded-lg bg-gray-50"
                  >
                    <span className="w-6 h-6 rounded-full bg-amber-100 text-amber-700 grid place-items-center text-xs font-bold flex-shrink-0">
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {d.destinatario?.nome || "Sem nome"}
                      </p>
                      <p className="text-xs text-gray-500 truncate">
                        NF-e {d.numero || "-"} · {d.destinatario?.bairro || "Sem bairro"}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="card">
          <h3 className="font-semibold text-gray-900 mb-4">Ações rápidas</h3>
          <div className="space-y-2">
            <Link href="/" className="btn-primary w-full">
              📤 Nova NF-e (escanear)
            </Link>
            <Link href="/nfes" className="btn-secondary w-full">
              📄 Enviar para entregas
            </Link>
            <Link href="/entrega" className="btn-secondary w-full">
              🚚 Ver rota de entrega
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}