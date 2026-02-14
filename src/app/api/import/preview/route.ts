import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

/**
 * POST /api/import/preview
 *
 * Recebe arquivo (CSV, XLSX, XML) via FormData,
 * parseia e retorna as colunas detectadas + amostra de dados.
 * Não requer autenticação — validação feita no /process.
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'Nenhum arquivo enviado' }, { status: 400 });
    }

    // Validar tipo
    const allowedTypes = [
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/xml',
      'application/xml',
    ];
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const isAllowed = allowedTypes.includes(file.type) || ['csv', 'xlsx', 'xls', 'xml'].includes(ext);

    if (!isAllowed) {
      return NextResponse.json(
        { error: 'Formato não suportado. Use CSV, XLSX ou XML.' },
        { status: 400 }
      );
    }

    // Ler arquivo
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, {
      type: 'array',
      codepage: 65001, // UTF-8
      cellDates: true,
    });

    // Pegar primeira sheet
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      return NextResponse.json({ error: 'Arquivo vazio ou sem abas' }, { status: 400 });
    }

    const sheet = workbook.Sheets[sheetName];
    const rawData: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, {
      defval: '',
      raw: false,
    });

    if (rawData.length === 0) {
      return NextResponse.json({ error: 'Nenhum dado encontrado no arquivo' }, { status: 400 });
    }

    // Extrair colunas do arquivo
    const fileColumns = Object.keys(rawData[0]);

    // Amostra (primeiras 5 linhas)
    const sample = rawData.slice(0, 5);

    // Sugestão automática de mapeamento (fuzzy match)
    const autoMapping = suggestMapping(fileColumns);

    return NextResponse.json({
      fileName: file.name,
      fileSize: file.size,
      totalRows: rawData.length,
      columns: fileColumns,
      sample,
      suggestedMapping: autoMapping,
      sheetNames: workbook.SheetNames,
    });
  } catch (error: unknown) {
    console.error('❌ Import preview error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro ao processar arquivo' },
      { status: 500 }
    );
  }
}

/**
 * Mapas de sinônimos: coluna do arquivo → campo do CRM.
 */
const FIELD_SYNONYMS: Record<string, string[]> = {
  name: ['nome', 'name', 'cliente', 'client', 'razao_social', 'razão social', 'nome_completo', 'nome completo'],
  phone: ['telefone', 'phone', 'celular', 'whatsapp', 'tel', 'fone', 'mobile', 'numero', 'número'],
  email: ['email', 'e-mail', 'e_mail', 'correio', 'mail'],
  cpf: ['cpf', 'documento', 'doc', 'cpf/cnpj', 'cpf_cnpj'],
  birthday: ['nascimento', 'birthday', 'data_nascimento', 'dt_nascimento', 'data de nascimento', 'aniversario', 'aniversário'],
  address_street: ['rua', 'logradouro', 'endereco', 'endereço', 'street', 'address'],
  address_number: ['numero', 'número', 'num', 'nro', 'number'],
  address_complement: ['complemento', 'compl', 'complement'],
  address_neighborhood: ['bairro', 'neighborhood'],
  address_city: ['cidade', 'city', 'municipio', 'município'],
  address_state: ['estado', 'uf', 'state'],
  address_zip: ['cep', 'zip', 'zipcode', 'codigo_postal'],
  ltv: ['ltv', 'lifetime_value', 'valor_total', 'total_gasto', 'receita', 'faturamento'],
  total_pedidos: ['total_pedidos', 'qtd_pedidos', 'pedidos', 'orders', 'total_orders', 'compras', 'quantidade_pedidos'],
  avg_ticket: ['ticket_medio', 'ticket médio', 'avg_ticket', 'media_pedido', 'média', 'valor_medio', 'valor médio'],
  tags: ['tags', 'etiquetas', 'labels', 'categorias'],
  notas: ['notas', 'observacoes', 'observações', 'notes', 'obs'],
  origem: ['origem', 'source', 'canal', 'channel'],
};

function suggestMapping(fileColumns: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};

  for (const col of fileColumns) {
    const normalized = col.toLowerCase().trim().replace(/[_\-\s]+/g, '_');

    for (const [crmField, synonyms] of Object.entries(FIELD_SYNONYMS)) {
      if (synonyms.some((syn) => {
        const normSyn = syn.toLowerCase().replace(/[_\-\s]+/g, '_');
        return normalized === normSyn || normalized.includes(normSyn) || normSyn.includes(normalized);
      })) {
        // Evitar duplicatas — se já mapeou, não sobrescrever
        if (!Object.values(mapping).includes(crmField)) {
          mapping[col] = crmField;
        }
        break;
      }
    }
  }

  return mapping;
}
