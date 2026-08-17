/**
 * Extrai dados estruturados de um DACTE/CT-e a partir do texto bruto de OCR.
 *
 * Diferente do DANFE, o layout do DACTE põe Remetente e Destinatário
 * LADO A LADO na mesma faixa horizontal — então o OCR (mesmo em modo
 * SINGLE_COLUMN) tende a juntar os dois numa única linha de texto, por
 * exemplo:
 *   "ENDEREÇO — RRERE34SL3O4 ENDEREÇO — CAMILO SILVERIO MENDES 84 0"
 * Por isso, em vez de tentar achar "o bloco do remetente" e "o bloco do
 * destinatário" separadamente, tratamos essas linhas como "2 valores por
 * linha, na ordem remetente → destinatário" e usamos regex com 2 grupos.
 *
 * Outro padrão comum aqui: o rótulo fica numa linha e os valores ficam
 * na linha SEGUINTE (tabelas de Produto/Peso/Volumes). Nesses casos,
 * localizamos a linha do rótulo e extraímos da linha seguinte.
 *
 * Uso:
 *   const dados = extrairDadosCTe(textoOCR);
 */
import type { CteData, PessoaCTe } from "./types";

const RE_CNPJ = /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/;
// Variante tolerante: o OCR às vezes troca "." por "," dentro do CNPJ
const RE_CNPJ_LOOSE = /\d{2}[.,]\d{3}[.,]\d{3}\/\d{4}-\d{2}/;
const RE_CPF = /\d{3}\.\d{3}\.\d{3}-\d{2}/;
const RE_CEP = /\d{5}-?\d{3}/;
const RE_DATA = /\d{2}\/\d{2}\/\d{4}/;
const RE_HORA = /\d{2}:\d{2}(?::\d{2})?/;
// Exige parênteses no DDD — sem isso o regex casava por engano dentro de
// sequências longas de dígitos (ex.: número de Inscrição Estadual).
const RE_FONE = /\(\d{2}\)\s?\d{4,5}-?\d{4}/;
// Valor monetário "de verdade" — exige separador decimal explícito (vírgula
// OU ponto, o Tesseract às vezes lê "0,00" como "0.00"). Preferimos deixar
// um campo vazio (cai no aviso "não detectado") a mostrar um número que
// pode estar errado porque o OCR comeu a vírgula decimal.
const RE_VALOR = /\d{1,3}(?:\.\d{3})*,\d{2}|\d+\.\d{2}/;

export function extrairDadosCTe(texto: string): CteData {
  const t = texto.replace(/\r/g, "").replace(/[ \t]+/g, " ");
  const linhas = t.split("\n").map((l) => l.trim()).filter(Boolean);

  const pick = (regex: RegExp, grupo = 1, alvo = t) => {
    const m = alvo.match(regex);
    return m ? m[grupo].trim() : "";
  };

  const idxLinha = (regex: RegExp, apartirDe = 0) => {
    for (let i = apartirDe; i < linhas.length; i++) {
      if (regex.test(linhas[i])) return i;
    }
    return -1;
  };

  // Recorta uma "janela" de linhas a partir de um índice, até achar uma das
  // regex de parada (ou um limite máximo de linhas, para não vazar demais).
  const janela = (inicio: number, paradas: RegExp[], maxLinhas = 8): string[] => {
    if (inicio === -1) return [];
    let fim = Math.min(linhas.length, inicio + maxLinhas);
    for (let i = inicio + 1; i < fim; i++) {
      if (paradas.some((r) => r.test(linhas[i]))) {
        fim = i;
        break;
      }
    }
    return linhas.slice(inicio, fim);
  };

  // Pega o(s) valor(es) decimal(is) presentes numa linha específica
  const valoresNaLinha = (regexAlvo: RegExp, ultimo = true): string => {
    const linha = linhas.find((l) => regexAlvo.test(l));
    if (!linha) return "";
    const valores = linha.match(new RegExp(RE_VALOR.source, "g"));
    if (!valores || !valores.length) return "";
    return ultimo ? valores[valores.length - 1] : valores[0];
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
  const idLinha = t.match(
    new RegExp(
      `\\b(\\d{2})\\s+(\\d)\\s+(\\d{6,})\\s+\\d+/\\d+\\s+(${RE_DATA.source})\\s+(${RE_HORA.source})`,
    ),
  );
  let modelo = idLinha ? idLinha[1] : pick(/MODELO\s*\n?\s*(\d{2})/i);
  let serie = idLinha ? idLinha[2] : pick(/S[ÉE]RIE\s*\n?\s*(\d+)/i);
  let numero = idLinha ? idLinha[3] : pick(/N[ÚU]MERO\s*\n?\s*(\d{6,})/i);
  const dataHoraEmissao = idLinha
    ? `${idLinha[4]} ${idLinha[5]}`
    : pick(new RegExp(`(${RE_DATA.source}\\s+${RE_HORA.source})`));

  // Fallback para o número: linha-resumo mais limpa perto do fim do documento
  // (RNTC/valor a receber/volumes/peso/valor da carga em sequência).
  if (!numero) {
    const resumo = linhas.find((l) =>
      new RegExp(
        `\\d{7,10}\\D{1,5}\\d{6,9}\\s+(?:${RE_VALOR.source})\\s+\\d{1,4}\\s+(?:${RE_VALOR.source})\\s+(?:${RE_VALOR.source})`,
      ).test(l),
    );
    if (resumo) {
      const m = resumo.match(/(\d{7,10})/);
      if (m) numero = m[1].length > 9 ? m[1].slice(-9) : m[1];
    }
  }

  // ---------- Protocolo de autorização: nº(13-15) + data + hora ----------
  const protocoloMatch = t.match(
    new RegExp(`(\\d{13,15})\\s+(${RE_DATA.source})\\s+(${RE_HORA.source})`),
  );
  const protocoloAutorizacao = protocoloMatch
    ? `${protocoloMatch[1]} ${protocoloMatch[2]} ${protocoloMatch[3]}`
    : "";

  const tipoCte = pick(/TIPO DO CT-?E\s*\n?\s*([A-ZÀ-Ú]+)/i);
  const tipoServico = pick(/TIPO DO SERVI[ÇC]O\s*\n?\s*([A-ZÀ-Ú]+)/i);

  // Natureza da prestação: para na primeira palavra minúscula/número (evita
  // engolir o cClass e o protocolo que ficam colados na mesma linha do OCR)
  const cfopMatch = t.match(/(\d{4})\s*-\s*(PRESTA[ÇC][ÃA]O[A-ZÀ-Ú ]+)/);
  const cfop = cfopMatch ? cfopMatch[1] : "";
  const naturezaPrestacao = cfopMatch ? cfopMatch[2].trim() : "";

  // ---------- Origem / Destino da prestação (com UF) ----------
  // Rótulo numa linha, valores "CIDADE / UF" na linha seguinte
  const idxOrigDest = idxLinha(/ORIGEM DA PRESTA[ÇC][ÃA]O/i);
  let origemPrestacao = "";
  let destinoPrestacao = "";
  let ufRemetente = "";
  let ufDestinatario = "";
  if (idxOrigDest !== -1 && linhas[idxOrigDest + 1]) {
    const cidadesUf = [
      ...linhas[idxOrigDest + 1].matchAll(/([A-ZÀ-Ú][A-ZÀ-Ú ]*\/\s*[A-Z]{2})/g),
    ];
    if (cidadesUf[0]) {
      origemPrestacao = cidadesUf[0][1].trim();
      ufRemetente = pick(/\/\s*([A-Z]{2})/, 1, origemPrestacao);
    }
    if (cidadesUf[1]) {
      destinoPrestacao = cidadesUf[1][1].trim();
      ufDestinatario = pick(/\/\s*([A-Z]{2})/, 1, destinoPrestacao);
    }
  }

  // ---------- Remetente / Destinatário (lado a lado na mesma linha) ----------
  const idxRemDest = idxLinha(/^REMETENTE\b/i);
  const janelaRD = janela(idxRemDest, [/^EXPEDIDOR/i], 8);

  let remNome = "",
    destNome = "",
    remEndereco = "",
    destEndereco = "",
    remMunicipio = "",
    destMunicipio = "",
    remCep = "",
    destCep = "",
    remCnpj = "",
    destCnpj = "",
    remIe = "",
    destIe = "",
    remTelefone = "",
    destTelefone = "";

  if (janelaRD.length) {
    const linhaNomes = janelaRD[0]; // "REMETENTE ... DESTINATÁRIO ..."
    const mNomes = linhaNomes.match(
      /REMETENTE\s*[—\-:]*\s*(.+?)\s+DESTINAT[ÁA]RIO\s*[—\-:]*\s*(.+)$/i,
    );
    if (mNomes) {
      remNome = mNomes[1].trim();
      destNome = mNomes[2].trim();
    }

    const linhaEnd = janelaRD.find(
      (l) => (l.match(/ENDERE[ÇC]O/gi) || []).length >= 2,
    );
    if (linhaEnd) {
      const mEnd = linhaEnd.match(
        /ENDERE[ÇC]O\s*[—\-:]*\s*(.+?)\s+ENDERE[ÇC]O\s*[—\-:]*\s*(.+)$/i,
      );
      if (mEnd) {
        remEndereco = mEnd[1].trim();
        destEndereco = mEnd[2].trim();
      }
    }

    const linhaMunCep = janelaRD.find(
      (l) => (l.match(/CEP/gi) || []).length >= 2,
    );
    if (linhaMunCep) {
      const mMunCep = linhaMunCep.match(
        /MUNIC[ÍI]PIO\s*[—\-:]*\s*(.+?)\s*CEP\s*[—\-:]*\s*(\d{5}-?\d{3}).*?MUNIC[ÍI]PIO\s*[—\-:]*\s*(.+?)\s*CEP\s*[—\-:]*\s*(\d{5}-?\d{3})/i,
      );
      if (mMunCep) {
        remMunicipio = mMunCep[1].trim();
        remCep = mMunCep[2];
        destMunicipio = mMunCep[3].trim();
        destCep = mMunCep[4];
      }
    }

    const textoJanela = janelaRD.join("\n");
    const cnpjsRD = [
      ...textoJanela.matchAll(new RegExp(`${RE_CNPJ_LOOSE.source}|${RE_CPF.source}`, "g")),
    ];
    // Normaliza eventual vírgula (erro de OCR) para ponto no CNPJ
    if (cnpjsRD[0]) remCnpj = cnpjsRD[0][0].replace(",", ".");
    if (cnpjsRD[1]) destCnpj = cnpjsRD[1][0].replace(",", ".");

    const iesRD = [
      ...textoJanela.matchAll(/INSCRI[ÇC][ÃA]O ESTADUAL\s*[—\-:]*\s*(\d{6,15})/gi),
    ];
    if (iesRD[0]) remIe = iesRD[0][1];
    if (iesRD[1]) destIe = iesRD[1][1];

    const fonesRD = [...textoJanela.matchAll(new RegExp(RE_FONE.source, "g"))];
    if (fonesRD[0]) remTelefone = fonesRD[0][0];
    if (fonesRD[1]) destTelefone = fonesRD[1][0];
  }

  const remetente: PessoaCTe = {
    nome: remNome,
    cnpjCpf: remCnpj,
    inscricaoEstadual: remIe,
    endereco: remEndereco,
    municipio: remMunicipio,
    cep: remCep,
    uf: ufRemetente,
    telefone: remTelefone,
  };

  const destinatario: PessoaCTe = {
    nome: destNome,
    cnpjCpf: destCnpj,
    inscricaoEstadual: destIe,
    endereco: destEndereco,
    municipio: destMunicipio,
    cep: destCep,
    uf: ufDestinatario,
    telefone: destTelefone,
  };

  // ---------- Tomador do serviço (bloco de coluna única) ----------
  const idxTomador = idxLinha(/TOMADOR DO SERVI[ÇC]O/i);
  const janelaTomador = janela(idxTomador, [/PRODUTO PREDOMINANTE/i], 5);

  let tomNome = "",
    tomEndereco = "",
    tomMunicipio = "",
    tomUf = "",
    tomCnpj = "",
    tomIe = "",
    tomTelefone = "";

  if (janelaTomador.length) {
    const linha0 = janelaTomador[0];
    const mNome = linha0.match(
      /TOMADOR DO SERVI[ÇC]O\s*[,.:]*\s*(.+?)\s*,?\s*MUNIC[ÍI]PIO/i,
    );
    if (mNome) tomNome = mNome[1].trim();

    const mMunUf = linha0.match(/MUNIC[ÍI]PIO\s*[—\-:]*\s*(.+?)\s*UF\s*([A-Z]{2})/i);
    if (mMunUf) {
      tomMunicipio = mMunUf[1].trim();
      tomUf = mMunUf[2];
    }

    const linha1 = janelaTomador[1] || "";
    const mEnd = linha1.match(/ENDERE[ÇC]O\s*[—\-:]*\s*(.+?)\s*PA[ÍI]S/i);
    if (mEnd) tomEndereco = mEnd[1].trim();

    const textoTomador = janelaTomador.join("\n");
    const mCnpj = textoTomador.match(
      new RegExp(`${RE_CNPJ_LOOSE.source}|${RE_CPF.source}`),
    );
    if (mCnpj) tomCnpj = mCnpj[0].replace(",", ".");

    const mIe = textoTomador.match(/INSCRI[ÇC][ÃA]O ESTADUAL\s*[—\-:]*\s*(\d{6,15})/i);
    if (mIe) tomIe = mIe[1];

    const mFone = textoTomador.match(new RegExp(RE_FONE.source));
    if (mFone) tomTelefone = mFone[0];
  }

  const tomador: PessoaCTe = {
    nome: tomNome,
    cnpjCpf: tomCnpj,
    inscricaoEstadual: tomIe,
    endereco: tomEndereco,
    municipio: tomMunicipio,
    cep: "",
    uf: tomUf,
    telefone: tomTelefone,
  };

  // ---------- Carga: rótulo numa linha, valores na linha seguinte ----------
  const idxCarga = idxLinha(/PRODUTO PREDOMINANTE/i);
  let produtoPredominante = "";
  let outrasCaracteristicasCarga = "";
  let valorTotalCarga = "";
  if (idxCarga !== -1 && linhas[idxCarga + 1]) {
    const m = linhas[idxCarga + 1].match(
      new RegExp(`([A-ZÀ-Ú]+)\\s+([A-ZÀ-Ú]+)\\s+(${RE_VALOR.source})`),
    );
    if (m) {
      produtoPredominante = m[1];
      outrasCaracteristicasCarga = m[2];
      valorTotalCarga = m[3];
    }
  }

  // ---------- Peso / Volumes: mesma lógica (rótulo numa linha, valores na seguinte) ----------
  const idxPeso = idxLinha(/PESO BRUTO/i);
  let pesoBruto = "",
    pesoBaseCalculo = "",
    pesoAferido = "",
    cubagem = "",
    volumes = "";
  if (idxPeso !== -1 && linhas[idxPeso + 1]) {
    const valoresPeso =
      linhas[idxPeso + 1].match(new RegExp(`${RE_VALOR.source}|\\d+`, "g")) || [];
    if (valoresPeso.length >= 3) {
      pesoBruto = valoresPeso[0] ?? "";
      pesoBaseCalculo = valoresPeso[1] ?? "";
      volumes = valoresPeso[valoresPeso.length - 1] ?? "";
      if (valoresPeso.length >= 5) {
        pesoAferido = valoresPeso[2] ?? "";
        cubagem = valoresPeso[3] ?? "";
      }
    }
  }
  if (!valorTotalCarga) {
    valorTotalCarga = valoresNaLinha(/VALOR TOTAL DA CARGA/i);
  }

  // ---------- Componentes do valor da prestação ----------
  // Normaliza "0.00" (o Tesseract às vezes lê o separador decimal como
  // ponto em vez de vírgula) para o padrão BR "0,00"
  const normalizarDecimal = (valor: string) =>
    /^\d+\.\d{2}$/.test(valor) ? valor.replace(".", ",") : valor;

  const v = (label: RegExp) =>
    normalizarDecimal(
      pick(new RegExp(`${label.source}\\s*\\n?\\s*(${RE_VALOR.source})`, "i")),
    );

  const componentesValor = {
    freteBaseCalculo: v(/FRETE PESO/i),
    freteValor: v(/FRETE VALOR/i),
    pedagio: v(/PED[ÁA]GIO/i),
    outras: v(/\bOUTRAS\b/i),
    suframa: v(/SUFRAMA/i),
    despacho: v(/DESPACHO/i),
    gris: v(/\bGRIS?\b/i),
    libSefaz: v(/LIB\.?\s*SEFAZ/i),
    secCat: v(/SEC\s*\/?\s*CAT/i),
    plusService: v(/PLUS\s*SERVICE/i),
    dce: v(/\bDCE\b/i),
    txNordeste: v(/TX\.?\s*NORDESTE/i),
  };

  // Valor total do serviço e valor a receber costumam vir "pendurados" no
  // fim das linhas da tabela de componentes, não logo após o rótulo.
  const valorTotalServico =
    valoresNaLinha(/SEC\s*\/?\s*CAT/i) || v(/VALOR TOTAL DO SERVI[ÇC]O/i);
  const valorAReceber = valoresNaLinha(/\bDCE\b/i) || v(/VALOR A RECEBER/i);

  // ---------- Impostos ----------
  const idxImposto = idxLinha(/SITUA[ÇC][ÃA]O TRIBUT[ÁA]RIA/i);
  let situacaoTributaria = "";
  let baseCalculoICMS = "";
  let aliqICMS = "";
  let valorICMS = "";
  if (idxImposto !== -1 && linhas[idxImposto + 1]) {
    const linhaValores = linhas[idxImposto + 1];
    const m = linhaValores.match(
      /(\d{2})\s*[-\s]*[I1]CMS\s*([A-ZÀ-Ú]*)\.?\s*([\d.,]+)\s*(\d+%)\s*([\d.,:]+)/i,
    );
    if (m) {
      situacaoTributaria = `${m[1]} - ICMS ${m[2]}`.trim();
      // só aceita como valor se tiver separador decimal reconhecível;
      // senão o OCR provavelmente comeu a vírgula e o número está errado
      const baseCandidata = m[3];
      const valorCandidato = m[5].replace(/[^\d.,]/g, "");
      baseCalculoICMS = RE_VALOR.test(baseCandidata) ? baseCandidata : "";
      aliqICMS = m[4];
      valorICMS = RE_VALOR.test(valorCandidato) ? valorCandidato : "";
    }
  }
  const percReducaoBaseCalculo = pick(
    new RegExp(`%\\s*RED\\.?\\s*BASE CALC\\.?\\s*\\n?\\s*(${RE_VALOR.source})`, "i"),
  );

  // ---------- Endereço de entrega (nas observações), corta no CEP para não pegar lixo do OCR ----------
  const enderecoEntrega =
    pick(/ENDERE[ÇC]O ENTREGA:?\s*(.+?CEP\s*-?\s*\d{5}-?\d{3})/i) ||
    pick(/ENDERE[ÇC]O ENTREGA:?\s*([^*\n]+)/i);

  const dados: CteData = {
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