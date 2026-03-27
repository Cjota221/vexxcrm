import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { createServerSupabaseClient, createAuthenticatedClient } from '@/lib/supabase';
import { PhoneNormalizer } from '@/lib/phone-normalizer';

/* ── Normalizar estado → UF de 2 letras ─────────────────────────────── */
const STATE_NAME_TO_UF: Record<string, string> = {
  'ACRE': 'AC', 'ALAGOAS': 'AL', 'AMAPÁ': 'AP', 'AMAPA': 'AP',
  'AMAZONAS': 'AM', 'BAHIA': 'BA', 'CEARÁ': 'CE', 'CEARA': 'CE',
  'DISTRITO FEDERAL': 'DF', 'ESPÍRITO SANTO': 'ES', 'ESPIRITO SANTO': 'ES',
  'GOIÁS': 'GO', 'GOIAS': 'GO', 'MARANHÃO': 'MA', 'MARANHAO': 'MA',
  'MATO GROSSO': 'MT', 'MATO GROSSO DO SUL': 'MS',
  'MINAS GERAIS': 'MG', 'PARÁ': 'PA', 'PARA': 'PA',
  'PARAÍBA': 'PB', 'PARAIBA': 'PB', 'PARANÁ': 'PR', 'PARANA': 'PR',
  'PERNAMBUCO': 'PE', 'PIAUÍ': 'PI', 'PIAUI': 'PI',
  'RIO DE JANEIRO': 'RJ', 'RIO GRANDE DO NORTE': 'RN',
  'RIO GRANDE DO SUL': 'RS', 'RONDÔNIA': 'RO', 'RONDONIA': 'RO',
  'RORAIMA': 'RR', 'SANTA CATARINA': 'SC', 'SÃO PAULO': 'SP',
  'SAO PAULO': 'SP', 'SERGIPE': 'SE', 'TOCANTINS': 'TO',
};
const VALID_UFS = new Set([
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS',
  'MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC',
  'SP','SE','TO',
]);
function normalizeStateToUF(raw: unknown): string | null {
  if (!raw) return null;
  const upper = String(raw).toUpperCase().trim();
  if (!upper) return null;
  if (VALID_UFS.has(upper)) return upper;
  if (STATE_NAME_TO_UF[upper]) return STATE_NAME_TO_UF[upper];
  const ufMatch = upper.match(/\b([A-Z]{2})\b/);
  if (ufMatch && VALID_UFS.has(ufMatch[1])) return ufMatch[1];
  return upper.length <= 3 ? upper : null; // manter valor curto desconhecido, ignorar longos
}

/**
 * POST /api/import/process
 *
 * Recebe arquivo + mapeamento de colunas.
 * Executa de-duplicação por CPF (prioridade 1) e Telefone (prioridade 2).
 * Merge inteligente: soma métricas, enriquece dados, resolve conflitos.
 *
 * Body: FormData com:
 *   - file: arquivo CSV/XLSX/XML
 *   - mapping: JSON string do mapeamento {coluna_arquivo: campo_crm}
 */
export async function POST(request: NextRequest) {
  try {
    // ─── 1. Autenticação ───
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const supabaseAuth = createAuthenticatedClient(token);
    const supabase = createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('tenant_id')
      .eq('id', user.id)
      .single();

    if (!profile?.tenant_id) {
      return NextResponse.json({ error: 'Tenant não encontrado' }, { status: 403 });
    }

    const tenantId = profile.tenant_id;

    // ─── 2. Parsear FormData ───
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const mappingStr = formData.get('mapping') as string | null;

    if (!file || !mappingStr) {
      return NextResponse.json(
        { error: 'Arquivo e mapeamento são obrigatórios' },
        { status: 400 }
      );
    }

    const mapping: Record<string, string> = JSON.parse(mappingStr);
    const importTag = (formData.get('tag') as string | null)?.trim() || '';

    // ─── 3. Parsear arquivo ───
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array', codepage: 65001, cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawData: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, {
      defval: '',
      raw: false,
    });

    // ─── 4. Detectar colunas disponíveis na tabela clients ───
    const { data: sampleClient, error: schemaError } = await supabase
      .from('clients')
      .select('*')
      .eq('tenant_id', tenantId)
      .limit(1);

    // Determinar quais colunas existem (evitar enviar campos inexistentes)
    let availableColumns: Set<string>;
    if (sampleClient && sampleClient.length > 0) {
      availableColumns = new Set(Object.keys(sampleClient[0]));
    } else if (!schemaError) {
      // Tabela existe mas vazia — tentar inserção de teste rápido
      availableColumns = new Set([
        'id', 'tenant_id', 'name', 'phone', 'phone_normalized', 'email',
        'ltv', 'total_orders', 'avg_ticket', 'status', 'source', 'tags',
        'notes', 'address_street', 'address_number', 'address_complement',
        'address_neighborhood', 'address_city', 'address_state', 'address_zip',
        'custom_fields', 'created_at', 'updated_at',
      ]);
    } else {
      // Fallback amplo
      availableColumns = new Set([
        'id', 'tenant_id', 'name', 'phone', 'phone_normalized', 'email',
        'ltv', 'total_orders', 'avg_ticket', 'status', 'source', 'tags',
        'notes', 'custom_fields',
      ]);
    }

    const hasCpfColumn = availableColumns.has('cpf');
    const hasBirthdayColumn = availableColumns.has('birthday');

    console.log(`📋 Colunas detectadas: ${availableColumns.size} | cpf: ${hasCpfColumn} | birthday: ${hasBirthdayColumn}`);

    // ─── 5. Carregar clientes existentes (para matching) ───
    // Construir select dinâmico baseado nas colunas disponíveis
    const selectFields = [
      'id', 'name', 'phone', 'phone_normalized', 'email',
      'ltv', 'total_orders', 'avg_ticket',
      'address_street', 'address_number', 'address_complement',
      'address_neighborhood', 'address_city', 'address_state', 'address_zip',
      'notes', 'custom_fields', 'tags', 'status', 'source', 'created_at',
    ];
    if (hasCpfColumn) selectFields.push('cpf');
    if (hasBirthdayColumn) selectFields.push('birthday');

    const { data: existingClients } = await supabase
      .from('clients')
      .select(selectFields.join(', '))
      .eq('tenant_id', tenantId) as { data: Record<string, unknown>[] | null };

    // Indexar por CPF e telefone (múltiplas variações para máximo matching)
    const byCpf = new Map<string, Record<string, unknown>>();
    const byPhone = new Map<string, Record<string, unknown>>();

    for (const client of existingClients || []) {
      const cpf = client.cpf as string | undefined;
      const phoneNorm = client.phone_normalized as string | undefined;
      const phone = client.phone as string | undefined;

      if (cpf) {
        const cpfClean = cpf.replace(/\D/g, '');
        if (cpfClean.length >= 11) byCpf.set(cpfClean, client);
      }

      // Indexar por múltiplas variações de telefone para máximo matching
      const phoneVariations = new Set<string>();

      if (phoneNorm) phoneVariations.add(phoneNorm);

      if (phone) {
        const digits = phone.replace(/\D/g, '');
        if (digits.length >= 10) {
          phoneVariations.add(digits); // telefone bruto sem formatação
          const canonical = PhoneNormalizer.canonical(phone);
          if (canonical) phoneVariations.add(canonical); // sem 9º dígito

          // Últimos 8 dígitos (número local sem DDD)
          if (digits.length >= 8) {
            phoneVariations.add(digits.slice(-8));
          }
          // Últimos 9 dígitos (número local com 9)
          if (digits.length >= 9) {
            phoneVariations.add(digits.slice(-9));
          }
        }
      }

      for (const variant of phoneVariations) {
        if (!byPhone.has(variant)) {
          byPhone.set(variant, client);
        }
      }
    }

    console.log(`📊 Índice: ${byCpf.size} CPFs, ${byPhone.size} variações de telefone para ${(existingClients || []).length} clientes`);

    // ─── 6. Processar cada linha ───
    const stats = {
      total: rawData.length,
      merged: 0,
      created: 0,
      enriched: 0,
      skipped: 0,
      errors: 0,
    };

    const results: ImportRowResult[] = [];
    const BATCH_SIZE = 50;
    const columnFlags = { hasCpfColumn, hasBirthdayColumn };

    for (let i = 0; i < rawData.length; i += BATCH_SIZE) {
      const batch = rawData.slice(i, i + BATCH_SIZE);
      const batchResults = await processBatch(
        supabase,
        tenantId,
        batch,
        mapping,
        byCpf,
        byPhone,
        stats,
        columnFlags,
        importTag
      );
      results.push(...batchResults);
    }

    return NextResponse.json({
      success: true,
      stats,
      details: results.slice(0, 100), // Primeiros 100 resultados
    });
  } catch (error: unknown) {
    console.error('❌ Import process error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro ao processar importação' },
      { status: 500 }
    );
  }
}

// ─── Tipos ───

interface ImportRowResult {
  row: number;
  action: 'merged' | 'created' | 'skipped' | 'error';
  name?: string;
  phone?: string;
  details?: string;
}

// ─── Processamento em batch ───

async function processBatch(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  tenantId: string,
  batch: Record<string, unknown>[],
  mapping: Record<string, string>,
  byCpf: Map<string, Record<string, unknown>>,
  byPhone: Map<string, Record<string, unknown>>,
  stats: { total: number; merged: number; created: number; enriched: number; skipped: number; errors: number },
  columnFlags: { hasCpfColumn: boolean; hasBirthdayColumn: boolean },
  importTag: string
): Promise<ImportRowResult[]> {
  const results: ImportRowResult[] = [];
  const toInsert: Record<string, unknown>[] = [];
  const toUpdate: { id: string; data: Record<string, unknown> }[] = [];

  for (let idx = 0; idx < batch.length; idx++) {
    const row = batch[idx];
    const rowNum = stats.merged + stats.created + stats.skipped + stats.errors + idx + 1;

    try {
      // Extrair campos mapeados
      const mapped = extractMappedFields(row, mapping);

      // Validação mínima: precisa ter nome OU telefone
      if (!mapped.name && !mapped.phone) {
        stats.skipped++;
        results.push({ row: rowNum, action: 'skipped', details: 'Sem nome e sem telefone' });
        continue;
      }

      // ─── De-duplicação ───
      let existingClient: Record<string, unknown> | undefined;

      // Prioridade 1: CPF
      if (mapped.cpf) {
        const cpfClean = String(mapped.cpf).replace(/\D/g, '');
        if (cpfClean.length >= 11) {
          existingClient = byCpf.get(cpfClean) as Record<string, unknown> | undefined;
        }
      }

      // Prioridade 2: Telefone normalizado (múltiplas variações)
      if (!existingClient && mapped.phone) {
        const phoneStr = String(mapped.phone);
        const digits = phoneStr.replace(/\D/g, '');
        const canonical = PhoneNormalizer.canonical(phoneStr);

        // Tentar canonical primeiro
        if (canonical) {
          existingClient = byPhone.get(canonical) as Record<string, unknown> | undefined;
        }

        // Tentar dígitos brutos
        if (!existingClient && digits.length >= 10) {
          existingClient = byPhone.get(digits) as Record<string, unknown> | undefined;
        }

        // Tentar últimos 8 dígitos (número local sem DDD)
        if (!existingClient && digits.length >= 8) {
          existingClient = byPhone.get(digits.slice(-8)) as Record<string, unknown> | undefined;
        }

        // Tentar últimos 9 dígitos (número local com 9)
        if (!existingClient && digits.length >= 9) {
          existingClient = byPhone.get(digits.slice(-9)) as Record<string, unknown> | undefined;
        }
      }

      if (existingClient) {
        // ─── MERGE: Cliente já existe ───
        const mergeData = buildMergeData(existingClient, mapped, columnFlags);

        // Adicionar importTag se não existir nas tags do cliente
        if (importTag) {
          const existingTags: string[] = Array.isArray(existingClient.tags) ? (existingClient.tags as string[]) : [];
          if (!existingTags.includes(importTag)) {
            mergeData.tags = [...new Set([...existingTags, ...(mergeData.tags as string[] || []), importTag])];
          }
        }

        if (Object.keys(mergeData).length > 0) {
          toUpdate.push({ id: existingClient.id as string, data: mergeData });
          stats.merged++;

          const enrichedFields = Object.keys(mergeData).filter(
            (k) => k !== 'ltv' && k !== 'total_orders' && k !== 'avg_ticket' && k !== 'updated_at' && k !== 'notes'
          );
          if (enrichedFields.length > 0) stats.enriched++;

          results.push({
            row: rowNum,
            action: 'merged',
            name: (existingClient.name as string) || (mapped.name as string) || '',
            phone: (existingClient.phone as string) || (mapped.phone as string) || '',
            details: `Atualizado: ${Object.keys(mergeData).join(', ')}`,
          });
        } else {
          stats.skipped++;
          results.push({
            row: rowNum,
            action: 'skipped',
            name: existingClient.name as string,
            details: 'Dados idênticos, nada para atualizar',
          });
        }
      } else {
        // ─── CREATE: Novo cliente ───
        const phone = mapped.phone ? String(mapped.phone) : '';
        const phoneNormalized = phone ? PhoneNormalizer.canonical(phone) || phone.replace(/\D/g, '') : '';

        const newClient: Record<string, unknown> = {
          tenant_id: tenantId,
          name: mapped.name || 'Importado',
          phone: phone ? PhoneNormalizer.normalize(phone) || phone : phoneNormalized,
          phone_normalized: phoneNormalized,
          email: mapped.email || null,
          ltv: parseFloat(String(mapped.ltv || '0').replace(',', '.')) || 0,
          total_orders: parseInt(String(mapped.total_pedidos || mapped.total_orders || '0')) || 0,
          avg_ticket: parseFloat(String(mapped.avg_ticket || mapped.ticket_medio || '0').replace(',', '.')) || 0,
          status: 'active',
          source: 'import',
          tags: [
            ...(mapped.tags ? parseTags(mapped.tags) : []),
            ...(importTag ? [importTag] : []),
          ],
          notes: mapped.notas || null,
          address_street: mapped.address_street || null,
          address_number: mapped.address_number || null,
          address_complement: mapped.address_complement || null,
          address_neighborhood: mapped.address_neighborhood || null,
          address_city: mapped.address_city || null,
          address_state: normalizeStateToUF(mapped.address_state),
          address_zip: mapped.address_zip || null,
          custom_fields: {},
        };

        // Só incluir cpf/birthday se as colunas existem no banco
        if (columnFlags.hasCpfColumn) {
          newClient.cpf = mapped.cpf ? String(mapped.cpf).replace(/\D/g, '') : null;
        }
        if (columnFlags.hasBirthdayColumn) {
          newClient.birthday = mapped.birthday ? parseDateField(mapped.birthday) : null;
        }

        // Calcular LTV se não foi fornecido mas temos orders + avg_ticket
        let ltv = (newClient.ltv as number) || 0;
        const orders = (newClient.total_orders as number) || 0;
        const avgTicket = (newClient.avg_ticket as number) || 0;

        if (ltv === 0 && orders > 0 && avgTicket > 0) {
          // Calcular LTV a partir de pedidos × ticket médio
          ltv = parseFloat((orders * avgTicket).toFixed(2));
          newClient.ltv = ltv;
        }

        // (Re)calcular avg_ticket se temos LTV e orders
        if (orders > 0 && ltv > 0) {
          newClient.avg_ticket = parseFloat((ltv / orders).toFixed(2));
        }

        toInsert.push(newClient);

        // Indexar para evitar duplicatas dentro do próprio arquivo
        if (mapped.cpf) {
          byCpf.set(String(mapped.cpf).replace(/\D/g, ''), newClient);
        }
        if (phoneNormalized) {
          byPhone.set(phoneNormalized, newClient);
        }

        stats.created++;
        results.push({
          row: rowNum,
          action: 'created',
          name: mapped.name as string,
          phone: phone,
          details: 'Novo cliente criado',
        });
      }
    } catch (err) {
      stats.errors++;
      results.push({
        row: rowNum,
        action: 'error',
        details: err instanceof Error ? err.message : 'Erro desconhecido',
      });
    }
  }

  // ─── Executar operações no banco ───

  // Inserts em batch
  if (toInsert.length > 0) {
    const { error } = await supabase
      .from('clients')
      .upsert(toInsert, { onConflict: 'tenant_id,phone_normalized', ignoreDuplicates: true });

    if (error) {
      console.error('❌ Import insert error:', error);
      // Reajustar stats — marcar as inserções como erros
      const insertCount = toInsert.length;
      stats.created -= insertCount;
      stats.errors += insertCount;

      // Adicionar detalhes do erro nos resultados
      results.push({
        row: 0,
        action: 'error',
        details: `Erro ao inserir ${insertCount} clientes: ${error.message}`,
      });
    }
  }

  // Updates individuais (cada um pode ter dados diferentes)
  if (toUpdate.length > 0) {
    const updatePromises = toUpdate.map(({ id, data }) =>
      supabase
        .from('clients')
        .update(data)
        .eq('id', id)
        .eq('tenant_id', tenantId)
    );

    // Processar em chunks de 20
    for (let i = 0; i < updatePromises.length; i += 20) {
      await Promise.all(updatePromises.slice(i, i + 20));
    }
  }

  return results;
}

// ─── Helpers ───

function extractMappedFields(
  row: Record<string, unknown>,
  mapping: Record<string, string>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [fileCol, crmField] of Object.entries(mapping)) {
    if (crmField && row[fileCol] !== undefined && row[fileCol] !== '') {
      result[crmField] = row[fileCol];
    }
  }
  return result;
}

/**
 * Constrói dados de merge respeitando as regras:
 * - Soma LTV e total_pedidos
 * - Endereço: mantém o mais recente (existente), guarda antigo nas notas
 * - Enriquecimento: preenche campos vazios
 */
function buildMergeData(
  existing: Record<string, unknown>,
  imported: Record<string, unknown>,
  columnFlags: { hasCpfColumn: boolean; hasBirthdayColumn: boolean }
): Record<string, unknown> {
  const update: Record<string, unknown> = {};
  const now = new Date().toISOString();

  // ── SOMA de métricas ──
  const importedLtv = parseFloat(String(imported.ltv || '0').replace(',', '.')) || 0;
  const importedOrders = parseInt(String(imported.total_pedidos || imported.total_orders || '0')) || 0;
  const importedAvgTicket = parseFloat(String(imported.avg_ticket || imported.ticket_medio || '0').replace(',', '.')) || 0;

  // Calcular LTV importado se não fornecido mas temos orders + avg_ticket
  const effectiveImportedLtv = importedLtv > 0
    ? importedLtv
    : (importedOrders > 0 && importedAvgTicket > 0 ? importedOrders * importedAvgTicket : 0);

  if (effectiveImportedLtv > 0) {
    const currentLtv = parseFloat(String(existing.ltv || '0')) || 0;
    const newLtv = currentLtv + effectiveImportedLtv;
    update.ltv = parseFloat(newLtv.toFixed(2));

    const currentOrders = parseInt(String(existing.total_orders || '0')) || 0;
    const newOrders = currentOrders + importedOrders;
    update.total_orders = newOrders;

    if (newOrders > 0) {
      update.avg_ticket = parseFloat((newLtv / newOrders).toFixed(2));
    }
  } else if (importedOrders > 0) {
    const currentOrders = parseInt(String(existing.total_orders || '0')) || 0;
    update.total_orders = currentOrders + importedOrders;
  }

  // ── ENRIQUECIMENTO: preencher campos vazios ──
  if (!existing.email && imported.email) {
    update.email = imported.email;
  }

  if (!existing.cpf && imported.cpf && columnFlags.hasCpfColumn) {
    update.cpf = String(imported.cpf).replace(/\D/g, '');
  }

  if (!existing.birthday && imported.birthday && columnFlags.hasBirthdayColumn) {
    const parsed = parseDateField(imported.birthday);
    if (parsed) update.birthday = parsed;
  }

  if (!existing.name && imported.name) {
    update.name = imported.name;
  }

  // ── ENDEREÇO: conflito → manter existente, guardar antigo nas notas ──
  const existingHasAddress = !!(existing.address_street || existing.address_city);
  const importedHasAddress = !!(imported.address_street || imported.address_city);

  if (!existingHasAddress && importedHasAddress) {
    // Sem endereço no CRM → preencher com importado
    if (imported.address_street) update.address_street = imported.address_street;
    if (imported.address_number) update.address_number = imported.address_number;
    if (imported.address_complement) update.address_complement = imported.address_complement;
    if (imported.address_neighborhood) update.address_neighborhood = imported.address_neighborhood;
    if (imported.address_city) update.address_city = imported.address_city;
    if (imported.address_state) update.address_state = normalizeStateToUF(imported.address_state);
    if (imported.address_zip) update.address_zip = imported.address_zip;
  } else if (existingHasAddress && importedHasAddress) {
    // Conflito de endereço → guardar antigo nas notas
    const importedAddress = [
      imported.address_street,
      imported.address_number,
      imported.address_complement,
      imported.address_neighborhood,
      imported.address_city,
      imported.address_state,
      imported.address_zip,
    ]
      .filter(Boolean)
      .join(', ');

    if (importedAddress) {
      const existingNotes = (existing.notes as string) || '';
      const historyNote = `\n[Importação ${now.split('T')[0]}] Endereço anterior: ${importedAddress}`;
      update.notes = existingNotes + historyNote;
    }
  }

  // ── TAGS: unir sem duplicatas ──
  if (imported.tags) {
    const existingTags: string[] = Array.isArray(existing.tags) ? (existing.tags as string[]) : [];
    const importedTags = parseTags(imported.tags);
    const merged = [...new Set([...existingTags, ...importedTags])];

    if (merged.length > existingTags.length) {
      update.tags = merged;
    }
  }

  // ── Notas adicionais ──
  if (imported.notas && !existingHasAddress) {
    const existingNotes = (existing.notes as string) || '';
    if (!existingNotes.includes(String(imported.notas))) {
      update.notes = existingNotes
        ? `${existingNotes}\n[Importação] ${imported.notas}`
        : String(imported.notas);
    }
  }

  if (Object.keys(update).length > 0) {
    update.updated_at = now;
  }

  return update;
}

function parseDateField(value: unknown): string | null {
  if (!value) return null;
  const str = String(value).trim();

  // Tentar dd/mm/yyyy
  const brMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (brMatch) {
    const [, day, month, year] = brMatch;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  // Tentar yyyy-mm-dd
  const isoMatch = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  // Tentar Date parse genérico
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    return d.toISOString().split('T')[0];
  }

  return null;
}

function parseTags(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string') {
    return value
      .split(/[,;|]/)
      .map((t) => t.trim())
      .filter(Boolean);
  }
  return [];
}
