"use client";

import type { NotaFiscalData, CteData, TipoDocumento } from "./types";

export const NFE_HISTORY_KEY = "nfe:history";
export const NFE_CURRENT_KEY = "nfe:data";
export const NFE_VALIDATED_KEY = "nfe:validated";

export interface NfeHistoryEntry {
  id: string;
  /** Ausente em registros antigos (salvos antes do suporte a CT-e) -> tratar como "nfe" */
  tipo?: TipoDocumento;
  data: NotaFiscalData | CteData;
  image?: string;
  validatedAt: number;
}

function safeParse<T = unknown>(v: string | null): T | null {
  if (!v) return null;
  try {
    return JSON.parse(v) as T;
  } catch {
    return null;
  }
}

function numeroEChave(tipo: TipoDocumento, data: NotaFiscalData | CteData) {
  // numero e chaveAcesso existem em ambos os tipos, então o cast é seguro aqui
  const d = data as NotaFiscalData & CteData;
  return { numero: d.numero || "", chave: d.chaveAcesso || "" };
}

export function getNfeHistory(): NfeHistoryEntry[] {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(NFE_HISTORY_KEY);
  const parsed = safeParse<NfeHistoryEntry[]>(raw);
  return Array.isArray(parsed) ? parsed : [];
}

export function saveNfeToHistory(
  tipo: TipoDocumento,
  data: NotaFiscalData | CteData,
  image?: string,
): NfeHistoryEntry {
  const { numero, chave } = numeroEChave(tipo, data);
  const id = `${tipo}_${numero}_${chave.replace(/\s+/g, "").slice(-10)}_${Date.now()}`;

  const entry: NfeHistoryEntry = { id, tipo, data, image, validatedAt: Date.now() };

  if (typeof window !== "undefined") {
    const prev = getNfeHistory();
    const filtered = prev.filter((p) => {
      const pTipo = p.tipo ?? "nfe";
      if (pTipo !== tipo) return true;
      const { numero: pNumero, chave: pChave } = numeroEChave(pTipo, p.data);
      // CNPJ do emitente só existe na NF-e; para CT-e comparamos só número + chave
      const mesmoEmitente =
        tipo === "nfe"
          ? (p.data as NotaFiscalData).emitente?.cnpj ===
            (data as NotaFiscalData).emitente?.cnpj
          : true;
      return !(pNumero === numero && pChave === chave && mesmoEmitente);
    });
    const next = [entry, ...filtered];
    try {
      localStorage.setItem(NFE_HISTORY_KEY, JSON.stringify(next));
    } catch (e) {
      console.warn("Não foi possível salvar no localStorage (quota?):", e);
      localStorage.setItem(
        NFE_HISTORY_KEY,
        JSON.stringify([entry, ...prev.slice(0, 49)]),
      );
    }
  }
  return entry;
}

export function deleteNfeFromHistory(id: string): void {
  if (typeof window === "undefined") return;
  const next = getNfeHistory().filter((e) => e.id !== id);
  localStorage.setItem(NFE_HISTORY_KEY, JSON.stringify(next));
}

export function clearNfeHistory(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(NFE_HISTORY_KEY);
}

export function getNfeById(id: string): NfeHistoryEntry | undefined {
  return getNfeHistory().find((e) => e.id === id);
}
