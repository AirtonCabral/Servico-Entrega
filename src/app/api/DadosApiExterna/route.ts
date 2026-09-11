// src/services/nfeService.ts

import { NextRequest, NextResponse } from 'next/server';
import type { NotaFiscalData, PessoaNF, ProdutoNF, ValoresTotaisNF } from '@/lib/types';
import { env } from 'process';

export type NfeApiError = {
  error?: string;
  status?: number;
};

export async function consultarNfe(accessKey: string) {
  const normalizedAccessKey = accessKey.replace(/\D/g, "");
  if (!/^\d{44}$/.test(normalizedAccessKey)) {
    throw new Error(
      "Chave de acesso inválida. Deve conter exatamente 44 dígitos.",
    );
  }

  // const apiKey = process.env.NFE_API_KEY;
  const apiKey = "TaDhtFBL3k8TN76NKq0CAkUETgrw2lDGAVZsnoUhlW0m6C3CtW8gwu95dlZ79NAmaGx";

  if (!apiKey) {
    throw new Error("Chave de API não configurada.");
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: apiKey,
  };

  const response = await fetch(
    `https://nfe.api.nfe.io/v2/productinvoices/serpro/${normalizedAccessKey}`,
    {
      method: "GET",
      headers,
    },
  );

  const data: unknown = await response.json().catch(() => null);
  
  if (!response.ok) {
    const apiError = data as NfeApiError | null;
    
    throw new Error(
      apiError?.error ?? "Não foi possível consultar a nota fiscal.",
    );
  }
  
  return data;
}

// ============================================================
// Tipagem do payload real retornado pela API externa (NFE.io / SERPRO)
// Só os campos usados no mapeamento abaixo.
// ============================================================

interface ApiAddress {
  phone?: string;
  state?: string;
  city?: { code?: string; name?: string };
  district?: string;
  street?: string;
  number?: string;
  postalCode?: string;
  country?: string;
}

interface ApiParty {
  federalTaxNumber?: number | string;
  name?: string;
  address?: ApiAddress;
  stateTaxNumber?: string;
}

interface ApiIcmsTotals {
  baseTax?: number;
  icmsAmount?: number;
  productAmount?: number;
  freightAmount?: number;
  insuranceAmount?: number;
  discountAmount?: number;
  ipiAmount?: number;
  othersAmount?: number;
  invoiceAmount?: number;
  federalTaxesAmount?: number;
}

interface ApiItemIcms {
  cst?: string;
}

interface ApiItemTax {
  icms?: ApiItemIcms;
}

interface ApiItem {
  code?: string;
  description?: string;
  ncm?: string;
  cfop?: number | string;
  unit?: string;
  quantity?: number;
  unitAmount?: number;
  totalAmount?: number;
  tax?: ApiItemTax;
}

interface ApiProtocol {
  accessKey?: string;
  protocolNumber?: string;
}

interface NfeApiResponse {
  number?: number | string;
  serie?: number | string;
  issuedOn?: string;
  operationOn?: string;
  operationNature?: string;
  issuer?: ApiParty;
  buyer?: ApiParty;
  totals?: { icms?: ApiIcmsTotals };
  items?: ApiItem[];
  protocol?: ApiProtocol;
}

// ============================================================
// Mapper — API real (inglês) -> NotaFiscalData (modelo interno)
// ============================================================

function mapParty(party?: ApiParty): PessoaNF {
  const addr = party?.address;
  const endereco = [addr?.street, addr?.number].filter(Boolean).join(', ');
  const taxNumber = party?.federalTaxNumber != null ? String(party.federalTaxNumber) : '';

  return {
    nome: party?.name || '',
    cnpj: taxNumber,
    cpfCnpj: taxNumber,
    inscricaoEstadual: party?.stateTaxNumber || '',
    endereco: endereco || '',
    bairro: addr?.district || '',
    cep: addr?.postalCode || '',
    municipio: addr?.city?.name || '',
    uf: addr?.state || '',
    telefone: addr?.phone || '',
  };
}

function mapApiToNotaFiscalData(apiData: NfeApiResponse): NotaFiscalData {
  const icmsTotals = apiData.totals?.icms;

  const produtos: ProdutoNF[] = (apiData.items || []).map((item) => ({
    codigo: item.code || '',
    descricao: item.description || '',
    ncm: item.ncm || '',
    cst: item.tax?.icms?.cst || '',
    cfop: item.cfop != null ? String(item.cfop) : '',
    unidade: item.unit || 'UN',
    quantidade: formatDecimal(item.quantity) || '0,000',
    valorUnitario: formatCurrency(item.unitAmount) || '0,00',
    valorTotal: formatCurrency(item.totalAmount) || '0,00',
  }));

  const valoresTotais: ValoresTotaisNF = {
    baseCalculoICMS: formatCurrency(icmsTotals?.baseTax) || '',
    valorICMS: formatCurrency(icmsTotals?.icmsAmount) || '',
    valorProdutos: formatCurrency(icmsTotals?.productAmount) || '',
    valorFrete: formatCurrency(icmsTotals?.freightAmount) || '',
    valorSeguro: formatCurrency(icmsTotals?.insuranceAmount) || '',
    valorDesconto: formatCurrency(icmsTotals?.discountAmount) || '',
    valorIPI: formatCurrency(icmsTotals?.ipiAmount) || '',
    // othersAmount cobre "outras despesas acessórias" do DANFE
    valorOutrasDespesas: formatCurrency(icmsTotals?.othersAmount) || '',
    // federalTaxesAmount é o total aproximado de tributos federais (Lei 12.741).
    // Troque por pisAmount + cofinsAmount + ipiAmount somados se preferir outro critério.
    valorTotalTributos: formatCurrency(icmsTotals?.federalTaxesAmount) || '',
  };

  return {
    numero: apiData.number != null ? String(apiData.number) : '',
    serie: apiData.serie != null ? String(apiData.serie) : '',
    dataEmissao: formatDate(apiData.issuedOn) || '',
    // A API não retorna data/hora de saída separadas; operationOn é o mais próximo disponível.
    dataSaidaEntrada: formatDate(apiData.operationOn) || '',
    horaSaida: '',
    naturezaOperacao: apiData.operationNature || '',
    chaveAcesso: apiData.protocol?.accessKey || '',
    protocoloAutorizacao: apiData.protocol?.protocolNumber || '',
    valorTotal: formatCurrency(icmsTotals?.invoiceAmount) || '',
    emitente: mapParty(apiData.issuer),
    destinatario: mapParty(apiData.buyer),
    produtos,
    valoresTotais,
  };
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return '';
  // Se já estiver no formato DD/MM/AAAA, retorna como está
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) return dateStr;

  // Se estiver no formato ISO (YYYY-MM-DDTHH:mm:ss...), converte para DD/MM/AAAA
  if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
    const [year, month, day] = dateStr.slice(0, 10).split('-');
    return `${day}/${month}/${year}`;
  }

  return dateStr;
}

function formatCurrency(value: unknown): string {
  if (value === null || value === undefined) return '0,00';
  const num = parseFloat(String(value).replace(',', '.'));
  if (isNaN(num)) return '0,00';
  return num.toFixed(2).replace('.', ',');
}

function formatDecimal(value: unknown): string {
  if (value === null || value === undefined) return '0,000';
  const num = parseFloat(String(value).replace(',', '.'));
  if (isNaN(num)) return '0,000';
  return num.toFixed(3).replace('.', ',');
}

// Endpoint API para consulta de NF-e
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const chave = searchParams.get('chave');

    if (!chave) {
      return NextResponse.json(
        { error: 'Chave de acesso não fornecida' },
        { status: 400 }
      );
    }

    const apiData = await consultarNfe(chave);
    const notaFiscalData = mapApiToNotaFiscalData(apiData as NfeApiResponse);

    return NextResponse.json(notaFiscalData);
  } catch (error) {
    console.error('Erro ao consultar NF-e:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro ao consultar NF-e' },
      { status: 500 }
    );
  }
}