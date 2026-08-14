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

export interface ExtracaoResponse {
  success: boolean;
  data?: NotaFiscalData;
  error?: string;
  raw?: string;
}
