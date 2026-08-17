export type TipoDocumento = "nfe" | "cte";

export interface PessoaNF {
  nome: string;
  cnpj: string;
  cpfCnpj: string;
  inscricaoEstadual: string;
  endereco: string;
  bairro: string;
  cep: string;
  municipio: string;
  uf: string;
  telefone: string;
}

export interface ProdutoNF {
  codigo: string;
  descricao: string;
  ncm: string;
  cst: string;
  cfop: string;
  unidade: string;
  quantidade: string;
  valorUnitario: string;
  valorTotal: string;
}

export interface ValoresTotaisNF {
  baseCalculoICMS: string;
  valorICMS: string;
  valorProdutos: string;
  valorFrete: string;
  valorSeguro: string;
  valorDesconto: string;
  valorIPI: string;
  valorOutrasDespesas: string;
  valorTotalTributos: string;
}

export interface PessoaCTe {
  nome: string;
  cnpjCpf: string;
  inscricaoEstadual: string;
  endereco: string;
  municipio: string;
  cep: string;
  uf: string;
  telefone: string;
}

export interface NotaFiscalData {
  numero: string;
  serie: string;
  dataEmissao: string;
  dataSaidaEntrada?: string;
  horaSaida?: string;
  naturezaOperacao: string;
  chaveAcesso: string;
  protocoloAutorizacao: string;
  valorTotal: string;
  emitente: PessoaNF;
  destinatario: PessoaNF;
  produtos?: ProdutoNF[];
  valoresTotais?: ValoresTotaisNF;
}

export interface ComponentesValor {
  freteBaseCalculo: string;
  freteValor: string;
  pedagio: string;
  outras: string;
  suframa: string;
  despacho: string;
  gris: string;
  libSefaz: string;
  secCat: string;
  plusService: string;
  dce: string;
  txNordeste: string;
}

export interface CteData {
  modelo: string;
  serie: string;
  numero: string;
  dataHoraEmissao: string;
  chaveAcesso: string;
  protocoloAutorizacao: string;
  tipoCte: string;
  tipoServico: string;
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
  componentesValor: ComponentesValor;
  valorTotalServico: string;
  valorAReceber: string;
  situacaoTributaria: string;
  baseCalculoICMS: string;
  aliqICMS: string;
  valorICMS: string;
  percReducaoBaseCalculo: string;
  enderecoEntrega: string;
}