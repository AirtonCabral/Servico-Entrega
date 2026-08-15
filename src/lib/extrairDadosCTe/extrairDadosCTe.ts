/**
 * Extrai dados estruturados de um DACTE/CT-e a partir do texto bruto
 * (geralmente vindo de OCR sobre a imagem/PDF do documento).
 *
 * Segue o mesmo estilo de "ancoragem por formato" usado em extrairDadosDANFE.ts:
 * já que o OCR embaralha a posição relativa entre rótulo e valor em layouts
 * de tabela, preferimos casar por formato (CNPJ, CEP, data...) ou por rótulo
 * textual em vez de depender de posição fixa.
 *
 * Uso:
 *   const dados = extrairDadosCTe(textoOCR);
 */
import type { CteData, PessoaCTe } from "@/lib/types";

const RE_CNPJ = /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/;
const RE_CPF = /\d{3}\.\d{3}\.\d{3}-\d{2}/;
const RE_CEP = /\d{5}-?\d{3}/;
const RE_DATA = /\d{2}\/\d{2}\/\d{4}/;
const RE_HORA = /\d{2}:\d{2}(?::\d{2})?/;
const RE_FONE = /\(?\d{2}\)?\s?\d{4,5}-?\d{4}/;
const RE_VALOR = /[\d.]*\d,\d{2}/;

export function extrairDadosCTe(texto: string): CteData {
  const t = texto.replace(/\r/g, "").replace(/[ \t]+/g, " ");
  const linhas = t.split("\n").map((l) => l.trim()).filter(Boolean);

  const pick = (regex: RegExp, grupo = 1, alvo = t) => {
    const m = alvo.match(regex);
    return m ? m[grupo].trim() : "";
  };

  // Valor logo após um rótulo — na mesma linha (resto da linha) ou na linha seguinte
  const apos = (labelRegex: RegExp) => {
    const idx = linhas.findIndex((l) => labelRegex.test(l));
    if (idx === -1) return "";
    const resto = linhas[idx].replace(labelRegex, "").trim();
    if (resto) return resto;
    return linhas[idx + 1] ? linhas[idx + 1].trim() : "";
  };

  // ---------- Chave de acesso: 11 grupos de 4 dígitos, separados por espaço OU ponto ----------
  let chaveRaw = pick(
    /\b(\d{4}[.\s]\d{4}[.\s]\d{4}[.\s]\d{4}[.\s]\d{4}[.\s]\d{4}[.\s]\d{4}[.\s]\d{4}[.\s]\d{4}[.\s]\d{4}[.\s]\d{4})\b/,
  );
  if (!chaveRaw) chaveRaw = pick(/\b(\d{44})\b/);
  const chaveAcesso = chaveRaw
    ? chaveRaw.replace(/\D/g, "").replace(/(\d{4})(?=\d)/g, "$1 ").trim()
    : "";

  // ---------- Modelo / Série / Número / Data-Hora de emissão ----------
  // Ex.: "57 0 003771108 1/1 30/07/2026 19:00"
  const idLinha = t.match(
    new RegExp(
      `\\b(\\d{2})\\s+(\\d)\\s+(\\d{6,})\\s+\\d+/\\d+\\s+(${RE_DATA.source})\\s+(${RE_HORA.source})`,
    ),
  );
  const modelo = idLinha ? idLinha[1] : pick(/MODELO\s*\n?\s*(\d{2})/i);
  const serie = idLinha ? idLinha[2] : pick(/S[ÉE]RIE\s*\n?\s*(\d+)/i);
  const numero = idLinha ? idLinha[3] : pick(/N[ÚU]MERO\s*\n?\s*(\d{6,})/i);
  const dataHoraEmissao = idLinha
    ? `${idLinha[4]} ${idLinha[5]}`
    : pick(new RegExp(`(${RE_DATA.source}\\s+${RE_HORA.source})`));

  // ---------- Protocolo de autorização: nº(13-15) + data + hora ----------
  const protocoloMatch = t.match(
    new RegExp(`(\\d{13,15})\\s+(${RE_DATA.source})\\s+(${RE_HORA.source})`),
  );
  const protocoloAutorizacao = protocoloMatch
    ? `${protocoloMatch[1]} ${protocoloMatch[2]} ${protocoloMatch[3]}`
    : "";

  const tipoCte = pick(/TIPO DO CT-?E\s*\n?\s*([A-ZÀ-Ú]+)/i);
  const tipoServico = pick(/TIPO DO SERVI[ÇC]O\s*\n?\s*([A-ZÀ-Ú]+)/i);

  const cfopMatch = t.match(/(\d{4})\s*-\s*(PRESTA[ÇC][ÃA]O[^\n]+)/i);
  const cfop = cfopMatch ? cfopMatch[1] : "";
  const naturezaPrestacao = cfopMatch ? cfopMatch[2].trim() : "";

  const origemPrestacao = apos(/ORIGEM DA PRESTA[ÇC][ÃA]O/i);
  const destinoPrestacao = apos(/DESTINO DA PRESTA[ÇC][ÃA]O/i);

  // ---------- Blocos de pessoa (Remetente / Destinatário / Tomador) ----------
  const extrairBloco = (inicioRegex: RegExp, fimRegexes: RegExp[]) => {
    const idxInicio = linhas.findIndex((l) => inicioRegex.test(l));
    if (idxInicio === -1) return "";
    let idxFim = linhas.length;
    for (let i = idxInicio + 1; i < linhas.length; i++) {
      if (fimRegexes.some((r) => r.test(linhas[i]))) {
        idxFim = i;
        break;
      }
    }
    return linhas.slice(idxInicio, idxFim).join("\n");
  };

  const extrairPessoa = (bloco: string): PessoaCTe => {
    const p = (regex: RegExp) => {
      const m = bloco.match(regex);
      return m ? m[1].trim() : "";
    };
    const linhasBloco = bloco.split("\n").map((l) => l.trim()).filter(Boolean);
    let nome = "";
    for (let i = 1; i < linhasBloco.length; i++) {
      if (!/^(ENDERE[ÇC]O|MUNIC[ÍI]PIO|CNPJ|PA[ÍI]S|DDD)/i.test(linhasBloco[i])) {
        nome = linhasBloco[i];
        break;
      }
    }
    return {
      nome,
      cnpjCpf: p(new RegExp(`(${RE_CNPJ.source}|${RE_CPF.source})`)),
      inscricaoEstadual: p(/INSCRI[ÇC][ÃA]O ESTADUAL\s*\n?\s*([\dA-Z]+)/i),
      endereco: p(
        /ENDERE[ÇC]O\s*\n?\s*([^\n]+?)(?:\s+CEP|\s+MUNIC[ÍI]PIO|$)/i,
      ),
      bairro: p(/BAIRRO\s*\n?\s*([^\n]+?)(?:\s+CEP|\s+MUNIC[ÍI]PIO|\s+ENDERE[ÇC]O|$)/i),
      municipio: p(
        /MUNIC[ÍI]PIO\s*\n?\s*([A-ZÀ-Ú ]+?)(?:\s+CEP|\s*\n|$)/i,
      ),
      cep: p(new RegExp(`CEP\\s*(${RE_CEP.source})`, "i")),
      uf: p(/\bUF\s*\n?\s*([A-Z]{2})\b/i) || p(/\b([A-Z]{2})\s*CEP\d/i),
      telefone: p(
        new RegExp(`DDD\\/TELEFONE\\s*\\n?\\s*(${RE_FONE.source})`, "i"),
      ),
    };
  };

  const blocoRemetente = extrairBloco(/^REMETENTE/i, [
    /^DESTINAT[ÁA]RIO/i,
    /^EXPEDIDOR/i,
  ]);
  const blocoDestinatario = extrairBloco(/^DESTINAT[ÁA]RIO/i, [
    /^EXPEDIDOR/i,
    /^RECEBEDOR/i,
  ]);
  const blocoTomador = extrairBloco(/TOMADOR DO SERVI[ÇC]O/i, [
    /OUTRAS CARACTER[ÍI]STICAS/i,
    /PRODUTO PREDOMINANTE/i,
    /COMPONENTES DO VALOR/i,
  ]);

  const remetente = extrairPessoa(blocoRemetente);
  const destinatario = extrairPessoa(blocoDestinatario);
  const tomador = extrairPessoa(blocoTomador);

  // ---------- Carga ----------
  const produtoPredominante = pick(/PRODUTO PREDOMINANTE\s*\n?\s*([A-ZÀ-Ú ]+)/i);
  const outrasCaracteristicasCarga = pick(
    /OUTRAS CARACTER[ÍI]STICAS DA CARGA\s*\n?\s*([A-ZÀ-Ú ]+)/i,
  );
  const pesoBruto = pick(new RegExp(`PESO BRUTO\\s*\\(Kg\\)\\s*\\n?\\s*(${RE_VALOR.source})`, "i"));
  const pesoBaseCalculo = pick(
    new RegExp(`PESO BASE CALC\\.?\\s*\\(Kg\\)\\s*\\n?\\s*(${RE_VALOR.source})`, "i"),
  );
  const pesoAferido = pick(
    new RegExp(`PESO AFERIDO\\s*\\(Kg\\)\\s*\\n?\\s*(${RE_VALOR.source})`, "i"),
  );
  const cubagem = pick(new RegExp(`CUBAGEM\\s*\\(Kg\\)\\s*\\n?\\s*(${RE_VALOR.source})`, "i"));
  const volumes = pick(/VOLUMES\s*\(UN\)\s*\n?\s*(\d+)/i);
  const valorTotalCarga = pick(
    new RegExp(`VALOR TOTAL DA CARGA\\s*\\n?\\s*(${RE_VALOR.source})`, "i"),
  );

  // ---------- Componentes do valor da prestação ----------
  const v = (label: RegExp) =>
    pick(new RegExp(`${label.source}\\s*\\n?\\s*(${RE_VALOR.source})`, "i"));

  const componentesValor = {
    freteBaseCalculo: v(/FRETE PESO/i),
    freteValor: v(/FRETE VALOR/i),
    pedagio: v(/PED[ÁA]GIO/i),
    outras: v(/\bOUTRAS\b/i),
    suframa: v(/SUFRAMA/i),
    despacho: v(/DESPACHO/i),
    gris: v(/\bGRIS\b/i),
    libSefaz: v(/LIB\.?\s*SEFAZ/i),
    secCat: v(/SEC\/CAT/i),
    plusService: v(/PLUS SERVICE/i),
    dce: v(/\bDCE\b/i),
    txNordeste: v(/TX\.?\s*NORDESTE/i),
  };

  const valorTotalServico = v(/VALOR TOTAL DO SERVI[ÇC]O/i);
  const valorAReceber = v(/VALOR A RECEBER/i);

  // ---------- Impostos ----------
  const situacaoTributaria = pick(
    /SITUA[ÇC][ÃA]O TRIBUT[ÁA]RIA\s*\n?\s*([\dA-ZÀ-Ú\- ]+)/i,
  );
  const baseCalculoICMS = v(/BASE DE C[ÁA]LCULO/i);
  const aliqICMS = pick(/AL[ÍI]Q\.?\s*ICMS\s*\n?\s*([\d.,]+%?)/i);
  const valorICMS = v(/VALOR ICMS/i);
  const percReducaoBaseCalculo = pick(
    new RegExp(`%\\s*RED\\.?\\s*BASE CALC\\.?\\s*\\n?\\s*(${RE_VALOR.source})`, "i"),
  );

  // ---------- Endereço de entrega (nas observações) ----------
  const enderecoEntrega = pick(/ENDERE[ÇC]O ENTREGA:?\s*([^*\n]+)/i);

  const dados: CteData = {
    nome: "",
    modelo,
    serie,
    numero,
    dataHoraEmissao,
    chaveAcesso,
    protocoloAutorizacao,
    tipoCte,
    tipoServico,
    cfop,
    naturezaPrestacao,
    origemPrestacao,
    destinoPrestacao,
    remetente,
    destinatario,
    tomador,
    produtoPredominante,
    outrasCaracteristicasCarga,
    pesoBruto,
    pesoBaseCalculo,
    pesoAferido,
    cubagem,
    volumes,
    valorTotalCarga,
    componentesValor,
    valorTotalServico,
    valorAReceber,
    situacaoTributaria,
    baseCalculoICMS,
    aliqICMS,
    valorICMS,
    percReducaoBaseCalculo,
    enderecoEntrega,
  };

  return dados;
}
