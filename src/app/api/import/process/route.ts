import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { createServerSupabaseClient } from '@/lib/supabase';
import { PhoneNormalizer } from '@/lib/phone-normalizer';

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

    const supabase = createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
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

    // ─── 3. Parsear arquivo ───
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array', codepage: 65001, cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawData: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, {
      defval: '',
      raw: false,
    });

    // ─── 4. Carregar clientes existentes (para matching) ───
    const { data: existingClients } = await supabase
      .from('clients')
      .select('id, name, phone, phone_normalized, email, cpf, ltv, total_orders, avg_ticket, birthday, address_street, address_number, address_complement, address_neighborhood, address_city, address_state, address_zip, notes, custom_fields, tags, status, source, created_at')
      .eq('tenant_id', tenantId);

    // Indexar por CPF e telefone
    type ClientRow = NonNullable<typeof existingClients>[number];
    const byCpf = new Map<string, ClientRow>();
    const byPhone = new Map<string, ClientRow>();

    for (const client of existingClients || []) {
      if (client.cpf) {
        const cpfClean = client.cpf.replace(/\D/g, '');
        if (cpfClean.length >= 11) byCpf.set(cpfClean, client);
      }
      if (client.phone_normalized) {
        byPhone.set(client.phone_normalized, client);
      }
      // Também indexar pela versão canônica
      if (client.phone) {
        const canonical = PhoneNormalizer.canonical(client.phone);
        if (canonical) byPhone.set(canonical, client);
      }
    }

    // ─── 5. Processar cada linha ───
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

    for (let i = 0; i < rawData.length; i += BATCH_SIZE) {
      const batch = rawData.slice(i, i + BATCH_SIZE);
      const batchResults = await processBatch(
        supabase,
        tenantId,
        batch,
        mapping,
        byCpf,
        byPhone,
        stats
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
  stats: { total: number; merged: number; created: number; enriched: number; skipped: number; errors: number }
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

      // Prioridade 2: Telefone normalizado
      if (!existingClient && mapped.phone) {
        const canonical = PhoneNormalizer.canonical(String(mapped.phone));
        if (canonical) {
          existingClient = byPhone.get(canonical) as Record<string, unknown> | undefined;
        }
      }

      if (existingClient) {
        // ─── MERGE: Cliente já existe ───
        const mergeData = buildMergeData(existingClient, mapped);

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
          cpf: mapped.cpf ? String(mapped.cpf).replace(/\D/g, '') : null,
          birthday: mapped.birthday ? parseDateField(mapped.birthday) : null,
          ltv: parseFloat(String(mapped.ltv || '0').replace(',', '.')) || 0,
          total_orders: parseInt(String(mapped.total_pedidos || '0')) || 0,
          avg_ticket: 0,
          status: 'active',
          source: 'import',
          tags: mapped.tags ? parseTags(mapped.tags) : [],
          notes: mapped.notas || null,
          address_street: mapped.address_street || null,
          address_number: mapped.address_number || null,
          address_complement: mapped.address_complement || null,
          address_neighborhood: mapped.address_neighborhood || null,
          address_city: mapped.address_city || null,
          address_state: mapped.address_state || null,
          address_zip: mapped.address_zip || null,
          custom_fields: {},
        };

        // Calcular avg_ticket
        const ltv = (newClient.ltv as number) || 0;
        const orders = (newClient.total_orders as number) || 0;
        if (orders > 0) newClient.avg_ticket = parseFloat((ltv / orders).toFixed(2));

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
      // Não falhar completamente — contar erros
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
  imported: Record<string, unknown>
): Record<string, unknown> {
  const update: Record<string, unknown> = {};
  const now = new Date().toISOString();

  // ── SOMA de métricas ──
  const importedLtv = parseFloat(String(imported.ltv || '0').replace(',', '.')) || 0;
  const importedOrders = parseInt(String(imported.total_pedidos || '0')) || 0;

  if (importedLtv > 0) {
    const currentLtv = parseFloat(String(existing.ltv || '0')) || 0;
    const newLtv = currentLtv + importedLtv;
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

  if (!existing.cpf && imported.cpf) {
    update.cpf = String(imported.cpf).replace(/\D/g, '');
  }

  if (!existing.birthday && imported.birthday) {
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
    if (imported.address_state) update.address_state = imported.address_state;
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
