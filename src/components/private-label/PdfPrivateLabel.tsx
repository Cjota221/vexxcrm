'use client';

import { useState } from 'react';
import { FileDown, Loader2, Send } from 'lucide-react';
import { PLPedido, PLItem, GRADE_TAMANHOS } from '@/hooks/usePrivateLabel';
import { formatCurrency } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';

interface Props { pedido: PLPedido; itens: PLItem[]; }

async function toBase64(url: string): Promise<string> {
  try {
    const res  = await fetch(url);
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload  = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return '';
  }
}

function buildPdfHtml(
  pedido: PLPedido,
  itens: PLItem[],
  modo: 'cliente' | 'producao',
  fotoMap: Record<string, string>,
  logoBase64: string,
): string {
  const isCliente = modo === 'cliente';
  const now = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

  const linhasItens = itens.map(item => {
    const gradeCells = GRADE_TAMANHOS.map(t =>
      `<td style="border:1px solid #e2e8f0;padding:6px 4px;text-align:center;font-size:12px;">${item.grade[t] || 0}</td>`,
    ).join('');
    const fotoSrc = fotoMap[item.id] || '';
    const fotoCell = `<td style="border:1px solid #e2e8f0;padding:4px;text-align:center;width:60px;">
      ${fotoSrc ? `<img src="${fotoSrc}" style="width:52px;height:52px;object-fit:cover;border-radius:6px;" />` : '<div style="width:52px;height:52px;background:#f1f5f9;border-radius:6px;display:inline-block;"></div>'}
    </td>`;
    return `<tr>
      ${fotoCell}
      <td style="border:1px solid #e2e8f0;padding:6px 8px;font-size:12px;vertical-align:middle;">${item.nome ?? '—'}</td>
      ${isCliente ? `<td style="border:1px solid #e2e8f0;padding:6px 8px;font-size:12px;vertical-align:middle;">${item.cores ?? '—'}</td>` : ''}
      ${gradeCells}
      <td style="border:1px solid #e2e8f0;padding:6px;text-align:center;font-size:12px;font-weight:600;vertical-align:middle;">${item.total_pares}</td>
      <td style="border:1px solid #e2e8f0;padding:6px 8px;text-align:right;font-size:12px;vertical-align:middle;">${formatCurrency(item.valor_unitario)}</td>
      <td style="border:1px solid #e2e8f0;padding:6px 8px;text-align:right;font-size:12px;font-weight:600;vertical-align:middle;">${formatCurrency(item.subtotal)}</td>
    </tr>`;
  }).join('');

  const enderecoHtml = pedido.cliente_cep
    ? `<p style="margin:2px 0;font-size:12px;color:#64748b;">${pedido.cliente_endereco ?? ''}, ${pedido.cliente_bairro ?? ''} — ${pedido.cliente_cidade ?? ''}/${pedido.cliente_estado ?? ''} — CEP ${pedido.cliente_cep}</p>`
    : '';

  const totalHtml = isCliente ? `
    <div style="margin-top:24px;border-top:2px solid #6366f1;padding-top:16px;">
      <table style="width:280px;margin-left:auto;border-collapse:collapse;">
        <tr><td style="padding:4px 8px;font-size:13px;color:#64748b;">Subtotal itens</td><td style="padding:4px 8px;font-size:13px;text-align:right;">${formatCurrency(itens.reduce((s, i) => s + i.subtotal, 0))}</td></tr>
        ${pedido.silk_logo ? `<tr><td style="padding:4px 8px;font-size:13px;color:#64748b;">Silk screen na logo</td><td style="padding:4px 8px;font-size:13px;text-align:right;">${formatCurrency(100)}</td></tr>` : ''}
        <tr><td style="padding:4px 8px;font-size:13px;color:#64748b;">Frete</td><td style="padding:4px 8px;font-size:13px;text-align:right;">${formatCurrency(pedido.frete)}</td></tr>
        <tr><td style="padding:4px 8px;font-size:13px;color:#64748b;">Desconto</td><td style="padding:4px 8px;font-size:13px;text-align:right;color:#dc2626;">- ${formatCurrency(pedido.desconto)}</td></tr>
        <tr style="border-top:1px solid #e2e8f0;"><td style="padding:8px;font-size:15px;font-weight:700;">TOTAL</td><td style="padding:8px;font-size:15px;font-weight:700;text-align:right;color:#6366f1;">${formatCurrency(pedido.total)}</td></tr>
      </table>
    </div>` : '';

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>*{box-sizing:border-box;}body{font-family:Arial,sans-serif;color:#1e293b;margin:0;padding:32px;}table{border-collapse:collapse;width:100%;}</style></head><body>
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;padding-bottom:16px;border-bottom:3px solid #6366f1;">
      <div>
        <h1 style="margin:0 0 4px;font-size:20px;color:#6366f1;">${isCliente ? 'Pedido Private Label' : 'Ordem de Produção'}</h1>
        <p style="margin:0;font-size:12px;color:#94a3b8;">Emitido em ${now}</p>
        ${pedido.prazo_entrega ? `<p style="margin:4px 0 0;font-size:12px;color:#64748b;">Prazo: <strong>${pedido.prazo_entrega}</strong></p>` : ''}
      </div>
      ${logoBase64 ? `<img src="${logoBase64}" style="max-height:60px;max-width:120px;object-fit:contain;" alt="Logo" />` : ''}
    </div>
    <div style="margin-bottom:24px;padding:12px 16px;background:#f8faff;border-radius:8px;">
      <h2 style="margin:0 0 8px;font-size:13px;color:#6366f1;text-transform:uppercase;letter-spacing:.05em;">Cliente</h2>
      <p style="margin:2px 0;font-size:13px;font-weight:600;">${pedido.cliente_nome ?? '—'}</p>
      ${pedido.cliente_cnpj ? `<p style="margin:2px 0;font-size:12px;color:#64748b;">CNPJ: ${pedido.cliente_cnpj}</p>` : ''}
      ${pedido.cliente_telefone ? `<p style="margin:2px 0;font-size:12px;color:#64748b;">Tel: ${pedido.cliente_telefone}</p>` : ''}
      ${enderecoHtml}
    </div>
    <table>
      <thead>
        <tr>
          <th style="border:1px solid #e2e8f0;padding:8px;background:#f8fafc;width:60px;">Foto</th>
          <th style="border:1px solid #e2e8f0;padding:8px;background:#f8fafc;text-align:left;">Produto</th>
          ${isCliente ? '<th style="border:1px solid #e2e8f0;padding:8px;background:#f8fafc;">Cores</th>' : ''}
          ${GRADE_TAMANHOS.map(t => `<th style="border:1px solid #e2e8f0;padding:8px;background:#f8fafc;text-align:center;">${t}</th>`).join('')}
          <th style="border:1px solid #e2e8f0;padding:8px;background:#f8fafc;text-align:center;">Total Pares</th>
          <th style="border:1px solid #e2e8f0;padding:8px;background:#f8fafc;text-align:right;">Preço Un.</th>
          <th style="border:1px solid #e2e8f0;padding:8px;background:#f8fafc;text-align:right;">Subtotal</th>
        </tr>
      </thead>
      <tbody>${linhasItens}</tbody>
    </table>
    ${totalHtml}
    ${pedido.observacoes ? `<div style="margin-top:20px;padding:12px;background:#f8fafc;border-left:3px solid #6366f1;border-radius:4px;"><p style="margin:0 0 4px;font-size:11px;font-weight:600;color:#6366f1;text-transform:uppercase;">Observações</p><p style="margin:0;font-size:12px;color:#64748b;">${pedido.observacoes}</p></div>` : ''}
    <div style="margin-top:40px;text-align:center;font-size:10px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:12px;">Documento gerado pelo VEXX CRM</div>
  </body></html>`;
}

/** Gera blob do PDF do cliente (para upload/envio) */
async function gerarBlob(
  pedido: PLPedido,
  itens: PLItem[],
): Promise<Blob> {
  const [fotoMap, logoBase64] = await Promise.all([
    Promise.all(itens.map(i => i.foto_url ? toBase64(i.foto_url) : Promise.resolve('')))
      .then(arr => Object.fromEntries(itens.map((i, idx) => [i.id, arr[idx]]))),
    pedido.cliente_logo_url ? toBase64(pedido.cliente_logo_url) : Promise.resolve(''),
  ]);

  const html = buildPdfHtml(pedido, itens, 'cliente', fotoMap, logoBase64);

  const win = window.open('', '_blank', 'width=960,height=700');
  if (!win) throw new Error('Pop-up bloqueado');
  win.document.write(html);
  win.document.close();
  await new Promise(r => setTimeout(r, 400));

  const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
    import('jspdf'), import('html2canvas'),
  ]);
  const canvas  = await html2canvas(win.document.body, { scale: 2, useCORS: true });
  win.close();

  const imgData = canvas.toDataURL('image/png');
  const pdf     = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const w = pdf.internal.pageSize.getWidth();
  const h = (canvas.height * w) / canvas.width;
  let y = 0;
  const pageH = pdf.internal.pageSize.getHeight();
  while (y < h) {
    if (y > 0) pdf.addPage();
    pdf.addImage(imgData, 'PNG', 0, -y, w, h);
    y += pageH;
  }
  return pdf.output('blob');
}

export function PdfPrivateLabel({ pedido, itens }: Props) {
  const [gerando,  setGerando]  = useState<'cliente' | 'producao' | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [enviado,  setEnviado]  = useState(false);
  const token = useAuthStore((s) => s.accessToken);

  async function gerarPdf(modo: 'cliente' | 'producao') {
    setGerando(modo);
    try {
      // Converte todas as imagens para base64 antes de renderizar
      const [logoBase64, ...fotosBase64] = await Promise.all([
        pedido.cliente_logo_url ? toBase64(pedido.cliente_logo_url) : Promise.resolve(''),
        ...itens.map(i => i.foto_url ? toBase64(i.foto_url) : Promise.resolve('')),
      ]);
      const fotoMap: Record<string, string> = {};
      itens.forEach((item, idx) => { fotoMap[item.id] = fotosBase64[idx] ?? ''; });

      const html = buildPdfHtml(pedido, itens, modo, fotoMap, logoBase64);
      const win  = window.open('', '_blank', 'width=960,height=700');
      if (!win) { alert('Permite pop-ups para gerar o PDF.'); return; }
      win.document.write(html);
      win.document.close();
      await new Promise(r => setTimeout(r, 400));
      const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([import('jspdf'), import('html2canvas')]);
      const canvas  = await html2canvas(win.document.body, { scale: 2, useCORS: true });
      win.close();
      const imgData = canvas.toDataURL('image/png');
      const pdf     = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const w = pdf.internal.pageSize.getWidth();
      const h = (canvas.height * w) / canvas.width;
      let y = 0;
      const pageH = pdf.internal.pageSize.getHeight();
      while (y < h) {
        if (y > 0) pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, -y, w, h);
        y += pageH;
      }
      pdf.save(`PL_${modo}_${(pedido.cliente_nome ?? 'pedido').replace(/\s+/g, '_')}.pdf`);
    } catch (err) {
      console.error('[PDF]', err);
    } finally {
      setGerando(null);
    }
  }

  async function enviarWhatsApp() {
    if (!pedido.cliente_telefone) {
      alert('Cadastre o telefone do cliente antes de enviar.');
      return;
    }
    setEnviando(true);
    try {
      const blob = await gerarBlob(pedido, itens);

      const formData = new FormData();
      const nomeArq  = `PL_${(pedido.cliente_nome ?? 'pedido').replace(/\s+/g, '_')}.pdf`;
      formData.append('file', blob, nomeArq);

      const uploadRes  = await fetch('/api/upload', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      if (!uploadRes.ok) throw new Error('Falha no upload do PDF');
      const { url } = await uploadRes.json() as { url: string };

      const sendRes = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          to:       pedido.cliente_telefone,
          type:     'document',
          mediaUrl: url,
          caption:  `Pedido Private Label — ${pedido.cliente_nome ?? ''}`,
        }),
      });
      if (!sendRes.ok) {
        const err = await sendRes.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? 'Falha ao enviar');
      }

      setEnviado(true);
      setTimeout(() => setEnviado(false), 4000);
    } catch (err: any) {
      alert(`Erro ao enviar: ${err?.message ?? err}`);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {(['cliente', 'producao'] as const).map(modo => (
        <button
          key={modo}
          onClick={() => gerarPdf(modo)}
          disabled={!!gerando || enviando}
          className="btn btn-ghost btn-sm"
        >
          {gerando === modo ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />}
          PDF {modo === 'cliente' ? 'Cliente' : 'Produção'}
        </button>
      ))}

      <button
        onClick={enviarWhatsApp}
        disabled={!!gerando || enviando}
        className={`btn btn-sm ${enviado ? 'btn-success' : 'btn-primary'}`}
        title={pedido.cliente_telefone ? `Enviar para ${pedido.cliente_telefone}` : 'Telefone não cadastrado'}
      >
        {enviando
          ? <Loader2 size={14} className="animate-spin" />
          : <Send size={14} />}
        {enviado ? 'Enviado!' : 'Enviar no WhatsApp'}
      </button>
    </div>
  );
}
