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

  const labelStyle = { color: '#8c8c8c', fontSize: 12 };
  const sectionHeader = (text) => (
    <div style={{ fontSize: 10, color: '#595959', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
      {text}
    </div>
  );

  return (
    <div style={{ padding: '16px 20px', overflowY: 'auto', height: '100%' }}>

      {/* ── Share code ── */}
      {sectionHeader('Quick setup')}
      <div style={{ marginBottom: 4, fontSize: 12, color: '#8c8c8c' }}>
        Paste the share code from the API server's startup log to auto-fill all settings.
      </div>
      <Space.Compact style={{ width: '100%', marginBottom: 20 }}>
        <Input
          value={shareCode}
          onChange={(e) => setShareCode(e.target.value)}
          placeholder="Paste share code here…"
          style={{ background: '#1a1a1a', color: '#d9d9d9', borderColor: '#3a3a3a' }}
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

      <Divider style={{ borderColor: '#2a2a2a', margin: '0 0 16px' }} />

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
            style={{ background: '#1a1a1a', color: '#d9d9d9', borderColor: '#3a3a3a' }}
          />
        </Form.Item>

        <Form.Item
          label={<span style={labelStyle}>MQTT port</span>}
          name="mqttPort"
          rules={[{ required: true }]}
        >
          <InputNumber
            min={1} max={65535} style={{ width: '100%', background: '#1a1a1a', borderColor: '#3a3a3a' }}
          />
        </Form.Item>

        <Form.Item
          label={<span style={labelStyle}>Project ID (UUID)</span>}
          name="projectId"
          rules={[{ required: true, message: 'Required' }]}
        >
          <Input
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            style={{ background: '#1a1a1a', color: '#d9d9d9', borderColor: '#3a3a3a', fontFamily: 'monospace', fontSize: 11 }}
          />
        </Form.Item>

        <Form.Item
          label={<span style={labelStyle}>System ID (UUID)</span>}
          name="systemId"
          rules={[{ required: true, message: 'Required' }]}
        >
          <Input
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            style={{ background: '#1a1a1a', color: '#d9d9d9', borderColor: '#3a3a3a', fontFamily: 'monospace', fontSize: 11 }}
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

      <Divider style={{ borderColor: '#2a2a2a', margin: '16px 0 10px' }} />

      <Text style={{ fontSize: 10, color: '#434343' }}>
        Topic IDs are UUIDs — they reveal nothing to anyone monitoring the broker.
        Keep your share code private.
      </Text>
    </div>
  );
}
