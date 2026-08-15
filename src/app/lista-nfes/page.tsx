"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { NfeHistoryEntry } from "@/lib/storage";
import { getNfeHistory } from "@/lib/storage";

export default function ListaNfesPage() {
  const router = useRouter();
  const [itens, setItens] = useState<NfeHistoryEntry[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const history = getNfeHistory(); // pode ler de localStorage aqui
    setItens(history);
    setLoaded(true);
  }, []);

  const toggleSelection = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === itens.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(itens.map(item => item.id)));
    }
  };

  const handleEnviarParaEntrega = () => {
    if (selectedIds.size === 0) {
      alert("Selecione pelo menos uma NF-e para envio.");
      return;
    }

    const selectedItens = itens.filter(item => selectedIds.has(item.id));
    
    // Salvar as NF-es selecionadas no sessionStorage para a página de entrega
    sessionStorage.setItem(
      "entrega:selected",
      JSON.stringify(selectedItens)
    );
    
    router.push("/entrega");
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
      <div className="mb-6 sm:mb-8">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-primary-600 transition"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            className="w-4 h-4"
          >
            <path d="m15 18-6-6 6-6" />
          </svg>
          Nova NF-e
        </Link>
        <div className="mt-4 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">
              Lista de NF-es Escaneadas
            </h2>
            <p className="mt-2 text-sm text-gray-600 max-w-2xl">
              Relatório simplificado das notas fiscais escaneadas com os principais
              dados do destinatário.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 self-start">
            <Link href="/" className="btn-primary">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                className="w-4 h-4"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
              Nova NF-e
            </Link>
            {selectedIds.size > 0 && (
              <button
                onClick={handleEnviarParaEntrega}
                className="btn-primary"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  className="w-4 h-4"
                >
                  <path d="M9 16l5 5 5-5" />
                  <path d="M14 11V5" />
                </svg>
                Enviar {selectedIds.size} para Entrega
              </button>
            )}
          </div>
        </div>
      </div>

      {!loaded ? null : itens.length === 0 ? (
        <div className="card text-center py-16">
          <div className="w-20 h-20 rounded-2xl bg-slate-100 grid place-items-center mx-auto mb-5 text-4xl">
            📭
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Nenhuma NF-e escaneada ainda
          </h3>
          <p className="text-sm text-gray-600 mb-6 max-w-md mx-auto">
            Assim que você escanear uma nota fiscal, ela aparecerá nesta lista.
          </p>
          <Link href="/" className="btn-primary">
            Começar agora
          </Link>
        </div>
      ) : (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input
                type="checkbox"
                checked={selectedIds.size === itens.length && itens.length > 0}
                onChange={toggleSelectAll}
                className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              Selecionar todas
            </label>
            <span className="text-xs text-gray-500">
              {selectedIds.size} selecionado(s)
            </span>
          </div>
          <div className="overflow-x-auto -mx-6 sm:-mx-6 px-6 sm:px-6">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold uppercase tracking-wider text-gray-500 border-b border-gray-200">
                  <th className="pb-3 pr-4 font-medium w-10"></th>
                  <th className="pb-3 pr-4 font-medium">Número NF-e</th>
                  <th className="pb-3 pr-4 font-medium">Data de Emissão</th>
                  <th className="pb-3 pr-4 font-medium">Nome Destinatário</th>
                  <th className="pb-3 pr-4 font-medium">Endereço</th>
                  <th className="pb-3 font-medium">Bairro</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {itens.map((item) => (
                  <tr
                    key={item.id}
                    className={`hover:bg-gray-50 transition-colors ${
                      selectedIds.has(item.id) ? "bg-primary-50" : ""
                    }`}
                  >
                    <td className="py-3 pr-4">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(item.id)}
                        onChange={() => toggleSelection(item.id)}
                        className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      />
                    </td>
                    <td className="py-3 pr-4 font-medium text-gray-900">
                      {item.data.numero || "-"}
                    </td>
                    <td className="py-3 pr-4 text-gray-600">
                      {item.tipo === "cte"
                        ? (item.data as any).dataHoraEmissao || "-"
                        : (item.data as any).dataEmissao || "-"}
                    </td>
                    <td className="py-3 pr-4 text-gray-900">
                      {item.data.destinatario.nome || "-"}
                    </td>
                    <td className="py-3 pr-4 text-gray-600">
                      {item.data.destinatario.endereco || "-"}
                    </td>
                    <td className="py-3 text-gray-600">
                      {item.data.destinatario.bairro || "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 pt-4 border-t border-gray-200 text-xs text-gray-500">
            Total: {itens.length} NF-e(s) · {selectedIds.size} selecionado(s)
          </div>
        </div>
      )}
    </div>
  );
}
