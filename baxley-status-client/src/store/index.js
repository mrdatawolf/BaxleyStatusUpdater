import { create } from 'zustand';

export const useStatusStore = create((set) => ({
  status: null,           // 'green' | 'yellow' | 'red' | null
  stage: null,            // null | 'process' | 'load' | 'scrape'
  detail: '',
  lastSuccess: null,      // ISO string
  checkedAt: null,        // ISO string
  connectionState: 'grey', // 'grey' | 'live' | 'black'

  setStatus: (payload) => set({
    status:      payload.status,
    stage:       payload.stage      ?? null,
    detail:      payload.detail     ?? '',
    lastSuccess: payload.lastSuccess ?? null,
    checkedAt:   payload.checkedAt  ?? null,
  }),

  setConnectionState: (connectionState) => set({ connectionState }),
}));

export const useSettingsStore = create((set) => ({
  mqttHost:  '',
  mqttPort:  1883,
  projectId: '',
  systemId:  '',

  setSettings: (s) => set({
    mqttHost:  s.mqttHost  || '',
    mqttPort:  s.mqttPort  || 1883,
    projectId: s.projectId || '',
    systemId:  s.systemId  || '',
  }),
}));
