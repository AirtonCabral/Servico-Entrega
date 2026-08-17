import { extrairDadosDANFE } from "@/lib/extrairDadosDANFE";
import { extrairDadosCTe } from "@/lib/extrairDadosCTe";
import { NextResponse } from "next/server";
import { createWorker, PSM, type Worker } from "tesseract.js";

export const runtime = "nodejs";
export const maxDuration = 300;

const OCR_TIMEOUT_MS = 42_000;
const MAX_BASE64_CHARS = 7_000_000;

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
  let worker: Worker | undefined;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const startedAt = performance.now();

  try {
    console.time("[OCR] body");

    const body = await req.json();

    console.timeEnd("[OCR] body");

    const image = body?.image;
    const tipoDocumento: TipoDocumento = body?.tipo === "cte" ? "cte" : "nfe";

    if (
      typeof image !== "string" ||
      !/^data:image\/(png|jpeg|jpg|webp);base64,/.test(image)
    ) {
      return jsonError("Imagem inválida. Envie PNG, JPG ou WEBP.", 400);
    }

    if (image.length > MAX_BASE64_CHARS) {
      return jsonError(
        "Imagem grande demais. Envie uma imagem de até aproximadamente 5 MB.",
        413,
      );
    }

    console.time("[OCR] criar worker");

    worker = await createWorker("por", 1, {
      logger: (event) => {
        if (event.status === "recognizing text") {
          console.log(`[OCR] ${Math.round(event.progress * 100)}%`);
        }
      },
    });

    console.timeEnd("[OCR] criar worker");

    await worker.setParameters({
      tessedit_pageseg_mode: PSM.SINGLE_COLUMN,
    });

    console.time("[OCR] reconhecer");

    const recognition = worker.recognize(image);

    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(
          new Error(
            "A leitura da imagem demorou demais. Tente uma foto menor, mais nítida ou com melhor iluminação.",
          ),
        );
      }, OCR_TIMEOUT_MS);
    });

    const ocrResult = await Promise.race([recognition, timeout]);

    console.timeEnd("[OCR] reconhecer");

    const texto = ocrResult.data.text.trim();

    if (texto.length < 10) {
      return jsonError(
        "Não foi possível identificar texto suficiente na imagem.",
        422,
      );
    }

    console.time("[OCR] interpretar");

    const data =
      tipoDocumento === "cte"
        ? extrairDadosCTe(texto)
        : extrairDadosDANFE(texto);

    console.timeEnd("[OCR] interpretar");

    console.log(
      `[OCR] total: ${Math.round(performance.now() - startedAt)} ms`,
    );

    return NextResponse.json({
      success: true,
      tipo: tipoDocumento,
      data,
      textoOcr: texto,
    });
  } catch (error) {
    console.error("[extrair-nfe] erro:", error);

    const message =
      error instanceof Error
        ? error.message
        : "Erro desconhecido ao ler o documento.";

    const isOcrTimeout =
      message.includes("demorou demais") ||
      message.includes("OCR excedeu o tempo");

    return jsonError(
      isOcrTimeout
        ? message
        : "Não foi possível processar o documento. Tente novamente.",
      isOcrTimeout ? 408 : 500,
    );
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    if (worker) {
      try {
        await worker.terminate();
      } catch (terminateError) {
        console.error(
          "[extrair-nfe] erro ao encerrar worker:",
          terminateError,
        );
      }
    }
  }
}