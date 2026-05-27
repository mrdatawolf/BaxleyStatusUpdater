'use strict';
const path = require('path');

// Join a base path with a sub-path using forward slash, stripping any trailing
// separator from base. Works for both Windows drive paths and URLs.
function joinPath(base, sub) {
  if (!base) return sub || '';
  if (!sub) return base;
  return `${base.replace(/[/\\]+$/, '')}/${sub}`;
}

function buildConfig(env) {
  // PROJECT_ID and SYSTEM_ID are written to .env on first run by index.js.
  const projectId = env.PROJECT_ID;
  const systemId  = env.SYSTEM_ID;

  const mqttHost   = env.MQTT_BROKER_HOST || 'localhost';
  const mqttPort   = parseInt(env.MQTT_BROKER_PORT || '1883', 10);
  const mqttWsPort = parseInt(env.MQTT_WS_PORT || '9001', 10);

  // The topic clients subscribe to — opaque UIDs reveal nothing to sniffers
  const statusTopic = `${projectId}/${systemId}/status`;

  // Share code encodes everything a client needs to connect
  const sharePayload = { mqttHost, mqttPort, mqttWsPort, projectId, systemId };
  const shareCode = Buffer.from(JSON.stringify(sharePayload)).toString('base64');

  const basePath = env.BASE_PATH || '';

  return {
    // Paths — DB_PATH is independent; all ETL folder paths are relative to BASE_PATH
    dbPath:            env.DB_PATH             || '',
    csvNewPath:        joinPath(basePath, env.CSV_NEW_PATH        || ''),
    csvFinishedPath:   joinPath(basePath, env.CSV_FINISHED_PATH   || ''),
    excelBasePath:     joinPath(basePath, env.EXCEL_BASE_PATH     || ''),
    excelTotalPath:    joinPath(basePath, env.EXCEL_TOTAL_PATH    || ''),
    excelFinalPath:    joinPath(basePath, env.EXCEL_FINAL_PATH    || ''),
    logPath:           joinPath(basePath, env.LOG_PATH            || ''),

    // Thresholds
    greenThresholdHours: parseFloat(env.GREEN_THRESHOLD_HOURS || '26'),

    // MQTT
    mqttBrokerHost: mqttHost,
    mqttBrokerPort: parseInt(env.MQTT_BROKER_PORT || '1883', 10),
    mqttWsPort,
    mqttUsername:   env.MQTT_USERNAME || '',
    mqttPassword:   env.MQTT_PASSWORD || '',
    statusTopic,
    shareCode,

    // Schedule / API
    checkCron:     env.CHECK_CRON    || '*/10 * * * *',
    apiPort:       parseInt(env.API_PORT || '3847', 10),
    apiCorsOrigin: env.API_CORS_ORIGIN || '*',
    historyDbPath: env.HISTORY_DB_PATH || path.join(__dirname, '..', 'data', 'history.db'),
  };
}

module.exports = { buildConfig };
