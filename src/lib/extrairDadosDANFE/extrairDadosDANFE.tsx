/**
 * Extrai dados estruturados de uma DANFE/NF-e a partir do texto bruto
 * (geralmente vindo de OCR sobre a imagem/PDF da nota).
 *
 * Uso:
 *   const dados = extrairDadosDANFE(textoOCR);
 *   console.log(dados);
 */
 
// Padrões de formato reutilizados para "ancorar" valores independente
// de onde o rótulo caiu no texto (o OCR real costuma embaralhar a posição
// relativa entre rótulo e valor em layouts de tabela/múltiplas colunas).
const RE_CNPJ = /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/;
const RE_CPF = /\d{3}\.\d{3}\.\d{3}-\d{2}/;
const RE_CEP = /\d{5}-?\d{3}/;
const RE_DATA = /\d{2}\/\d{2}\/\d{4}/;
const RE_HORA = /\d{2}:\d{2}:\d{2}/;
const RE_FONE = /\(?\d{2}\)?\s?\d{4,5}-?\d{4}/;
const RE_UF = /\b[A-Z]{2}\b/; // sem grupo de captura próprio (evita desalinhar grupos ao compor)
 
export function extrairDadosDANFE(texto: string) {
  debugger
  // Normaliza espaços múltiplos e quebras de linha para facilitar os regex
  const t = texto.replace(/\r/g, "").replace(/[ \t]+/g, " ");
  const linhas = t.split("\n").map((l) => l.trim()).filter(Boolean);
 
  const pick = (regex: RegExp, grupo = 1, alvo = t) => {
    const m = alvo.match(regex);
    return m ? m[grupo].trim() : "";
  };
 
  // Acha a primeira linha que casa com um regex (a partir de um índice opcional)
  const linhaComMatch = (regex: RegExp, apartirDe = 0) => {
    for (let i = apartirDe; i < linhas.length; i++) {
      const m = linhas[i].match(regex);
      if (m) return { linha: linhas[i], match: m, indice: i };
    }
    return null;
  };
 
  // ---------- Chave de acesso: 11 grupos de 4 dígitos (44 dígitos) ----------
  let chaveAcesso = pick(
    /\b(\d{4}\s\d{4}\s\d{4}\s\d{4}\s\d{4}\s\d{4}\s\d{4}\s\d{4}\s\d{4}\s\d{4}\s\d{4})\b/
  );
  if (!chaveAcesso) {
    // fallback: uma sequência solta de 44 dígitos
    const solta = pick(/\b(\d{44})\b/);
    chaveAcesso = solta ? solta.replace(/(\d{4})(?=\d)/g, "$1 ").trim() : "";
  }
 
  // ---------- Protocolo de autorização: nº(15) + data + hora, geralmente na mesma linha ----------
  const protocoloLinha = linhaComMatch(
    new RegExp(`(\\d{13,15})\\s+(${RE_DATA.source})\\s+(${RE_HORA.source})`)
  );
  const protocoloAutorizacao = protocoloLinha
    ? `${protocoloLinha.match[1]} ${protocoloLinha.match[2]} ${protocoloLinha.match[3]}`
    : "";
 
  // Natureza da operação: token(s) em maiúsculas logo antes do protocolo, na mesma linha
  const naturezaOperacao = protocoloLinha
    ? pick(
        new RegExp(`([A-ZÀ-Ú]+(?:\\s[A-ZÀ-Ú]+)?)\\s+${protocoloLinha.match[1]}`),
        1,
        protocoloLinha.linha
      )
    : pick(/NATUREZA DE OPERA[ÇC][ÃA]O\s*\n?\s*([A-ZÀ-Ú ]+)/i);
 
  // ---------- CNPJ do emitente + Inscrição Estadual (mesma linha, IE antes do CNPJ) ----------
  const ieCnpjLinha = linhaComMatch(new RegExp(`(\\d{8,15})\\s+(${RE_CNPJ.source})`));
  const cnpjEmitente = ieCnpjLinha
    ? ieCnpjLinha.match[2]
    : pick(new RegExp(`(${RE_CNPJ.source})`));
  const inscricaoEstadualEmitente = ieCnpjLinha ? ieCnpjLinha.match[1] : "";
 
  // ---------- Linha do destinatário: NOME + CPF/CNPJ + DATA EMISSÃO ----------
  const destLinha = linhaComMatch(
    new RegExp(`^(.+?)\\s+(${RE_CPF.source}|${RE_CNPJ.source})\\s+(${RE_DATA.source})`)
  );
  const destNome = destLinha ? destLinha.match[1].trim() : "";
  const destCpfCnpj = destLinha ? destLinha.match[2] : "";
  const dataEmissao = destLinha
    ? destLinha.match[3]
    : pick(new RegExp(`(${RE_DATA.source})`));
 
  // ---------- Linha do endereço: ENDEREÇO + BAIRRO + CEP + DATA SAÍDA/ENTRADA ----------
  const endLinha = linhaComMatch(
    new RegExp(`^(.+?)\\s+(${RE_CEP.source})\\s+(${RE_DATA.source})`),
    destLinha ? destLinha.indice + 1 : 0
  );
  let destEndereco = "";
  let destBairro = "";
  let destCep = "";
  let dataSaidaEntrada = "";
  if (endLinha) {
    destCep = endLinha.match[2];
    dataSaidaEntrada = endLinha.match[3];
    // separa endereço x bairro: bairro = últimas 1-2 palavras antes do CEP
    const antesDoCep = endLinha.match[1].trim();
    const partes = antesDoCep.split(/\s+/);
    // heurística: endereço geralmente termina em número/complemento (dígitos);
    // bairro é a cauda em maiúsculas sem números
    let corte = partes.length;
    while (corte > 1 && /^[A-ZÀ-Ú]+$/.test(partes[corte - 1])) corte--;
    destBairro = partes.slice(corte).join(" ");
    destEndereco = partes.slice(0, corte).join(" ");
    if (!destBairro && partes.length > 1) {
      // fallback: última palavra como bairro
      destBairro = partes[partes.length - 1];
      destEndereco = partes.slice(0, -1).join(" ");
    }
  }
 
  // ---------- Linha do município: MUNICÍPIO + FONE + UF + HORA SAÍDA ----------
  const munLinha = linhaComMatch(
    new RegExp(`^(.+?)\\s+(${RE_FONE.source})\\s+([A-Z]{2})\\b\\s+(?:\\S*\\s+)?(${RE_HORA.source})`),
    endLinha ? endLinha.indice + 1 : 0
  );
  let destMunicipio = "";
  let destTelefone = "";
  let destUf = "";
  let horaSaida = "";
  if (munLinha) {
    destMunicipio = munLinha.match[1].trim();
    destTelefone = munLinha.match[2].trim();
    destUf = munLinha.match[3];
    horaSaida = munLinha.match[4];
  } else {
    horaSaida =
      pick(/HORA DA SA[ÍI]DA\s*\n?\s*(\d{2}:\d{2}:\d{2})/i) ||
      pick(/(\d{2}:\d{2}:\d{2})/);
    destTelefone = pick(/FONE\s*\/?\s*FAX\s*\n?\s*(\(?\d{2}\)?\s*\d{4,5}-?\d{4})/i);
    destMunicipio = pick(/MUNIC[ÍI]PIO\s*\n?\s*([A-ZÀ-Ú ]+)/i);
    destUf = pick(/\bUF\s*\n?\s*([A-Z]{2})\b/);
  }
 
  const dados = {
    numero: pick(/N[ºo°]\s*(\d{6,})/i),
    serie: pick(/S[ÉE]RIE\s*(\d+)/i),
    dataEmissao,
    dataSaidaEntrada,
    horaSaida,
    naturezaOperacao,
    chaveAcesso,
    protocoloAutorizacao,
    valorTotal: pick(/VALOR TOTAL:?\s*R\$\s*([\d.,]+)/i),
 
    emitente: {
      nome: (() => {
        // O nome do emitente costuma vir na linha seguinte ao rótulo
        // (a própria linha do rótulo pode vir suja com lixo do cabeçalho "DANFE").
        const rotulo = linhaComMatch(/IDENTIFICA[ÇC][ÃA]O\s+DO\s+EMITENTE/i);
        if (!rotulo) return "";
        for (let i = rotulo.indice + 1; i < linhas.length; i++) {
          const candidata = linhas[i].trim();
          // pula linhas vazias ou que sejam só ruído curto (ex: "D FE")
          if (candidata.length >= 5 && /[A-ZÀ-Ú]{3,}/.test(candidata)) {
            return candidata;
          }
        }
        return "";
      })(),
      cnpj: cnpjEmitente,
      inscricaoEstadual: inscricaoEstadualEmitente,
      endereco: pick(/((?:AV\.?|RUA)[^\n]+?)(?:\s+CEP:?\s*\d{5}-?\d{3}|\s+CHAVE DE ACESSO)/i),
      bairro: "", // este modelo não separa bairro do emitente no cabeçalho
      cep: pick(/CEP:?\s*(\d{5}-?\d{3})/i),
      // Busca município/UF em qualquer trecho no formato "CEP:xxxxx-xxx - CIDADE - UF"
      municipio: pick(/CEP:?\s*\d{5}-?\d{3}\s*-\s*([A-ZÀ-Ú ]+?)\s*-\s*[A-Z]{2}\b/i),
      uf: pick(/CEP:?\s*\d{5}-?\d{3}\s*-\s*[A-ZÀ-Ú ]+?\s*-\s*([A-Z]{2})\b/i),
      telefone: pick(/TEL:?\s*(\(?\d{2}\)?\s*\d{4,5}-?\d{4})/i),
    },
 
    destinatario: {
      nome: destNome || pick(/NOME \/ RAZ[ÃA]O SOCIAL\.?\s*\n?\s*([A-ZÀ-Ú ]+)/i),
      cpfCnpj: destCpfCnpj,
      endereco: destEndereco,
      bairro: destBairro,
      cep: destCep,
      municipio: destMunicipio,
      uf: destUf,
      telefone: destTelefone,
      inscricaoEstadual: pick(/DESTINAT[ÁA]RIO[\s\S]{0,400}?INSCRI[ÇC][ÃA]O ESTADUAL\s*\n?\s*([\d]+|ISENTO)/i),
    },
 
    produtos: extrairProdutos(t),
    valoresTotais: extrairValoresTotais(t),
  };
 
  return dados;
}
 
// ---------- Tabela de produtos ----------
// Formato típico de linha (DANFE modelo 1/1A):
// CODIGO DESCRICAO NCM CST CFOP UN QUANT VUNIT VTOTAL BC-ICMS V-ICMS V-IPI %ICMS %IPI
function extrairProdutos(t: string) {
  const produtos: { codigo: string; descricao: string; ncm: string; cst: string; cfop: string; unidade: string; quantidade: string; valorUnitario: string; valorTotal: string; }[] = [];
 
  // Isola o bloco entre o cabeçalho da tabela e "CALCULO DO IMPOSTO" / "DADOS ADICIONAIS"
  const blocoMatch = t.match(
    /C[ÓO]DIGO[\s\S]*?DESCRI[ÇC][ÃA]O[\s\S]*?VALOR[\s\S]*?\n([\s\S]*?)(?:C[ÁA]LCULO DO IMPOSTO|DADOS ADICIONAIS|VALOR TOTAL DA NOTA|$)/i
  );
  if (!blocoMatch) return produtos;
 
  const linhas = blocoMatch[1].split("\n").map((l) => l.trim()).filter(Boolean);
 
  const linhaRegex =
    /^(\S+)\s+(.+?)\s+(\d{8})\s+(\d{2,3}|[\d.]{3,9})\s+(\d{4})\s+([A-Z]{2,4})\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)/;
 
  for (const linha of linhas) {
    const m = linha.match(linhaRegex);
    if (!m) continue;
    produtos.push({
      codigo: m[1],
      descricao: m[2].trim(),
      ncm: m[3],
      cst: m[4],
      cfop: m[5],
      unidade: m[6],
      quantidade: m[7],
      valorUnitario: m[8],
      valorTotal: m[9],
    });
  }
 
  return produtos;
}
 
// ---------- Bloco "Cálculo do Imposto" ----------
function extrairValoresTotais(t: string) {
  const pick = (regex: RegExp) => {
    const m = t.match(regex);
    return m ? m[1].trim() : "";
  };
 
  return {
    baseCalculoICMS: pick(/BASE DE C[ÁA]LCULO DO ICMS\s*\n?\s*([\d.,]+)/i),
    valorICMS: pick(/VALOR DO ICMS\s*\n?\s*([\d.,]+)/i),
    valorProdutos: pick(/VALOR TOTAL DOS PRODUTOS\s*\n?\s*([\d.,]+)/i),
    valorFrete: pick(/VALOR DO FRETE\s*\n?\s*([\d.,]+)/i),
    valorSeguro: pick(/VALOR DO SEGURO\s*\n?\s*([\d.,]+)/i),
    valorDesconto: pick(/(?:VALOR DO )?DESCONTO\s*\n?\s*([\d.,]+)/i),
    valorIPI: pick(/VALOR DO IPI\s*\n?\s*([\d.,]+)/i),
    valorOutrasDespesas: pick(/OUTRAS DESPESAS ACESS[ÓO]RIAS\s*\n?\s*([\d.,]+)/i),
    valorTotalTributos: pick(/VALOR APROX(?:IMADO)? DOS TRIBUTOS\s*\n?\s*([\d.,]+)/i),
  };
}