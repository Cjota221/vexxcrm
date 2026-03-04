import { NextRequest, NextResponse } from 'next/server';
import { authenticateAdmin } from '@/lib/auth-admin';
import { PhoneNormalizer } from '@/lib/phone-normalizer';

/**
 * POST /api/facilzap/relink-orphans
 * 
 * Vincula todos os pedidos órfãos (client_id = NULL) aos clientes corretos
 * usando múltiplas estratégias de matching (telefone, CPF, email, nome, Facilzap ID)
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  console.log('[RelinkOrphans] 🔗 Iniciando revinculação de pedidos órfãos');

  try {
    const auth = await authenticateAdmin(request);
    if (auth instanceof NextResponse) return auth;

    const { supabase: supabaseAdmin, tenantId } = auth;

    // 1️⃣ Buscar TODOS os clientes com seus atributos
    console.log('[RelinkOrphans] Carregando mapa de clientes...');
    const { data: clients } = await supabaseAdmin
      .from('clients')
      .select('id, phone, phone_normalized, phone_canonical, name, email, custom_fields')
      .eq('tenant_id', tenantId);

    // Criar mapas de busca
    const phoneMap = new Map<string, string>();
    const emailMap = new Map<string, string>();
    const nameMap = new Map<string, string>();
    const cpfMap = new Map<string, string>();
    const facilzapIdMap = new Map<string, string>();

    for (const client of clients || []) {
      // Mapear telefones
      for (const phone of [client.phone, client.phone_normalized, client.phone_canonical]) {
        if (phone) {
          const clean = phone.replace(/\D/g, '');
          if (clean) phoneMap.set(clean, client.id);
          phoneMap.set(PhoneNormalizer.canonical(phone), client.id);
        }
      }

      // Mapear email
      if (client.email) {
        emailMap.set(client.email.toLowerCase().trim(), client.id);
      }

      // Mapear nome
      if (client.name && client.name !== 'Sem nome') {
        nameMap.set(client.name.toLowerCase().trim(), client.id);
      }

      // Mapear CPF/CNPJ
      const cpf = (client.custom_fields as any)?.cpf || (client.custom_fields as any)?.cpf_cnpj;
      if (cpf) {
        const cleanCpf = String(cpf).replace(/\D/g, '');
        if (cleanCpf) cpfMap.set(cleanCpf, client.id);
      }

      // Mapear Facilzap ID
      const fzId = (client.custom_fields as any)?.facilzap_id;
      if (fzId) facilzapIdMap.set(String(fzId), client.id);
    }

    console.log(`[RelinkOrphans] Mapas criados: ${phoneMap.size} phones, ${emailMap.size} emails, ${nameMap.size} names, ${cpfMap.size} CPFs, ${facilzapIdMap.size} Facilzap IDs`);

    // 2️⃣ Buscar TODOS os pedidos órfãos
    console.log('[RelinkOrphans] Buscando pedidos órfãos...');
    const { data: orphans, count: orphanCount } = await supabaseAdmin
      .from('orders')
      .select('id, metadata, external_id')
      .eq('tenant_id', tenantId)
      .is('client_id', null)
      .order('created_at', { ascending: false });

    console.log(`[RelinkOrphans] Encontrados ${orphanCount} pedidos órfãos`);

    // 3️⃣ Tentar vincular cada órfão
    const relinkUpdates: { id: string; client_id: string }[] = [];
    const unmatched: any[] = [];

    for (const order of orphans || []) {
      const meta = order.metadata || {};
      let clientId: string | null = null;

      // Estratégia 1: Telefone
      const phones = [
        meta.cliente_whatsapp_e164,
        meta.cliente_whatsapp,
        meta.cliente_telefone,
        meta.whatsapp_e164,
        meta.whatsapp,
        meta.telefone,
        meta.phone,
      ].filter(Boolean);

      for (const phone of phones) {
        const ph = String(phone).replace(/\D/g, '');
        if (ph && ph.length >= 8) {
          clientId = phoneMap.get(ph) || phoneMap.get(PhoneNormalizer.canonical(ph)) || null;
          if (clientId) break;
        }
      }

      // Estratégia 2: Facilzap ID
      if (!clientId && (meta.cliente_id_facilzap || meta.cliente_id || meta.facilzap_id)) {
        const fzId = meta.cliente_id_facilzap || meta.cliente_id || meta.facilzap_id;
        clientId = facilzapIdMap.get(String(fzId)) || null;
      }

      // Estratégia 3: CPF/CNPJ
      if (!clientId && (meta.cliente_cpf_cnpj || meta.cliente_cpf || meta.cpf_cnpj || meta.cpf)) {
        const cpf = String(meta.cliente_cpf_cnpj || meta.cliente_cpf || meta.cpf_cnpj || meta.cpf).replace(/\D/g, '');
        if (cpf) {
          clientId = cpfMap.get(cpf) || null;
        }
      }

      // Estratégia 4: Email
      if (!clientId && (meta.cliente_email || meta.email)) {
        const email = (meta.cliente_email || meta.email)?.toLowerCase().trim();
        if (email) {
          clientId = emailMap.get(email) || null;
        }
      }

      // Estratégia 5: Nome (último recurso)
      if (!clientId && (meta.cliente_nome || meta.cliente_name || meta.nome || meta.name)) {
        const name = (meta.cliente_nome || meta.cliente_name || meta.nome || meta.name)?.toLowerCase().trim();
        if (name && name !== 'sem nome') {
          clientId = nameMap.get(name) || null;
        }
      }

      if (clientId) {
        relinkUpdates.push({ id: order.id, client_id: clientId });
      } else {
        unmatched.push({
          external_id: order.external_id,
          clientName: meta.cliente_nome || meta.cliente_name,
          clientPhone: meta.cliente_telefone || meta.cliente_whatsapp,
        });
      }
    }

    // 4️⃣ Aplicar atualizações em batch
    let relinkCount = 0;
    if (relinkUpdates.length > 0) {
      console.log(`[RelinkOrphans] Vinculando ${relinkUpdates.length} pedidos...`);
      
      // Fazer em batches de 100
      for (let i = 0; i < relinkUpdates.length; i += 100) {
        const batch = relinkUpdates.slice(i, i + 100);
        
        // Atualizar cada um (Supabase não tem batch update com múltiplos valores)
        for (const upd of batch) {
          const { error } = await supabaseAdmin
            .from('orders')
            .update({ client_id: upd.client_id })
            .eq('id', upd.id);
          
          if (!error) relinkCount++;
          else console.warn(`[RelinkOrphans] ⚠️ Erro ao vincular ${upd.id}: ${error.message}`);
        }
      }
      console.log(`[RelinkOrphans] ✅ ${relinkCount} pedidos vinculados com sucesso`);
    }

    const elapsed = Date.now() - startTime;
    console.log(`[RelinkOrphans] Concluído em ${elapsed}ms`);

    return NextResponse.json({
      success: true,
      relinked: relinkCount,
      unmatched: unmatched.length,
      total_orphans: orphanCount,
      duration_ms: elapsed,
      unmatched_sample: unmatched.slice(0, 10),
    });

  } catch (error: any) {
    console.error('[RelinkOrphans] Erro:', error);
    return NextResponse.json(
      { error: 'Erro ao revincula orphans', details: error.message },
      { status: 500 }
    );
  }
}
