import React, { useState, useEffect } from 'react';
import { ConfigProvider, theme } from 'antd';
import { SettingOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import StatusPanel from './components/StatusPanel';
import Settings from './components/Settings';
import { useStatusStore, useSettingsStore } from './store';

// Map live status + connection state → the visual accent used for the
// panel tint and the header dot. grey/black connection states are neutral
// (no status color), per the reference's frosted-glass treatment.
export function resolveAccent(connectionState, status) {
  if (connectionState === 'black' || connectionState === 'grey') return 'neutral';
  if (status === 'green') return 'green';
  if (status === 'yellow') return 'amber';
  if (status === 'red') return 'red';
  return 'neutral';
}

export default function App() {
  const [view, setView] = useState('status'); // 'status' | 'settings'
  const setStatus = useStatusStore((s) => s.setStatus);
  const setConnectionState = useStatusStore((s) => s.setConnectionState);
  const setSettings = useSettingsStore((s) => s.setSettings);
  const connectionState = useStatusStore((s) => s.connectionState);
  const status = useStatusStore((s) => s.status);

  const accent = resolveAccent(connectionState, status);

  // Load initial state from main process
  useEffect(() => {
    window.electron?.getStatus().then(({ status, connectionState }) => {
      if (status) setStatus(status);
      setConnectionState(connectionState);
    });
    window.electron?.getSettings().then((s) => {
      if (s) setSettings(s);
    });
  }, []);

  // Subscribe to live MQTT pushes and connection state changes
  useEffect(() => {
    window.electron?.onStatus((payload) => setStatus(payload));
    window.electron?.onConnection((state) => setConnectionState(state));
  }, []);

  return (
    <ConfigProvider
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorPrimary: '#5de2a0',
          borderRadius: 11,
          // Fully transparent antd surfaces so nothing paints an opaque box
          // over the frosted panel.
          colorBgContainer: 'rgba(255,255,255,0.07)',
          colorBgElevated: 'rgba(40,40,46,0.92)',
          colorBgBase: 'transparent',
        },
      }}
    >
      <div className="panel">
        <div className={`tint ${accent}`} />

        <div className="head">
          <div className="brand">
            <span className={`dot ${accent}`} />
            Baxley
          </div>
          <button
            className="gear"
            onClick={() => setView(view === 'status' ? 'settings' : 'status')}
            title={view === 'status' ? 'Settings' : 'Back'}
          >
            {view === 'status' ? <SettingOutlined /> : <ArrowLeftOutlined />}
          </button>
        </div>

        <div className="panel-scroll">
          {view === 'status'
            ? <StatusPanel />
            : <Settings onSaved={() => setView('status')} />}
        </div>
      </div>
    </ConfigProvider>
  );
}
