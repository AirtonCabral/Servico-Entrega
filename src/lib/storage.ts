"use client";

import type { NotaFiscalData } from "./types";

export const NFE_HISTORY_KEY = "nfe:history";
export const NFE_CURRENT_KEY = "nfe:data";
export const NFE_VALIDATED_KEY = "nfe:validated";

export interface NfeHistoryEntry {
  id: string;
  data: NotaFiscalData;
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

export function getNfeHistory(): NfeHistoryEntry[] {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(NFE_HISTORY_KEY);
  const parsed = safeParse<NfeHistoryEntry[]>(raw);
  return Array.isArray(parsed) ? parsed : [];
}

export function saveNfeToHistory(
  data: NotaFiscalData,
  image?: string,
): NfeHistoryEntry {
  const id =
    "nfe_" +
    (data.numero || "") +
    "_" +
    (data.chaveAcesso || "").replace(/\s+/g, "").slice(-10) +
    "_" +
    Date.now();

  const entry: NfeHistoryEntry = {
    id,
    data,
    image,
    validatedAt: Date.now(),
  };

  if (typeof window !== "undefined") {
    const prev = getNfeHistory();
    const filtered = prev.filter(
      (p) =>
        !(
          p.data.numero === data.numero &&
          p.data.chaveAcesso === data.chaveAcesso &&
          p.data.emitente.cnpj === data.emitente.cnpj
        ),
    );
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
