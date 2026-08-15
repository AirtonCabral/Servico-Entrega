"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { NotaFiscalData, ProdutoItem } from "@/lib/types";
import { saveNfeToHistory } from "@/lib/storage";

type Stored = {
  data: NotaFiscalData;
  image: string;
  extractedAt: number;
};

type SectionKey = "nfe" | "emitente" | "destinatario" | "produtos" | "totais";

const SECTIONS: { key: SectionKey; label: string; icon: string }[] = [
  { key: "nfe", label: "NF-e", icon: "📄" },
  { key: "emitente", label: "Emitente", icon: "🏢" },
  { key: "destinatario", label: "Destinatário", icon: "👤" },
  { key: "produtos", label: "Itens", icon: "📦" },
  { key: "totais", label: "Totais", icon: "💰" },
];

const emptyProduto = (): ProdutoItem => ({
  codigo: "",
  descricao: "",
  ncm: "",
  cst: "",
  cfop: "",
  unidade: "UN",
  quantidade: "0,000",
  valorUnitario: "0,00",
  valorTotal: "0,00",
});

function Field({
  id,
  label,
  value,
  onChange,
  placeholder,
  required,
  inputMode,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  inputMode?:
    | "text"
    | "numeric"
    | "decimal"
    | "tel"
    | "email"
    | "search"
    | "url"
    | "none";
}) {
  const hasValue = value.trim().length > 0;
  return (
    <div>
      <label htmlFor={id} className="label-field">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <input
        id={id}
        type="text"
        inputMode={inputMode}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`input-field ${
          !hasValue ? "bg-amber-50/60 border-amber-200" : ""
        }`}
      />
      {!hasValue && (
        <p className="mt-1 text-[11px] text-amber-700">
          Não detectado — confira na imagem
        </p>
      )}
    </div>
  );
}

function SectionHeader({
  icon,
  title,
  subtitle,
}: {
  icon: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex items-start gap-3 mb-4">
      <div className="w-10 h-10 rounded-lg bg-primary-50 text-primary-600 grid place-items-center text-xl">
        {icon}
      </div>
      <div>
        <h3 className="font-semibold text-gray-900">{title}</h3>
        {subtitle && (
          <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>
        )}
      </div>
    </div>
  );
}

export default function ValidacaoPage() {
  const router = useRouter();
  const [stored, setStored] = useState<Stored | null>(null);
  const [data, setData] = useState<NotaFiscalData | null>(null);
  const [active, setActive] = useState<SectionKey>("nfe");
  const [confirmado, setConfirmado] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("nfe:data");
      if (!raw) {
        setLoading(false);
        return;
      }
      const parsed = JSON.parse(raw) as Stored;
      setStored(parsed);
      setData(parsed.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-16 text-center">
        <p className="text-gray-500">Carregando dados extraídos...</p>
      </div>
    );
  }

  if (!stored || !data) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center">
        <div className="card">
          <div className="w-16 h-16 rounded-full bg-amber-50 text-amber-600 grid place-items-center text-2xl mx-auto mb-4">
            ⚠️
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">
            Nenhuma NF-e carregada
          </h2>
          <p className="text-sm text-gray-600 mb-6">
            Volte para a página inicial e envie a foto da sua nota fiscal para
            extrair os dados antes de validar.
          </p>
          <Link href="/" className="btn-primary">
            Enviar nova NF-e
          </Link>
        </div>
      </div>
    );
  }

  const patch = <K extends keyof NotaFiscalData>(
    key: K,
    value: NotaFiscalData[K],
  ) => setData((d) => (d ? { ...d, [key]: value } : d));

  const patchEmitente = (key: keyof NotaFiscalData["emitente"], v: string) =>
    patch("emitente", { ...data.emitente, [key]: v });
  const patchDest = (
    key: keyof NotaFiscalData["destinatario"],
    v: string,
  ) => patch("destinatario", { ...data.destinatario, [key]: v });
  const patchTotais = (
    key: keyof NotaFiscalData["valoresTotais"],
    v: string,
  ) => patch("valoresTotais", { ...data.valoresTotais, [key]: v });

  const updateProduto = (idx: number, p: ProdutoItem) => {
    const next = [...data.produtos];
    next[idx] = p;
    patch("produtos", next);
  };
  const removeProduto = (idx: number) => {
    if (data.produtos.length <= 1) return;
    patch(
      "produtos",
      data.produtos.filter((_, i) => i !== idx),
    );
  };
  const addProduto = () =>
    patch("produtos", [...data.produtos, emptyProduto()]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!data || !stored) return;
    try {
      saveNfeToHistory("nfe", data, stored.image);
      sessionStorage.setItem(
        "nfe:validated",
        JSON.stringify({
          data,
          image: stored.image,
          validatedAt: Date.now(),
          confirmed: confirmado,
        }),
      );
      sessionStorage.removeItem("nfe:data");
    } catch (err) {
      console.warn("Falha ao persistir NF-e:", err);
    }
    setSaved(true);
    setTimeout(() => {
      router.push("/nfes");
    }, 900);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
      <div className="mb-6 sm:mb-8">
        <div className="mt-4 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">
              Valide os dados extraídos
            </h1>
            <p className="mt-2 text-sm text-gray-600 max-w-2xl">
              Revise cuidadosamente cada campo. Campos em amarelo não foram
              detectados automaticamente — use a imagem ao lado para confirmar
              e preencher.
            </p>
          </div>
          <div className="text-xs text-gray-500 bg-white border border-gray-200 rounded-lg px-3 py-2 shadow-sm inline-flex items-center gap-2 self-start">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            Extraído em{" "}
            <span className="font-medium text-gray-800 tabular-nums">
              {new Date(stored.extractedAt).toLocaleString("pt-BR")}
            </span>
          </div>
        </div>
      </div>

      <form onSubmit={onSubmit} className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="card flex flex-wrap gap-2">
            {SECTIONS.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setActive(s.key)}
                className={`px-3.5 py-2 rounded-lg text-sm font-medium transition inline-flex items-center gap-1.5 ${
                  active === s.key
                    ? "bg-primary-600 text-white shadow-sm"
                    : "bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200"
                }`}
              >
                <span>{s.icon}</span>
                {s.label}
              </button>
            ))}
          </div>

          {active === "nfe" && (
            <div className="card">
              <SectionHeader
                icon="📄"
                title="Dados da Nota Fiscal"
                subtitle="Identificação, chave de acesso e datas"
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <Field
                  id="numero"
                  label="Número NF-e"
                  required
                  value={data.numero}
                  onChange={(v) => patch("numero", v)}
                  inputMode="numeric"
                />
                <Field
                  id="serie"
                  label="Série"
                  required
                  value={data.serie}
                  onChange={(v) => patch("serie", v)}
                />
                <Field
                  id="natureza"
                  label="Natureza da Operação"
                  value={data.naturezaOperacao}
                  onChange={(v) => patch("naturezaOperacao", v)}
                />
                <Field
                  id="dataEmissao"
                  label="Data de Emissão"
                  required
                  value={data.dataEmissao}
                  onChange={(v) => patch("dataEmissao", v)}
                  placeholder="DD/MM/AAAA"
                />
                <Field
                  id="dataSaida"
                  label="Saída / Entrada"
                  value={data.dataSaidaEntrada}
                  onChange={(v) => patch("dataSaidaEntrada", v)}
                  placeholder="DD/MM/AAAA"
                />
                <Field
                  id="horaSaida"
                  label="Hora da Saída"
                  value={data.horaSaida}
                  onChange={(v) => patch("horaSaida", v)}
                  placeholder="HH:MM:SS"
                />
                <div className="sm:col-span-2 lg:col-span-3">
                  <Field
                    id="chave"
                    label="Chave de Acesso (44 dígitos)"
                    required
                    value={data.chaveAcesso}
                    onChange={(v) => patch("chaveAcesso", v)}
                  />
                </div>
                <div className="sm:col-span-2 lg:col-span-3">
                  <Field
                    id="protocolo"
                    label="Protocolo de Autorização"
                    value={data.protocoloAutorizacao}
                    onChange={(v) => patch("protocoloAutorizacao", v)}
                  />
                </div>
                <div className="sm:col-span-2 lg:col-span-3">
                  <Field
                    id="valorTotal"
                    label="Valor Total da NF-e (R$)"
                    required
                    inputMode="decimal"
                    value={data.valorTotal}
                    onChange={(v) => patch("valorTotal", v)}
                  />
                </div>
              </div>
            </div>
          )}

          {active === "emitente" && (
            <div className="card">
              <SectionHeader
                icon="🏢"
                title="Emitente (Empresa que emitiu a NF-e)"
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <Field
                    id="em-nome"
                    label="Razão Social / Nome"
                    required
                    value={data.emitente.nome}
                    onChange={(v) => patchEmitente("nome", v)}
                  />
                </div>
                <Field
                  id="em-cnpj"
                  label="CNPJ"
                  required
                  value={data.emitente.cnpj}
                  onChange={(v) => patchEmitente("cnpj", v)}
                  inputMode="numeric"
                />
                <Field
                  id="em-ie"
                  label="Inscrição Estadual"
                  value={data.emitente.inscricaoEstadual}
                  onChange={(v) => patchEmitente("inscricaoEstadual", v)}
                />
                <div className="sm:col-span-2">
                  <Field
                    id="em-end"
                    label="Endereço (Logradouro, Nº, Complemento)"
                    value={data.emitente.endereco}
                    onChange={(v) => patchEmitente("endereco", v)}
                  />
                </div>
                <Field
                  id="em-bairro"
                  label="Bairro / Distrito"
                  value={data.emitente.bairro}
                  onChange={(v) => patchEmitente("bairro", v)}
                />
                <Field
                  id="em-cep"
                  label="CEP"
                  value={data.emitente.cep}
                  onChange={(v) => patchEmitente("cep", v)}
                  inputMode="numeric"
                />
                <Field
                  id="em-mun"
                  label="Município"
                  value={data.emitente.municipio}
                  onChange={(v) => patchEmitente("municipio", v)}
                />
                <Field
                  id="em-uf"
                  label="UF"
                  value={data.emitente.uf}
                  onChange={(v) => patchEmitente("uf", v)}
                />
                <Field
                  id="em-tel"
                  label="Telefone"
                  value={data.emitente.telefone}
                  onChange={(v) => patchEmitente("telefone", v)}
                  inputMode="tel"
                />
              </div>
            </div>
          )}

          {active === "destinatario" && (
            <div className="card">
              <SectionHeader
                icon="👤"
                title="Destinatário / Remetente"
                subtitle="Quem recebeu ou enviou a mercadoria"
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <Field
                    id="de-nome"
                    label="Nome / Razão Social"
                    required
                    value={data.destinatario.nome}
                    onChange={(v) => patchDest("nome", v)}
                  />
                </div>
                <Field
                  id="de-cpf"
                  label="CPF / CNPJ"
                  required
                  value={data.destinatario.cpfCnpj}
                  onChange={(v) => patchDest("cpfCnpj", v)}
                  inputMode="numeric"
                />
                <Field
                  id="de-ie"
                  label="Inscrição Estadual"
                  value={data.destinatario.inscricaoEstadual || ""}
                  onChange={(v) => patchDest("inscricaoEstadual", v)}
                />
                <div className="sm:col-span-2">
                  <Field
                    id="de-end"
                    label="Endereço (Logradouro, Nº, Complemento)"
                    value={data.destinatario.endereco}
                    onChange={(v) => patchDest("endereco", v)}
                  />
                </div>
                <Field
                  id="de-bairro"
                  label="Bairro / Distrito"
                  value={data.destinatario.bairro}
                  onChange={(v) => patchDest("bairro", v)}
                />
                <Field
                  id="de-cep"
                  label="CEP"
                  value={data.destinatario.cep}
                  onChange={(v) => patchDest("cep", v)}
                  inputMode="numeric"
                />
                <Field
                  id="de-mun"
                  label="Município"
                  value={data.destinatario.municipio}
                  onChange={(v) => patchDest("municipio", v)}
                />
                <div className="grid grid-cols-2 gap-4 sm:col-span-1">
                  <Field
                    id="de-uf"
                    label="UF"
                    value={data.destinatario.uf}
                    onChange={(v) => patchDest("uf", v)}
                  />
                  <Field
                    id="de-tel"
                    label="Telefone"
                    value={data.destinatario.telefone}
                    onChange={(v) => patchDest("telefone", v)}
                    inputMode="tel"
                  />
                </div>
              </div>
            </div>
          )}

          {active === "produtos" && (
            <div className="card">
              <div className="flex items-start justify-between gap-4 mb-4">
                <SectionHeader
                  icon="📦"
                  title="Produtos / Serviços"
                  subtitle={`${data.produtos.length} item(ns) listado(s) na NF-e`}
                />
                <button
                  type="button"
                  onClick={addProduto}
                  className="btn-secondary text-sm !py-2 !px-3"
                >
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
                  Adicionar item
                </button>
              </div>

              <div className="space-y-5">
                {data.produtos.map((p, i) => (
                  <div
                    key={i}
                    className="rounded-xl border border-gray-200 bg-gray-50/40 p-4 sm:p-5 relative"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-semibold text-gray-500 bg-white px-2.5 py-1 rounded-full border border-gray-200">
                        Item {i + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeProduto(i)}
                        disabled={data.produtos.length <= 1}
                        className="text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Remover
                      </button>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="col-span-2 sm:col-span-1">
                        <Field
                          id={`p-cod-${i}`}
                          label="Código"
                          value={p.codigo}
                          onChange={(v) =>
                            updateProduto(i, { ...p, codigo: v })
                          }
                        />
                      </div>
                      <div className="col-span-2 sm:col-span-2">
                        <Field
                          id={`p-desc-${i}`}
                          label="Descrição"
                          value={p.descricao}
                          onChange={(v) =>
                            updateProduto(i, { ...p, descricao: v })
                          }
                        />
                      </div>
                      <div>
                        <Field
                          id={`p-und-${i}`}
                          label="Und."
                          value={p.unidade}
                          onChange={(v) =>
                            updateProduto(i, { ...p, unidade: v })
                          }
                        />
                      </div>
                      <div>
                        <Field
                          id={`p-qtd-${i}`}
                          label="Quantidade"
                          inputMode="decimal"
                          value={p.quantidade}
                          onChange={(v) =>
                            updateProduto(i, { ...p, quantidade: v })
                          }
                        />
                      </div>
                      <div>
                        <Field
                          id={`p-vu-${i}`}
                          label="Vlr. Unitário"
                          inputMode="decimal"
                          value={p.valorUnitario}
                          onChange={(v) =>
                            updateProduto(i, { ...p, valorUnitario: v })
                          }
                        />
                      </div>
                      <div>
                        <Field
                          id={`p-vt-${i}`}
                          label="Vlr. Total"
                          inputMode="decimal"
                          value={p.valorTotal}
                          onChange={(v) =>
                            updateProduto(i, { ...p, valorTotal: v })
                          }
                        />
                      </div>
                      <div>
                        <Field
                          id={`p-ncm-${i}`}
                          label="NCM"
                          value={p.ncm || ""}
                          onChange={(v) =>
                            updateProduto(i, { ...p, ncm: v })
                          }
                        />
                      </div>
                      <div>
                        <Field
                          id={`p-cst-${i}`}
                          label="CST/CSOSN"
                          value={p.cst || ""}
                          onChange={(v) =>
                            updateProduto(i, { ...p, cst: v })
                          }
                        />
                      </div>
                      <div className="col-span-2">
                        <Field
                          id={`p-cfop-${i}`}
                          label="CFOP"
                          value={p.cfop || ""}
                          onChange={(v) =>
                            updateProduto(i, { ...p, cfop: v })
                          }
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {active === "totais" && (
            <div className="card">
              <SectionHeader
                icon="💰"
                title="Valores Totais e Tributos"
                subtitle="Confira os valores finais da operação"
              />
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <Field
                  id="t-bc"
                  label="Base Cálculo ICMS"
                  inputMode="decimal"
                  value={data.valoresTotais.baseCalculoICMS || ""}
                  onChange={(v) => patchTotais("baseCalculoICMS", v)}
                />
                <Field
                  id="t-icms"
                  label="Valor ICMS"
                  inputMode="decimal"
                  value={data.valoresTotais.valorICMS || ""}
                  onChange={(v) => patchTotais("valorICMS", v)}
                />
                <Field
                  id="t-prod"
                  label="Vlr. Produtos"
                  inputMode="decimal"
                  value={data.valoresTotais.valorProdutos || ""}
                  onChange={(v) => patchTotais("valorProdutos", v)}
                />
                <Field
                  id="t-frete"
                  label="Frete"
                  inputMode="decimal"
                  value={data.valoresTotais.valorFrete || ""}
                  onChange={(v) => patchTotais("valorFrete", v)}
                />
                <Field
                  id="t-seg"
                  label="Seguro"
                  inputMode="decimal"
                  value={data.valoresTotais.valorSeguro || ""}
                  onChange={(v) => patchTotais("valorSeguro", v)}
                />
                <Field
                  id="t-desc"
                  label="Desconto"
                  inputMode="decimal"
                  value={data.valoresTotais.valorDesconto || ""}
                  onChange={(v) => patchTotais("valorDesconto", v)}
                />
                <Field
                  id="t-ipi"
                  label="IPI"
                  inputMode="decimal"
                  value={data.valoresTotais.valorIPI || ""}
                  onChange={(v) => patchTotais("valorIPI", v)}
                />
                <Field
                  id="t-out"
                  label="Outras Despesas"
                  inputMode="decimal"
                  value={data.valoresTotais.valorOutrasDespesas || ""}
                  onChange={(v) => patchTotais("valorOutrasDespesas", v)}
                />
                <Field
                  id="t-trib"
                  label="Total Tributos"
                  inputMode="decimal"
                  value={data.valoresTotais.valorTotalTributos || ""}
                  onChange={(v) => patchTotais("valorTotalTributos", v)}
                />
              </div>

              <div className="mt-6 rounded-xl bg-gradient-to-br from-primary-600 to-primary-800 text-white p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-primary-100">
                    Valor total conferido
                  </p>
                  <p className="text-3xl sm:text-4xl font-bold tracking-tight tabular-nums">
                    R$ {data.valorTotal || "0,00"}
                  </p>
                </div>
                <div className="text-sm text-primary-100">
                  <div>
                    Itens:{" "}
                    <span className="font-semibold text-white">
                      {data.produtos.length}
                    </span>
                  </div>
                  <div>
                    Emissão:{" "}
                    <span className="font-semibold text-white">
                      {data.dataEmissao || "-"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="card border-emerald-200 bg-emerald-50/40">
            <div className="flex items-start gap-3">
              <label
                htmlFor="confirmado"
                className="relative flex items-center cursor-pointer"
              >
                <input
                  id="confirmado"
                  type="checkbox"
                  className="peer sr-only"
                  checked={confirmado}
                  onChange={(e) => setConfirmado(e.target.checked)}
                />
                <div className="w-6 h-6 rounded border-2 border-emerald-600 bg-white grid place-items-center peer-checked:bg-emerald-600 transition">
                  {confirmado && (
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="white"
                      strokeWidth={3}
                      className="w-4 h-4"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </div>
              </label>
              <div className="flex-1">
                <label
                  htmlFor="confirmado"
                  className="block font-semibold text-emerald-900 cursor-pointer"
                >
                  Confirmo que revisei e valido todos os dados
                </label>
                <p className="text-sm text-emerald-800/80 mt-1">
                  Marque esta opção apenas após conferir cada campo com a nota
                  fiscal original.
                </p>
              </div>
            </div>

            <div className="mt-5 flex flex-col sm:flex-row gap-3 justify-end">
              <button
                type="button"
                onClick={() => router.push("/")}
                className="btn-secondary"
              >
                Cancelar / Refazer upload
              </button>
              <button
                type="submit"
                disabled={!confirmado || saved}
                className="btn-primary !bg-emerald-600 hover:!bg-emerald-700"
              >
                {saved ? (
                  <>
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2.5}
                      className="w-5 h-5"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    Validado com sucesso
                  </>
                ) : (
                  <>
                    Validar e salvar
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
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        <aside className="lg:col-span-1 space-y-6">
          <div className="card sticky top-24">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-900">Imagem original</h3>
              <a
                href={stored.image}
                download={`nfe-${data.numero || "documento"}.jpg`}
                className="text-xs font-medium text-primary-600 hover:text-primary-700"
              >
                Baixar
              </a>
            </div>
            <p className="text-xs text-gray-500 mb-3">
              Use como referência para conferir os dados extraídos.
            </p>
            <div className="rounded-lg overflow-hidden border border-gray-200 bg-gray-50 max-h-[520px] overflow-y-auto">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={stored.image}
                alt="Imagem da NF-e enviada"
                className="w-full h-auto"
              />
            </div>

            <div className="mt-4 space-y-2 border-t border-gray-100 pt-4">
              {SECTIONS.map((s) => {
                const counts: Record<SectionKey, number> = {
                  nfe: 9,
                  emitente: 9,
                  destinatario: 9,
                  produtos: 0,
                  totais: 9,
                };
                return (
                  <div
                    key={s.key}
                    className="flex items-center justify-between text-xs"
                  >
                    <span className="text-gray-600">
                      {s.icon} {s.label}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setActive(s.key);
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                      className="text-primary-600 font-medium hover:text-primary-700"
                    >
                      Ir →
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </aside>
      </form>
    </div>
  );
}
