import { extrairDadosDANFE } from "@/lib/extrairDadosDANFE";
import { extrairDadosCTe } from "@/lib/extrairDadosCTe";
import { NextResponse } from "next/server";
import { createWorker, PSM, type Worker } from "tesseract.js";

export const runtime = "nodejs";
export const maxDuration = 60;

const OCR_TIMEOUT_MS = 50_000;
const MAX_BASE64_CHARS = 7_000_000;


export async function POST(req: Request) {
  let worker: Worker | undefined;
  const startedAt = performance.now();

  try {
    const { image, tipo } = await req.json();
    const tipoDocumento: "nfe" | "cte" = tipo === "cte" ? "cte" : "nfe";

    if (typeof image !== "string" || !/^data:image\/\w+;base64,/.test(image)) {
      return NextResponse.json(
        { success: false, error: "Imagem inválida." },
        { status: 400 },
      );
    }

    if (image.length > MAX_BASE64_CHARS) {
      return NextResponse.json(
        {
          success: false,
          error: "Imagem grande demais. Envie uma imagem de até aproximadamente 5 MB.",
        },
        { status: 413 },
      );
    }

    console.time("[OCR] worker");
    worker = await createWorker("por", 1, {
      logger: (event) => {
        if (event.status === "recognizing text") {
          console.log("[OCR]", Math.round(event.progress * 100) + "%");
        }
      },
    });
    console.timeEnd("[OCR] worker");

    await worker.setParameters({
      tessedit_pageseg_mode: PSM.SINGLE_COLUMN,
    });

    console.time("[OCR] recognize");

    const ocrResult = await Promise.race([
      worker.recognize(image),
      new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error("OCR excedeu o tempo máximo de 50 segundos.")),
          OCR_TIMEOUT_MS,
        );
      }),
    ]);

    console.timeEnd("[OCR] recognize");

    const texto = ocrResult.data.text.trim();

    if (texto.length < 10) {
      return NextResponse.json(
        {
          success: false,
          error: "Não foi possível identificar texto suficiente na imagem.",
        },
        { status: 422 },
      );
    }

    const data =
      tipoDocumento === "cte"
        ? extrairDadosCTe(texto)
        : extrairDadosDANFE(texto);

    console.log("[OCR] total:", Math.round(performance.now() - startedAt), "ms");

    return NextResponse.json({
      success: true,
      tipo: tipoDocumento,
      data,
      textoOcr: texto,
    });
  } catch (err) {
    console.error("[extrair-nfe] erro:", err);

    const message =
      err instanceof Error ? err.message : "Erro desconhecido ao ler documento.";

    const status = message.includes("tempo máximo") ? 504 : 500;

    return NextResponse.json(
      { success: false, error: message },
      { status },
    );
  } finally {
    if (worker) {
      await worker.terminate().catch((terminateError) => {
        console.error("[extrair-nfe] erro ao encerrar worker:", terminateError);
      });
    }
  }
}