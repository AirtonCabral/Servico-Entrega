import { extrairDadosDANFE } from "@/lib/extrairDadosDANFE";
import { extrairDadosCTe } from "@/lib/extrairDadosCTe";
import { NextResponse } from "next/server";
import { createWorker, PSM } from "tesseract.js";

export async function POST(req: Request) {
  let worker;
  try {
    // "image": data URL: "data:image/png;base64,...."
    // "tipo": "nfe" | "cte" — escolhido pelo usuário antes do upload.
    const { image, tipo } = await req.json();
    const tipoDocumento: "nfe" | "cte" = tipo === "cte" ? "cte" : "nfe";

    if (!image || !/^data:image\/\w+;base64,/.test(image)) {
      return NextResponse.json(
        { success: false, error: "Imagem inválida." },
        { status: 400 },
      );
    }

    worker = await createWorker("por"); // português
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_COLUMN });

    const { data } = await worker.recognize(image);

    const texto = data.text;
    if (!texto || texto.trim().length < 10) {
      throw new Error("Não foi possível ler texto na imagem enviada.");
    }

    const resultado =
      tipoDocumento === "cte" ? extrairDadosCTe(texto) : extrairDadosDANFE(texto);

    return NextResponse.json({
      success: true,
      tipo: tipoDocumento,
      data: resultado,
      textoOcr: texto,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido.";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  } finally {
    if (worker) await worker.terminate();
  }
}
