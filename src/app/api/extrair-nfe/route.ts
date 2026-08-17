import { extrairDadosDANFE } from "@/lib/extrairDadosDANFE";
import { extrairDadosCTe } from "@/lib/extrairDadosCTe";
import { NextResponse } from "next/server";
import { createWorker, PSM, type Worker } from "tesseract.js";
import sharp from "sharp";

export const runtime = "nodejs";
export const maxDuration = 300;

const OCR_TIMEOUT_MS = 42_000;
const MAX_BASE64_CHARS = 7_000_000;
const MAX_IMAGE_WIDTH = 2200;

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

type ImagemPreparada = {
  buffer: Buffer;
  width: number;
  height: number;
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

function dataUrlParaBuffer(dataUrl: string): Buffer {
  const base64 = dataUrl.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, "");
  return Buffer.from(base64, "base64");
}

async function prepararImagem(dataUrl: string): Promise<ImagemPreparada> {
  const input = dataUrlParaBuffer(dataUrl);

  const image = sharp(input, {
    failOn: "none",
  }).rotate();

  const metadata = await image.metadata();

  if (!metadata.width || !metadata.height) {
    throw new Error("Não foi possível identificar as dimensões da imagem.");
  }

  // Evita mandar fotos enormes ao OCR, reduzindo CPU, memória e tempo.
  // Não aumenta imagens pequenas para não piorar artefatos.
  const buffer = await image
    .resize({
      width: MAX_IMAGE_WIDTH,
      withoutEnlargement: true,
    })
    .grayscale()
    .normalize()
    .sharpen()
    .png()
    .toBuffer();

  const processedMetadata = await sharp(buffer).metadata();

  if (!processedMetadata.width || !processedMetadata.height) {
    throw new Error("Não foi possível preparar a imagem para OCR.");
  }

  return {
    buffer,
    width: processedMetadata.width,
    height: processedMetadata.height,
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
      height: Math.round(h * 0.18),
      psm: PSM.SINGLE_BLOCK,
    },
    {
      nome: "chaveAcesso",
      left: Math.round(w * 0.56),
      top: 0,
      width: Math.round(w * 0.44),
      height: Math.round(h * 0.14),
      psm: PSM.SINGLE_BLOCK,
    },
    {
      nome: "destinatario",
      left: 0,
      top: Math.round(h * 0.18),
      width: w,
      height: Math.round(h * 0.15),
      psm: PSM.SINGLE_BLOCK,
    },
    {
      nome: "dadosNfe",
      left: 0,
      top: Math.round(h * 0.1),
      width: w,
      height: Math.round(h * 0.23),
      psm: PSM.SINGLE_BLOCK,
    },
    {
      nome: "totais",
      left: Math.round(w * 0.52),
      top: Math.round(h * 0.78),
      width: Math.round(w * 0.48),
      height: Math.round(h * 0.18),
      psm: PSM.SINGLE_BLOCK,
    },
  ];
}

async function criarWorker(nome: string): Promise<Worker> {
  return createWorker("por", 1, {
    logger: (event) => {
      if (event.status === "recognizing text") {
        console.log(
          `[OCR:${nome}] ${Math.round(event.progress * 100)}%`,
        );
      }
    },
  });
}

async function reconhecerRegiao(
  worker: Worker,
  image: Buffer,
  regiao: RegiaoOcr,
): Promise<[string, ResultadoRegiao]> {
  const result = await worker.recognize(image, {}, {
    rectangle: {
      left: regiao.left,
      top: regiao.top,
      width: regiao.width,
      height: regiao.height,
    },
    tessedit_pageseg_mode: regiao.psm,
  });

  return [
    regiao.nome,
    {
      texto: result.data.text.trim(),
      confianca: Math.round(result.data.confidence),
    },
  ];
}

async function reconhecerTextoCompleto(
  worker: Worker,
  image: Buffer,
): Promise<string> {
  await worker.setParameters({
    tessedit_pageseg_mode: PSM.SINGLE_COLUMN,
  });

  const result = await worker.recognize(image);

  return result.data.text.trim();
}

async function encerrarWorker(worker?: Worker) {
  if (!worker) return;

  try {
    await worker.terminate();
  } catch (error) {
    console.error("[OCR] erro ao encerrar worker:", error);
  }
}

export async function POST(req: Request) {
  let workerCompleto: Worker | undefined;
  let workerRegioes: Worker | undefined;
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

    console.time("[OCR] preparar imagem");
    const imagemPreparada = await prepararImagem(image);
    console.timeEnd("[OCR] preparar imagem");

    console.log(
      `[OCR] imagem preparada: ${imagemPreparada.width}x${imagemPreparada.height}`,
    );

    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(
          new Error(
            "A leitura da imagem demorou demais. Tente uma foto menor, mais nítida ou com melhor iluminação.",
          ),
        );
      }, OCR_TIMEOUT_MS);
    });

    console.time("[OCR] criar workers");

    // CT-e mantém um único OCR completo, pois ainda não há regiões específicas.
    if (tipoDocumento === "cte") {
      workerCompleto = await criarWorker("completo");
    } else {
      [workerCompleto, workerRegioes] = await Promise.all([
        criarWorker("completo"),
        criarWorker("regioes"),
      ]);
    }

    console.timeEnd("[OCR] criar workers");

    console.time("[OCR] reconhecer");

    const recognition = (async () => {
      if (tipoDocumento === "cte") {
        const textoCompleto = await reconhecerTextoCompleto(
          workerCompleto!,
          imagemPreparada.buffer,
        );

        return {
          textoCompleto,
          regioes: {},
        };
      }

      const regioes = criarRegioesDanfe(
        imagemPreparada.width,
        imagemPreparada.height,
      );

      // OCR integral e OCR por campos ocorrem simultaneamente.
      const [textoCompleto, regioesEntries] = await Promise.all([
        reconhecerTextoCompleto(workerCompleto!, imagemPreparada.buffer),
        Promise.all(
          regioes.map((regiao) =>
            reconhecerRegiao(workerRegioes!, imagemPreparada.buffer, regiao),
          ),
        ),
      ]);

      return {
        textoCompleto,
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

    const tempoMs = Math.round(performance.now() - startedAt);

    console.log(`[OCR] total: ${tempoMs} ms`);

    return NextResponse.json({
      success: true,
      tipo: tipoDocumento,
      data,
      textoOcr: texto,
      ocrPorRegiao: ocrResult.regioes,
      tempoMs,
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

    await Promise.all([
      encerrarWorker(workerCompleto),
      encerrarWorker(workerRegioes),
    ]);
  }
}