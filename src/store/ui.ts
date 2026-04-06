import { create } from 'zustand';

interface UIState {
  /** Sidebar expandida ou colapsada */
  sidebarExpanded: boolean;
  /** Sidebar aberta como drawer no mobile */
  mobileSidebarOpen: boolean;
  /** CRM sidebar visível (no atendimento) */
  crmSidebarOpen: boolean;
  /** Modal ativa (null = nenhuma) */
  activeModal: string | null;
  /** Dados do modal ativo */
  modalData: unknown;
  /** Toast messages */
  toasts: Toast[];

  /** Aba ativa no módulo de Tráfego Pago */
  trafegoTab: string;
  /** Aprovações pendentes no módulo de Tráfego */
  trafegoPendentes: number;

  /** Toggle sidebar */
  toggleSidebar: () => void;
  setSidebarExpanded: (expanded: boolean) => void;

  /** Toggle sidebar drawer no mobile */
  toggleMobileSidebar: () => void;
  setMobileSidebarOpen: (open: boolean) => void;

  /** Toggle CRM sidebar */
  toggleCrmSidebar: () => void;
  setCrmSidebarOpen: (open: boolean) => void;

  /** Modais */
  openModal: (id: string, data?: unknown) => void;
  closeModal: () => void;

  /** Toasts */
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;

  /** Tráfego */
  setTrafegoTab: (tab: string) => void;
  setTrafegoPendentes: (count: number) => void;
}

export interface Toast {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message?: string;
  duration?: number;
}

export const useUIStore = create<UIState>()((set) => ({
  sidebarExpanded: true,
  mobileSidebarOpen: false,
  crmSidebarOpen: true,
  activeModal: null,
  modalData: null,
  toasts: [],
  trafegoTab: 'campanhas',
  trafegoPendentes: 0,

  toggleSidebar: () =>
    set((state) => ({ sidebarExpanded: !state.sidebarExpanded })),

  setSidebarExpanded: (expanded) =>
    set({ sidebarExpanded: expanded }),

  toggleMobileSidebar: () =>
    set((state) => ({ mobileSidebarOpen: !state.mobileSidebarOpen })),

  setMobileSidebarOpen: (open) =>
    set({ mobileSidebarOpen: open }),

  toggleCrmSidebar: () =>
    set((state) => ({ crmSidebarOpen: !state.crmSidebarOpen })),

  setCrmSidebarOpen: (open) =>
    set({ crmSidebarOpen: open }),

  openModal: (id, data) =>
    set({ activeModal: id, modalData: data }),

  closeModal: () =>
    set({ activeModal: null, modalData: null }),

  addToast: (toast) =>
    set((state) => ({
      toasts: [
        ...state.toasts,
        { ...toast, id: `toast-${Date.now()}-${Math.random().toString(36).slice(2)}` },
      ],
    })),

  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),

  setTrafegoTab: (tab) => set({ trafegoTab: tab }),
  setTrafegoPendentes: (count) => set({ trafegoPendentes: count }),
}));
