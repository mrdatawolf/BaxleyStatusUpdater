import React from 'react';
import { Divider, Tag } from 'antd';
import {
  CheckCircleFilled, WarningFilled, CloseCircleFilled,
  ClockCircleOutlined, DatabaseOutlined,
} from '@ant-design/icons';
import { useStatusStore, useSettingsStore } from '../store';

const STATUS_CONFIG = {
  green: {
    color: '#52c41a',
    bg: '#162312',
    border: '#274916',
    icon: <CheckCircleFilled style={{ color: '#52c41a', fontSize: 22 }} />,
    label: 'All Good',
    tagColor: 'success',
  },
  yellow: {
    color: '#faad14',
    bg: '#2b2111',
    border: '#443111',
    icon: <WarningFilled style={{ color: '#faad14', fontSize: 22 }} />,
    label: 'Needs Attention',
    tagColor: 'warning',
  },
  red: {
    color: '#ff4d4f',
    bg: '#2a1215',
    border: '#431418',
    icon: <CloseCircleFilled style={{ color: '#ff4d4f', fontSize: 22 }} />,
    label: 'Pipeline Issue',
    tagColor: 'error',
  },
};

const STAGE_LABELS = {
  scrape:  { label: 'Data Delivery',  description: 'Raw CSV files did not arrive on the server' },
  process: { label: 'CSV Processing', description: 'CSV files arrived but were not converted to Excel' },
  load:    { label: 'Database Load',  description: 'Excel files exist but were not loaded into the database' },
};

function formatRelative(isoString) {
  if (!isoString) return 'Never';
  const diff = Date.now() - new Date(isoString).getTime();
  const hours = Math.floor(diff / 3_600_000);
  const mins  = Math.floor((diff % 3_600_000) / 60_000);
  if (hours > 48) return `${Math.floor(hours / 24)} days ago`;
  if (hours > 0)  return `${hours}h ${mins}m ago`;
  if (mins > 0)   return `${mins}m ago`;
  return 'Just now';
}

function formatDate(isoString) {
  if (!isoString) return '—';
  return new Date(isoString).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function Row({ icon, label, value, sub }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 0' }}>
      <span style={{ color: '#595959', fontSize: 16, marginTop: 1 }}>{icon}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 11, color: '#8c8c8c', marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: 13, color: '#d9d9d9' }}>{value}</div>
        {sub && <div style={{ fontSize: 11, color: '#595959', marginTop: 2 }}>{sub}</div>}
      </div>
    </div>
  );
}

// ─── Grey state — connecting, no data yet ─────────────────────────────────────

function GreyPanel() {
  const { projectId } = useSettingsStore();
  const notConfigured = !projectId;

  return (
    <div style={{ padding: 24, textAlign: 'center', color: '#595959' }}>
      <span className="status-dot grey" style={{ width: 44, height: 44, margin: '0 auto 16px', display: 'block' }} />
      {notConfigured ? (
        <>
          <p style={{ fontSize: 13, color: '#8c8c8c' }}>Not configured</p>
          <p style={{ fontSize: 11, marginTop: 8, color: '#595959' }}>
            Open Settings and enter your server share code.
          </p>
        </>
      ) : (
        <>
          <p style={{ fontSize: 13, color: '#8c8c8c' }}>Connecting…</p>
          <p style={{ fontSize: 11, marginTop: 8, color: '#595959' }}>
            Waiting for status from MQTT broker.
          </p>
        </>
      )}
    </div>
  );
}

// ─── Black state — connection lost or no updates in 24h ───────────────────────

function BlackPanel({ status, checkedAt }) {
  const hasLastKnown = status && checkedAt;
  return (
    <div style={{ padding: 24, textAlign: 'center' }}>
      <span className="status-dot black" style={{ width: 44, height: 44, margin: '0 auto 16px', display: 'block' }} />
      <div style={{ fontSize: 14, fontWeight: 600, color: '#595959', marginBottom: 8 }}>
        No Updates Received
      </div>
      <p style={{ fontSize: 12, color: '#434343', lineHeight: 1.6 }}>
        {hasLastKnown
          ? <>Last known status was <strong style={{ color: '#595959' }}>{status.toUpperCase()}</strong>, {formatRelative(checkedAt)}.<br />The monitor may have stopped or the broker is unreachable.</>
          : 'Cannot reach the MQTT broker or the monitor has stopped publishing.'}
      </p>
      {hasLastKnown && (
        <div style={{ marginTop: 16, fontSize: 11, color: '#3a3a3a' }}>
          Last update: {formatDate(checkedAt)}
        </div>
      )}
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export default function StatusPanel() {
  const { status, stage, detail, lastSuccess, checkedAt, connectionState } = useStatusStore();

  if (connectionState === 'black') {
    return <BlackPanel status={status} checkedAt={checkedAt} />;
  }

  if (!status) {
    return <GreyPanel />;
  }

  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.yellow;
  const stageInfo = stage ? STAGE_LABELS[stage] : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Status hero */}
      <div
        style={{
          padding: '20px 20px 16px',
          background: cfg.bg,
          borderBottom: `1px solid ${cfg.border}`,
          display: 'flex',
          alignItems: 'center',
          gap: 14,
        }}
      >
        <span className={`status-dot ${status}`} style={{ width: 44, height: 44 }} />
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: cfg.color, lineHeight: 1.2 }}>
            {cfg.label}
          </div>
          <div style={{ fontSize: 11, color: '#8c8c8c', marginTop: 3 }}>
            Checked {formatRelative(checkedAt)}
          </div>
        </div>
      </div>

      {/* Failed stage banner */}
      {stageInfo && (
        <div style={{
          background: '#1a1208', borderBottom: '1px solid #3d2b00',
          padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <WarningFilled style={{ color: '#faad14', fontSize: 14 }} />
          <div>
            <span style={{ fontSize: 12, color: '#faad14', fontWeight: 600 }}>
              Failed stage:&nbsp;
            </span>
            <Tag color="warning" style={{ fontSize: 11 }}>{stageInfo.label}</Tag>
            <div style={{ fontSize: 11, color: '#8c8c8c', marginTop: 2 }}>
              {stageInfo.description}
            </div>
          </div>
        </div>
      )}

      {/* Detail rows */}
      <div style={{ padding: '4px 20px', flex: 1 }}>
        {detail && (
          <>
            <Row icon="💬" label="Details" value={detail} />
            <Divider style={{ borderColor: '#2a2a2a', margin: '4px 0' }} />
          </>
        )}
        <Row
          icon={<DatabaseOutlined />}
          label="Last successful DB update"
          value={formatDate(lastSuccess)}
          sub={lastSuccess ? formatRelative(lastSuccess) : null}
        />
        <Row
          icon={<ClockCircleOutlined />}
          label="Last checked"
          value={formatDate(checkedAt)}
        />
      </div>

      {/* Pipeline stage legend */}
      <div style={{
        padding: '10px 20px 14px',
        borderTop: '1px solid #2a2a2a',
        background: '#1a1a1a',
      }}>
        <div style={{ fontSize: 10, color: '#595959', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>
          Pipeline stages
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {['Data Delivery', 'CSV Processing', 'DB Load'].map((s, i) => {
            const stageKeys = ['scrape', 'process', 'load'];
            const active = stageKeys[i] === stage;
            return (
              <div
                key={s}
                style={{
                  flex: 1, textAlign: 'center', padding: '4px 6px',
                  borderRadius: 4, fontSize: 10,
                  background: active ? '#2b2111' : '#262626',
                  color: active ? '#faad14' : '#595959',
                  border: `1px solid ${active ? '#443111' : '#2a2a2a'}`,
                }}
              >
                {s}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
