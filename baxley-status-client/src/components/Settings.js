import React, { useState, useEffect } from 'react';
import { Form, Input, InputNumber, Button, Divider, message, Space, Typography } from 'antd';
import { SaveOutlined, LinkOutlined } from '@ant-design/icons';
import { useSettingsStore } from '../store';

const { Text } = Typography;

export default function Settings({ onSaved }) {
  const [form] = Form.useForm();
  const [shareCode, setShareCode] = useState('');
  const [saving, setSaving] = useState(false);
  const setStoreSettings = useSettingsStore((s) => s.setSettings);
  const storeSettings = useSettingsStore((s) => s);

  useEffect(() => {
    form.setFieldsValue({
      mqttHost:  storeSettings.mqttHost,
      mqttPort:  storeSettings.mqttPort,
      projectId: storeSettings.projectId,
      systemId:  storeSettings.systemId,
    });
  }, [storeSettings.mqttHost]);

  async function applyShareCode() {
    if (!shareCode.trim()) return;
    setSaving(true);
    try {
      const result = await window.electron.saveSettings({ shareCode: shareCode.trim() });
      if (result.ok) {
        const updated = await window.electron.getSettings();
        setStoreSettings(updated);
        form.setFieldsValue(updated);
        setShareCode('');
        onSaved?.();
      } else {
        message.error(result.error || 'Invalid share code');
      }
    } finally {
      setSaving(false);
    }
  }

  async function saveManual(values) {
    setSaving(true);
    try {
      const result = await window.electron.saveSettings(values);
      if (result.ok) {
        setStoreSettings(values);
        onSaved?.();
      } else {
        message.error(result.error || 'Failed to save');
      }
    } finally {
      setSaving(false);
    }
  }

  const labelStyle = { color: 'rgba(255,255,255,0.78)', fontSize: 12 };
  const sectionHeader = (text) => (
    <div className="section-head">{text}</div>
  );

  const inputStyle = {
    background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.92)',
    borderColor: 'rgba(255,255,255,0.15)',
  };

  return (
    <div className="settings-body">

      {/* ── Share code ── */}
      {sectionHeader('Quick setup')}
      <div className="settings-hint">
        Paste the share code from the API server's startup log to auto-fill all settings.
      </div>
      <Space.Compact style={{ width: '100%', marginBottom: 12 }}>
        <Input
          value={shareCode}
          onChange={(e) => setShareCode(e.target.value)}
          placeholder="Paste share code here…"
          style={inputStyle}
        />
        <Button
          type="primary"
          icon={<LinkOutlined />}
          onClick={applyShareCode}
          loading={saving}
        >
          Apply
        </Button>
      </Space.Compact>

      <Divider style={{ borderColor: 'rgba(255,255,255,0.10)', margin: '0 0 10px' }} />

      {/* ── Manual fields ── */}
      {sectionHeader('Manual configuration')}
      <Form
        form={form}
        layout="vertical"
        onFinish={saveManual}
        size="small"
        style={{ color: '#d9d9d9' }}
      >
        <Form.Item
          label={<span style={labelStyle}>MQTT broker host</span>}
          name="mqttHost"
          rules={[{ required: true, message: 'Required' }]}
        >
          <Input
            placeholder="192.168.1.100"
            style={inputStyle}
          />
        </Form.Item>

        <Form.Item
          label={<span style={labelStyle}>MQTT port</span>}
          name="mqttPort"
          rules={[{ required: true }]}
        >
          <InputNumber
            min={1} max={65535} style={{ width: '100%', ...inputStyle }}
          />
        </Form.Item>

        <Form.Item
          label={<span style={labelStyle}>Project ID (UUID)</span>}
          name="projectId"
          rules={[{ required: true, message: 'Required' }]}
        >
          <Input
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 11 }}
          />
        </Form.Item>

        <Form.Item
          label={<span style={labelStyle}>System ID (UUID)</span>}
          name="systemId"
          rules={[{ required: true, message: 'Required' }]}
        >
          <Input
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 11 }}
          />
        </Form.Item>

        <Form.Item style={{ marginBottom: 0 }}>
          <Button
            type="primary"
            htmlType="submit"
            icon={<SaveOutlined />}
            loading={saving}
            block
          >
            Save & Reconnect
          </Button>
        </Form.Item>
      </Form>

      <Divider style={{ borderColor: 'rgba(255,255,255,0.10)', margin: '10px 0 8px' }} />

      <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.50)' }}>
        Topic IDs are UUIDs — they reveal nothing to anyone monitoring the broker.
        Keep your share code private.
      </Text>
    </div>
  );
}
