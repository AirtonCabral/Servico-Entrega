"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type {
  NotaFiscalData,
  ProdutoNF,
  CteData,
  PessoaCTe,
  ComponentesValor,
  TipoDocumento,
  ValoresTotaisNF,
} from "@/lib/types";
import { saveNfeToHistory } from "@/lib/storage";

type Stored = {
  tipo: TipoDocumento;
  data: NotaFiscalData | CteData;
  image: string;
  extractedAt: number;
};

type SectionKeyNfe = "nfe" | "emitente" | "destinatario" | "produtos" | "totais";
type SectionKeyCte =
  | "cte"
  | "remetente"
  | "destinatario-cte"
  | "prestacao"
  | "impostos";
type SectionKey = SectionKeyNfe | SectionKeyCte;

const SECTIONS_NFE: { key: SectionKeyNfe; label: string; icon: string }[] = [
  { key: "nfe", label: "NF-e", icon: "📄" },
  { key: "emitente", label: "Emitente", icon: "🏢" },
  { key: "destinatario", label: "Destinatário", icon: "👤" },
  { key: "produtos", label: "Itens", icon: "📦" },
  { key: "totais", label: "Totais", icon: "💰" },
];

const SECTIONS_CTE: { key: SectionKeyCte; label: string; icon: string }[] = [
  { key: "cte", label: "CT-e", icon: "🚚" },
  { key: "remetente", label: "Remetente", icon: "🏢" },
  { key: "destinatario-cte", label: "Destinatário", icon: "👤" },
  { key: "prestacao", label: "Prestação", icon: "📦" },
  { key: "impostos", label: "Impostos", icon: "💰" },
];

const emptyProduto = (): ProdutoNF => ({
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
  value: string | undefined | null;
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
  // Defesa contra dados vindos de extrações antigas / incompletas: nunca deixa
  // "value" undefined/null chegar até o input ou até o .trim().
  const safeValue = value ?? "";
  const hasValue = safeValue.trim().length > 0;
  return (
    <div>
      <label htmlFor={id} className="label-field">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <input
        id={id}
        type="text"
        inputMode={inputMode}
        value={safeValue}
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
  const [data, setData] = useState<NotaFiscalData | CteData | null>(null);
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
      // registros antigos (antes do suporte a CT-e) não têm "tipo" -> assume nfe
      if (!parsed.tipo) parsed.tipo = "nfe";
      setStored(parsed);
      setData(parsed.data);
      setActive(parsed.tipo === "cte" ? "cte" : "nfe");
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
            Nenhum documento carregado
          </h2>
          <p className="text-sm text-gray-600 mb-6">
            Volte para a página inicial e envie a foto da sua NF-e ou CT-e para
            extrair os dados antes de validar.
          </p>
          <Link href="/" className="btn-primary">
            Enviar novo documento
          </Link>
        </div>
      </div>
    );
  }

  const isNfe = stored.tipo === "nfe";
  const nfeData = isNfe ? (data as NotaFiscalData) : null;
  const cteData = !isNfe ? (data as CteData) : null;
  const SECTIONS = isNfe ? SECTIONS_NFE : SECTIONS_CTE;

  // ---------- patch helpers: NF-e ----------
  const patch = <K extends keyof NotaFiscalData>(
    key: K,
    value: NotaFiscalData[K],
  ) => setData((d) => (d ? { ...(d as NotaFiscalData), [key]: value } : d));

  const patchEmitente = (key: keyof NotaFiscalData["emitente"], v: string) =>
    patch("emitente", { ...nfeData!.emitente, [key]: v });
  const patchDest = (key: keyof NotaFiscalData["destinatario"], v: string) =>
    patch("destinatario", { ...nfeData!.destinatario, [key]: v });
  const patchTotais = (key: keyof ValoresTotaisNF, v: string) =>
    patch("valoresTotais", { ...(nfeData!.valoresTotais || {} as ValoresTotaisNF), [key]: v });

  const updateProduto = (idx: number, p: ProdutoNF) => {
    const produtos = nfeData!.produtos || [];
    const next = [...produtos];
    next[idx] = p;
    patch("produtos", next);
  };
  const removeProduto = (idx: number) => {
    const produtos = nfeData!.produtos || [];
    if (produtos.length <= 1) return;
    patch("produtos", produtos.filter((_, i) => i !== idx));
  };
  const addProduto = () => patch("produtos", [...(nfeData!.produtos || []), emptyProduto()]);

  // ---------- patch helpers: CT-e ----------
  const patchCte = <K extends keyof CteData>(key: K, value: CteData[K]) =>
    setData((d) => (d ? { ...(d as CteData), [key]: value } : d));

  const patchPessoaCte = (
    campo: "remetente" | "destinatario" | "tomador",
    key: keyof PessoaCTe,
    v: string,
  ) => patchCte(campo, { ...cteData![campo], [key]: v });

  const patchComponentes = (key: keyof ComponentesValor, v: string) =>
    patchCte("componentesValor", { ...cteData!.componentesValor, [key]: v });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!data || !stored) return;
    try {
      saveNfeToHistory(stored.tipo, data, stored.image);
      sessionStorage.setItem(
        "nfe:validated",
        JSON.stringify({
          tipo: stored.tipo,
          data,
          image: stored.image,
          validatedAt: Date.now(),
          confirmed: confirmado,
        }),
      );
      sessionStorage.removeItem("nfe:data");
    } catch (err) {
      console.warn("Falha ao persistir documento:", err);
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
            {isNfe ? "NF-e" : "CT-e"} extraído em{" "}
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

          {/* ==================== SEÇÕES NF-e ==================== */}
          {isNfe && active === "nfe" && (
            <div className="card">
              <SectionHeader
                icon="📄"
                title="Dados da Nota Fiscal"
                subtitle="Identificação, chave de acesso e datas"
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <Field id="numero" label="Número NF-e" required value={nfeData!.numero} onChange={(v) => patch("numero", v)} inputMode="numeric" />
                <Field id="serie" label="Série" required value={nfeData!.serie} onChange={(v) => patch("serie", v)} />
                <Field id="natureza" label="Natureza da Operação" value={nfeData!.naturezaOperacao} onChange={(v) => patch("naturezaOperacao", v)} />
                <Field id="dataEmissao" label="Data de Emissão" required value={nfeData!.dataEmissao} onChange={(v) => patch("dataEmissao", v)} placeholder="DD/MM/AAAA" />
                <Field id="dataSaida" label="Saída / Entrada" value={nfeData!.dataSaidaEntrada} onChange={(v) => patch("dataSaidaEntrada", v)} placeholder="DD/MM/AAAA" />
                <Field id="horaSaida" label="Hora da Saída" value={nfeData!.horaSaida} onChange={(v) => patch("horaSaida", v)} placeholder="HH:MM:SS" />
                <div className="sm:col-span-2 lg:col-span-3">
                  <Field id="chave" label="Chave de Acesso (44 dígitos)" required value={nfeData!.chaveAcesso} onChange={(v) => patch("chaveAcesso", v)} />
                </div>
                <div className="sm:col-span-2 lg:col-span-3">
                  <Field id="protocolo" label="Protocolo de Autorização" value={nfeData!.protocoloAutorizacao} onChange={(v) => patch("protocoloAutorizacao", v)} />
                </div>
                <div className="sm:col-span-2 lg:col-span-3">
                  <Field id="valorTotal" label="Valor Total da NF-e (R$)" required inputMode="decimal" value={nfeData!.valorTotal} onChange={(v) => patch("valorTotal", v)} />
                </div>
              </div>
            </div>
          )}

          {isNfe && active === "emitente" && (
            <div className="card">
              <SectionHeader icon="🏢" title="Emitente (Empresa que emitiu a NF-e)" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <Field id="em-nome" label="Razão Social / Nome" required value={nfeData!.emitente.nome} onChange={(v) => patchEmitente("nome", v)} />
                </div>
                <Field id="em-cnpj" label="CNPJ" required value={nfeData!.emitente.cnpj} onChange={(v) => patchEmitente("cnpj", v)} inputMode="numeric" />
                <Field id="em-ie" label="Inscrição Estadual" value={nfeData!.emitente.inscricaoEstadual} onChange={(v) => patchEmitente("inscricaoEstadual", v)} />
                <div className="sm:col-span-2">
                  <Field id="em-end" label="Endereço (Logradouro, Nº, Complemento)" value={nfeData!.emitente.endereco} onChange={(v) => patchEmitente("endereco", v)} />
                </div>
                <Field id="em-bairro" label="Bairro / Distrito" value={nfeData!.emitente.bairro} onChange={(v) => patchEmitente("bairro", v)} />
                <Field id="em-cep" label="CEP" value={nfeData!.emitente.cep} onChange={(v) => patchEmitente("cep", v)} inputMode="numeric" />
                <Field id="em-mun" label="Município" value={nfeData!.emitente.municipio} onChange={(v) => patchEmitente("municipio", v)} />
                <Field id="em-uf" label="UF" value={nfeData!.emitente.uf} onChange={(v) => patchEmitente("uf", v)} />
                <Field id="em-tel" label="Telefone" value={nfeData!.emitente.telefone} onChange={(v) => patchEmitente("telefone", v)} inputMode="tel" />
              </div>
            </div>
          )}

          {isNfe && active === "destinatario" && (
            <div className="card">
              <SectionHeader icon="👤" title="Destinatário / Remetente" subtitle="Quem recebeu ou enviou a mercadoria" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <Field id="de-nome" label="Nome / Razão Social" required value={nfeData!.destinatario.nome} onChange={(v) => patchDest("nome", v)} />
                </div>
                <Field id="de-cpf" label="CPF / CNPJ" required value={nfeData!.destinatario.cpfCnpj} onChange={(v) => patchDest("cpfCnpj", v)} inputMode="numeric" />
                <Field id="de-ie" label="Inscrição Estadual" value={nfeData!.destinatario.inscricaoEstadual || ""} onChange={(v) => patchDest("inscricaoEstadual", v)} />
                <div className="sm:col-span-2">
                  <Field id="de-end" label="Endereço (Logradouro, Nº, Complemento)" value={nfeData!.destinatario.endereco} onChange={(v) => patchDest("endereco", v)} />
                </div>
                <Field id="de-bairro" label="Bairro / Distrito" value={nfeData!.destinatario.bairro} onChange={(v) => patchDest("bairro", v)} />
                <Field id="de-cep" label="CEP" value={nfeData!.destinatario.cep} onChange={(v) => patchDest("cep", v)} inputMode="numeric" />
                <Field id="de-mun" label="Município" value={nfeData!.destinatario.municipio} onChange={(v) => patchDest("municipio", v)} />
                <div className="grid grid-cols-2 gap-4 sm:col-span-1">
                  <Field id="de-uf" label="UF" value={nfeData!.destinatario.uf} onChange={(v) => patchDest("uf", v)} />
                  <Field id="de-tel" label="Telefone" value={nfeData!.destinatario.telefone} onChange={(v) => patchDest("telefone", v)} inputMode="tel" />
                </div>
              </div>
            </div>
          )}

          {isNfe && active === "produtos" && (
            <div className="card">
              <div className="flex items-start justify-between gap-4 mb-4">
                <SectionHeader icon="📦" title="Produtos / Serviços" subtitle={`${(nfeData!.produtos || []).length} item(ns) listado(s) na NF-e`} />
                <button type="button" onClick={addProduto} className="btn-secondary text-sm !py-2 !px-3">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                  Adicionar item
                </button>
              </div>

              <div className="space-y-5">
                {(nfeData!.produtos || []).map((p, i) => (
                  <div key={i} className="rounded-xl border border-gray-200 bg-gray-50/40 p-4 sm:p-5 relative">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-semibold text-gray-500 bg-white px-2.5 py-1 rounded-full border border-gray-200">Item {i + 1}</span>
                      <button type="button" onClick={() => removeProduto(i)} disabled={(nfeData!.produtos || []).length <= 1} className="text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-40 disabled:cursor-not-allowed">
                        Remover
                      </button>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="col-span-2 sm:col-span-1">
                        <Field id={`p-cod-${i}`} label="Código" value={p.codigo} onChange={(v) => updateProduto(i, { ...p, codigo: v })} />
                      </div>
                      <div className="col-span-2 sm:col-span-2">
                        <Field id={`p-desc-${i}`} label="Descrição" value={p.descricao} onChange={(v) => updateProduto(i, { ...p, descricao: v })} />
                      </div>
                      <div>
                        <Field id={`p-und-${i}`} label="Und." value={p.unidade} onChange={(v) => updateProduto(i, { ...p, unidade: v })} />
                      </div>
                      <div>
                        <Field id={`p-qtd-${i}`} label="Quantidade" inputMode="decimal" value={p.quantidade} onChange={(v) => updateProduto(i, { ...p, quantidade: v })} />
                      </div>
                      <div>
                        <Field id={`p-vu-${i}`} label="Vlr. Unitário" inputMode="decimal" value={p.valorUnitario} onChange={(v) => updateProduto(i, { ...p, valorUnitario: v })} />
                      </div>
                      <div>
                        <Field id={`p-vt-${i}`} label="Vlr. Total" inputMode="decimal" value={p.valorTotal} onChange={(v) => updateProduto(i, { ...p, valorTotal: v })} />
                      </div>
                      <div>
                        <Field id={`p-ncm-${i}`} label="NCM" value={p.ncm || ""} onChange={(v) => updateProduto(i, { ...p, ncm: v })} />
                      </div>
                      <div>
                        <Field id={`p-cst-${i}`} label="CST/CSOSN" value={p.cst || ""} onChange={(v) => updateProduto(i, { ...p, cst: v })} />
                      </div>
                      <div className="col-span-2">
                        <Field id={`p-cfop-${i}`} label="CFOP" value={p.cfop || ""} onChange={(v) => updateProduto(i, { ...p, cfop: v })} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {isNfe && active === "totais" && (
            <div className="card">
              <SectionHeader icon="💰" title="Valores Totais e Tributos" subtitle="Confira os valores finais da operação" />
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <Field id="t-bc" label="Base Cálculo ICMS" inputMode="decimal" value={nfeData!.valoresTotais?.baseCalculoICMS || ""} onChange={(v) => patchTotais("baseCalculoICMS", v)} />
                <Field id="t-icms" label="Valor ICMS" inputMode="decimal" value={nfeData!.valoresTotais?.valorICMS || ""} onChange={(v) => patchTotais("valorICMS", v)} />
                <Field id="t-prod" label="Vlr. Produtos" inputMode="decimal" value={nfeData!.valoresTotais?.valorProdutos || ""} onChange={(v) => patchTotais("valorProdutos", v)} />
                <Field id="t-frete" label="Frete" inputMode="decimal" value={nfeData!.valoresTotais?.valorFrete || ""} onChange={(v) => patchTotais("valorFrete", v)} />
                <Field id="t-seg" label="Seguro" inputMode="decimal" value={nfeData!.valoresTotais?.valorSeguro || ""} onChange={(v) => patchTotais("valorSeguro", v)} />
                <Field id="t-desc" label="Desconto" inputMode="decimal" value={nfeData!.valoresTotais?.valorDesconto || ""} onChange={(v) => patchTotais("valorDesconto", v)} />
                <Field id="t-ipi" label="IPI" inputMode="decimal" value={nfeData!.valoresTotais?.valorIPI || ""} onChange={(v) => patchTotais("valorIPI", v)} />
                <Field id="t-out" label="Outras Despesas" inputMode="decimal" value={nfeData!.valoresTotais?.valorOutrasDespesas || ""} onChange={(v) => patchTotais("valorOutrasDespesas", v)} />
                <Field id="t-trib" label="Total Tributos" inputMode="decimal" value={nfeData!.valoresTotais?.valorTotalTributos || ""} onChange={(v) => patchTotais("valorTotalTributos", v)} />
              </div>
            </div>
          )}

          {/* ==================== SEÇÕES CT-e ==================== */}
          {!isNfe && active === "cte" && (
            <div className="card">
              <SectionHeader icon="🚚" title="Dados do CT-e" subtitle="Identificação, chave de acesso e prestação" />
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <Field id="c-numero" label="Número CT-e" required value={cteData!.numero} onChange={(v) => patchCte("numero", v)} inputMode="numeric" />
                <Field id="c-serie" label="Série" required value={cteData!.serie} onChange={(v) => patchCte("serie", v)} />
                <Field id="c-modelo" label="Modelo" value={cteData!.modelo} onChange={(v) => patchCte("modelo", v)} />
                <Field id="c-dataHora" label="Data/Hora Emissão" required value={cteData!.dataHoraEmissao} onChange={(v) => patchCte("dataHoraEmissao", v)} placeholder="DD/MM/AAAA HH:MM" />
                <Field id="c-tipoCte" label="Tipo do CT-e" value={cteData!.tipoCte} onChange={(v) => patchCte("tipoCte", v)} />
                <Field id="c-tipoServico" label="Tipo do Serviço" value={cteData!.tipoServico} onChange={(v) => patchCte("tipoServico", v)} />
                <Field id="c-cfop" label="CFOP" value={cteData!.cfop} onChange={(v) => patchCte("cfop", v)} inputMode="numeric" />
                <div className="sm:col-span-2 lg:col-span-2">
                  <Field id="c-natureza" label="Natureza da Prestação" value={cteData!.naturezaPrestacao} onChange={(v) => patchCte("naturezaPrestacao", v)} />
                </div>
                <Field id="c-origem" label="Origem da Prestação" value={cteData!.origemPrestacao} onChange={(v) => patchCte("origemPrestacao", v)} />
                <Field id="c-destino" label="Destino da Prestação" value={cteData!.destinoPrestacao} onChange={(v) => patchCte("destinoPrestacao", v)} />
                <div className="sm:col-span-2 lg:col-span-3">
                  <Field id="c-chave" label="Chave de Acesso (44 dígitos)" required value={cteData!.chaveAcesso} onChange={(v) => patchCte("chaveAcesso", v)} />
                </div>
                <div className="sm:col-span-2 lg:col-span-3">
                  <Field id="c-protocolo" label="Protocolo de Autorização" value={cteData!.protocoloAutorizacao} onChange={(v) => patchCte("protocoloAutorizacao", v)} />
                </div>
                {cteData!.enderecoEntrega && (
                  <div className="sm:col-span-2 lg:col-span-3">
                    <Field id="c-endEntrega" label="Endereço de Entrega" value={cteData!.enderecoEntrega} onChange={(v) => patchCte("enderecoEntrega", v)} />
                  </div>
                )}
              </div>
            </div>
          )}

          {!isNfe && active === "remetente" && (
            <div className="card">
              <SectionHeader icon="🏢" title="Remetente" subtitle="Quem enviou a mercadoria para transporte" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <Field id="r-nome" label="Nome / Razão Social" required value={cteData!.remetente.nome} onChange={(v) => patchPessoaCte("remetente", "nome", v)} />
                </div>
                <Field id="r-cnpj" label="CNPJ/CPF" required value={cteData!.remetente.cnpjCpf} onChange={(v) => patchPessoaCte("remetente", "cnpjCpf", v)} inputMode="numeric" />
                <Field id="r-ie" label="Inscrição Estadual" value={cteData!.remetente.inscricaoEstadual || ""} onChange={(v) => patchPessoaCte("remetente", "inscricaoEstadual", v)} />
                <div className="sm:col-span-2">
                  <Field id="r-end" label="Endereço" value={cteData!.remetente.endereco} onChange={(v) => patchPessoaCte("remetente", "endereco", v)} />
                </div>
                <Field id="r-mun" label="Município" value={cteData!.remetente.municipio} onChange={(v) => patchPessoaCte("remetente", "municipio", v)} />
                <Field id="r-cep" label="CEP" value={cteData!.remetente.cep} onChange={(v) => patchPessoaCte("remetente", "cep", v)} inputMode="numeric" />
                <Field id="r-uf" label="UF" value={cteData!.remetente.uf} onChange={(v) => patchPessoaCte("remetente", "uf", v)} />
                <Field id="r-tel" label="Telefone" value={cteData!.remetente.telefone} onChange={(v) => patchPessoaCte("remetente", "telefone", v)} inputMode="tel" />
              </div>

              <div className="mt-8 pt-6 border-t border-gray-100">
                <SectionHeader icon="🧾" title="Tomador do Serviço" subtitle="Quem contratou e paga pelo transporte" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <Field id="tm-nome" label="Nome / Razão Social" value={cteData!.tomador.nome} onChange={(v) => patchPessoaCte("tomador", "nome", v)} />
                  </div>
                  <Field id="tm-cnpj" label="CNPJ/CPF" value={cteData!.tomador.cnpjCpf} onChange={(v) => patchPessoaCte("tomador", "cnpjCpf", v)} inputMode="numeric" />
                  <Field id="tm-ie" label="Inscrição Estadual" value={cteData!.tomador.inscricaoEstadual || ""} onChange={(v) => patchPessoaCte("tomador", "inscricaoEstadual", v)} />
                </div>
              </div>
            </div>
          )}

          {!isNfe && active === "destinatario-cte" && (
            <div className="card">
              <SectionHeader icon="👤" title="Destinatário" subtitle="Quem recebe a mercadoria" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <Field id="d-nome" label="Nome / Razão Social" required value={cteData!.destinatario.nome} onChange={(v) => patchPessoaCte("destinatario", "nome", v)} />
                </div>
                <Field id="d-cnpj" label="CNPJ/CPF" required value={cteData!.destinatario.cnpjCpf} onChange={(v) => patchPessoaCte("destinatario", "cnpjCpf", v)} inputMode="numeric" />
                <Field id="d-ie" label="Inscrição Estadual" value={cteData!.destinatario.inscricaoEstadual || ""} onChange={(v) => patchPessoaCte("destinatario", "inscricaoEstadual", v)} />
                <div className="sm:col-span-2">
                  <Field id="d-end" label="Endereço" value={cteData!.destinatario.endereco} onChange={(v) => patchPessoaCte("destinatario", "endereco", v)} />
                </div>
                <Field id="d-mun" label="Município" value={cteData!.destinatario.municipio} onChange={(v) => patchPessoaCte("destinatario", "municipio", v)} />
                <Field id="d-cep" label="CEP" value={cteData!.destinatario.cep} onChange={(v) => patchPessoaCte("destinatario", "cep", v)} inputMode="numeric" />
                <Field id="d-uf" label="UF" value={cteData!.destinatario.uf} onChange={(v) => patchPessoaCte("destinatario", "uf", v)} />
                <Field id="d-tel" label="Telefone" value={cteData!.destinatario.telefone} onChange={(v) => patchPessoaCte("destinatario", "telefone", v)} inputMode="tel" />
              </div>
            </div>
          )}

          {!isNfe && active === "prestacao" && (
            <div className="card">
              <SectionHeader icon="📦" title="Carga e Prestação de Serviço" subtitle="Peso, volumes e componentes do frete" />
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
                <Field id="p-predom" label="Produto Predominante" value={cteData!.produtoPredominante} onChange={(v) => patchCte("produtoPredominante", v)} />
                <Field id="p-carac" label="Outras Características" value={cteData!.outrasCaracteristicasCarga} onChange={(v) => patchCte("outrasCaracteristicasCarga", v)} />
                <Field id="p-vol" label="Volumes (UN)" inputMode="numeric" value={cteData!.volumes} onChange={(v) => patchCte("volumes", v)} />
                <Field id="p-pbruto" label="Peso Bruto (Kg)" inputMode="decimal" value={cteData!.pesoBruto} onChange={(v) => patchCte("pesoBruto", v)} />
                <Field id="p-pcalc" label="Peso Base Cálc. (Kg)" inputMode="decimal" value={cteData!.pesoBaseCalculo} onChange={(v) => patchCte("pesoBaseCalculo", v)} />
                <Field id="p-paferido" label="Peso Aferido (Kg)" inputMode="decimal" value={cteData!.pesoAferido} onChange={(v) => patchCte("pesoAferido", v)} />
                <Field id="p-cubagem" label="Cubagem (Kg)" inputMode="decimal" value={cteData!.cubagem} onChange={(v) => patchCte("cubagem", v)} />
                <Field id="p-valorCarga" label="Valor Total da Carga (R$)" inputMode="decimal" value={cteData!.valorTotalCarga} onChange={(v) => patchCte("valorTotalCarga", v)} />
              </div>

              <div className="pt-4 border-t border-gray-100">
                <h4 className="text-sm font-semibold text-gray-800 mb-3">Componentes do Valor da Prestação</h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <Field id="cv-fretePeso" label="Frete Peso (R$)" inputMode="decimal" value={cteData!.componentesValor?.freteBaseCalculo || ""} onChange={(v) => patchComponentes("freteBaseCalculo", v)} />
                  <Field id="cv-freteValor" label="Frete Valor (R$)" inputMode="decimal" value={cteData!.componentesValor?.freteValor || ""} onChange={(v) => patchComponentes("freteValor", v)} />
                  <Field id="cv-pedagio" label="Pedágio (R$)" inputMode="decimal" value={cteData!.componentesValor?.pedagio || ""} onChange={(v) => patchComponentes("pedagio", v)} />
                  <Field id="cv-despacho" label="Despacho (R$)" inputMode="decimal" value={cteData!.componentesValor?.despacho || ""} onChange={(v) => patchComponentes("despacho", v)} />
                  <Field id="cv-secCat" label="Sec/Cat (R$)" inputMode="decimal" value={cteData!.componentesValor?.secCat || ""} onChange={(v) => patchComponentes("secCat", v)} />
                  <Field id="cv-outras" label="Outras (R$)" inputMode="decimal" value={cteData!.componentesValor?.outras || ""} onChange={(v) => patchComponentes("outras", v)} />
                  <Field id="cv-gris" label="Gris (R$)" inputMode="decimal" value={cteData!.componentesValor?.gris || ""} onChange={(v) => patchComponentes("gris", v)} />
                  <Field id="cv-plusService" label="Plus Service (R$)" inputMode="decimal" value={cteData!.componentesValor?.plusService || ""} onChange={(v) => patchComponentes("plusService", v)} />
                  <Field id="cv-suframa" label="Suframa (R$)" inputMode="decimal" value={cteData!.componentesValor?.suframa || ""} onChange={(v) => patchComponentes("suframa", v)} />
                  <Field id="cv-libSefaz" label="Lib. Sefaz (R$)" inputMode="decimal" value={cteData!.componentesValor?.libSefaz || ""} onChange={(v) => patchComponentes("libSefaz", v)} />
                  <Field id="cv-dce" label="DCE (R$)" inputMode="decimal" value={cteData!.componentesValor?.dce || ""} onChange={(v) => patchComponentes("dce", v)} />
                  <Field id="cv-txNordeste" label="Tx. Nordeste (R$)" inputMode="decimal" value={cteData!.componentesValor?.txNordeste || ""} onChange={(v) => patchComponentes("txNordeste", v)} />
                </div>
              </div>

              <div className="mt-6 grid grid-cols-2 gap-4">
                <Field id="p-valorServico" label="Valor Total do Serviço (R$)" required inputMode="decimal" value={cteData!.valorTotalServico} onChange={(v) => patchCte("valorTotalServico", v)} />
                <Field id="p-valorReceber" label="Valor a Receber (R$)" inputMode="decimal" value={cteData!.valorAReceber} onChange={(v) => patchCte("valorAReceber", v)} />
              </div>
            </div>
          )}

          {!isNfe && active === "impostos" && (
            <div className="card">
              <SectionHeader icon="💰" title="Informações Relativas ao Imposto" subtitle="ICMS incidente sobre a prestação de serviço" />
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div className="col-span-2 sm:col-span-3">
                  <Field id="i-situacao" label="Situação Tributária" value={cteData!.situacaoTributaria} onChange={(v) => patchCte("situacaoTributaria", v)} />
                </div>
                <Field id="i-baseCalc" label="Base de Cálculo" inputMode="decimal" value={cteData!.baseCalculoICMS} onChange={(v) => patchCte("baseCalculoICMS", v)} />
                <Field id="i-aliq" label="Alíquota ICMS" value={cteData!.aliqICMS} onChange={(v) => patchCte("aliqICMS", v)} />
                <Field id="i-valorIcms" label="Valor ICMS" inputMode="decimal" value={cteData!.valorICMS} onChange={(v) => patchCte("valorICMS", v)} />
                <Field id="i-redBase" label="% Red. Base Cálc." inputMode="decimal" value={cteData!.percReducaoBaseCalculo || ""} onChange={(v) => patchCte("percReducaoBaseCalculo", v)} />
              </div>

              <div className="mt-6 rounded-xl bg-gradient-to-br from-primary-600 to-primary-800 text-white p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-primary-100">Valor total do serviço</p>
                  <p className="text-3xl sm:text-4xl font-bold tracking-tight tabular-nums">R$ {cteData!.valorTotalServico || "0,00"}</p>
                </div>
                <div className="text-sm text-primary-100">
                  <div>Volumes: <span className="font-semibold text-white">{cteData!.volumes || "-"}</span></div>
                  <div>Emissão: <span className="font-semibold text-white">{cteData!.dataHoraEmissao || "-"}</span></div>
                </div>
              </div>
            </div>
          )}

          <div className="card border-emerald-200 bg-emerald-50/40">
            <div className="flex items-start gap-3">
              <label htmlFor="confirmado" className="relative flex items-center cursor-pointer">
                <input id="confirmado" type="checkbox" className="peer sr-only" checked={confirmado} onChange={(e) => setConfirmado(e.target.checked)} />
                <div className="w-6 h-6 rounded border-2 border-emerald-600 bg-white grid place-items-center peer-checked:bg-emerald-600 transition">
                  {confirmado && (
                    <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={3} className="w-4 h-4">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </div>
              </label>
              <div className="flex-1">
                <label htmlFor="confirmado" className="block font-semibold text-emerald-900 cursor-pointer">
                  Confirmo que revisei e valido todos os dados
                </label>
                <p className="text-sm text-emerald-800/80 mt-1">
                  Marque esta opção apenas após conferir cada campo com o documento original.
                </p>
              </div>
            </div>

            <div className="mt-5 flex flex-col sm:flex-row gap-3 justify-end">
              <button type="button" onClick={() => router.push("/")} className="btn-secondary">
                Cancelar / Refazer upload
              </button>
              <button type="submit" disabled={!confirmado || saved} className="btn-primary !bg-emerald-600 hover:!bg-emerald-700">
                {saved ? (
                  <>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-5 h-5">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    Validado com sucesso
                  </>
                ) : (
                  <>
                    Validar e salvar
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
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
              <a href={stored.image} download={`${stored.tipo}-${(isNfe ? nfeData!.numero : cteData!.numero) || "documento"}.jpg`} className="text-xs font-medium text-primary-600 hover:text-primary-700">
                Baixar
              </a>
            </div>
            <p className="text-xs text-gray-500 mb-3">Use como referência para conferir os dados extraídos.</p>
            <div className="rounded-lg overflow-hidden border border-gray-200 bg-gray-50 max-h-[520px] overflow-y-auto">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={stored.image} alt="Imagem do documento enviado" className="w-full h-auto" />
            </div>

            <div className="mt-4 space-y-2 border-t border-gray-100 pt-4">
              {SECTIONS.map((s) => (
                <div key={s.key} className="flex items-center justify-between text-xs">
                  <span className="text-gray-600">{s.icon} {s.label}</span>
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
              ))}
            </div>
          </div>
        </aside>
      </form>
    </div>
  );
}