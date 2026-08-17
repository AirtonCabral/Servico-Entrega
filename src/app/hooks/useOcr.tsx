// app/hooks/useOcr.ts
import { useState, useCallback, useRef } from 'react';
import { createWorker, PSM, type Worker } from "tesseract.js";

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

interface ResultadoOcr {
  textoCompleto: string;
  regioes?: Record<string, ResultadoRegiao>;
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

// Função para converter DataURL para ArrayBuffer
async function dataUrlToBuffer(dataUrl: string): Promise<ArrayBuffer> {
  const response = await fetch(dataUrl);
  return await response.arrayBuffer();
}

export function useOcr() {
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState("");
  const workerRef = useRef<Worker | null>(null);
  const workerRegioesRef = useRef<Worker | null>(null);

  const processarImagem = useCallback(async (
    imagemDataUrl: string,
    tipoDocumento: TipoDocumento = "nfe"
  ): Promise<ResultadoOcr> => {
    setIsLoading(true);
    setProgress(0);
    setStatusMessage("Inicializando OCR...");

    try {
      // Carregar a imagem para obter dimensões
      const img = new Image();
      img.src = imagemDataUrl;
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });

      if (!img.width || !img.height) {
        throw new Error("Não foi possível carregar a imagem");
      }

      // CT-e usa apenas um worker
      if (tipoDocumento === "cte") {
        setStatusMessage("Preparando OCR para CT-e...");
        const worker = await createWorker("por", 1, {
          logger: (event) => {
            if (event.status === "recognizing text") {
              const progressPercent = Math.round(event.progress * 100);
              setProgress(progressPercent);
              setStatusMessage(`Reconhecendo texto: ${progressPercent}%`);
            }
          },
        });
        workerRef.current = worker;

        await worker.setParameters({
          tessedit_pageseg_mode: PSM.SINGLE_COLUMN,
        });

        setStatusMessage("Processando imagem...");
        const result = await worker.recognize(imagemDataUrl);
        
        return {
          textoCompleto: result.data.text?.trim() || "",
        };
      }

      // NFE - dois workers simultâneos
      setStatusMessage("Preparando OCR para NF-e...");
      const [worker, workerRegioes] = await Promise.all([
        createWorker("por", 1, {
          logger: (event) => {
            if (event.status === "recognizing text") {
              const progressPercent = Math.round(event.progress * 100);
              setProgress(progressPercent);
              setStatusMessage(`Reconhecendo texto: ${progressPercent}%`);
            }
          },
        }),
        createWorker("por", 1),
      ]);
      
      workerRef.current = worker;
      workerRegioesRef.current = workerRegioes;

      // Definir regiões baseado nas dimensões da imagem
      const regioes = criarRegioesDanfe(img.width, img.height);
      
      setStatusMessage("Executando OCR completo e por regiões...");
      
      // OCR completo + OCR por regiões em paralelo
      const [textoCompleto, regioesEntries] = await Promise.all([
        (async () => {
          await worker.setParameters({
            tessedit_pageseg_mode: PSM.SINGLE_COLUMN,
          });
          const result = await worker.recognize(imagemDataUrl);
          return result.data.text?.trim() || "";
        })(),
        Promise.all(
          regioes.map(async (regiao) => {
            await workerRegioes.setParameters({
              tessedit_pageseg_mode: regiao.psm,
            });
            const result = await workerRegioes.recognize(imagemDataUrl, {
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
                texto: result.data.text?.trim() || "",
                confianca: Math.round(result.data.confidence || 0),
              },
            ];
          })
        ),
      ]);

      return {
        textoCompleto,
        regioes: Object.fromEntries(regioesEntries),
      };
    } catch (error) {
      console.error("[useOcr] erro:", error);
      throw error;
    } finally {
      setIsLoading(false);
      setStatusMessage("");
      // Limpar workers
      await Promise.all([
        workerRef.current?.terminate(),
        workerRegioesRef.current?.terminate(),
      ]);
      workerRef.current = null;
      workerRegioesRef.current = null;
    }
  }, []);

  const cancelar = useCallback(async () => {
    await Promise.all([
      workerRef.current?.terminate(),
      workerRegioesRef.current?.terminate(),
    ]);
    workerRef.current = null;
    workerRegioesRef.current = null;
    setIsLoading(false);
    setProgress(0);
    setStatusMessage("");
  }, []);

  return {
    processarImagem,
    cancelar,
    isLoading,
    progress,
    statusMessage,
  };
}