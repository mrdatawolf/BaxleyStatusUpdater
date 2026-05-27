import React, { useState, useEffect } from 'react';
import { ConfigProvider, theme } from 'antd';
import StatusPanel from './components/StatusPanel';
import Settings from './components/Settings';
import { useStatusStore, useSettingsStore } from './store';

export default function App() {
  const [view, setView] = useState('status'); // 'status' | 'settings'
  const setStatus = useStatusStore((s) => s.setStatus);
  const setConnectionState = useStatusStore((s) => s.setConnectionState);
  const setSettings = useSettingsStore((s) => s.setSettings);
  const connectionState = useStatusStore((s) => s.connectionState);
  const status = useStatusStore((s) => s.status);

  const headerDotColor =
    connectionState === 'black' ? '#3a3a3a' :
    connectionState === 'grey'  ? '#595959' :
    status === 'green'  ? '#52c41a' :
    status === 'yellow' ? '#faad14' :
    status === 'red'    ? '#ff4d4f' : '#595959';

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
          colorPrimary: '#52c41a',
          borderRadius: 6,
          colorBgContainer: '#1f1f1f',
          colorBgElevated: '#262626',
        },
      }}
    >
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#141414' }}>
        <header className="app-header">
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: headerDotColor, flexShrink: 0,
            transition: 'background 0.4s',
          }} />
          <span style={{ fontSize: 14, fontWeight: 700, color: '#e0e0e0', flex: 1 }}>
            Baxley Pipeline Monitor
          </span>
          <button
            onClick={() => setView(view === 'status' ? 'settings' : 'status')}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#8c8c8c', fontSize: 18, padding: '0 4px',
              '-webkit-app-region': 'no-drag',
            }}
            title={view === 'status' ? 'Settings' : 'Back'}
          >
            {view === 'status' ? '⚙' : '←'}
          </button>
        </header>

        <div className="app-content" style={{ flex: 1, overflow: 'auto' }}>
          {view === 'status' ? <StatusPanel /> : <Settings onSaved={() => setView('status')} />}
        </div>
      </div>
    </ConfigProvider>
  );
}
