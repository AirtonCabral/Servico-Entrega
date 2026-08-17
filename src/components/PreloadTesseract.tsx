// components/PreloadTesseract.tsx
"use client";

import { useEffect } from 'react';
import { createWorker } from "tesseract.js";

export function PreloadTesseract() {
  useEffect(() => {
    // Verifica se já foi carregado nesta sessão
    if (typeof window !== 'undefined' && window.__TESSERACT_PRELOADED) {
      return;
    }

    // Pré-carrega o Tesseract.js em background quando o usuário interagir
    const preload = async () => {
      try {
        console.log("📥 Pré-carregando Tesseract.js...");
        const worker = await createWorker("por", 1);
        await worker.terminate();
        
        if (typeof window !== 'undefined') {
          window.__TESSERACT_PRELOADED = true;
        }
        
        console.log("✅ Tesseract.js pré-carregado com sucesso");
      } catch (error) {
        console.warn("⚠️ Falha ao pré-carregar Tesseract:", error);
      }
    };

    // Carrega quando o usuário interagir pela primeira vez
    const handleInteraction = () => {
      preload();
      document.removeEventListener('click', handleInteraction);
      document.removeEventListener('touchstart', handleInteraction);
      document.removeEventListener('scroll', handleInteraction);
    };

    // Também carrega após um pequeno delay se não houver interação
    const timeoutId = setTimeout(() => {
      // Se já passou 3 segundos e não houve interação, carrega mesmo assim
      if (!window.__TESSERACT_PRELOADED) {
        preload();
      }
    }, 3000);

    document.addEventListener('click', handleInteraction);
    document.addEventListener('touchstart', handleInteraction);
    document.addEventListener('scroll', handleInteraction);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('click', handleInteraction);
      document.removeEventListener('touchstart', handleInteraction);
      document.removeEventListener('scroll', handleInteraction);
    };
  }, []);

  return null;
}

// Declaração para o window.__TESSERACT_PRELOADED
declare global {
  interface Window {
    __TESSERACT_PRELOADED?: boolean;
  }
}