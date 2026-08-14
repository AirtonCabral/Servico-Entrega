import { extrairDadosDANFE } from "@/lib/extrairDadosDANFE";
import { NextResponse } from "next/server";
import { createWorker, PSM } from "tesseract.js";

export async function POST(req: Request) {
  let worker;
  debugger
  try {
    const { image } = await req.json(); // data URL: "data:image/png;base64,...."

    if (!image || !/^data:image\/\w+;base64,/.test(image)) {
      return NextResponse.json(
        { success: false, error: "Imagem inválida." },
        { status: 400 },
      );
    }
    debugger
    worker = await createWorker("por"); // português
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_COLUMN }); // <- aqui

    const { data } = await worker.recognize(image);

    const texto = data.text;
    if (!texto || texto.trim().length < 10) {
      throw new Error("Não foi possível ler texto na imagem enviada.");
    }

    const nfe = extrairDadosDANFE(texto);

    return NextResponse.json({ success: true, data: nfe, textoOcr: texto });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido.";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  } finally {
    if (worker) await worker.terminate();
  }
}