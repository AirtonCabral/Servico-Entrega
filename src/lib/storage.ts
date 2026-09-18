"use client";

import { createClient } from "./supabase/client";
import type { NotaFiscalData, CteData, TipoDocumento } from "./types";

// Chaves legadas — usadas apenas para migrar o histórico antigo do localStorage
export const NFE_HISTORY_KEY = "nfe:history";
export const NFE_CURRENT_KEY = "nfe:data";
export const NFE_VALIDATED_KEY = "nfe:validated";

export type NfeStatus =
  | "pendente"
  | "em_rota"
  | "entregue"
  | "cancelado"
  | "devolvido";

export const NFE_STATUSES: NfeStatus[] = [
  "pendente",
  "em_rota",
  "entregue",
  "cancelado",
  "devolvido",
];

export interface NfeHistoryEntry {
  id: string;
  /** Ausente em registros antigos (salvos antes do suporte a CT-e) -> tratar como "nfe" */
  tipo?: TipoDocumento;
  data: NotaFiscalData | CteData;
  image?: string;
  validatedAt: number;
  /** Status de entrega da NF-e (padrão: "pendente") */
  status?: NfeStatus;
}

interface NotaFiscalRow {
  id: string;
  chave_acesso: string;
  tipo: TipoDocumento;
  payload: NotaFiscalData | CteData;
  image: string | null;
  validated_at: string;
  status: NfeStatus;
}

const SELECT_COLS =
  "id, chave_acesso, tipo, payload, image, validated_at, status";

function rowToEntry(row: NotaFiscalRow): NfeHistoryEntry {
  return {
    id: row.id,
    tipo: row.tipo,
    data: row.payload,
    image: row.image || undefined,
    validatedAt: new Date(row.validated_at).getTime(),
    status: row.status,
  };
}

function extrairResumo(tipo: TipoDocumento, data: NotaFiscalData | CteData) {
  const d = data as NotaFiscalData & CteData;
  return {
    numero: d.numero || "",
    serie: d.serie || "",
    emitenteNome:
      tipo === "nfe" ? d.emitente?.nome || "" : d.remetente?.nome || "",
    emitenteCnpj:
      tipo === "nfe" ? d.emitente?.cnpj || "" : d.remetente?.cnpjCpf || "",
    destinatarioNome: d.destinatario?.nome || "",
    destinatarioCnpj:
      tipo === "nfe"
        ? d.destinatario?.cpfCnpj || ""
        : d.destinatario?.cnpjCpf || "",
    valorTotal:
      tipo === "nfe" ? d.valorTotal || "" : d.valorTotalServico || "",
  };
}

export type DatePeriod = "15d" | "1m" | "3m" | "6m" | "1y";

export interface NfeHistoryFilter {
  statuses?: NfeStatus[];
  datePeriod?: DatePeriod;
}

export async function getNfeHistory(options?: {
  excludeStatuses?: NfeStatus[];
  filter?: NfeHistoryFilter;
}): Promise<NfeHistoryEntry[]> {
  const supabase = createClient();
  let query = supabase
    .from("notas_fiscais")
    .select(SELECT_COLS)
    .order("validated_at", { ascending: false });

  if (options?.excludeStatuses?.length) {
    query = query.not(
      "status",
      "in",
      `(${options.excludeStatuses.join(",")})`,
    );
  }

  // Filtro por status
  if (options?.filter?.statuses?.length) {
    query = query.in(
      "status",
      options.filter.statuses,
    );
  }

  // Filtro por período de data
  if (options?.filter?.datePeriod) {
    const now = new Date();
    let days: number;
    switch (options.filter.datePeriod) {
      case "15d": days = 15; break;
      case "1m": days = 30; break;
      case "3m": days = 90; break;
      case "6m": days = 180; break;
      case "1y": days = 365; break;
      default: days = 0;
    }
    if (days > 0) {
      const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
      query = query.gte("validated_at", since.toISOString());
    }
  }

  const { data, error } = await query;

  if (error) {
    console.error("Erro ao buscar NF-es:", error.message);
    return [];
  }
  return (data || []).map(rowToEntry);
}

export async function getNfesByStatus(
  status: NfeStatus,
): Promise<NfeHistoryEntry[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("notas_fiscais")
    .select(SELECT_COLS)
    .eq("status", status)
    .order("validated_at", { ascending: false });

  if (error) {
    console.error("Erro ao buscar NF-es por status:", error.message);
    return [];
  }
  return (data || []).map(rowToEntry);
}

export async function saveNfeToHistory(
  tipo: TipoDocumento,
  data: NotaFiscalData | CteData,
  image?: string,
): Promise<NfeHistoryEntry> {
  const supabase = createClient();
  const d = data as NotaFiscalData & CteData;
  const chave = (d.chaveAcesso || "").replace(/\s+/g, "");
  const resumo = extrairResumo(tipo, data);

  // Adiciona status a cada produto no payload
  const dataWithStatus = { ...data } as NotaFiscalData & CteData;
  if (tipo === "nfe" && (data as NotaFiscalData).produtos?.length) {
    (dataWithStatus as NotaFiscalData).produtos = (data as NotaFiscalData).produtos!.map((p) => ({
      ...p,
      status: "pendente",
    }));
  }

  const { data: row, error } = await supabase
    .from("notas_fiscais")
    .upsert(
      {
        chave_acesso: chave,
        tipo,
        numero: resumo.numero,
        serie: resumo.serie,
        emitente_nome: resumo.emitenteNome,
        emitente_cnpj: resumo.emitenteCnpj,
        destinatario_nome: resumo.destinatarioNome,
        destinatario_cnpj: resumo.destinatarioCnpj,
        valor_total: resumo.valorTotal,
        payload: dataWithStatus,
        image: image || null,
        validated_at: new Date().toISOString(),
      },
      { onConflict: "chave_acesso" },
    )
    .select(SELECT_COLS)
    .single();

  if (error) {
    console.error("Erro ao salvar NF-e:", error.message);
    throw error;
  }

  // Produtos (itens da NF-e) — substitui os itens da nota ao revalidar
  if (tipo === "nfe" && (data as NotaFiscalData).produtos?.length) {
    await supabase.from("produtos").delete().eq("nota_fiscal_id", row.id);
    const itens = (data as NotaFiscalData).produtos!.map((p) => ({
      nota_fiscal_id: row.id,
      codigo: p.codigo || null,
      descricao: p.descricao || null,
      ncm: p.ncm || null,
      cst: p.cst || null,
      cfop: p.cfop || null,
      unidade: p.unidade || null,
      quantidade: p.quantidade || null,
      valor_unitario: p.valorUnitario || null,
      valor_total: p.valorTotal || null,
      status: row.status || "pendente",
    }));
    const { error: errItens } = await supabase.from("produtos").insert(itens);
    if (errItens) {
      console.error("Erro ao salvar produtos:", errItens.message);
    }
  }

  return rowToEntry(row);
}

export async function deleteNfeFromHistory(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("notas_fiscais").delete().eq("id", id);
  if (error) {
    console.error("Erro ao excluir NF-e:", error.message);
  }
}

export async function clearNfeHistory(): Promise<void> {
  const supabase = createClient();
  // PostgREST exige um filtro no delete — remove todas as linhas do usuário
  const { error } = await supabase
    .from("notas_fiscais")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");
  if (error) {
    console.error("Erro ao limpar histórico:", error.message);
  }
}

export async function getNfeById(
  id: string,
): Promise<NfeHistoryEntry | undefined> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("notas_fiscais")
    .select(SELECT_COLS)
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return undefined;
  return rowToEntry(data);
}

export async function updateNfeStatus(
  id: string,
  status: NfeStatus,
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("notas_fiscais")
    .update({ status })
    .eq("id", id);
  if (error) {
    console.error("Erro ao atualizar status:", error.message);
  }
  // Propaga o status para todos os produtos da NF-e
  const { error: errProd } = await supabase
    .from("produtos")
    .update({ status })
    .eq("nota_fiscal_id", id);
  if (errProd) {
    console.error("Erro ao atualizar status dos produtos:", errProd.message);
  }
}

// ---------------------------------------------------------------------------
// Dashboard — estatísticas agregadas
// ---------------------------------------------------------------------------

export type DashboardPeriod = "7d" | "1m" | "6m" | "1y";

export interface DashboardStats {
  kpis: {
    nfesHoje: number;
    concluidasHoje: number;
    emRota: number;
    pendentes: number;
    valorEmRota: number;
    canceladas: number;
  };
  /** Período selecionado — NF-es entregues por data (7d/1m: diário · 6m/1y: mensal) */
  entregasPorData: {
    key: string;
    label: string;
    hoje: boolean;
    total: number;
  }[];
  /** Distribuição atual por status (todos os registros) */
  statusAtual: { status: NfeStatus; total: number }[];
  /** NF-es em rota no momento */
  rotaHoje: NfeHistoryEntry[];
}

interface DashboardRow {
  id: string;
  status: NfeStatus;
  valor_total: string | null;
  validated_at: string;
  atualizado_em: string;
}

function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dia}`;
}

function formatDay(d: Date): string {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function toNumber(v: string | null | undefined): number {
  if (!v) return 0;
  const clean = String(v).replace(/\./g, "").replace(",", ".");
  const n = parseFloat(clean);
  return isNaN(n) ? 0 : n;
}

function buildPeriodPoints(period: DashboardPeriod, hoje: Date) {
  const points: { key: string; label: string; hoje: boolean }[] = [];
  if (period === "7d" || period === "1m") {
    const dias = period === "7d" ? 7 : 30;
    for (let i = dias - 1; i >= 0; i--) {
      const d = new Date(hoje);
      d.setDate(hoje.getDate() - i);
      points.push({ key: toDateKey(d), label: formatDay(d), hoje: i === 0 });
    }
  } else {
    const meses = period === "6m" ? 6 : 12;
    for (let i = meses - 1; i >= 0; i--) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
      points.push({
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
        label: `${String(d.getMonth() + 1).padStart(2, "0")}/${String(
          d.getFullYear(),
        ).slice(2)}`,
        hoje: i === 0,
      });
    }
  }
  return points;
}

function pointKeyOf(dateStr: string, period: DashboardPeriod): string {
  const d = new Date(dateStr);
  if (period === "7d" || period === "1m") return toDateKey(d);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export async function getDashboardStats(
  period: DashboardPeriod = "7d",
): Promise<DashboardStats> {
  const supabase = createClient();
  const hoje = new Date();
  const hojeKey = toDateKey(hoje);
  const pontos = buildPeriodPoints(period, hoje);

  const { data, error } = await supabase
    .from("notas_fiscais")
    .select("id, status, valor_total, validated_at, atualizado_em");

  if (error) {
    console.error("Erro ao buscar estatísticas do dashboard:", error.message);
  }

  const rows = (data || []) as DashboardRow[];

  const entregasPorData = pontos.map((p) => ({
    key: p.key,
    label: p.label,
    hoje: p.hoje,
    total: rows.filter(
      (r) =>
        r.status === "entregue" &&
        pointKeyOf(r.atualizado_em, period) === p.key,
    ).length,
  }));

  const statusAtual = NFE_STATUSES.map((s) => ({
    status: s,
    total: rows.filter((r) => r.status === s).length,
  })).filter((s) => s.total > 0);

  const kpis = {
    nfesHoje: rows.filter(
      (r) => toDateKey(new Date(r.validated_at)) === hojeKey,
    ).length,
    concluidasHoje: rows.filter(
      (r) =>
        r.status === "entregue" &&
        toDateKey(new Date(r.atualizado_em)) === hojeKey,
    ).length,
    emRota: rows.filter((r) => r.status === "em_rota").length,
    pendentes: rows.filter((r) => r.status === "pendente").length,
    valorEmRota: rows
      .filter((r) => r.status === "em_rota")
      .reduce((acc, r) => acc + toNumber(r.valor_total), 0),
    canceladas: rows.filter((r) => r.status === "cancelado").length,
  };

  const rotaHoje = await getNfesByStatus("em_rota");

  return { kpis, entregasPorData, statusAtual, rotaHoje };
}

// ---------------------------------------------------------------------------
// Migração do histórico antigo (localStorage) para o banco
// ---------------------------------------------------------------------------

function safeParse<T = unknown>(v: string | null): T | null {
  if (!v) return null;
  try {
    return JSON.parse(v) as T;
  } catch {
    return null;
  }
}

interface LegacyEntry {
  id: string;
  tipo?: TipoDocumento;
  data: NotaFiscalData | CteData;
  image?: string;
  validatedAt: number;
}

export async function migrateLegacyHistory(): Promise<number> {
  if (typeof window === "undefined") return 0;
  const raw = localStorage.getItem(NFE_HISTORY_KEY);
  if (!raw) return 0;

  const parsed = safeParse<LegacyEntry[]>(raw);
  if (!Array.isArray(parsed) || parsed.length === 0) {
    localStorage.removeItem(NFE_HISTORY_KEY);
    return 0;
  }

  let migrados = 0;
  for (const entry of parsed) {
    try {
      const tipo = entry.tipo ?? "nfe";
      await saveNfeToHistory(tipo, entry.data, entry.image);
      migrados++;
    } catch (e) {
      console.warn("Falha ao migrar NF-e do localStorage:", e);
    }
  }

  // Só limpa o localStorage se tudo foi migrado
  if (migrados === parsed.length) {
    localStorage.removeItem(NFE_HISTORY_KEY);
  }
  return migrados;
}