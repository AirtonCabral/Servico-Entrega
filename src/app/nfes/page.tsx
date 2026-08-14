"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { NfeHistoryEntry } from "@/lib/storage";
import {
  clearNfeHistory,
  deleteNfeFromHistory,
  getNfeHistory,
} from "@/lib/storage";

function formatDate(ts: number): string {
  try {
    return new Date(ts).toLocaleString("pt-BR");
  } catch {
    return "-";
  }
}

function toNumber(v: string): number {
  if (!v) return 0;
  const clean = String(v).replace(/\./g, "").replace(",", ".");
  const n = parseFloat(clean);
  return isNaN(n) ? 0 : n;
}

function formatMoney(v: string): string {
  const n = toNumber(v);
  return n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });
}

export default function NfeListPage() {
  const router = useRouter();
  const [itens, setItens] = useState<NfeHistoryEntry[]>([]);
  const [filtro, setFiltro] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedNfes, setSelectedNfes] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);

  // Carrega itens apenas na primeira montagem
  useEffect(() => {
    if (typeof window === "undefined") return;
    const history = getNfeHistory();
    setItens(history);
    setLoaded(true);
  }, []);

  // Sempre que itens mudar, atualiza o localStorage
  useEffect(() => {
    if (typeof window === "undefined" || !loaded) return;
    localStorage.setItem("nfe:data", JSON.stringify(itens));
  }, [itens, loaded]);

  const filtrados = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    if (!q) return itens;
    return itens.filter((e) => {
      const d = e.data;
      const haystack = [
        d.numero,
        d.serie,
        d.emitente.nome,
        d.emitente.cnpj,
        d.destinatario.nome,
        d.destinatario.cpfCnpj,
        d.chaveAcesso,
        d.naturezaOperacao,
        d.dataEmissao,
        ...(d.produtos?.map((p) => `${p.codigo} ${p.descricao}`) || []),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [itens, filtro]);

  const totalGeral = useMemo(
    () =>
      itens.reduce((acc, e) => acc + toNumber(e.data.valorTotal), 0),
    [itens],
  );

  const detalhe = selected
    ? itens.find((i) => i.id === selected) || null
    : null;

  const onDelete = (id: string) => {
    if (!confirm("Deseja realmente excluir esta NF-e do histórico?")) return;
    deleteNfeFromHistory(id);
    setItens(getNfeHistory());
    if (selected === id) setSelected(null);
  };

  const onClear = () => {
    if (
      !confirm(
        "Deseja APAGAR TODAS as NF-e do histórico? Essa ação não pode ser desfeita.",
      )
    )
      return;
    clearNfeHistory();
    setItens([]);
    setSelected(null);
  };

  const onEdit = (entry: NfeHistoryEntry) => {
    if (typeof window !== "undefined") {
      sessionStorage.setItem(
        "nfe:data",
        JSON.stringify({
          data: entry.data,
          image: entry.image || "",
          extractedAt: entry.validatedAt,
          fromHistory: true,
          id: entry.id,
        }),
      );
      router.push("/validacao");
    }
  };

  const toggleSelectNfe = (id: string) => {
    setSelectedNfes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedNfes.size === filtrados.length) {
      setSelectedNfes(new Set());
    } else {
      setSelectedNfes(new Set(filtrados.map((e) => e.id)));
    }
  };

  const onSendToDelivery = () => {
    if (selectedNfes.size === 0) {
      alert("Selecione pelo menos uma NF-e para enviar para entregas.");
      return;
    }

    const selectedEntries = itens.filter((e) => selectedNfes.has(e.id));

    if (typeof window !== "undefined") {
      try {
        const existingDelivery = JSON.parse(
          localStorage.getItem("delivery:items") || "[]"
        );

        const newDeliveryItems = selectedEntries.map((entry) => ({
          id: `delivery-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          nfeId: entry.id,
          data: entry.data,
          image: entry.image,
          addedAt: Date.now(),
          status: "pending",
        }));

        const updatedDelivery = [...existingDelivery, ...newDeliveryItems];
        localStorage.setItem("delivery:items", JSON.stringify(updatedDelivery));

        // Remove os selecionados da lista principal
        const updatedItens = itens.filter((e) => {
          !selectedNfes.has(e.id)
          deleteNfeFromHistory(e.id);
        });
        setItens(updatedItens);
        // O useEffect acima já atualiza localStorage "nfe:data"
        setSelectedNfes(new Set());
        setSelected((prev) => (prev && selectedNfes.has(prev) ? null : prev));

        alert(`${selectedNfes.size} NF-e(s) enviada(s) para entregas com sucesso!`);

        // Navega para a página de entregas
        router.push("/entrega");
      } catch (err) {
        console.error("Erro ao enviar para entregas:", err);
        alert("Erro ao enviar NF-es para entregas. Tente novamente.");
      }
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
      <div className="mb-6 sm:mb-8">
        <div className="mt-4 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">
              NF-e&apos;s Validadas
            </h1>
            <p className="mt-2 text-sm text-gray-600 max-w-2xl">
              Histórico das notas fiscais validadas e armazenadas localmente
              (localStorage). Clique em uma linha para ver os detalhes.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 self-start">
            {itens.length > 0 && (
              <button
                type="button"
                onClick={onClear}
                className="btn-secondary !text-red-600 !border-red-200 hover:!bg-red-50"
              >
                Limpar tudo
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
            Nenhuma NF-e validada ainda
          </h3>
          <p className="text-sm text-gray-600 mb-6 max-w-md mx-auto">
            Assim que você validar uma nota fiscal, ela aparecerá aqui para
            consulta, edição ou exclusão.
          </p>
          <Link href="/" className="btn-primary">
            Começar agora
          </Link>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div className="card">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Total de notas
              </p>
              <p className="mt-2 text-3xl font-bold text-gray-900 tabular-nums">
                {itens.length}
              </p>
            </div>
            <div className="card">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Valor total
              </p>
              <p className="mt-2 text-3xl font-bold text-primary-700 tabular-nums">
                {totalGeral.toLocaleString("pt-BR", {
                  style: "currency",
                  currency: "BRL",
                })}
              </p>
            </div>
            <div className="card">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Itens cadastrados
              </p>
              <p className="mt-2 text-3xl font-bold text-gray-900 tabular-nums">
                {itens.reduce(
                  (acc, e) => acc + (e.data.produtos?.length || 0),
                  0,
                )}
              </p>
            </div>
          </div>

          <div className="card">
            <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between mb-5">
              <div className="relative w-full sm:max-w-sm">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2"
                >
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.3-4.3" />
                </svg>
                <input
                  type="text"
                  value={filtro}
                  onChange={(e) => setFiltro(e.target.value)}
                  placeholder="Buscar por nº, emitente, destinatário, produto..."
                  className="input-field pl-9"
                />
              </div>
              <div className="flex items-center gap-3">
                <p className="text-xs text-gray-500">
                  {filtrados.length} de {itens.length} resultado(s)
                </p>
                {selectedNfes.size > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={() => setSelectedNfes(new Set())}
                      className="text-xs font-medium text-gray-500 hover:text-gray-700"
                    >
                      Limpar seleção
                    </button>
                    <button
                      type="button"
                      onClick={onSendToDelivery}
                      className="btn-primary !bg-emerald-600 hover:!bg-emerald-700 text-sm !py-2 !px-4"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                        className="w-4 h-4"
                      >
                        <path d="M5 12h14" />
                        <path d="m12 5 7 7-7 7" />
                      </svg>
                      Enviar para entregas ({selectedNfes.size})
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="overflow-x-auto -mx-6 sm:-mx-6 px-6 sm:px-6">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-semibold uppercase tracking-wide text-gray-500 border-b border-gray-200">
                    <th className="py-3 pr-2 font-medium">
                      <input
                        type="checkbox"
                        checked={
                          selectedNfes.size === filtrados.length &&
                          filtrados.length > 0
                        }
                        onChange={toggleSelectAll}
                        className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      />
                    </th>
                    <th className="py-3 pr-4 font-medium">Nº / Série</th>
                    <th className="py-3 pr-4 font-medium hidden sm:table-cell">
                      Emissão
                    </th>
                    <th className="py-3 pr-4 font-medium">Emitente</th>
                    <th className="py-3 pr-4 font-medium hidden lg:table-cell">
                      Destinatário
                    </th>
                    <th className="py-3 pr-4 font-medium hidden md:table-cell">
                      Itens
                    </th>
                    <th className="py-3 pr-4 font-medium text-right">
                      Valor total
                    </th>
                    <th className="py-3 pr-4 font-medium hidden xl:table-cell">
                      Validada em
                    </th>
                    <th className="py-3 pl-2 font-medium text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtrados.map((e) => {
                    const isSel = selected === e.id;
                    const isSelected = selectedNfes.has(e.id);
                    return (
                      <tr
                        key={e.id}
                        onClick={() => setSelected(isSel ? null : e.id)}
                        className={`transition cursor-pointer ${
                          isSel ? "bg-primary-50/60" : "hover:bg-slate-50"
                        } ${isSelected ? "bg-blue-50/40" : ""}`}
                      >
                        <td className="py-3.5 pr-2 align-top">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(ev) => {
                              ev.stopPropagation();
                              toggleSelectNfe(e.id);
                            }}
                            className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                          />
                        </td>
                        <td className="py-3.5 pr-4 align-top">
                          <div className="font-semibold text-gray-900 tabular-nums">
                            {e.data.numero || "-"}
                          </div>
                          <div className="text-xs text-gray-500">
                            Série {e.data.serie || "-"} ·{" "}
                            <span className="text-primary-700 font-medium">
                              {e.data.naturezaOperacao || "NF-e"}
                            </span>
                          </div>
                        </td>
                        <td className="py-3.5 pr-4 align-top hidden sm:table-cell">
                          <div className="font-medium text-gray-800 tabular-nums">
                            {e.data.dataEmissao || "-"}
                          </div>
                          {e.data.dataSaidaEntrada &&
                            e.data.dataSaidaEntrada !== e.data.dataEmissao && (
                              <div className="text-xs text-gray-500">
                                Saída {e.data.dataSaidaEntrada}
                              </div>
                            )}
                        </td>
                        <td className="py-3.5 pr-4 align-top">
                          <div className="font-medium text-gray-900 line-clamp-1">
                            {e.data.emitente.nome || "-"}
                          </div>
                          <div className="text-xs text-gray-500 tabular-nums">
                            {e.data.emitente.cnpj || "-"}
                          </div>
                        </td>
                        <td className="py-3.5 pr-4 align-top hidden lg:table-cell">
                          <div className="font-medium text-gray-800 line-clamp-1">
                            {e.data.destinatario.nome || "-"}
                          </div>
                          <div className="text-xs text-gray-500 tabular-nums">
                            {e.data.destinatario.cpfCnpj || "-"}
                          </div>
                        </td>
                        <td className="py-3.5 pr-4 align-top hidden md:table-cell">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 tabular-nums">
                            {e.data.produtos?.length || 0} item(ns)
                          </span>
                        </td>
                        <td className="py-3.5 pr-4 align-top text-right">
                          <div className="font-bold text-gray-900 tabular-nums">
                            {formatMoney(e.data.valorTotal)}
                          </div>
                        </td>
                        <td className="py-3.5 pr-4 align-top hidden xl:table-cell">
                          <span className="text-xs text-gray-600 tabular-nums">
                            {formatDate(e.validatedAt)}
                          </span>
                        </td>
                        <td className="py-3.5 pl-2 align-top text-right">
                          <div
                            className="inline-flex gap-1"
                            onClick={(ev) => ev.stopPropagation()}
                          >
                            <button
                              type="button"
                              onClick={() => onEdit(e)}
                              title="Editar"
                              className="p-2 rounded-md text-gray-500 hover:text-primary-600 hover:bg-primary-50 transition"
                            >
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth={2}
                                className="w-4 h-4"
                              >
                                <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                                <path d="m15 5 4 4" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              onClick={() => onDelete(e.id)}
                              title="Excluir"
                              className="p-2 rounded-md text-gray-500 hover:text-red-600 hover:bg-red-50 transition"
                            >
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth={2}
                                className="w-4 h-4"
                              >
                                <path d="M3 6h18" />
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                                <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                <path d="M10 11v6" />
                                <path d="M14 11v6" />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {filtrados.length === 0 && (
              <div className="text-center py-12 text-sm text-gray-500">
                Nenhuma NF-e encontrada para o filtro:{" "}
                <strong className="text-gray-700">
                  &ldquo;{filtro}&rdquo;
                </strong>
              </div>
            )}
          </div>

          {detalhe && (
            <div className="mt-6 card">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-5">
                <div>
                  <h3 className="font-bold text-gray-900 text-lg">
                    Detalhes da NF-e {detalhe.data.numero || ""}{" "}
                    <span className="text-gray-400 font-normal">
                      / Série {detalhe.data.serie || "-"}
                    </span>
                  </h3>
                  <p className="text-xs text-gray-500 mt-1">
                    Validada em {formatDate(detalhe.validatedAt)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => onEdit(detalhe)}
                    className="btn-secondary"
                  >
                    Editar validação
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelected(null)}
                    className="btn-secondary"
                  >
                    Fechar
                  </button>
                </div>
              </div>

              <div className="grid md:grid-cols-3 gap-6">
                <div className="md:col-span-2 space-y-6">
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                      Identificação
                    </p>
                    <dl className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <dt className="text-gray-500 text-xs">Natureza</dt>
                        <dd className="font-medium text-gray-900">
                          {detalhe.data.naturezaOperacao || "-"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-gray-500 text-xs">Emissão</dt>
                        <dd className="font-medium text-gray-900 tabular-nums">
                          {detalhe.data.dataEmissao || "-"}
                        </dd>
                      </div>
                      <div className="col-span-2">
                        <dt className="text-gray-500 text-xs">
                          Chave de acesso
                        </dt>
                        <dd className="font-mono text-xs text-gray-900 break-all">
                          {detalhe.data.chaveAcesso || "-"}
                        </dd>
                      </div>
                    </dl>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="rounded-xl border border-gray-200 p-4 bg-gray-50/50">
                      <p className="text-xs font-semibold text-primary-700 uppercase tracking-wide mb-2">
                        🏢 Emitente
                      </p>
                      <p className="font-semibold text-gray-900 text-sm">
                        {detalhe.data.emitente.nome || "-"}
                      </p>
                      <p className="text-xs text-gray-600 tabular-nums">
                        CNPJ {detalhe.data.emitente.cnpj || "-"}
                      </p>
                      <p className="text-xs text-gray-500 mt-2">
                        {detalhe.data.emitente.endereco}
                        {detalhe.data.emitente.municipio
                          ? ` · ${detalhe.data.emitente.municipio}/${detalhe.data.emitente.uf}`
                          : ""}
                      </p>
                    </div>
                    <div className="rounded-xl border border-gray-200 p-4 bg-gray-50/50">
                      <p className="text-xs font-semibold text-primary-700 uppercase tracking-wide mb-2">
                        👤 Destinatário
                      </p>
                      <p className="font-semibold text-gray-900 text-sm">
                        {detalhe.data.destinatario.nome || "-"}
                      </p>
                      <p className="text-xs text-gray-600 tabular-nums">
                        {detalhe.data.destinatario.cpfCnpj?.length > 14
                          ? "CNPJ "
                          : "CPF "}
                        {detalhe.data.destinatario.cpfCnpj || "-"}
                      </p>
                      <p className="text-xs text-gray-500 mt-2">
                        {detalhe.data.destinatario.endereco}
                        {detalhe.data.destinatario.municipio
                          ? ` · ${detalhe.data.destinatario.municipio}/${detalhe.data.destinatario.uf}`
                          : ""}
                      </p>
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                      Itens ({detalhe.data.produtos?.length || 0})
                    </p>
                    <div className="overflow-x-auto rounded-xl border border-gray-200">
                      <table className="min-w-full text-xs">
                        <thead className="bg-gray-50">
                          <tr className="text-left text-gray-600">
                            <th className="py-2 px-3 font-medium">Código</th>
                            <th className="py-2 px-3 font-medium">Descrição</th>
                            <th className="py-2 px-3 font-medium text-right">
                              Qtd
                            </th>
                            <th className="py-2 px-3 font-medium text-right">
                              Vlr. Unit.
                            </th>
                            <th className="py-2 px-3 font-medium text-right">
                              Total
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 text-gray-800">
                          {(detalhe.data.produtos || []).map((p, i) => (
                            <tr key={i}>
                              <td className="py-2 px-3 tabular-nums font-mono">
                                {p.codigo || "-"}
                              </td>
                              <td className="py-2 px-3">{p.descricao || "-"}</td>
                              <td className="py-2 px-3 text-right tabular-nums">
                                {p.quantidade || "-"} {p.unidade}
                              </td>
                              <td className="py-2 px-3 text-right tabular-nums">
                                {formatMoney(p.valorUnitario)}
                              </td>
                              <td className="py-2 px-3 text-right font-semibold tabular-nums">
                                {formatMoney(p.valorTotal)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  {detalhe.image && (
                    <div className="rounded-xl border border-gray-200 bg-white p-3">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                        Imagem da NF-e
                      </p>
                      <a
                        href={detalhe.image}
                        target="_blank"
                        rel="noreferrer"
                        className="block rounded-lg overflow-hidden bg-gray-50 aspect-[4/3]"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={detalhe.image}
                          alt="Imagem da NF-e"
                          className="w-full h-full object-contain"
                        />
                      </a>
                    </div>
                  )}
                  <div className="rounded-xl bg-gradient-to-br from-primary-600 to-primary-800 text-white p-5">
                    <p className="text-xs uppercase tracking-wide text-primary-100">
                      Valor total da NF-e
                    </p>
                    <p className="mt-2 text-3xl font-bold tabular-nums">
                      {formatMoney(detalhe.data.valorTotal)}
                    </p>
                    <dl className="mt-4 space-y-1.5 text-sm">
                      {[
                        ["Produtos", detalhe.data.valoresTotais.valorProdutos],
                        ["ICMS", detalhe.data.valoresTotais.valorICMS],
                        ["Frete", detalhe.data.valoresTotais.valorFrete],
                        ["Desconto", detalhe.data.valoresTotais.valorDesconto],
                      ].map(([k, v]) =>
                        v ? (
                          <div
                            key={k}
                            className="flex justify-between text-primary-100"
                          >
                            <dt>{k}</dt>
                            <dd className="tabular-nums font-medium">
                              {formatMoney(v)}
                            </dd>
                          </div>
                        ) : null,
                      )}
                    </dl>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}