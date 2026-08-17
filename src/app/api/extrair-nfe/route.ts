import { extrairDadosDANFE } from "@/lib/extrairDadosDANFE";
import { extrairDadosCTe } from "@/lib/extrairDadosCTe";
import { NextResponse } from "next/server";
import { createWorker, PSM, type Worker } from "tesseract.js";
import sharp from "sharp";

export const runtime = "nodejs";
export const maxDuration = 300;

const OCR_TIMEOUT_MS = 42_000;
const MAX_BASE64_CHARS = 7_000_000;

type TipoDocumento = "nfe" | "cte";

type RegiaoOcr = {
  nome: string;
  left: number;
  top: number;
  width: number;
  height: number;
  psm: PSM;
};

type ResultadoRegiao = {
  texto: string;
  confianca: number;
};

function jsonError(error: string, status: number) {
  return NextResponse.json(
    {
      success: false,
      error,
    },
    { status },
  );
}


async function getImageDimensions(dataUrl: string) {
  const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, "");
  const buffer = Buffer.from(base64, "base64");

  const metadata = await sharp(buffer).metadata();

  if (!metadata.width || !metadata.height) {
    throw new Error("Não foi possível identificar as dimensões da imagem.");
  }

  return {
    width: metadata.width,
    height: metadata.height,
  };
}

function criarRegioesDanfe(
  imageWidth: number,
  imageHeight: number,
): RegiaoOcr[] {
  const w = imageWidth;
  const h = imageHeight;

  return [
    {
      nome: "emitente",
      left: 0,
      top: 0,
      width: Math.round(w * 0.6),
      height: Math.round(h * 0.2),
      psm: PSM.SINGLE_BLOCK,
    },
    {
      nome: "chaveAcesso",
      left: Math.round(w * 0.58),
      top: 0,
      width: Math.round(w * 0.42),
      height: Math.round(h * 0.13),
      psm: PSM.SINGLE_BLOCK,
    },
    {
      nome: "destinatario",
      left: 0,
      top: Math.round(h * 0.18),
      width: w,
      height: Math.round(h * 0.14),
      psm: PSM.SINGLE_BLOCK,
    },
    {
      nome: "dadosNfe",
      left: 0,
      top: Math.round(h * 0.12),
      width: w,
      height: Math.round(h * 0.2),
      psm: PSM.SINGLE_BLOCK,
    },
    {
      nome: "totais",
      left: Math.round(w * 0.55),
      top: Math.round(h * 0.8),
      width: Math.round(w * 0.45),
      height: Math.round(h * 0.16),
      psm: PSM.SINGLE_BLOCK,
    },
  ];
}

async function reconhecerRegiao(
  worker: Worker,
  image: string,
  regiao: RegiaoOcr,
): Promise<[string, ResultadoRegiao]> {
  const result = await worker.recognize(image, {
    rectangle: {
      left: regiao.left,
      top: regiao.top,
      width: regiao.width,
      height: regiao.height,
    },
  });

  return [
    regiao.nome,
    {
      texto: result.data.text.trim(),
      confianca: result.data.confidence,
    },
  ];
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

    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(
          new Error(
            "A leitura da imagem demorou demais. Tente uma foto menor, mais nítida ou com melhor iluminação.",
          ),
        );
      }, OCR_TIMEOUT_MS);
    });

    console.time("[OCR] reconhecer");

    const recognition = (async () => {
      if (tipoDocumento === "cte") {
        await worker!.setParameters({
          tessedit_pageseg_mode: PSM.SINGLE_COLUMN,
        });

        const result = await worker!.recognize(image);

        return {
          textoCompleto: result.data.text.trim(),
          regioes: {},
        };
      }

      const { width, height } = await getImageDimensions(image);
      const regioesDanfe = criarRegioesDanfe(width, height);

      // Um worker processa uma tarefa por vez.
      // Executamos os campos prioritários primeiro para reduzir o tempo útil.
      const regioesEntries: Array<[string, ResultadoRegiao]> = [];

      for (const regiao of regioesDanfe) {
        const resultado = await reconhecerRegiao(worker!, image, regiao);
        regioesEntries.push(resultado);
      }

      // Mantém compatibilidade com os extratores existentes,
      // especialmente para tabela de itens e campos fora das regiões acima.
      await worker!.setParameters({
        tessedit_pageseg_mode: PSM.SINGLE_COLUMN,
      });

      const resultCompleto = await worker!.recognize(image);

      return {
        textoCompleto: resultCompleto.data.text.trim(),
        regioes: Object.fromEntries(regioesEntries),
      };
    })();

    const ocrResult = await Promise.race([recognition, timeout]);

    console.timeEnd("[OCR] reconhecer");

    const texto = ocrResult.textoCompleto;

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

      // Útil para revisar os blocos no frontend e evoluir
      // seus extratores para usar OCR por campo.
      ocrPorRegiao: ocrResult.regioes,

      tempoMs: Math.round(performance.now() - startedAt),
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