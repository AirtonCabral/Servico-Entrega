// app/page.tsx
"use client";

import { useState, useRef, useCallback, DragEvent, ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import type { NotaFiscalData, CteData, TipoDocumento } from "@/lib/types";
import { useOcr } from "@/app/hooks/useOcr";

type Step = "idle" | "uploading" | "processing" | "error";

export default function UploadPage() {
  const router = useRouter();
  const [tipoDocumento, setTipoDocumento] = useState<TipoDocumento>("nfe");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [step, setStep] = useState<Step>("idle");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Usar o hook de OCR client-side
  const { processarImagem, isLoading, progress, statusMessage } = useOcr();

  const setStoredData = (
    tipo: TipoDocumento,
    data: NotaFiscalData | CteData,
    base64: string,
  ) => {
    if (typeof window === "undefined") return;
    try {
      sessionStorage.setItem(
        "nfe:data",
        JSON.stringify({ tipo, data, image: base64, extractedAt: Date.now() }),
      );
    } catch (e) {
      console.error("Erro ao salvar dados na sessão:", e);
    }
  };

  const fileToBase64 = (f: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(f);
    });

  // Redimensiona a imagem no navegador antes de processar
  const redimensionarImagem = (dataUrl: string, larguraMax = 1800): Promise<string> =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        if (img.width <= larguraMax) {
          resolve(dataUrl);
          return;
        }
        const escala = larguraMax / img.width;
        const canvas = document.createElement("canvas");
        canvas.width = larguraMax;
        canvas.height = Math.round(img.height * escala);
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.9));
      };
      img.onerror = reject;
      img.src = dataUrl;
    });

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      const f = files[0];
      if (!f.type.startsWith("image/")) {
        setErrorMessage("Por favor, envie apenas arquivos de imagem.");
        setStep("error");
        return;
      }
      if (f.size > 8 * 1024 * 1024) {
        setErrorMessage("Arquivo muito grande. Use uma imagem com até 8MB.");
        setStep("error");
        return;
      }

      setFile(f);
      setErrorMessage("");
      const base64Original = await fileToBase64(f);
      const base64 = await redimensionarImagem(base64Original);
      setImagePreview(base64);
      setStep("idle");
    },
    [],
  );

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    handleFiles(e.target.files);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    handleFiles(e.dataTransfer.files);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleExtrair = async () => {
    if (!file || !imagePreview) return;
    setStep("processing");
    setErrorMessage("");

    try {
      // 1. Processar OCR no cliente
      const ocrResult = await processarImagem(imagePreview, tipoDocumento);
      
      if (!ocrResult.textoCompleto || ocrResult.textoCompleto.length < 10) {
        throw new Error("Não foi possível identificar texto suficiente na imagem.");
      }

      // 2. Enviar apenas o texto para o servidor para parse
      const res = await fetch("/api/extrair-nfe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          texto: ocrResult.textoCompleto,
          tipo: tipoDocumento 
        }),
      });
      
      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(
          json.error || "Não foi possível extrair os dados do documento.",
        );
      }

      // 3. Salvar resultado
      const tipoConfirmado: TipoDocumento = json.tipo === "cte" ? "cte" : "nfe";
      setStoredData(
        tipoConfirmado,
        json.data as NotaFiscalData | CteData,
        imagePreview,
      );

      // 4. Navegar para validação
      setTimeout(() => {
        router.push("/validacao");
      }, 400);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido.";
      setErrorMessage(msg);
      setStep("error");
    }
  };

  const handleReset = () => {
    setImagePreview(null);
    setFile(null);
    setStep("idle");
    setErrorMessage("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const isCte = tipoDocumento === "cte";

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
      <div className="mb-8 sm:mb-10 text-center">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">
          Envie a foto do documento fiscal
        </h1>
        <p className="mt-3 text-sm sm:text-base text-gray-600 max-w-2xl mx-auto">
          {isCte
            ? "Envie uma foto ou scan nítido do seu CT-e (DACTE). O OCR é processado no seu navegador e os dados são extraídos automaticamente."
            : "Envie uma foto ou scan nítido da sua NF-e (DANFE). O OCR é processado no seu navegador e os dados são extraídos automaticamente."}
        </p>
        <p className="mt-2 text-xs text-green-600">
          🔒 Processamento local - sua imagem nunca é enviada para o servidor
        </p>
      </div>

      {/* Seletor de tipo de documento */}
      <div className="max-w-md mx-auto mb-8 sm:mb-10">
        <div className="inline-flex w-full rounded-xl border border-gray-200 bg-gray-50 p-1 gap-1">
          <button
            type="button"
            onClick={() => setTipoDocumento("nfe")}
            disabled={step === "processing" || isLoading}
            className={`flex-1 inline-flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium transition ${
              !isCte
                ? "bg-white text-primary-700 shadow-sm border border-gray-200"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            📄 NF-e (produtos)
          </button>
          <button
            type="button"
            onClick={() => setTipoDocumento("cte")}
            disabled={step === "processing" || isLoading}
            className={`flex-1 inline-flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium transition ${
              isCte
                ? "bg-white text-primary-700 shadow-sm border border-gray-200"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            🚚 CT-e (frete)
          </button>
        </div>
        <p className="mt-2 text-center text-xs text-gray-500">
          Escolha o tipo de documento antes de enviar a imagem
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-6 sm:gap-8">
        <div className="space-y-5">
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
            className={`group cursor-pointer card border-2 border-dashed transition-all ${
              isDragOver
                ? "border-primary-500 bg-primary-50/60"
                : "border-gray-300 hover:border-primary-400 hover:bg-slate-50"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleInputChange}
            />
            <div className="text-center py-8 sm:py-10 select-none">
              <div
                className={`mx-auto w-16 h-16 rounded-2xl grid place-items-center mb-4 transition ${
                  isDragOver
                    ? "bg-primary-600 text-white"
                    : "bg-primary-100 text-primary-600 group-hover:bg-primary-200"
                }`}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="w-8 h-8"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
              </div>
              <p className="font-semibold text-gray-900">
                Clique para escolher ou arraste a imagem
              </p>
              <p className="mt-1 text-xs text-gray-500">
                PNG, JPG ou WEBP · Até 8MB
              </p>
            </div>
          </div>

          <div className="card">
            <h3 className="font-semibold text-gray-900 mb-3">
              Dicas para melhor extração
            </h3>
            <ul className="space-y-2 text-sm text-gray-600">
              {(isCte
                ? [
                    "Garanta boa iluminação e foco em todo o documento",
                    "Evite sombras, reflexos ou cortes nas bordas",
                    "Chave de acesso e valores do frete devem estar legíveis",
                    "DACTE impresso em tamanho A4 em fundo plano",
                  ]
                : [
                    "Garanta boa iluminação e foco em todo o documento",
                    "Evite sombras, reflexos ou cortes nas bordas",
                    "Chave de acesso e valores devem estar legíveis",
                    "DANFE impresso em tamanho A4 em fundo plano",
                  ]
              ).map((d) => (
                <li key={d} className="flex gap-2">
                  <span className="mt-0.5 text-primary-600">•</span>
                  <span>{d}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="space-y-5">
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">
                Pré-visualização
              </h3>
              {imagePreview && (
                <button
                  type="button"
                  onClick={handleReset}
                  className="text-xs font-medium text-gray-500 hover:text-red-600 transition"
                >
                  Remover imagem
                </button>
              )}
            </div>
            <div
              className={`aspect-[4/3] w-full rounded-lg border border-gray-200 bg-gray-50 grid place-items-center overflow-hidden`}
            >
              {imagePreview ? (
                <img
                  src={imagePreview}
                  alt={`Pré-visualização do ${isCte ? "CT-e" : "NF-e"}`}
                  className="w-full h-full object-contain bg-white"
                />
              ) : (
                <div className="text-center text-gray-400 px-4">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="w-12 h-12 mx-auto mb-2 opacity-60"
                  >
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <circle cx="9" cy="9" r="2" />
                    <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
                  </svg>
                  <p className="text-sm">
                    A imagem aparecerá aqui após o upload
                  </p>
                </div>
              )}
            </div>

            {/* Progresso do OCR client-side */}
            {(step === "processing" || isLoading) && (
              <div className="mt-5">
                <div className="flex items-center justify-between text-xs mb-2">
                  <span className="font-medium text-gray-700">
                    {statusMessage || (step === "processing" ? "Processando OCR..." : "Preparando...")}
                  </span>
                  <span className="text-primary-600 font-semibold tabular-nums">
                    {Math.round(progress)}%
                  </span>
                </div>
                <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-primary-500 to-primary-700 transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  ⚡ Processamento local no seu navegador
                </p>
              </div>
            )}

            {errorMessage && (
              <div className="mt-5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 px-4 py-3 flex gap-3">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  className="w-5 h-5 flex-shrink-0 mt-0.5"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span>{errorMessage}</span>
              </div>
            )}

            <div className="mt-6 flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="btn-secondary"
                disabled={step === "processing" || isLoading}
              >
                Trocar imagem
              </button>
              <button
                type="button"
                onClick={handleExtrair}
                className="btn-primary flex-1"
                disabled={
                  !imagePreview ||
                  step === "processing" ||
                  isLoading
                }
              >
                {(step === "processing" || isLoading) ? (
                  <>
                    <svg
                      className="animate-spin -ml-0.5 h-4 w-4"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                    {statusMessage || "Processando..."}
                  </>
                ) : (
                  <>
                    Extrair dados
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      className="w-4 h-4"
                    >
                      <path d="M5 12h14" />
                      <path d="m12 5 7 7-7 7" />
                    </svg>
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="card bg-gradient-to-br from-slate-900 to-slate-800 border-slate-800 text-white">
            <h3 className="font-semibold mb-2">Como funciona?</h3>
            <ol className="text-sm text-slate-300 space-y-2 list-decimal list-inside">
              <li>Escolha o tipo de documento ({isCte ? "CT-e / DACTE" : "NF-e / DANFE"})</li>
              <li>Envie a foto do documento</li>
              <li>OCR processado no seu navegador (local e privado)</li>
              <li>Sistema extrai e organiza os dados automaticamente</li>
              <li>Revise, ajuste e confirme as informações</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}