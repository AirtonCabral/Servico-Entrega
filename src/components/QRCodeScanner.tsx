import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Html5QrcodeScanner, Html5Qrcode } from 'html5-qrcode';
import { useRouter } from 'next/navigation';
import type { NotaFiscalData } from '@/lib/types';
import { consultarNfe } from '@/app/api/DadosApiExterna/route';
import * as pdfjsLib from 'pdfjs-dist';
import Tesseract from 'tesseract.js';

const QRCodeScanner = () => {
  const router = useRouter();
  // Estados do React
  const [scanResult, setScanResult] = useState<string | null>(null); // Guarda o número lido
  const [loadingData, setLoadingData] = useState(false); // Controle de carregamento
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [processingPdf, setProcessingPdf] = useState(false);
  const [pdfProgress, setPdfProgress] = useState<string>('');
  const [pdfWorkerReady, setPdfWorkerReady] = useState(false);
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Configure PDF.js worker on mount
  useEffect(() => {
  if (typeof window !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url
    ).toString();
    console.log('[PDF.js] Worker configurado (local):', pdfjsLib.GlobalWorkerOptions.workerSrc);
    setPdfWorkerReady(true);
  }
}, []);

  // Função chamada quando a câmera/foto lê algo com sucesso
  const onScanSuccess = useCallback(async (decodedText: string, decodedResult?: any) => {

    console.log("SCANNER REF")
    // 1. Para de escanear depois que achar o primeiro código
    if (scannerRef.current) {
      scannerRef.current.clear();
    }
    
    // 2. Exibe o número lido na tela imediatamente
    setScanResult(decodedText);
    setLoadingData(true);
    setErrorMsg(null);

    // 3. Chama a API DadosApiExterna com a chave de acesso
    console.log("Chave lida:", decodedText);
    console.log(`[CHAVE DE ACESSO] ${decodedText}`); // Chave de acesso em destaque
    console.log("QRCodeScanner - Consultando NFE...");

    try {
      const response = await consultarNfe(decodedText);
      const apiData = await response;
      
      // Salvar os dados no sessionStorage para uso na página de validação
      sessionStorage.setItem('nfe:data', JSON.stringify({
        tipo: 'nfe',
        data: apiData,
        image: '', // Sem imagem pois veio do QR code
        extractedAt: Date.now()
      }));

      setLoadingData(false);
      
      // Redirecionar para a página de validação
      router.push('/validacao');
      
    } catch (err) {
      setLoadingData(false);
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao buscar dados da API');
    }

  }, [router]);

  // Função para lidar com erros
  const onScanFailure = useCallback((error: any) => {
    // Ignoramos erros constantes de leitura para não poluir
    console.log('Erro no callback')
  }, []);

  // Função para extrair chave de acesso usando OCR (fallback)
  const extractAccessKeyFromPdf = async (pdfFile: File): Promise<string | null> => {
    try {
      console.log(`[OCR Fallback] Attempting OCR extraction from PDF: ${pdfFile.name}`);
      setPdfProgress('Tentando extrair chave via OCR...');
      
      const arrayBuffer = await pdfFile.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      
      for (let i = 1; i <= pdf.numPages; i++) {
        console.log(`[OCR Fallback] Processing page ${i} for OCR extraction`);
        
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 2 });
        
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        
        await page.render({
          canvasContext: context!,
          canvas: canvas,
          viewport: viewport
        }).promise;
        
        // Use Tesseract.js to extract text
        const imageData = canvas.toDataURL('image/png');
        const result = await Tesseract.recognize(imageData, 'por', {
          logger: (m) => console.log(`[OCR] ${m.status}: ${Math.round(m.progress * 100)}%`)
        });
        
        console.log(`[OCR Fallback] Text extracted from page ${i}:`, result.data.text.substring(0, 200) + '...');
        
        // Look for 44-digit access key pattern (NF-e and CT-e keys are 44 digits)
        const accessKeyPattern = /\b\d{44}\b/;
        const match = result.data.text.match(accessKeyPattern);
        
        if (match) {
          console.log(`[OCR Fallback] Access key found: ${match[0]}`);
          console.log(`[CHAVE DE ACESSO] ${match[0]}`); // Chave de acesso em destaque
          return match[0];
        }
        
        // Also try to find keys near "Emitente" for DACTE/CT-e
        const emitentePattern = /emitente.*?(\d{44})/i;
        const emitenteMatch = result.data.text.match(emitentePattern);
        
        if (emitenteMatch) {
          console.log(`[OCR Fallback] Access key found near Emitente: ${emitenteMatch[1]}`);
          console.log(`[CHAVE DE ACESSO] ${emitenteMatch[1]}`); // Chave de acesso em destaque
          return emitenteMatch[1];
        }
      }
      
      console.log(`[OCR Fallback] No access key found in any page`);
      return null;
    } catch (error) {
      console.error('[OCR Fallback] Error during OCR extraction:', error);
      return null;
    }
  };

  // Função para processar PDF e extrair QR code
  const processPdfFile = async (pdfFile: File) => {
    if (!pdfWorkerReady) {
      setErrorMsg('Worker do PDF.js ainda não está pronto. Tente novamente em alguns segundos.');
      return;
    }

    setProcessingPdf(true);
    setErrorMsg(null);

    // Add timeout to prevent infinite processing
    const timeout = setTimeout(() => {
      setProcessingPdf(false);
      setPdfProgress('');
      setErrorMsg('Tempo limite excedido ao processar PDF. Tente um arquivo menor.');
    }, 60000); // 60 seconds timeout

    try {
      console.log(`[PDF Processing] Starting to process PDF: ${pdfFile.name}, size: ${pdfFile.size} bytes`);
      
      const arrayBuffer = await pdfFile.arrayBuffer();
      console.log(`[PDF Processing] ArrayBuffer created, size: ${arrayBuffer.byteLength} bytes`);
      
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      const pdf = await loadingTask.promise;
      console.log(`[PDF Processing] PDF loaded successfully, total pages: ${pdf.numPages}`);
      
      // Try different scales for better QR code detection
      const scales = [1.5, 2, 3];
      let foundQrCode = false;
      
      // Varre todas as páginas do PDF
      for (let i = 1; i <= pdf.numPages; i++) {
        if (foundQrCode) break;
        
        setPdfProgress(`Processando página ${i} de ${pdf.numPages}...`);
        console.log(`[PDF Processing] Processing page ${i} of ${pdf.numPages}`);
        
        for (const scale of scales) {
          if (foundQrCode) break;
          
          try {
            const page = await pdf.getPage(i);
            const viewport = page.getViewport({ scale: scale });
            console.log(`[PDF Processing] Page ${i} viewport at scale ${scale}: ${viewport.width}x${viewport.height}`);
            
            // Renderiza a página como canvas
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            
            console.log(`[PDF Processing] Rendering page ${i} to canvas at scale ${scale}...`);
            await page.render({
              canvasContext: context!,
              canvas: canvas,
              viewport: viewport
            }).promise;
            console.log(`[PDF Processing] Page ${i} rendered successfully at scale ${scale}`);
            
            // Tenta ler QR code da página renderizada
            const html5QrCode = new Html5Qrcode('reader');
            try {
              console.log(`[PDF Processing] Attempting to scan QR code from page ${i} at scale ${scale}...`);
              
              // Convert canvas to blob and then to file for html5-qrcode
              const blob = await new Promise<Blob>((resolve, reject) => {
                canvas.toBlob((blob) => {
                  if (blob) {
                    resolve(blob);
                  } else {
                    reject(new Error('Failed to create blob from canvas'));
                  }
                }, 'image/png');
              });
              
              console.log(`[PDF Processing] Blob created: ${blob.size} bytes`);
              
              const pageImageFile = new File([blob], `page-${i}-scale-${scale}.png`, { type: 'image/png' });
              console.log(`[PDF Processing] File created: ${pageImageFile.name}, ${pageImageFile.size} bytes`);
              
              const decodedText = await html5QrCode.scanFile(pageImageFile, true);
              console.log(`[PDF Processing] QR code found on page ${i} at scale ${scale}: ${decodedText}`);
              console.log(`[CHAVE DE ACESSO] ${decodedText}`); // Chave de acesso em destaque
              
              await html5QrCode.clear();
              foundQrCode = true;
              clearTimeout(timeout);
              
              // Se encontrou QR code, processa como sucesso
              setProcessingPdf(false);
              setPdfProgress('');
              debugger
              await onScanSuccess(decodedText);
              return;
            } catch (qrError) {
              console.log(`[PDF Processing] No QR code found on page ${i} at scale ${scale}:`, qrError);
              await html5QrCode.clear();
              // Continua para próxima escala se não encontrou QR code
            }
          } catch (pageError) {
            console.error(`[PDF Processing] Error processing page ${i} at scale ${scale}:`, pageError);
            // Continue to next scale even if one fails
          }
        }
      }
      
      // Se não encontrou QR code em nenhuma página com nenhuma escala, tente OCR
      if (!foundQrCode) {
        console.log(`[PDF Processing] No QR code found, trying OCR fallback`);
        setPdfProgress('QR code não encontrado, tentando OCR...');
        
        const accessKey = await extractAccessKeyFromPdf(pdfFile);
        
        if (accessKey) {
          console.log(`[PDF Processing] Access key extracted via OCR: ${accessKey}`);
          console.log(`[CHAVE DE ACESSO] ${accessKey}`); // Chave de acesso em destaque
          clearTimeout(timeout);
          setProcessingPdf(false);
          setPdfProgress('');
          await onScanSuccess(accessKey);
          return;
        }
        
        console.log(`[PDF Processing] No QR code found in any of ${pdf.numPages} pages with any scale and OCR failed`);
        clearTimeout(timeout);
        setProcessingPdf(false);
        setPdfProgress('');
        setErrorMsg('Nenhum QR code ou chave de acesso encontrado no PDF. Tente escanear uma imagem do QR code.');
      }
      
    } catch (error) {
      console.error('[PDF Processing] Fatal error processing PDF:', error);
      clearTimeout(timeout);
      setProcessingPdf(false);
      setPdfProgress('');
      setErrorMsg(error instanceof Error ? error.message : 'Erro ao processar PDF');
    }
  };

  // Função para lidar com upload de arquivo
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    console.log(`[File Upload] File selected: ${file.name}, type: ${file.type}, size: ${file.size} bytes`);

    if (file.type === 'application/pdf') {
      console.log(`[File Upload] Processing as PDF`);
      await processPdfFile(file);
    } else if (file.type.startsWith('image/')) {
      console.log(`[File Upload] Processing as image`);
      // Processa imagem usando o scanner
      const html5QrCode = new Html5Qrcode('reader');
      try {
        const decodedText = await html5QrCode.scanFile(file, true);
        console.log(`[File Upload] QR code found in image: ${decodedText}`);
        console.log(`[CHAVE DE ACESSO] ${decodedText}`); // Chave de acesso em destaque
        await html5QrCode.clear();
        await onScanSuccess(decodedText);
      } catch (error) {
        console.error(`[File Upload] Error scanning image:`, error);
        await html5QrCode.clear();
        setErrorMsg('Não foi possível ler QR code da imagem');
      }
    } else {
      console.error(`[File Upload] Unsupported file type: ${file.type}`);
      setErrorMsg('Formato de arquivo não suportado. Use PDF ou imagem.');
    }
  };

  // Função para ativar o scanner quando o usuário clicar
  const startScanner = useCallback(() => {
    setScanResult(null);
    setErrorMsg(null);

    const scanner = new Html5QrcodeScanner('reader',
      { fps: 10, qrbox: { width: 250, height: 250 } },
      false
    );
    
    scanner.render(onScanSuccess, onScanFailure);
    
    // Salva no ref para poder parar o scanner depois
    scannerRef.current = scanner;
  }, [onScanSuccess, onScanFailure]);

  return (
    <div style={styles.container}>
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        
        @media (max-width: 640px) {
          .mobile-button {
            width: 100% !important;
            margin-right: 0 !important;
            padding: 16px 20px !important;
            font-size: 16px !important;
            min-height: 48px !important;
            -webkit-tap-highlight-color: rgba(0, 122, 255, 0.1);
          }
          
          .mobile-controls {
            flex-direction: column !important;
            gap: 12px !important;
          }
          
          .mobile-reader {
            min-height: 200px !important;
          }
        }
      `}</style>
      <h2 style={styles.title}>📷 Leitor de QR Code / Código de Barras</h2>
      
      {!scanResult && (
        <div style={styles.controls}>
          <button 
            style={styles.button} 
            className="mobile-button"
            onClick={startScanner}
            onTouchStart={(e) => {
              e.preventDefault();
              startScanner();
            }}
          >
            📷 Abrir Câmera / Enviar Foto
          </button>
          <div style={styles.orSeparator}>ou</div>
          <button 
            style={processingPdf ? {...styles.button, ...styles.buttonDisabled} : styles.button} 
            className="mobile-button"
            onClick={() => fileInputRef.current?.click()}
            onTouchStart={(e) => {
              e.preventDefault();
              fileInputRef.current?.click();
            }}
            disabled={processingPdf}
          >
            {processingPdf ? `⏳ ${pdfProgress || 'Processando PDF...'}` : '📄 Enviar PDF'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,image/jpeg,image/png"
            style={{ display: 'none' }}
            onChange={handleFileUpload}
          />
          <div id="reader" style={styles.reader} className="mobile-reader"></div>
        </div>
      )}

      {/* Área onde os dados serão mostrados */}
      {scanResult && (
        <div style={styles.resultBox}>
          <h3>✅ Leitura concluída</h3>
          <p><strong>Chave de Acesso:</strong> <br/> {scanResult}</p>

          {loadingData ? (
            <div style={styles.loading}>
              <div style={styles.spinner}></div>
              🔍 Buscando dados da NF-e na API...
            </div>
          ) : errorMsg ? (
            <div style={styles.errorBox}>
              <h4 style={styles.errorTitle}>❌ Erro na consulta</h4>
              <p style={styles.errorMsg}>{errorMsg}</p>
              <button 
                style={styles.resetBtn} 
                className="mobile-button"
                onClick={() => {
                  setScanResult(null);
                  setErrorMsg(null);
                  setPdfProgress('');
                  if (scannerRef.current) scannerRef.current.clear();
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
                onTouchStart={(e) => {
                  e.preventDefault();
                  setScanResult(null);
                  setErrorMsg(null);
                  setPdfProgress('');
                  if (scannerRef.current) scannerRef.current.clear();
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
              >
                🔄 Tentar Novamente
              </button>
            </div>
          ) : (
            <div style={styles.dataBox}>
              <h4 style={styles.dataTitle}>📦 Dados carregados com sucesso!</h4>
              <p>Redirecionando para a página de validação...</p>
            </div>
          )}
        </div>
      )}

      {/* Mostrar progresso do processamento de PDF */}
      {processingPdf && (
        <div style={styles.resultBox}>
          <h3>📄 Processando PDF</h3>
          <div style={styles.loading}>
            <div style={styles.spinner}></div>
            <p>{pdfProgress || 'Carregando PDF...'}</p>
          </div>
        </div>
      )}
    </div>
  );
};

// Estilos CSS-in-JS para o componente
const styles: { [key: string]: React.CSSProperties } = {
  container: {
    fontFamily: 'Arial, sans-serif',
    maxWidth: '600px',
    margin: '0 auto',
    padding: '20px',
    textAlign: 'center',
  },
  title: {
    fontSize: 'clamp(18px, 5vw, 24px)',
    marginBottom: '20px',
    color: '#333',
  },
  controls: {
    margin: '20px 0',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '15px',
  },
  button: {
    padding: '14px 28px',
    fontSize: '16px',
    fontWeight: '600',
    backgroundColor: '#007bff',
    color: '#fff',
    border: 'none',
    borderRadius: '12px',
    cursor: 'pointer',
    marginRight: '10px',
    marginBottom: '10px',
    minWidth: '200px',
    transition: 'all 0.2s ease',
    boxShadow: '0 2px 8px rgba(0, 123, 255, 0.3)',
    userSelect: 'none',
    WebkitUserSelect: 'none',
    WebkitTouchCallout: 'none',
  },
  buttonDisabled: {
    opacity: 0.6,
    cursor: 'not-allowed',
  },
  orSeparator: {
    margin: '10px 0',
    fontSize: '16px',
    color: '#666',
    fontWeight: 'bold',
  },
  reader: {
    width: '100%',
    border: '2px dashed #ccc',
    borderRadius: '10px',
    marginTop: '15px',
    minHeight: '250px',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f9f9f9',
  },
  resultBox: {
    marginTop: '20px',
    padding: '20px',
    backgroundColor: '#e8f5e9',
    border: '1px solid #66bb6a',
    borderRadius: '10px',
    textAlign: 'left',
  },
  loading: {
    marginTop: '15px',
    color: '#555',
    fontWeight: 'bold',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '10px',
  },
  spinner: {
    width: '30px',
    height: '30px',
    border: '3px solid #f3f3f3',
    borderTop: '3px solid #007bff',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  dataBox: {
    marginTop: '15px',
    padding: '15px',
    backgroundColor: '#fff',
    borderRadius: '8px',
  },
  dataTitle: {
    marginTop: '0',
    color: '#2e7d32',
  },
  errorBox: {
    marginTop: '15px',
    padding: '15px',
    backgroundColor: '#ffebee',
    borderRadius: '8px',
    border: '1px solid #ef5350',
  },
  errorTitle: {
    marginTop: '0',
    color: '#c62828',
  },
  errorMsg: {
    color: '#d32f2f',
    margin: '10px 0',
  },
  resetBtn: {
    marginTop: '20px',
    padding: '12px 24px',
    backgroundColor: '#ff9800',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '16px',
    fontWeight: '600',
    minWidth: '200px',
    transition: 'all 0.2s ease',
    boxShadow: '0 2px 8px rgba(255, 152, 0, 0.3)',
    userSelect: 'none',
    WebkitUserSelect: 'none',
    WebkitTouchCallout: 'none',
  }
};

export default QRCodeScanner;