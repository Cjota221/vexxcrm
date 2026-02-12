import { create } from 'zustand';

type ConnectionStatus = 'connected' | 'disconnected' | 'connecting' | 'unknown';

interface ConnectionState {
  /** Status da conexão WhatsApp */
  whatsappStatus: ConnectionStatus;
  /** Status da conexão SSE */
  sseStatus: ConnectionStatus;
  /** QR Code para conexão (base64) */
  qrCode: string | null;
  /** Nome da instância Evolution */
  instanceName: string | null;

  /** Atualizar status WhatsApp */
  setWhatsAppStatus: (status: ConnectionStatus) => void;
  /** Atualizar status SSE */
  setSSEStatus: (status: ConnectionStatus) => void;
  /** Definir QR Code */
  setQRCode: (qr: string | null) => void;
  /** Definir instância */
  setInstanceName: (name: string | null) => void;
}

export const useConnectionStore = create<ConnectionState>()((set) => ({
  whatsappStatus: 'unknown',
  sseStatus: 'disconnected',
  qrCode: null,
  instanceName: null,

  setWhatsAppStatus: (status) => set({ whatsappStatus: status }),
  setSSEStatus: (status) => set({ sseStatus: status }),
  setQRCode: (qr) => set({ qrCode: qr }),
  setInstanceName: (name) => set({ instanceName: name }),
}));
