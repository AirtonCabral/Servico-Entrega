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

type SectionKey =
  | "dados"
  | "emitente"
  | "destinatario"
  | "produtos"
  | "totais"
  | "transporte"
  | "pagamento";

const SECTIONS: { key: SectionKey; label: string; icon: string }[] = [
  { key: "dados", label: "Dados", icon: "📄" },
  { key: "emitente", label: "Emitente", icon: "🏢" },
  { key: "destinatario", label: "Destinatário", icon: "👤" },
  { key: "produtos", label: "Itens", icon: "📦" },
  { key: "totais", label: "Totais", icon: "💰" },
  { key: "transporte", label: "Transporte", icon: "🚚" },
  { key: "pagamento", label: "Pagamento", icon: "💳" },
];

// Interfaces unificadas
interface EnderecoUnificado {
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cep: string;
  municipio: string;
  uf: string;
  telefone: string;
}

interface PessoaUnificada {
  nome: string;
  cnpjCpf: string;
  inscricaoEstadual: string;
  endereco: EnderecoUnificado;
}

interface ProdutoUnificado {
  codigo: string;
  descricao: string;
  ncm: string;
  cst: string;
  cfop: string;
  unidade: string;
  quantidade: string;
  valorUnitario: string;
  valorTotal: string;
}

interface DocumentoUnificado {
  // Identificação
  numero: string;
  serie: string;
  modelo: string;
  tipo: "nfe" | "cte";
  dataEmissao: string;
  dataOperacao: string;
  horaOperacao: string;
  naturezaOperacao: string;
  chaveAcesso: string;
  protocoloAutorizacao: string;
  valorTotal: string;
  
  // Pessoas
  emitente: PessoaUnificada;
  destinatario: PessoaUnificada;
  remetente?: PessoaUnificada;
  tomador?: PessoaUnificada;
  
  // Produtos
  produtos: ProdutoUnificado[];
  
  // Totais
  valoresTotais: {
    baseCalculoICMS: string;
    valorICMS: string;
    valorProdutos: string;
    valorFrete: string;
    valorSeguro: string;
    valorDesconto: string;
    valorIPI: string;
    valorOutrasDespesas: string;
    valorTotalTributos: string;
  };
  
  // Transporte
  transporte: {
    transportadora: string;
    cnpjTransportadora: string;
    ieTransportadora: string;
    cidadeTransportadora: string;
    ufTransportadora: string;
    volumes: string;
    pesoBruto: string;
    pesoLiquido: string;
    especie: string;
    marca: string;
    numeracao: string;
  };
  
  // Pagamento
  pagamento: {
    tipo: string;
    modalidade: string;
    valor: string;
    informacoesAdicionais: string;
  };
}

// Sobrescreve `base` com os valores de `incoming` apenas quando `incoming`
// realmente tem conteúdo (string não-vazia). Usado ao mesclar o retorno da
// API por cima dos dados já extraídos via OCR.
function pick(base: string | undefined, incoming: string | undefined): string {
  return incoming && incoming.trim().length > 0 ? incoming : base ?? "";
}

function mergePessoa<T extends object>(base: T, incoming: T): T {
  const merged = { ...base };
  (Object.keys(incoming) as (keyof T)[]).forEach((key) => {
    const b = base[key];
    const i = incoming[key];
    if (typeof i === "string") {
      merged[key] = pick(b as string, i) as T[keyof T];
    } else if (i && typeof i === "object" && b && typeof b === "object") {
      // Objetos aninhados (ex.: endereco) são mesclados recursivamente
      merged[key] = mergePessoa(b as object, i as object) as T[keyof T];
    } else {
      merged[key] = i;
    }
  });
  return merged;
}

function mergeDocumentoData(
  base: DocumentoUnificado,
  incoming: DocumentoUnificado,
): DocumentoUnificado {
  return {
    ...base,
    numero: pick(base.numero, incoming.numero),
    serie: pick(base.serie, incoming.serie),
    dataEmissao: pick(base.dataEmissao, incoming.dataEmissao),
    dataOperacao: pick(base.dataOperacao, incoming.dataOperacao),
    horaOperacao: pick(base.horaOperacao, incoming.horaOperacao),
    naturezaOperacao: pick(base.naturezaOperacao, incoming.naturezaOperacao),
    chaveAcesso: pick(base.chaveAcesso, incoming.chaveAcesso),
    protocoloAutorizacao: pick(base.protocoloAutorizacao, incoming.protocoloAutorizacao),
    valorTotal: pick(base.valorTotal, incoming.valorTotal),
    emitente: mergePessoa(base.emitente, incoming.emitente),
    destinatario: mergePessoa(base.destinatario, incoming.destinatario),
    produtos: incoming.produtos && incoming.produtos.length > 0 ? incoming.produtos : base.produtos,
    valoresTotais: base.valoresTotais && incoming.valoresTotais
      ? mergePessoa(base.valoresTotais, incoming.valoresTotais)
      : (incoming.valoresTotais || base.valoresTotais),
    transporte: incoming.transporte ? mergePessoa(base.transporte, incoming.transporte) : base.transporte,
    pagamento: incoming.pagamento ? mergePessoa(base.pagamento, incoming.pagamento) : base.pagamento,
  };
}

const emptyProduto = (): ProdutoUnificado => ({
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

// Converte uma string de valor (ex: "1.234,56" ou "1234,56") para número,
// respeitando o padrão brasileiro de separador decimal (vírgula).
function parseValorBR(value: string | undefined | null): number {
  if (!value) return NaN;
  const limpo = value
    .trim()
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "") // remove separador de milhar
    .replace(",", ".");
  return parseFloat(limpo);
}

// Formata um valor como moeda brasileira (R$ 1.234,56).
function formatBRL(value: string | undefined | null): string {
  const numero = parseValorBR(value);
  if (Number.isNaN(numero)) return "";
  return numero.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function Field({
  id,
  label,
  value,
  onChange,
  placeholder,
  required,
  inputMode,
  currency,
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
  currency?: boolean;
}) {
  const safeValue = value ?? "";
  const hasValue = safeValue.trim().length > 0;
  const valorFormatado = currency ? formatBRL(safeValue) : "";
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
      {hasValue && valorFormatado && (
        <p className="mt-1 text-xs font-medium text-emerald-700 tabular-nums">
          {valorFormatado}
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

// Converte o modelo interno NotaFiscalData (vindo do OCR) para o shape cru
// da API NFe.io, para que o mapeamento unificado funcione com ambos os formatos.
function toRawShape(nfe: any): any {
  return {
    number: nfe?.numero,
    serie: nfe?.serie,
    issuedOn: nfe?.dataEmissao,
    operationOn: nfe?.dataSaidaEntrada,
    operationNature: nfe?.naturezaOperacao,
    protocol: {
      accessKey: nfe?.chaveAcesso,
      protocolNumber: nfe?.protocoloAutorizacao,
    },
    totals: {
      icms: {
        baseTax: nfe?.valoresTotais?.baseCalculoICMS,
        icmsAmount: nfe?.valoresTotais?.valorICMS,
        productAmount: nfe?.valoresTotais?.valorProdutos,
        freightAmount: nfe?.valoresTotais?.valorFrete,
        insuranceAmount: nfe?.valoresTotais?.valorSeguro,
        discountAmount: nfe?.valoresTotais?.valorDesconto,
        ipiAmount: nfe?.valoresTotais?.valorIPI,
        othersAmount: nfe?.valoresTotais?.valorOutrasDespesas,
        federalTaxesAmount: nfe?.valoresTotais?.valorTotalTributos,
        invoiceAmount: nfe?.valorTotal,
      },
    },
    issuer: {
      name: nfe?.emitente?.nome,
      federalTaxNumber: nfe?.emitente?.cnpj || nfe?.emitente?.cpfCnpj,
      stateTaxNumber: nfe?.emitente?.inscricaoEstadual,
      address: {
        street: nfe?.emitente?.endereco,
        district: nfe?.emitente?.bairro,
        postalCode: nfe?.emitente?.cep,
        city: { name: nfe?.emitente?.municipio },
        state: nfe?.emitente?.uf,
        phone: nfe?.emitente?.telefone,
      },
    },
    buyer: {
      name: nfe?.destinatario?.nome,
      federalTaxNumber: nfe?.destinatario?.cnpj || nfe?.destinatario?.cpfCnpj,
      stateTaxNumber: nfe?.destinatario?.inscricaoEstadual,
      address: {
        street: nfe?.destinatario?.endereco,
        district: nfe?.destinatario?.bairro,
        postalCode: nfe?.destinatario?.cep,
        city: { name: nfe?.destinatario?.municipio },
        state: nfe?.destinatario?.uf,
        phone: nfe?.destinatario?.telefone,
      },
    },
    items: (nfe?.produtos || []).map((p: any) => ({
      code: p?.codigo,
      description: p?.descricao,
      ncm: p?.ncm,
      cfop: p?.cfop,
      unit: p?.unidade,
      quantity: p?.quantidade,
      unitAmount: p?.valorUnitario,
      totalAmount: p?.valorTotal,
      tax: { icms: { cst: p?.cst } },
    })),
  };
}

export default function ValidacaoPage() {
  const router = useRouter();
  const [stored, setStored] = useState<Stored | null>(null);
  const [data, setData] = useState<DocumentoUnificado | null>(null);
  const [active, setActive] = useState<SectionKey>("dados");
  const [confirmado, setConfirmado] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [apiLoading, setApiLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  // Função para converter dados do JSON para o formato unificado
  const converterParaUnificado = (dados: any, tipo: TipoDocumento): DocumentoUnificado => {
    if (tipo === "nfe") {
      // Extrair dados do JSON no formato que você forneceu
      const dadosOriginais = dados;
      let nfe = dados;

      // Detecta o formato recebido:
      // - payload cru da API NFe.io (issuer/totals/items) — vindo do QR code
      // - modelo interno NotaFiscalData (emitente/valoresTotais/produtos) — vindo do OCR
      const isRawApi = !!(nfe && (nfe.issuer || nfe.totals?.icms));
      if (!isRawApi) {
        nfe = toRawShape(nfe);
      }
      
      // Formatar data
      const formatarData = (dataStr: string) => {
        if (!dataStr) return "";
        // Já está em DD/MM/AAAA (modelo interno) — não reconverter
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(dataStr)) return dataStr;
        try {
          const date = new Date(dataStr);
          return date.toLocaleDateString('pt-BR');
        } catch {
          return dataStr;
        }
      };

      // Formatar hora
      const formatarHora = (dataStr: string) => {
        if (!dataStr) return "";
        // Já está em HH:MM:SS — não reconverter
        if (/^\d{2}:\d{2}:\d{2}$/.test(dataStr)) return dataStr;
        // Só converte se a string realmente contiver hora (ISO datetime)
        if (!/\d{2}:\d{2}/.test(dataStr)) return "";
        try {
          const date = new Date(dataStr);
          return date.toLocaleTimeString('pt-BR');
        } catch {
          return "";
        }
      };

      return {
        numero: String(nfe.number || ""),
        serie: String(nfe.serie || ""),
        modelo: String(nfe.codeModel || "55"),
        tipo: "nfe",
        dataEmissao: formatarData(nfe.issuedOn),
        dataOperacao: formatarData(nfe.operationOn),
        horaOperacao: formatarHora(nfe.operationOn) || dadosOriginais?.horaSaida || "",
        naturezaOperacao: nfe.operationNature || "",
        chaveAcesso: nfe.protocol?.accessKey || "",
        protocoloAutorizacao: nfe.protocol?.protocolNumber || "",
        valorTotal: String(nfe.totals?.icms?.invoiceAmount || ""),
        emitente: {
          nome: nfe.issuer?.name || "",
          cnpjCpf: String(nfe.issuer?.federalTaxNumber || ""),
          inscricaoEstadual: nfe.issuer?.stateTaxNumber || "",
          endereco: {
            logradouro: nfe.issuer?.address?.street || "",
            numero: nfe.issuer?.address?.number?.replace("SALA1", "")?.trim() || "",
            complemento: nfe.issuer?.address?.number?.includes("SALA") ? nfe.issuer.address.number : "",
            bairro: nfe.issuer?.address?.district || "",
            cep: nfe.issuer?.address?.postalCode || "",
            municipio: nfe.issuer?.address?.city?.name || "",
            uf: nfe.issuer?.address?.state || "",
            telefone: nfe.issuer?.address?.phone || "",
          }
        },
        destinatario: {
          nome: nfe.buyer?.name || "",
          cnpjCpf: String(nfe.buyer?.federalTaxNumber || ""),
          inscricaoEstadual: nfe.buyer?.stateTaxNumber || "",
          endereco: {
            logradouro: nfe.buyer?.address?.street || "",
            numero: nfe.buyer?.address?.number || "",
            complemento: nfe.buyer?.address?.additionalInformation || "",
            bairro: nfe.buyer?.address?.district || "",
            cep: nfe.buyer?.address?.postalCode || "",
            municipio: nfe.buyer?.address?.city?.name || "",
            uf: nfe.buyer?.address?.state || "",
            telefone: nfe.buyer?.address?.phone || "",
          }
        },
        produtos: (nfe.items || []).map((item: any) => ({
          codigo: item.code || "",
          descricao: item.description || "",
          ncm: item.ncm || "",
          cst: item.tax?.icms?.cst || "",
          cfop: String(item.cfop || ""),
          unidade: item.unit || "UN",
          quantidade: String(item.quantity || "0"),
          valorUnitario: String(item.unitAmount || "0"),
          valorTotal: String(item.totalAmount || "0"),
        })),
        valoresTotais: {
          baseCalculoICMS: String(nfe.totals?.icms?.baseTax || ""),
          valorICMS: String(nfe.totals?.icms?.icmsAmount || ""),
          valorProdutos: String(nfe.totals?.icms?.productAmount || ""),
          valorFrete: String(nfe.totals?.icms?.freightAmount || ""),
          valorSeguro: String(nfe.totals?.icms?.insuranceAmount || ""),
          valorDesconto: String(nfe.totals?.icms?.discountAmount || ""),
          valorIPI: String(nfe.totals?.icms?.ipiAmount || ""),
          valorOutrasDespesas: String(nfe.totals?.icms?.othersAmount || ""),
          valorTotalTributos: String(nfe.totals?.icms?.federalTaxesAmount || ""),
        },
        transporte: {
          transportadora: nfe.transport?.transportGroup?.name || "",
          cnpjTransportadora: String(nfe.transport?.transportGroup?.federalTaxNumber || ""),
          ieTransportadora: nfe.transport?.transportGroup?.stateTaxNumber || "",
          cidadeTransportadora: nfe.transport?.transportGroup?.cityName || "",
          ufTransportadora: nfe.transport?.transportGroup?.state || "",
          volumes: String(nfe.transport?.volume?.volumeQuantity || ""),
          pesoBruto: String(nfe.transport?.volume?.grossWeight || ""),
          pesoLiquido: String(nfe.transport?.volume?.netWeight || ""),
          especie: nfe.transport?.volume?.species || "",
          marca: nfe.transport?.volume?.brand || "",
          numeracao: nfe.transport?.volume?.volumeNumeration || "",
        },
        pagamento: {
          tipo: nfe.paymentType || "",
          modalidade: nfe.payment?.[0]?.paymentDetail?.[0]?.method || "",
          valor: String(nfe.payment?.[0]?.paymentDetail?.[0]?.amount || ""),
          informacoesAdicionais: nfe.additionalInformation?.taxpayer || "",
        },
      };
    } else {
      // CT-e - manter a conversão existente
      const cte = dados as CteData;
      return {
        numero: cte.numero || "",
        serie: cte.serie || "",
        modelo: "57",
        tipo: "cte",
        dataEmissao: cte.dataHoraEmissao || "",
        dataOperacao: "",
        horaOperacao: "",
        naturezaOperacao: cte.naturezaPrestacao || "",
        chaveAcesso: cte.chaveAcesso || "",
        protocoloAutorizacao: cte.protocoloAutorizacao || "",
        valorTotal: cte.valorTotalServico || "",
        emitente: {
          nome: cte.remetente?.nome || "",
          cnpjCpf: cte.remetente?.cnpjCpf || "",
          inscricaoEstadual: cte.remetente?.inscricaoEstadual || "",
          endereco: {
            logradouro: cte.remetente?.endereco || "",
            numero: "",
            complemento: "",
            bairro: "",
            cep: cte.remetente?.cep || "",
            municipio: cte.remetente?.municipio || "",
            uf: cte.remetente?.uf || "",
            telefone: cte.remetente?.telefone || "",
          }
        },
        destinatario: {
          nome: cte.destinatario?.nome || "",
          cnpjCpf: cte.destinatario?.cnpjCpf || "",
          inscricaoEstadual: cte.destinatario?.inscricaoEstadual || "",
          endereco: {
            logradouro: cte.destinatario?.endereco || "",
            numero: "",
            complemento: "",
            bairro: "",
            cep: cte.destinatario?.cep || "",
            municipio: cte.destinatario?.municipio || "",
            uf: cte.destinatario?.uf || "",
            telefone: cte.destinatario?.telefone || "",
          }
        },
        produtos: [],
        valoresTotais: {
          baseCalculoICMS: cte.baseCalculoICMS || "",
          valorICMS: cte.valorICMS || "",
          valorProdutos: "",
          valorFrete: "",
          valorSeguro: "",
          valorDesconto: "",
          valorIPI: "",
          valorOutrasDespesas: "",
          valorTotalTributos: "",
        },
        transporte: {
          transportadora: "",
          cnpjTransportadora: "",
          ieTransportadora: "",
          cidadeTransportadora: "",
          ufTransportadora: "",
          volumes: cte.volumes || "",
          pesoBruto: cte.pesoBruto || "",
          pesoLiquido: "",
          especie: "",
          marca: "",
          numeracao: "",
        },
        pagamento: {
          tipo: "",
          modalidade: "",
          valor: "",
          informacoesAdicionais: "",
        },
        remetente: cte.remetente ? {
          nome: cte.remetente.nome || "",
          cnpjCpf: cte.remetente.cnpjCpf || "",
          inscricaoEstadual: cte.remetente.inscricaoEstadual || "",
          endereco: {
            logradouro: cte.remetente.endereco || "",
            numero: "",
            complemento: "",
            bairro: "",
            cep: cte.remetente.cep || "",
            municipio: cte.remetente.municipio || "",
            uf: cte.remetente.uf || "",
            telefone: cte.remetente.telefone || "",
          }
        } : undefined,
        tomador: cte.tomador ? {
          nome: cte.tomador.nome || "",
          cnpjCpf: cte.tomador.cnpjCpf || "",
          inscricaoEstadual: cte.tomador.inscricaoEstadual || "",
          endereco: {
            logradouro: "",
            numero: "",
            complemento: "",
            bairro: "",
            cep: "",
            municipio: "",
            uf: "",
            telefone: "",
          }
        } : undefined,
      };
    }
  };

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("nfe:data");
      if (!raw) {
        setLoading(false);
        return;
      }
      const parsed = JSON.parse(raw) as Stored;
      if (!parsed.tipo) parsed.tipo = "nfe";
      
      // Converter para formato unificado
      const dadosUnificados = converterParaUnificado(parsed.data, parsed.tipo);
      
      setStored(parsed);
      setData(dadosUnificados);
      setActive("dados");
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

  // ---------- patch helpers ----------
  const patch = <K extends keyof DocumentoUnificado>(
    key: K,
    value: DocumentoUnificado[K],
  ) => setData((d) => (d ? { ...d, [key]: value } : d));

  const patchPessoa = (tipo: "emitente" | "destinatario" | "remetente" | "tomador", campo: keyof PessoaUnificada, valor: string) => {
    if (!data) return;
    const pessoaAtual = data[tipo];
    if (!pessoaAtual) return;
    patch(tipo, { ...pessoaAtual, [campo]: valor });
  };

  const patchEndereco = (tipo: "emitente" | "destinatario" | "remetente" | "tomador", campo: keyof EnderecoUnificado, valor: string) => {
    if (!data) return;
    const pessoaAtual = data[tipo];
    if (!pessoaAtual) return;
    patch(tipo, { ...pessoaAtual, endereco: { ...pessoaAtual.endereco, [campo]: valor } });
  };

  const patchTotais = (key: keyof DocumentoUnificado["valoresTotais"], v: string) =>
    patch("valoresTotais", { ...data.valoresTotais, [key]: v });

  const patchTransporte = (key: keyof DocumentoUnificado["transporte"], v: string) =>
    patch("transporte", { ...data.transporte, [key]: v });

  const patchPagamento = (key: keyof DocumentoUnificado["pagamento"], v: string) =>
    patch("pagamento", { ...data.pagamento, [key]: v });

  const updateProduto = (idx: number, p: ProdutoUnificado) => {
    const produtos = data.produtos || [];
    const next = [...produtos];
    next[idx] = p;
    patch("produtos", next);
  };

  const removeProduto = (idx: number) => {
    const produtos = data.produtos || [];
    if (produtos.length <= 1) return;
    patch("produtos", produtos.filter((_, i) => i !== idx));
  };

  const addProduto = () => patch("produtos", [...(data.produtos || []), emptyProduto()]);

  const buscarDadosApi = async () => {
    if (!data?.chaveAcesso) {
      setApiError('Chave de acesso não encontrada nos dados extraídos.');
      return;
    }

    const chave = data.chaveAcesso.replace(/\D/g, '');
    if (chave.length !== 44) {
      setApiError('Chave de acesso deve ter 44 dígitos.');
      return;
    }

    setApiLoading(true);
    setApiError(null);

    try {
      const response = await fetch(`/api/DadosApiExterna?chave=${chave}`);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erro ao buscar dados da API');
      }

      const apiData = await response.json();

      // A API devolve o payload cru da NFe.io — converte para o formato
      // unificado antes de mesclar com os dados já extraídos.
      const unificado = converterParaUnificado(apiData, "nfe");

      setData((prev) => {
        const base = prev || data;
        return mergeDocumentoData(base, unificado);
      });
      setApiError(null);
    } catch (error) {
      console.error('Erro ao buscar dados da API:', error);
      setApiError(error instanceof Error ? error.message : 'Erro ao buscar dados da API');
    } finally {
      setApiLoading(false);
    }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!data || !stored) return;
    try {
      // Converter de volta para o formato original para salvar
      const dadosOriginais = stored.tipo === "nfe" 
        ? converterParaNfe(data) 
        : converterParaCte(data);
      
      const result = await saveNfeToHistory(stored.tipo, dadosOriginais, stored.image);
      if (!result) {
        throw new Error("saveNfeToHistory retornou undefined — verifique se você está logado");
      }
      sessionStorage.setItem(
        "nfe:validated",
        JSON.stringify({
          tipo: stored.tipo,
          data: dadosOriginais,
          image: stored.image,
          validatedAt: Date.now(),
          confirmed: confirmado,
        }),
      );
      sessionStorage.removeItem("nfe:data");
      setSaved(true);
      setTimeout(() => {
        router.push("/nfes");
      }, 900);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log("Falha ao persistir documento:", msg);
      alert("Erro ao salvar nota fiscal:\n\n" + msg + "\n\nVerifique se você está logado.");
    }
  };

  // Funções para converter de volta (simplificadas)
  const converterParaNfe = (d: DocumentoUnificado): NotaFiscalData => {
    return {
      numero: d.numero,
      serie: d.serie,
      naturezaOperacao: d.naturezaOperacao,
      dataEmissao: d.dataEmissao,
      dataSaidaEntrada: d.dataOperacao,
      horaSaida: d.horaOperacao,
      chaveAcesso: d.chaveAcesso,
      protocoloAutorizacao: d.protocoloAutorizacao,
      valorTotal: d.valorTotal,
      emitente: {
        nome: d.emitente.nome,
        cnpj: d.emitente.cnpjCpf,
        cpfCnpj: d.emitente.cnpjCpf,
        inscricaoEstadual: d.emitente.inscricaoEstadual,
        endereco: `${d.emitente.endereco.logradouro}, ${d.emitente.endereco.numero} ${d.emitente.endereco.complemento}`,
        bairro: d.emitente.endereco.bairro,
        cep: d.emitente.endereco.cep,
        municipio: d.emitente.endereco.municipio,
        uf: d.emitente.endereco.uf,
        telefone: d.emitente.endereco.telefone,
      },
      destinatario: {
        nome: d.destinatario.nome,
        cnpj: d.destinatario.cnpjCpf,
        cpfCnpj: d.destinatario.cnpjCpf,
        inscricaoEstadual: d.destinatario.inscricaoEstadual,
        endereco: `${d.destinatario.endereco.logradouro}, ${d.destinatario.endereco.numero} ${d.destinatario.endereco.complemento}`,
        bairro: d.destinatario.endereco.bairro,
        cep: d.destinatario.endereco.cep,
        municipio: d.destinatario.endereco.municipio,
        uf: d.destinatario.endereco.uf,
        telefone: d.destinatario.endereco.telefone,
      },
      produtos: d.produtos.map(p => ({
        codigo: p.codigo,
        descricao: p.descricao,
        ncm: p.ncm,
        cst: p.cst,
        cfop: p.cfop,
        unidade: p.unidade,
        quantidade: p.quantidade,
        valorUnitario: p.valorUnitario,
        valorTotal: p.valorTotal,
      })),
      valoresTotais: d.valoresTotais,
    };
  };

  const converterParaCte = (d: DocumentoUnificado): CteData => {
    return {
      numero: d.numero,
      serie: d.serie,
      modelo: d.modelo,
      dataHoraEmissao: d.dataEmissao,
      chaveAcesso: d.chaveAcesso,
      protocoloAutorizacao: d.protocoloAutorizacao,
      naturezaPrestacao: d.naturezaOperacao,
      valorTotalServico: d.valorTotal,
      remetente: {
        nome: d.emitente.nome,
        cnpjCpf: d.emitente.cnpjCpf,
        inscricaoEstadual: d.emitente.inscricaoEstadual,
        endereco: d.emitente.endereco.logradouro,
        municipio: d.emitente.endereco.municipio,
        cep: d.emitente.endereco.cep,
        uf: d.emitente.endereco.uf,
        telefone: d.emitente.endereco.telefone,
      },
      destinatario: {
        nome: d.destinatario.nome,
        cnpjCpf: d.destinatario.cnpjCpf,
        inscricaoEstadual: d.destinatario.inscricaoEstadual,
        endereco: d.destinatario.endereco.logradouro,
        municipio: d.destinatario.endereco.municipio,
        cep: d.destinatario.endereco.cep,
        uf: d.destinatario.endereco.uf,
        telefone: d.destinatario.endereco.telefone,
      },
      volumes: d.transporte.volumes,
      pesoBruto: d.transporte.pesoBruto,
      baseCalculoICMS: d.valoresTotais.baseCalculoICMS,
      valorICMS: d.valoresTotais.valorICMS,
      tomador: d.tomador || { nome: "", cnpjCpf: "", inscricaoEstadual: "", endereco: "", municipio: "", cep: "", uf: "", telefone: "" },
    } as CteData;
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
          <div className="flex flex-col sm:flex-row gap-2 self-start">
            <div className="text-xs text-gray-500 bg-white border border-gray-200 rounded-lg px-3 py-2 shadow-sm inline-flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              {isNfe ? "NF-e" : "CT-e"} extraído em{" "}
              <span className="font-medium text-gray-800 tabular-nums">
                {new Date(stored.extractedAt).toLocaleString("pt-BR")}
              </span>
            </div>
            {formatBRL(data.valorTotal) && (
              <div className="text-xs text-gray-500 bg-white border border-gray-200 rounded-lg px-3 py-2 shadow-sm inline-flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-primary-500"></span>
                Valor Total{" "}
                <span className="font-semibold text-gray-900 tabular-nums">
                  {formatBRL(data.valorTotal)}
                </span>
              </div>
            )}
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

          {/* ==================== SEÇÃO DADOS ==================== */}
          {active === "dados" && (
            <div className="card">
              <SectionHeader
                icon="📄"
                title="Dados do Documento"
                subtitle={`Identificação, chave de acesso e datas - ${isNfe ? "NF-e" : "CT-e"}`}
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <Field id="numero" label="Número" required value={data.numero} onChange={(v) => patch("numero", v)} inputMode="numeric" />
                <Field id="serie" label="Série" required value={data.serie} onChange={(v) => patch("serie", v)} />
                <Field id="modelo" label="Modelo" value={data.modelo} onChange={(v) => patch("modelo", v)} />
                <Field id="natureza" label="Natureza da Operação" value={data.naturezaOperacao} onChange={(v) => patch("naturezaOperacao", v)} />
                <Field id="dataEmissao" label="Data de Emissão" required value={data.dataEmissao} onChange={(v) => patch("dataEmissao", v)} placeholder="DD/MM/AAAA" />
                <Field id="dataOperacao" label="Data da Operação" value={data.dataOperacao} onChange={(v) => patch("dataOperacao", v)} placeholder="DD/MM/AAAA" />
                <Field id="horaOperacao" label="Hora da Operação" value={data.horaOperacao} onChange={(v) => patch("horaOperacao", v)} placeholder="HH:MM:SS" />
                <div className="sm:col-span-2 lg:col-span-3">
                  <Field id="chave" label="Chave de Acesso (44 dígitos)" required value={data.chaveAcesso} onChange={(v) => patch("chaveAcesso", v)} />
                  <button
                    type="button"
                    onClick={buscarDadosApi}
                    disabled={apiLoading || !data.chaveAcesso}
                    className="mt-2 w-full btn-secondary text-sm !py-2 !px-3 flex items-center justify-center gap-2"
                  >
                    {apiLoading ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-600"></div>
                        Buscando dados...
                      </>
                    ) : (
                      <>
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                          <path d="M21 12a9 9 0 0 1-9 9m9-9a9 9 0 0 0-9-9m9 9H3m9 9a9 9 0 0 1-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 0 1 9-9" />
                        </svg>
                        Buscar dados pela chave
                      </>
                    )}
                  </button>
                  {apiError && (
                    <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                      {apiError}
                    </div>
                  )}
                </div>
                <div className="sm:col-span-2 lg:col-span-3">
                  <Field id="protocolo" label="Protocolo de Autorização" value={data.protocoloAutorizacao} onChange={(v) => patch("protocoloAutorizacao", v)} />
                </div>
                <div className="sm:col-span-2 lg:col-span-3">
                  <Field id="valorTotal" label="Valor Total (R$)" required inputMode="decimal" currency value={data.valorTotal} onChange={(v) => patch("valorTotal", v)} />
                </div>
              </div>
            </div>
          )}

          {/* ==================== SEÇÃO EMITENTE ==================== */}
          {active === "emitente" && (
            <div className="card">
              <SectionHeader icon="🏢" title="Emitente" subtitle="Empresa que emitiu o documento" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <Field id="em-nome" label="Razão Social / Nome" required value={data.emitente.nome} onChange={(v) => patchPessoa("emitente", "nome", v)} />
                </div>
                <Field id="em-cnpj" label="CNPJ/CPF" required value={data.emitente.cnpjCpf} onChange={(v) => patchPessoa("emitente", "cnpjCpf", v)} inputMode="numeric" />
                <Field id="em-ie" label="Inscrição Estadual" value={data.emitente.inscricaoEstadual} onChange={(v) => patchPessoa("emitente", "inscricaoEstadual", v)} />
                <div className="sm:col-span-2">
                  <Field id="em-logradouro" label="Logradouro" value={data.emitente.endereco.logradouro} onChange={(v) => patchEndereco("emitente", "logradouro", v)} />
                </div>
                <Field id="em-numero" label="Número" value={data.emitente.endereco.numero} onChange={(v) => patchEndereco("emitente", "numero", v)} />
                <Field id="em-complemento" label="Complemento" value={data.emitente.endereco.complemento} onChange={(v) => patchEndereco("emitente", "complemento", v)} />
                <Field id="em-bairro" label="Bairro" value={data.emitente.endereco.bairro} onChange={(v) => patchEndereco("emitente", "bairro", v)} />
                <Field id="em-cep" label="CEP" value={data.emitente.endereco.cep} onChange={(v) => patchEndereco("emitente", "cep", v)} inputMode="numeric" />
                <Field id="em-mun" label="Município" value={data.emitente.endereco.municipio} onChange={(v) => patchEndereco("emitente", "municipio", v)} />
                <Field id="em-uf" label="UF" value={data.emitente.endereco.uf} onChange={(v) => patchEndereco("emitente", "uf", v)} />
                <Field id="em-tel" label="Telefone" value={data.emitente.endereco.telefone} onChange={(v) => patchEndereco("emitente", "telefone", v)} inputMode="tel" />
              </div>
            </div>
          )}

          {/* ==================== SEÇÃO DESTINATÁRIO ==================== */}
          {active === "destinatario" && (
            <div className="card">
              <SectionHeader icon="👤" title="Destinatário" subtitle="Quem recebeu a mercadoria" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <Field id="de-nome" label="Nome / Razão Social" required value={data.destinatario.nome} onChange={(v) => patchPessoa("destinatario", "nome", v)} />
                </div>
                <Field id="de-cnpj" label="CNPJ/CPF" required value={data.destinatario.cnpjCpf} onChange={(v) => patchPessoa("destinatario", "cnpjCpf", v)} inputMode="numeric" />
                <Field id="de-ie" label="Inscrição Estadual" value={data.destinatario.inscricaoEstadual} onChange={(v) => patchPessoa("destinatario", "inscricaoEstadual", v)} />
                <div className="sm:col-span-2">
                  <Field id="de-logradouro" label="Logradouro" value={data.destinatario.endereco.logradouro} onChange={(v) => patchEndereco("destinatario", "logradouro", v)} />
                </div>
                <Field id="de-numero" label="Número" value={data.destinatario.endereco.numero} onChange={(v) => patchEndereco("destinatario", "numero", v)} />
                <Field id="de-complemento" label="Complemento" value={data.destinatario.endereco.complemento} onChange={(v) => patchEndereco("destinatario", "complemento", v)} />
                <Field id="de-bairro" label="Bairro" value={data.destinatario.endereco.bairro} onChange={(v) => patchEndereco("destinatario", "bairro", v)} />
                <Field id="de-cep" label="CEP" value={data.destinatario.endereco.cep} onChange={(v) => patchEndereco("destinatario", "cep", v)} inputMode="numeric" />
                <Field id="de-mun" label="Município" value={data.destinatario.endereco.municipio} onChange={(v) => patchEndereco("destinatario", "municipio", v)} />
                <Field id="de-uf" label="UF" value={data.destinatario.endereco.uf} onChange={(v) => patchEndereco("destinatario", "uf", v)} />
                <Field id="de-tel" label="Telefone" value={data.destinatario.endereco.telefone} onChange={(v) => patchEndereco("destinatario", "telefone", v)} inputMode="tel" />
              </div>
            </div>
          )}

          {/* ==================== SEÇÃO PRODUTOS ==================== */}
          {active === "produtos" && (
            <div className="card">
              <div className="flex items-start justify-between gap-4 mb-4">
                <SectionHeader icon="📦" title="Produtos / Serviços" subtitle={`${data.produtos.length} item(ns) listado(s)`} />
                <button type="button" onClick={addProduto} className="btn-secondary text-sm !py-2 !px-3">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                  Adicionar item
                </button>
              </div>

              <div className="space-y-5">
                {data.produtos.map((p, i) => (
                  <div key={i} className="rounded-xl border border-gray-200 bg-gray-50/40 p-4 sm:p-5 relative">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-semibold text-gray-500 bg-white px-2.5 py-1 rounded-full border border-gray-200">Item {i + 1}</span>
                      <button type="button" onClick={() => removeProduto(i)} disabled={data.produtos.length <= 1} className="text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-40 disabled:cursor-not-allowed">
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
                        <Field id={`p-vu-${i}`} label="Vlr. Unitário" inputMode="decimal" currency value={p.valorUnitario} onChange={(v) => updateProduto(i, { ...p, valorUnitario: v })} />
                      </div>
                      <div>
                        <Field id={`p-vt-${i}`} label="Vlr. Total" inputMode="decimal" currency value={p.valorTotal} onChange={(v) => updateProduto(i, { ...p, valorTotal: v })} />
                      </div>
                      <div>
                        <Field id={`p-ncm-${i}`} label="NCM" value={p.ncm} onChange={(v) => updateProduto(i, { ...p, ncm: v })} />
                      </div>
                      <div>
                        <Field id={`p-cst-${i}`} label="CST" value={p.cst} onChange={(v) => updateProduto(i, { ...p, cst: v })} />
                      </div>
                      <div className="col-span-2">
                        <Field id={`p-cfop-${i}`} label="CFOP" value={p.cfop} onChange={(v) => updateProduto(i, { ...p, cfop: v })} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ==================== SEÇÃO TOTAIS ==================== */}
          {active === "totais" && (
            <div className="card">
              <SectionHeader icon="💰" title="Valores Totais e Tributos" subtitle="Confira os valores finais da operação" />
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <Field id="t-bc" label="Base Cálculo ICMS" inputMode="decimal" currency value={data.valoresTotais.baseCalculoICMS} onChange={(v) => patchTotais("baseCalculoICMS", v)} />
                <Field id="t-icms" label="Valor ICMS" inputMode="decimal" currency value={data.valoresTotais.valorICMS} onChange={(v) => patchTotais("valorICMS", v)} />
                <Field id="t-prod" label="Vlr. Produtos" inputMode="decimal" currency value={data.valoresTotais.valorProdutos} onChange={(v) => patchTotais("valorProdutos", v)} />
                <Field id="t-frete" label="Frete" inputMode="decimal" currency value={data.valoresTotais.valorFrete} onChange={(v) => patchTotais("valorFrete", v)} />
                <Field id="t-seg" label="Seguro" inputMode="decimal" currency value={data.valoresTotais.valorSeguro} onChange={(v) => patchTotais("valorSeguro", v)} />
                <Field id="t-desc" label="Desconto" inputMode="decimal" currency value={data.valoresTotais.valorDesconto} onChange={(v) => patchTotais("valorDesconto", v)} />
                <Field id="t-ipi" label="IPI" inputMode="decimal" currency value={data.valoresTotais.valorIPI} onChange={(v) => patchTotais("valorIPI", v)} />
                <Field id="t-out" label="Outras Despesas" inputMode="decimal" currency value={data.valoresTotais.valorOutrasDespesas} onChange={(v) => patchTotais("valorOutrasDespesas", v)} />
                <Field id="t-trib" label="Total Tributos" inputMode="decimal" currency value={data.valoresTotais.valorTotalTributos} onChange={(v) => patchTotais("valorTotalTributos", v)} />
              </div>
            </div>
          )}

          {/* ==================== SEÇÃO TRANSPORTE ==================== */}
          {active === "transporte" && (
            <div className="card">
              <SectionHeader icon="🚚" title="Transporte" subtitle="Informações do frete e volumes" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <Field id="t-transportadora" label="Transportadora" value={data.transporte.transportadora} onChange={(v) => patchTransporte("transportadora", v)} />
                </div>
                <Field id="t-cnpj" label="CNPJ Transportadora" value={data.transporte.cnpjTransportadora} onChange={(v) => patchTransporte("cnpjTransportadora", v)} />
                <Field id="t-ie" label="IE Transportadora" value={data.transporte.ieTransportadora} onChange={(v) => patchTransporte("ieTransportadora", v)} />
                <Field id="t-cidade" label="Cidade" value={data.transporte.cidadeTransportadora} onChange={(v) => patchTransporte("cidadeTransportadora", v)} />
                <Field id="t-uf" label="UF" value={data.transporte.ufTransportadora} onChange={(v) => patchTransporte("ufTransportadora", v)} />
                <Field id="t-volumes" label="Volumes" value={data.transporte.volumes} onChange={(v) => patchTransporte("volumes", v)} />
                <Field id="t-pesoBruto" label="Peso Bruto (Kg)" inputMode="decimal" value={data.transporte.pesoBruto} onChange={(v) => patchTransporte("pesoBruto", v)} />
                <Field id="t-pesoLiq" label="Peso Líquido (Kg)" inputMode="decimal" value={data.transporte.pesoLiquido} onChange={(v) => patchTransporte("pesoLiquido", v)} />
                <Field id="t-especie" label="Espécie" value={data.transporte.especie} onChange={(v) => patchTransporte("especie", v)} />
                <Field id="t-marca" label="Marca" value={data.transporte.marca} onChange={(v) => patchTransporte("marca", v)} />
                <Field id="t-numeracao" label="Numeração" value={data.transporte.numeracao} onChange={(v) => patchTransporte("numeracao", v)} />
              </div>
            </div>
          )}

          {/* ==================== SEÇÃO PAGAMENTO ==================== */}
          {active === "pagamento" && (
            <div className="card">
              <SectionHeader icon="💳" title="Pagamento" subtitle="Formas e valores de pagamento" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field id="pg-tipo" label="Tipo de Pagamento" value={data.pagamento.tipo} onChange={(v) => patchPagamento("tipo", v)} />
                <Field id="pg-modalidade" label="Modalidade" value={data.pagamento.modalidade} onChange={(v) => patchPagamento("modalidade", v)} />
                <Field id="pg-valor" label="Valor Pago (R$)" inputMode="decimal" currency value={data.pagamento.valor} onChange={(v) => patchPagamento("valor", v)} />
                <div className="sm:col-span-2">
                  <Field id="pg-info" label="Informações Adicionais" value={data.pagamento.informacoesAdicionais} onChange={(v) => patchPagamento("informacoesAdicionais", v)} />
                </div>
              </div>
            </div>
          )}

          {/* ==================== CONFIRMAÇÃO ==================== */}
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
              <a href={stored.image} download={`${stored.tipo}-${data.numero || "documento"}.jpg`} className="text-xs font-medium text-primary-600 hover:text-primary-700">
                Baixar
              </a>
            </div>
            <p className="text-xs text-gray-500 mb-3">Use como referência para conferir os dados extraídos.</p>
            <div className="rounded-lg overflow-hidden border border-gray-200 bg-gray-50 max-h-[520px] overflow-y-auto">
              {stored.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={stored.image} alt="Imagem do documento enviado" className="w-full h-auto" />
              )}
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