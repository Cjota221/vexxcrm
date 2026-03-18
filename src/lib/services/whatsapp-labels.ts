/**
 * Serviço de etiquetas do WhatsApp via Evolution API
 * POST /chat/updateChatLabel/{instance}
 */

const EVO_URL = process.env.EVOLUTION_API_URL!;
const EVO_KEY = process.env.EVOLUTION_API_KEY!;
const EVO_INSTANCE = process.env.EVOLUTION_INSTANCE!;

/** Aplicar etiqueta em um chat pelo número de telefone */
export async function applyLabel(phone: string, labelName: string): Promise<boolean> {
  try {
    const number = phone.replace(/\D/g, '');
    const response = await fetch(`${EVO_URL}/chat/updateChatLabel/${EVO_INSTANCE}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: EVO_KEY },
      body: JSON.stringify({ number, label: labelName, action: 'add' }),
    });
    return response.ok;
  } catch (err) {
    console.error('[Labels] Erro ao aplicar etiqueta:', err);
    return false;
  }
}

/** Remover etiqueta de um chat */
export async function removeLabel(phone: string, labelName: string): Promise<boolean> {
  try {
    const number = phone.replace(/\D/g, '');
    const response = await fetch(`${EVO_URL}/chat/updateChatLabel/${EVO_INSTANCE}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: EVO_KEY },
      body: JSON.stringify({ number, label: labelName, action: 'remove' }),
    });
    return response.ok;
  } catch (err) {
    console.error('[Labels] Erro ao remover etiqueta:', err);
    return false;
  }
}
