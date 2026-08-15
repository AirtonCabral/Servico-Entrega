"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type TestImage = {
  filename: string;
  url: string;
  size: number;
};

export default function TesteLoadingPage() {
  const router = useRouter();
  const [images, setImages] = useState<TestImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [currentImage, setCurrentImage] = useState<number>(0);
  const [processed, setProcessed] = useState<number>(0);

  useEffect(() => {
    loadTestImages();
  }, []);

  const loadTestImages = async () => {
    try {
      const res = await fetch("/api/test-images");
      const data = await res.json();
      if (data.success) {
        setImages(data.images);
      }
    } catch (error) {
      console.error("Erro ao carregar imagens:", error);
    } finally {
      setLoading(false);
    }
  };

  const processImage = async (image: TestImage, index: number) => {
    setCurrentImage(index);
    setProcessing(true);

    try {
      // Importar dados mock
      const { mockNotasFiscais } = await import("@/lib/mock-data");
      
      // Usar dados mock específico para esta imagem
      const mockData = mockNotasFiscais[index % mockNotasFiscais.length];
      
      // Salvar no sessionStorage como se fosse extraído normalmente
      sessionStorage.setItem(
        "nfe:data",
        JSON.stringify({
          data: mockData,
          image: image.url,
          extractedAt: Date.now(),
        }),
      );

      // Redirecionar para validação
      router.push("/validacao");
    } catch (error) {
      console.error("Erro ao processar imagem:", error);
      alert("Erro ao processar imagem");
    } finally {
      setProcessing(false);
    }
  };

  const processAllImages = async () => {
    setProcessing(true);
    let successCount = 0;

    // Importar dados mock e função de salvamento
    const { mockNotasFiscais } = await import("@/lib/mock-data");
    const { saveNfeToHistory } = await import("@/lib/storage");

    for (let i = 0; i < images.length; i++) {
      setCurrentImage(i);
      try {
        // Usar dados mock diretamente associados a cada imagem
        const mockData = mockNotasFiscais[i % mockNotasFiscais.length];
        
        // Salvar diretamente no histórico com os dados mock
        saveNfeToHistory("nfe", mockData, images[i].url);
        successCount++;
        
        console.log(`Imagem ${i + 1} processada: ${mockData.destinatario.nome}`);
      } catch (error) {
        console.error(`Erro ao processar imagem ${i}:`, error);
      }

      // Pequena pausa entre processamentos
      await new Promise(r => setTimeout(r, 300));
    }

    setProcessed(successCount);
    setProcessing(false);
    alert(`Processamento concluído! ${successCount} de ${images.length} imagens processadas com dados extraídos.`);
    
    // Redirecionar para a lista de NF-es
    setTimeout(() => {
      router.push("/lista-nfes");
    }, 1000);
  };

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-16 text-center">
        <p className="text-gray-500">Carregando imagens de teste...</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">
          Teste de Processamento de Imagens
        </h1>
        <p className="mt-2 text-sm text-gray-600 max-w-2xl">
          Carregue e processe as imagens da pasta artifacts para teste do sistema de NF-e.
        </p>
      </div>

      <div className="mb-6">
        <button
          onClick={processAllImages}
          disabled={processing || images.length === 0}
          className="btn-primary"
        >
          {processing ? "Processando..." : "Processar Todas as Imagens"}
        </button>
        {processed > 0 && (
          <span className="ml-4 text-sm text-green-600">
            {processed} imagens processadas com sucesso
          </span>
        )}
      </div>

      {processing && (
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-800">
            Processando imagem {currentImage + 1} de {images.length}...
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {images.map((image, index) => (
          <div key={image.filename} className="card">
            <div className="aspect-square rounded-lg overflow-hidden bg-gray-100 mb-3">
              <img
                src={image.url}
                alt={image.filename}
                className="w-full h-full object-cover"
              />
            </div>
            <p className="text-xs font-medium text-gray-900 truncate mb-2">
              {image.filename}
            </p>
            <button
              onClick={() => processImage(image, index)}
              disabled={processing}
              className="w-full btn-secondary text-xs py-2"
            >
              Processar
            </button>
          </div>
        ))}
      </div>

      {images.length === 0 && (
        <div className="card text-center py-16">
          <p className="text-gray-500">Nenhuma imagem encontrada na pasta artifacts</p>
        </div>
      )}
    </div>
  );
}
