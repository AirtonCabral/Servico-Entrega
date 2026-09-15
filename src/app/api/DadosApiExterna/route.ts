// src/services/nfeService.ts

import { NextRequest, NextResponse } from 'next/server';

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

  const apiKey = process.env.NFE_API_KEY;

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
  
  // Converte todos os valores monetários do payload para reais no formato
  // brasileiro ("1.234,56") antes de devolver, para que qualquer consumidor
  // (QR code, validação, histórico) receba os valores já em BRL.
  return normalizeValuesToBRL(data);
}

// ============================================================
// Helpers de normalização de valores monetários (BRL)
// ============================================================

// Converte um valor para número, aceitando tanto o formato brasileiro
// ("1.234,56" ou "1234,56") quanto o americano/numérico ("1234.56").
function parseNumber(value: unknown): number {
  if (value === null || value === undefined) return NaN;
  const s = String(value).trim();
  if (!s) return NaN;
  // Formato brasileiro: vírgula é o separador decimal e ponto é milhar
  if (s.includes(',')) {
    return parseFloat(s.replace(/\./g, '').replace(',', '.'));
  }
  // Formato americano/numérico: ponto é o separador decimal
  return parseFloat(s);
}

function formatCurrency(value: unknown): string {
  if (value === null || value === undefined) return '0,00';
  const num = parseNumber(value);
  if (isNaN(num)) return '0,00';
  return num.toFixed(2).replace('.', ',');
}

// Campos monetários do payload da API (nfe.io / SERPRO):
// chaves que terminam em "Amount" (unitAmount, totalAmount, invoiceAmount,
// productAmount, paymentDetail.amount etc.) ou a "baseTax" são valores em reais.
function isMoneyKey(key: string): boolean {
  const k = key.toLowerCase();
  return k.endsWith('amount') || k === 'basetax' || k === 'totaltax';
}

// Percorre o payload recursivamente e converte todos os valores monetários
// para o formato brasileiro de reais ("1.234,56"), preservando a estrutura.
function normalizeValuesToBRL(node: unknown): unknown {
  if (Array.isArray(node)) {
    return node.map(normalizeValuesToBRL);
  }
  if (node && typeof node === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (isMoneyKey(key)) {
        out[key] = formatCurrency(value);
      } else {
        out[key] = normalizeValuesToBRL(value);
      }
    }
    return out;
  }
  return node;
}

// Endpoint API para consulta de NF-e
// Retorna o payload CRU da NFe.io (com valores em BRL), que é o formato
// esperado pela página de validação (converterParaUnificado).
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

    return NextResponse.json(apiData);
  } catch (error) {
    console.error('Erro ao consultar NF-e:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro ao consultar NF-e' },
      { status: 500 }
    );
  }
}