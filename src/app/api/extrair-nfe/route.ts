// app/api/extrair-nfe/route.ts
import { extrairDadosDANFE } from "@/lib/extrairDadosDANFE";
import { extrairDadosCTe } from "@/lib/extrairDadosCTe";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

type TipoDocumento = "nfe" | "cte";

function jsonError(error: string, status: number) {
  return NextResponse.json(
    {
      success: false,
      error,
    },
    { status },
  );
}

export async function POST(req: Request) {
  const startedAt = performance.now();

  try {
    const body = await req.json();
    
    // Agora esperamos texto, não imagem
    const { texto, tipo } = body;
    const tipoDocumento: TipoDocumento = tipo === "cte" ? "cte" : "nfe";

    // Validar texto
    if (!texto || typeof texto !== "string" || texto.length < 10) {
      return jsonError(
        "Texto OCR insuficiente ou inválido. Tente uma imagem mais nítida.",
        422,
      );
    }

    console.log(`[API] Processando ${tipoDocumento} com ${texto.length} caracteres`);

    // Interpretar o texto
    const data = tipoDocumento === "cte"
      ? extrairDadosCTe(texto)
      : extrairDadosDANFE(texto);

    const tempoMs = Math.round(performance.now() - startedAt);
    console.log(`[API] ${tipoDocumento} processado em ${tempoMs}ms`);

    return NextResponse.json({
      success: true,
      tipo: tipoDocumento,
      data,
      tempoMs,
    });
  } catch (error) {
    console.error("[extrair-nfe] erro:", error);

    const message = error instanceof Error
      ? error.message
      : "Erro desconhecido ao processar o texto.";

    return jsonError(
      "Não foi possível processar o documento. Tente novamente.",
      500,
    );
  }
}