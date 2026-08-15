export type TipoDocumento = "nfe" | "cte";

export interface NotaFiscalData {
  numero: string;
  serie: string;
  dataEmissao: string;
  dataSaidaEntrada: string;
  horaSaida: string;
  naturezaOperacao: string;
  chaveAcesso: string;
  protocoloAutorizacao: string;
  valorTotal: string;

  emitente: {
    nome: string;
    cnpj: string;
    inscricaoEstadual: string;
    endereco: string;
    bairro: string;
    cep: string;
    municipio: string;
    uf: string;
    telefone: string;
  };

  destinatario: {
    nome: string;
    cpfCnpj: string;
    endereco: string;
    bairro: string;
    cep: string;
    municipio: string;
    uf: string;
    telefone: string;
    inscricaoEstadual?: string;
  };

  produtos: ProdutoItem[];

  valoresTotais: {
    baseCalculoICMS?: string;
    valorICMS?: string;
    valorProdutos?: string;
    valorFrete?: string;
    valorSeguro?: string;
    valorDesconto?: string;
    valorIPI?: string;
    valorOutrasDespesas?: string;
    valorTotalTributos?: string;
  };
}

export interface ProdutoItem {
  codigo: string;
  descricao: string;
  ncm?: string;
  cst?: string;
  cfop?: string;
  unidade: string;
  quantidade: string;
  valorUnitario: string;
  valorTotal: string;
}

/**
 * Uma "pessoa" dentro do CT-e (remetente, destinatário ou tomador do serviço).
 * O DACTE repete basicamente os mesmos campos para os três papéis.
 */
export interface PessoaCTe {
  nome: string;
  cnpjCpf: string;
  inscricaoEstadual?: string;
  endereco: string;
  bairro?: string;
  municipio: string;
  cep: string;
  uf: string;
  telefone: string;
}

export interface ComponentesValorCTe {
  freteBaseCalculo?: string; // "FRETE PESO"
  freteValor?: string;
  pedagio?: string;
  outras?: string;
  suframa?: string;
  despacho?: string;
  gris?: string;
  libSefaz?: string;
  secCat?: string;
  plusService?: string;
  dce?: string;
  txNordeste?: string;
}

export interface CteData {
  modelo: string;
  serie: string;
  numero: string;
  dataHoraEmissao: string;
  chaveAcesso: string;
  protocoloAutorizacao: string;

  tipoCte: string; // NORMAL, COMPLEMENTAR, SUBSTITUTO...
  tipoServico: string; // NORMAL, SUBCONTRATAÇÃO...
  cfop: string;
  naturezaPrestacao: string;
  origemPrestacao: string;
  destinoPrestacao: string;

  remetente: PessoaCTe;
  destinatario: PessoaCTe;
  tomador: PessoaCTe;

  produtoPredominante: string;
  outrasCaracteristicasCarga: string;
  pesoBruto: string;
  pesoBaseCalculo: string;
  pesoAferido: string;
  cubagem: string;
  volumes: string;
  valorTotalCarga: string;

  componentesValor: ComponentesValorCTe;
  valorTotalServico: string;
  valorAReceber: string;

  situacaoTributaria: string;
  baseCalculoICMS: string;
  aliqICMS: string;
  valorICMS: string;
  percReducaoBaseCalculo?: string;

  enderecoEntrega?: string;
}

export interface ExtracaoResponse<T = NotaFiscalData | CteData> {
  success: boolean;
  tipo?: TipoDocumento;
  data?: T;
  error?: string;
  raw?: string;
}
