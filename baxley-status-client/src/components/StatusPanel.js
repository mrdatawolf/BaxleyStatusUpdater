import React from 'react';
import { useStatusStore, useSettingsStore } from '../store';

// Hero config per live status. Single ring + centered glyph (no dark disc).
// Glyphs use thin unicode marks to match the reference's 300-weight glyph.
const STATUS_CONFIG = {
  green:  { accent: 'green', glyph: '✓', title: 'All good' },          // ✓
  yellow: { accent: 'amber', glyph: '⚠', title: 'Needs attention' },   // ⚠
  red:    { accent: 'red',   glyph: '✕', title: 'Pipeline issue' },    // ✕
};

// Pipeline stages in order. Payload `stage` (scrape/process/load) names the
// FAILED stage — map: scrape→Delivery, process→Processing, load→DB load.
const STAGES = [
  { key: 'scrape',  label: 'Delivery',   banner: 'Failed at data delivery',  description: 'Raw CSV files did not arrive on the server.' },
  { key: 'process', label: 'Processing', banner: 'Failed at CSV processing', description: 'CSV files arrived but were not converted to Excel.' },
  { key: 'load',    label: 'DB load',    banner: 'Failed at database load',  description: 'Excel files exist but were not loaded into the database.' },
];

const STAGE_BY_KEY = Object.fromEntries(STAGES.map((s) => [s.key, s]));

const INFO  = 'ℹ'; // ℹ
const CHECK = '✓'; // ✓
const CROSS = '✕'; // ✕
const WARN  = '⚠'; // ⚠

function formatRelative(isoString) {
  if (!isoString) return 'never';
  const diff = Date.now() - new Date(isoString).getTime();
  const hours = Math.floor(diff / 3_600_000);
  const mins  = Math.floor((diff % 3_600_000) / 60_000);
  if (hours > 48) return `${Math.floor(hours / 24)} days ago`;
  if (hours > 0)  return `${hours}h ${mins}m ago`;
  if (mins > 0)   return `${mins}m ago`;
  return 'just now';
}

function formatDate(isoString) {
  if (!isoString) return '—';
  return new Date(isoString).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

// ─── Stage chips ──────────────────────────────────────────────────────────────
// green  → all chips ok (check)
// yellow → failed chip amber, rest idle
// red    → failed chip red, rest idle
function StageChips({ status, stage }) {
  return (
    <div className="stages">
      {STAGES.map((s) => {
        const isFailed = s.key === stage;
        let cls = 'chip';
        let glyph = null;

        if (status === 'green') {
          cls += ' ok';
          glyph = CHECK;
        } else if (isFailed && status === 'red') {
          cls += ' fail';
          glyph = CROSS;
        } else if (isFailed) {
          cls += ' fail-amber';
          glyph = WARN;
        } else {
          cls += ' idle';
        }

        return (
          <div key={s.key} className={cls} title={s.description}>
            {glyph && <span>{glyph}</span>}
            <span>{s.label}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Neutral hero (grey / black connection states — no status color) ──────────

function NeutralHero({ glyph, title, sub }) {
  return (
    <div className="hero">
      <div className="ring neutral">
        <span className="glyph neutral">{glyph}</span>
      </div>
      <div className="htitle">{title}</div>
      <div className="hsub">{sub}</div>
    </div>
  );
}

// ─── Grey state — connecting / no share code ──────────────────────────────────

function GreyPanel() {
  const { projectId } = useSettingsStore();
  const notConfigured = !projectId;
  return (
    <>
      <NeutralHero
        glyph={notConfigured ? INFO : '⋯'}  /* ℹ or ⋯ (loading) */
        title={notConfigured ? 'Not configured' : 'Connecting…'}
        sub={notConfigured ? 'Open settings to begin' : 'Waiting for status'}
      />
      <div className="card">
        <div className="row">
          <span className="ico">{INFO}</span>
          <span className="body">
            {notConfigured
              ? 'Open Settings and enter your server share code.'
              : 'Waiting for status from the MQTT broker.'}
          </span>
        </div>
      </div>
    </>
  );
}

// ─── Black state — broker unreachable / no updates in 24h ─────────────────────

function BlackPanel({ status, checkedAt }) {
  const hasLastKnown = status && checkedAt;
  return (
    <>
      <NeutralHero
        glyph={'⧖'}  /* ⧖ hourglass / stale-clock */
        title="No updates"
        sub={hasLastKnown ? `Last seen ${formatRelative(checkedAt)}` : 'Broker unreachable'}
      />
      <div className="card">
        <div className="row">
          <span className="ico">{INFO}</span>
          <span className="body">
            {hasLastKnown
              ? `Last known status was ${status.toUpperCase()}. The monitor may have stopped or the broker is unreachable.`
              : 'Cannot reach the MQTT broker or the monitor has stopped publishing.'}
          </span>
        </div>
      </div>
      {hasLastKnown && (
        <div className="meta">
          <div className="card">
            <div className="lbl">Last checked</div>
            <div className="val">{formatDate(checkedAt)}</div>
          </div>
        </div>
      )}
    </>
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
  const stageInfo = stage ? STAGE_BY_KEY[stage] : null;
  const isRed = status === 'red';

  return (
    <>
      {/* Hero: single ring + centered glyph */}
      <div className="hero">
        <div className={`ring ${cfg.accent}`}>
          <span className={`glyph ${cfg.accent}`}>{cfg.glyph}</span>
        </div>
        <div className="htitle">{cfg.title}</div>
        <div className="hsub">Checked {formatRelative(checkedAt)}</div>
      </div>

      {/* Failed-stage banner (yellow/red only) */}
      {stageInfo && status !== 'green' && (
        <div className={`banner${isRed ? '' : ' amber'}`}>
          <span className={`glyph ${cfg.accent}`} style={{ fontSize: 15 }}>
            {isRed ? CROSS : WARN}
          </span>
          <div>
            <div className="bt">{stageInfo.banner}</div>
            <div className="bs">{stageInfo.description}</div>
          </div>
        </div>
      )}

      {/* Details body */}
      {detail && (
        <div className="card" style={{ marginTop: stageInfo && status !== 'green' ? 10 : 0 }}>
          <div className="row">
            <span className="ico">{INFO}</span>
            <span className="body">{detail}</span>
          </div>
        </div>
      )}

      {/* Meta: Last DB update / Last checked side by side */}
      <div className="meta">
        <div className="card">
          <div className="lbl">Last DB update</div>
          <div className="val">{formatDate(lastSuccess)}</div>
        </div>
        <div className="card">
          <div className="lbl">Last checked</div>
          <div className="val">{formatDate(checkedAt)}</div>
        </div>
      </div>

      {/* Pipeline stages */}
      <div className="section-lbl">Pipeline stages</div>
      <StageChips status={status} stage={stage} />
    </>
  );
}
