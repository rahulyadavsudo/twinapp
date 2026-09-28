import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { GoogleGenAI, FunctionDeclaration, Type } from '@google/genai';
import {
  Machine,
  ProductionLine,
  Factory,
  TelemetryPoint,
  Alert,
  AlertType,
  MaintenanceRecord,
  Incident,
  KafkaEventEnvelope,
  AuditLogEntry,
  FailureScenarioType,
  HealthStatus,
  OperatingState,
  UserRole,
  McpToolCallTrace,
  AiDiagnosticResponse,
  ChaosExperimentResult,
  SystemObservability
} from './src/types/twin.ts';
import { PRODUCTION_RUNBOOKS, RAG_KNOWLEDGE_BASE } from './src/data/knowledgeBase.ts';

dotenv.config();

const app = express();
app.use(express.json());

// ============================================================================
// 1. INITIAL FACTORY-A ASSETS, STATE, TELEMETRY & HISTORY STORE
// ============================================================================

const INITIAL_MACHINES: Omit<Machine, 'latest_telemetry' | 'health_breakdown'>[] = [
  {
    id: 'CNC-001',
    name: '5-Axis Milling Center Alpha',
    type: 'CNC Milling Center',
    manufacturer: 'DMG MORI',
    model: 'DMU 50 3rd Gen',
    serial_number: 'DM-88412-A',
    factory_id: 'FAC-A',
    factory_name: 'Factory-A (Munich Precision Plant)',
    line_id: 'LINE-1',
    line_name: 'Line 1 — Precision Machining & Robotics',
    location: 'Bay A1 · North Wing',
    operating_state: 'RUNNING',
    status: 'WATCH',
    health_score: 78,
    risk_level: 'WATCH',
    firmware_version: 'v4.12.8-rt',
    last_seen: new Date().toISOString(),
    maintenance_state: 'SCHEDULED',
    telemetry_interval_ms: 2000,
    active_failures: ['bearing_degradation'],
    mqtt_topic: 'factory/FAC-A/line/LINE-1/machine/CNC-001/telemetry'
  },
  {
    id: 'CNC-002',
    name: 'Multi-Spindle Turning Center Beta',
    type: 'CNC Turning Center',
    manufacturer: 'Mazak',
    model: 'Integrex i-200H',
    serial_number: 'MZ-44910-B',
    factory_id: 'FAC-A',
    factory_name: 'Factory-A (Munich Precision Plant)',
    line_id: 'LINE-1',
    line_name: 'Line 1 — Precision Machining & Robotics',
    location: 'Bay A2 · North Wing',
    operating_state: 'RUNNING',
    status: 'HEALTHY',
    health_score: 96,
    risk_level: 'HEALTHY',
    firmware_version: 'v4.12.8-rt',
    last_seen: new Date().toISOString(),
    maintenance_state: 'OPERATIONAL',
    telemetry_interval_ms: 2000,
    active_failures: [],
    mqtt_topic: 'factory/FAC-A/line/LINE-1/machine/CNC-002/telemetry'
  },
  {
    id: 'ROBOT-001',
    name: '6-Axis Articulated Handling Arm',
    type: 'Industrial Robot',
    manufacturer: 'FANUC',
    model: 'M-20iD/25',
    serial_number: 'FN-19204-R',
    factory_id: 'FAC-A',
    factory_name: 'Factory-A (Munich Precision Plant)',
    line_id: 'LINE-1',
    line_name: 'Line 1 — Precision Machining & Robotics',
    location: 'Bay A3 · Cell Interconnect',
    operating_state: 'RUNNING',
    status: 'HEALTHY',
    health_score: 98,
    risk_level: 'HEALTHY',
    firmware_version: 'v9.40P/18',
    last_seen: new Date().toISOString(),
    maintenance_state: 'OPERATIONAL',
    telemetry_interval_ms: 2000,
    active_failures: [],
    mqtt_topic: 'factory/FAC-A/line/LINE-1/machine/ROBOT-001/telemetry'
  },
  {
    id: 'CONVEYOR-001',
    name: 'Modular Servo Transfer Conveyor',
    type: 'Transfer Conveyor',
    manufacturer: 'Bosch Rexroth',
    model: 'TS 2plus',
    serial_number: 'BR-77310-C',
    factory_id: 'FAC-A',
    factory_name: 'Factory-A (Munich Precision Plant)',
    line_id: 'LINE-2',
    line_name: 'Line 2 — Assembly & Pneumatic Conveyance',
    location: 'Bay B1 · Central Spine',
    operating_state: 'RUNNING',
    status: 'HEALTHY',
    health_score: 95,
    risk_level: 'HEALTHY',
    firmware_version: 'v3.08.2',
    last_seen: new Date().toISOString(),
    maintenance_state: 'OPERATIONAL',
    telemetry_interval_ms: 2000,
    active_failures: [],
    mqtt_topic: 'factory/FAC-A/line/LINE-2/machine/CONVEYOR-001/telemetry'
  },
  {
    id: 'MOTOR-001',
    name: 'High-Efficiency Main Drive Motor',
    type: 'Induction Traction Drive',
    manufacturer: 'Siemens',
    model: 'SIMOTICS SD 1LE1',
    serial_number: 'SM-33109-M',
    factory_id: 'FAC-A',
    factory_name: 'Factory-A (Munich Precision Plant)',
    line_id: 'LINE-2',
    line_name: 'Line 2 — Assembly & Pneumatic Conveyance',
    location: 'Bay B2 · Drive Mezzanine',
    operating_state: 'RUNNING',
    status: 'HEALTHY',
    health_score: 94,
    risk_level: 'HEALTHY',
    firmware_version: 'v2.19.4',
    last_seen: new Date().toISOString(),
    maintenance_state: 'OPERATIONAL',
    telemetry_interval_ms: 2000,
    active_failures: [],
    mqtt_topic: 'factory/FAC-A/line/LINE-2/machine/MOTOR-001/telemetry'
  },
  {
    id: 'COMPRESSOR-001',
    name: 'Rotary Screw Air Compressor',
    type: 'Pneumatic Compressor',
    manufacturer: 'Atlas Copco',
    model: 'GA 37 VSD+',
    serial_number: 'AC-66291-P',
    factory_id: 'FAC-A',
    factory_name: 'Factory-A (Munich Precision Plant)',
    line_id: 'LINE-2',
    line_name: 'Line 2 — Assembly & Pneumatic Conveyance',
    location: 'Bay B4 · Utility Annex',
    operating_state: 'RUNNING',
    status: 'HEALTHY',
    health_score: 92,
    risk_level: 'HEALTHY',
    firmware_version: 'v5.04.1-elek',
    last_seen: new Date().toISOString(),
    maintenance_state: 'OPERATIONAL',
    telemetry_interval_ms: 2000,
    active_failures: [],
    mqtt_topic: 'factory/FAC-A/line/LINE-2/machine/COMPRESSOR-001/telemetry'
  },
  {
    id: 'GENERATOR-001',
    name: 'Facility Microgrid Gas Turbine Generator',
    type: 'Power Generator',
    manufacturer: 'Caterpillar',
    model: 'CG170-16',
    serial_number: 'CT-90112-G',
    factory_id: 'FAC-A',
    factory_name: 'Factory-A (Munich Precision Plant)',
    line_id: 'LINE-PWR',
    line_name: 'Power — Substation & Microgrid',
    location: 'Substation Yard · Pad 1',
    operating_state: 'IDLE',
    status: 'HEALTHY',
    health_score: 99,
    risk_level: 'HEALTHY',
    firmware_version: 'v6.11.0-cat',
    last_seen: new Date().toISOString(),
    maintenance_state: 'OPERATIONAL',
    telemetry_interval_ms: 2000,
    active_failures: [],
    mqtt_topic: 'factory/FAC-A/line/LINE-PWR/machine/GENERATOR-001/telemetry'
  },
  {
    id: 'TRANSFORMER-001',
    name: 'Step-Down Cast Resin Transformer 2500kVA',
    type: 'Power Transformer',
    manufacturer: 'ABB',
    model: 'RESIBLOC 20kV/400V',
    serial_number: 'AB-51008-T',
    factory_id: 'FAC-A',
    factory_name: 'Factory-A (Munich Precision Plant)',
    line_id: 'LINE-PWR',
    line_name: 'Power — Substation & Microgrid',
    location: 'Substation Yard · Vault A',
    operating_state: 'RUNNING',
    status: 'HEALTHY',
    health_score: 97,
    risk_level: 'HEALTHY',
    firmware_version: 'v3.02.9-abb',
    last_seen: new Date().toISOString(),
    maintenance_state: 'OPERATIONAL',
    telemetry_interval_ms: 2000,
    active_failures: [],
    mqtt_topic: 'factory/FAC-A/line/LINE-PWR/machine/TRANSFORMER-001/telemetry'
  }
];

const machinesMap = new Map<string, Machine>();
const telemetryHistoryMap = new Map<string, TelemetryPoint[]>();
const bearingDriftAccumulator = new Map<string, number>();

// Alert deduplication cooldown map: key = `${machine_id}:${type}` -> timestamp
const alertCooldownMap = new Map<string, number>();
// Idempotency deduplication set of processed event_ids
const processedEventIds = new Set<string>();

let kafkaOffsetCounter = 10420;
const kafkaEvents: KafkaEventEnvelope[] = [];
const alertsList: Alert[] = [];
const maintenanceRecords: MaintenanceRecord[] = [
  {
    id: 'MNT-2026-401',
    machine_id: 'CNC-001',
    type: 'PREDICTIVE',
    status: 'SCHEDULED',
    technician: 'M. Weber (Senior Reliability Eng)',
    summary: 'Scheduled spindle angular-contact bearing inspection and grease replenishment per SOP-M04 due to progressive vibration drift.',
    parts_replaced: ['BRG-7014-C-T-P4S Ceramic Bearing Set', 'Viton Spindle Seal Kit'],
    performed_at: new Date(Date.now() - 86400000 * 18).toISOString(),
    next_due_at: new Date(Date.now() + 86400000 * 2).toISOString(),
    sop_reference: 'SOP-M04'
  },
  {
    id: 'MNT-2026-398',
    machine_id: 'COMPRESSOR-001',
    type: 'PREVENTIVE',
    status: 'COMPLETED',
    technician: 'L. Hoffmann (Mechanical Tech)',
    summary: '2,000-hour oil separator element replacement and heat exchanger fin cleaning.',
    parts_replaced: ['AC-2901-0566-22 Oil Separator', 'Air Intake Filter Element'],
    performed_at: new Date(Date.now() - 86400000 * 5).toISOString(),
    next_due_at: new Date(Date.now() + 86400000 * 85).toISOString(),
    sop_reference: 'SOP-T02'
  },
  {
    id: 'MNT-2026-392',
    machine_id: 'CNC-002',
    type: 'CALIBRATION',
    status: 'COMPLETED',
    technician: 'K. Richter (Metrology Lead)',
    summary: 'Laser interferometer B-axis backlash compensation and hydraulic chuck pressure calibration.',
    parts_replaced: [],
    performed_at: new Date(Date.now() - 86400000 * 11).toISOString(),
    next_due_at: new Date(Date.now() + 86400000 * 49).toISOString(),
    sop_reference: 'SOP-M04'
  },
  {
    id: 'MNT-2026-385',
    machine_id: 'TRANSFORMER-001',
    type: 'CORRECTIVE',
    status: 'COMPLETED',
    technician: 'H. Braun (HV Electrical Eng)',
    summary: 'Recalibrated on-load tap changer voltage regulator following Line 2 voltage sag incident INC-2026-094.',
    parts_replaced: ['ABB Tap Position Sensor Module'],
    performed_at: new Date(Date.now() - 86400000 * 24).toISOString(),
    next_due_at: new Date(Date.now() + 86400000 * 150).toISOString(),
    sop_reference: 'RB-06'
  }
];

const incidentsList: Incident[] = [
  {
    incident_id: 'INC-2026-102',
    severity: 'SEV-2',
    title: 'CNC-001 Progressive Spindle Vibration & Thermal Drift (Bearing Wear Signature)',
    description: 'Digital Twin deterministic health engine detected CNC-001 health dropping below 80 with elevated vibration RMS (3.8–4.9 mm/s) and secondary spindle thermal rise (77–81 °C). Matches historical bearing inner-race wear signature.',
    affected_asset: 'CNC-001',
    status: 'INVESTIGATING',
    root_cause: 'Suspected front angular-contact spindle bearing lubrication film degradation under continuous 5-axis contouring load (similar to INC-2026-089).',
    resolution: 'Pending execution of SOP-M04 spindle bearing replacement during next shift handover window.',
    lessons_learned: 'Early WATCH threshold at health < 85 enabled proactive parts staging before critical surface-finish scrap occurred.',
    created_at: new Date(Date.now() - 3600000 * 2).toISOString(),
    updated_at: new Date(Date.now() - 60000 * 15).toISOString(),
    timeline: [
      {
        timestamp: new Date(Date.now() - 3600000 * 2).toISOString(),
        actor: 'digital-twin-engine',
        note: 'CNC-001 risk_level transitioned from HEALTHY to WATCH (health_score: 81).'
      },
      {
        timestamp: new Date(Date.now() - 3600000 * 1.2).toISOString(),
        actor: 'alert-engine',
        note: 'Triggered POSSIBLE_BEARING_FAILURE alert after sustained vibration > 3.8 mm/s.'
      },
      {
        timestamp: new Date(Date.now() - 60000 * 15).toISOString(),
        actor: 'M. Weber (ENGINEER)',
        note: 'Staged ceramic bearing kit BRG-7014-C-T-P4S and linked runbook RB-03.'
      }
    ]
  },
  {
    incident_id: 'INC-2026-094',
    severity: 'SEV-3',
    title: 'Line 2 Bus Voltage Transient During Compressor Peak Startup',
    description: 'Brief voltage sag to 358V detected on MOTOR-001 and CONVEYOR-001 during COMPRESSOR-001 VSD ramp.',
    affected_asset: 'TRANSFORMER-001',
    status: 'CLOSED',
    root_cause: 'Harmonic tap changer delay combined with simultaneous inductive inrush on Line 2.',
    resolution: 'Staggered COMPRESSOR-001 soft-start curve by 4.5s and calibrated ABB tap regulator.',
    lessons_learned: 'Enforce sequenced startup interlocks across Line 2 high-draw drives.',
    created_at: new Date(Date.now() - 86400000 * 24).toISOString(),
    updated_at: new Date(Date.now() - 86400000 * 23).toISOString(),
    timeline: [
      {
        timestamp: new Date(Date.now() - 86400000 * 24).toISOString(),
        actor: 'alert-engine',
        note: 'POWER_ANOMALY alert opened on MOTOR-001.'
      },
      {
        timestamp: new Date(Date.now() - 86400000 * 23).toISOString(),
        actor: 'H. Braun (ENGINEER)',
        note: 'Completed tap changer calibration and verified bus voltage stability within 396–404V.'
      }
    ]
  }
];

const auditLogs: AuditLogEntry[] = [
  {
    id: 'AUD-1001',
    actor: 'system-bootstrap',
    role: 'ADMIN',
    action: 'TWIN_ENGINE_INITIALIZED',
    resource: 'factory',
    resource_id: 'FAC-A',
    timestamp: new Date(Date.now() - 3600000 * 4).toISOString(),
    source: 'digital-twin-engine',
    correlation_id: 'corr-init-0001',
    result: 'SUCCESS',
    details: 'Initialized 8 Factory-A machine twins, Kafka consumer group twin-engine-cg, and PostgreSQL/Redis state stores.'
  },
  {
    id: 'AUD-1002',
    actor: 'M. Weber',
    role: 'ENGINEER',
    action: 'SIMULATION_INJECT_FAULT',
    resource: 'machine',
    resource_id: 'CNC-001',
    timestamp: new Date(Date.now() - 3600000 * 2).toISOString(),
    source: 'simulator-control-api',
    correlation_id: 'corr-sim-0104',
    result: 'SUCCESS',
    details: 'Injected failure scenario: bearing_degradation on CNC-001'
  }
];

const chaosResults: ChaosExperimentResult[] = [
  {
    id: 'CHAOS-01',
    scenario_number: 8,
    name: 'Duplicate Event Injection (Idempotency Verification)',
    target: 'Kafka Topic: machine.telemetry (CNC-002)',
    triggered_at: new Date(Date.now() - 1800000).toISOString(),
    detection_time_ms: 4,
    recovery_time_ms: 0,
    data_loss_events: 0,
    duplicate_events_blocked: 12,
    dlq_routed: 0,
    alert_correctness: 'VERIFIED',
    status: 'PASSED',
    summary: 'Injected 12 duplicate telemetry packets with identical UUID event_ids. Digital Twin idempotency filter dropped all 12 duplicates with 0 state corruption.'
  },
  {
    id: 'CHAOS-02',
    scenario_number: 6,
    name: 'API Pod Deletion (Kubernetes ReplicaSet Self-Healing)',
    target: 'k8s://twin-prod/deploy/twin-api',
    triggered_at: new Date(Date.now() - 900000).toISOString(),
    detection_time_ms: 1200,
    recovery_time_ms: 4800,
    data_loss_events: 0,
    duplicate_events_blocked: 0,
    dlq_routed: 0,
    alert_correctness: 'VERIFIED',
    status: 'PASSED',
    summary: 'Terminated pod twin-api-7d9f8b-x4k2p. Kubernetes ReplicaSet scheduled replacement container and passed /api/v1/ready probe in 4.8s.'
  }
];

const observability: SystemObservability = {
  mqtt_messages_total: 14820,
  mqtt_connected: true,
  kafka_throughput_eps: 8.4,
  kafka_consumer_lag: 2,
  kafka_dlq_count: 3,
  duplicate_events_blocked: 14,
  out_of_order_events_flagged: 4,
  postgres_latency_ms: 4.2,
  postgres_status: 'UP',
  last_backup_at: new Date(Date.now() - 1200000).toISOString(),
  rpo_target: '5m (Continuous WAL)',
  rto_target: '12m (Verified Restore)',
  redis_hit_rate_pct: 98.4,
  redis_cached_keys: 64,
  api_http_requests_total: 4290,
  api_p95_latency_ms: 11.6,
  api_error_rate_pct: 0.04,
  argocd_sync_status: 'Synced',
  argocd_health_status: 'Healthy',
  git_revision: 'a8f4c29 (v1.4.2-prod)',
  pods: [
    { name: 'twin-api-7d9f8b-m9p2x', namespace: 'twin-prod', service: 'api', status: 'Running', restarts: 0, cpu_m: 85, memory_mib: 184, age: '4d12h', ready: '1/1', node: 'eks-node-eu-1a' },
    { name: 'digital-twin-engine-6b4c1d-k2w8n', namespace: 'twin-prod', service: 'digital-twin-engine', status: 'Running', restarts: 0, cpu_m: 140, memory_mib: 248, age: '4d12h', ready: '1/1', node: 'eks-node-eu-1b' },
    { name: 'mqtt-consumer-5f8a2c-v7j4l', namespace: 'twin-prod', service: 'mqtt-consumer', status: 'Running', restarts: 0, cpu_m: 62, memory_mib: 118, age: '4d12h', ready: '1/1', node: 'eks-node-eu-1a' },
    { name: 'alert-engine-8c3e9a-q5r1z', namespace: 'twin-prod', service: 'alert-engine', status: 'Running', restarts: 0, cpu_m: 48, memory_mib: 132, age: '4d12h', ready: '1/1', node: 'eks-node-eu-1c' },
    { name: 'machine-simulator-4a7d1e-t9b3m', namespace: 'twin-prod', service: 'simulator', status: 'Running', restarts: 0, cpu_m: 55, memory_mib: 110, age: '4d12h', ready: '1/1', node: 'eks-node-eu-1b' },
    { name: 'kafka-broker-0', namespace: 'twin-prod', service: 'kafka', status: 'Running', restarts: 0, cpu_m: 310, memory_mib: 890, age: '12d4h', ready: '1/1', node: 'eks-node-eu-1a' }
  ]
};

// ============================================================================
// 2. DETERMINISTIC HEALTH MODEL & ALERT ENGINE
// ============================================================================

function computeDeterministicHealth(
  telemetry: TelemetryPoint,
  operatingState: OperatingState,
  activeFailures: FailureScenarioType[],
  lastSeenIso: string
): { score: number; status: HealthStatus; breakdown: Machine['health_breakdown'] } {
  const ageMs = Date.now() - new Date(lastSeenIso).getTime();
  if (activeFailures.includes('machine_offline') || ageMs > 15000) {
    return {
      score: 0,
      status: 'OFFLINE',
      breakdown: {
        base_score: 100,
        temperature_penalty: 0,
        vibration_penalty: 0,
        power_penalty: 0,
        sensor_or_offline_penalty: 100,
        final_score: 0
      }
    };
  }

  let tempPenalty = 0;
  if (telemetry.temperature > 75) {
    tempPenalty += Math.round((telemetry.temperature - 75) * 1.8);
  }
  if (telemetry.temperature > 84) {
    tempPenalty += Math.round((telemetry.temperature - 84) * 2.2);
  }

  let vibPenalty = 0;
  if (telemetry.vibration > 3.0) {
    vibPenalty += Math.round((telemetry.vibration - 3.0) * 8.5);
  }
  if (telemetry.vibration > 5.0) {
    vibPenalty += Math.round((telemetry.vibration - 5.0) * 6.5);
  }

  let powerPenalty = 0;
  if (telemetry.power_kw > 10.5) {
    powerPenalty += Math.round((telemetry.power_kw - 10.5) * 3.5);
  }
  if (telemetry.voltage < 380 || telemetry.voltage > 420) {
    powerPenalty += Math.round(Math.abs(400 - telemetry.voltage) * 0.45);
  }
  if (telemetry.current > 18) {
    powerPenalty += Math.round((telemetry.current - 18) * 1.5);
  }

  let sensorPenalty = 0;
  if (
    activeFailures.includes('sensor_malfunction') ||
    telemetry.temperature < 0 ||
    telemetry.pressure <= 0
  ) {
    sensorPenalty = 35;
  }

  const rawScore = 100 - tempPenalty - vibPenalty - powerPenalty - sensorPenalty;
  const finalScore = Math.max(0, Math.min(100, rawScore));

  let status: HealthStatus = 'HEALTHY';
  if (finalScore < 40) status = 'CRITICAL';
  else if (finalScore < 70) status = 'WARNING';
  else if (finalScore < 90) status = 'WATCH';

  return {
    score: finalScore,
    status,
    breakdown: {
      base_score: 100,
      temperature_penalty: tempPenalty,
      vibration_penalty: vibPenalty,
      power_penalty: powerPenalty,
      sensor_or_offline_penalty: sensorPenalty,
      final_score: finalScore
    }
  };
}

function createOrDedupAlert(
  machine: Machine,
  type: AlertType,
  severity: 'WARNING' | 'CRITICAL',
  title: string,
  metric: string,
  observedValue: string | number,
  threshold: string,
  eventId: string,
  correlationId: string
) {
  const dedupKey = `${machine.id}:${type}`;
  const existingOpen = alertsList.find(
    (a) => a.machine_id === machine.id && a.type === type && a.status !== 'RESOLVED'
  );

  if (existingOpen) {
    existingOpen.dedup_count += 1;
    existingOpen.evidence.observed_value = observedValue;
    existingOpen.evidence.telemetry_snapshot = { ...machine.latest_telemetry };
    if (severity === 'CRITICAL') existingOpen.severity = 'CRITICAL';
    return;
  }

  const cooldownUntil = alertCooldownMap.get(dedupKey) || 0;
  if (Date.now() < cooldownUntil) {
    return;
  }

  alertCooldownMap.set(dedupKey, Date.now() + 20000);

  const newAlert: Alert = {
    alert_id: `ALT-${Date.now().toString().slice(-5)}-${Math.floor(Math.random() * 90 + 10)}`,
    machine_id: machine.id,
    machine_name: machine.name,
    line_id: machine.line_id,
    type,
    severity,
    title,
    evidence: {
      metric,
      observed_value: observedValue,
      threshold,
      telemetry_snapshot: { ...machine.latest_telemetry }
    },
    status: 'OPEN',
    created_at: new Date().toISOString(),
    correlation_id: correlationId,
    event_id: eventId,
    dedup_count: 1
  };

  alertsList.unshift(newAlert);
  if (alertsList.length > 80) alertsList.pop();

  pushKafkaEvent({
    event_id: `evt-alt-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    event_type: 'machine.alerts',
    event_version: '1.0',
    machine_id: machine.id,
    timestamp: new Date().toISOString(),
    correlation_id: correlationId,
    source: 'alert-engine',
    partition: 0,
    offset: ++kafkaOffsetCounter,
    validation_status: 'VALID',
    payload: {
      alert_id: newAlert.alert_id,
      type: newAlert.type,
      severity: newAlert.severity,
      title: newAlert.title,
      observed_value: observedValue
    }
  });
}

function evaluateAlertsForMachine(machine: Machine, eventId: string, correlationId: string) {
  const t = machine.latest_telemetry;

  if (machine.status === 'OFFLINE' || machine.active_failures.includes('machine_offline')) {
    createOrDedupAlert(
      machine,
      'MACHINE_OFFLINE',
      'CRITICAL',
      `${machine.id} telemetry heartbeat lost (>10s timeout)`,
      'last_seen',
      'TIMEOUT',
      '<= 10s',
      eventId,
      correlationId
    );
    return;
  }

  if (machine.active_failures.includes('sensor_malfunction') || t.temperature < 0) {
    createOrDedupAlert(
      machine,
      'SENSOR_FAILURE',
      'CRITICAL',
      `${machine.id} PT100 RTD / transducer out-of-bounds reading`,
      'temperature',
      `${t.temperature} °C`,
      '0.0 – 150.0 °C',
      eventId,
      correlationId
    );
  }

  if (t.temperature >= 80) {
    createOrDedupAlert(
      machine,
      'HIGH_TEMPERATURE',
      t.temperature >= 88 ? 'CRITICAL' : 'WARNING',
      `${machine.id} thermal excursion (${t.temperature.toFixed(1)} °C)`,
      'temperature',
      `${t.temperature.toFixed(1)} °C`,
      '< 80.0 °C',
      eventId,
      correlationId
    );
  }

  if (t.vibration >= 3.8 && t.temperature >= 75.5) {
    createOrDedupAlert(
      machine,
      'POSSIBLE_BEARING_FAILURE',
      t.vibration >= 5.5 ? 'CRITICAL' : 'WARNING',
      `${machine.id} correlated vibration (${t.vibration.toFixed(2)} mm/s) + thermal rise indicates bearing wear`,
      'vibration + temperature',
      `${t.vibration.toFixed(2)} mm/s @ ${t.temperature.toFixed(1)} °C`,
      '< 3.5 mm/s',
      eventId,
      correlationId
    );
  } else if (t.vibration >= 4.0) {
    createOrDedupAlert(
      machine,
      'HIGH_VIBRATION',
      t.vibration >= 6.2 ? 'CRITICAL' : 'WARNING',
      `${machine.id} excessive RMS vibration (${t.vibration.toFixed(2)} mm/s)`,
      'vibration',
      `${t.vibration.toFixed(2)} mm/s`,
      '1.0 – 3.0 mm/s',
      eventId,
      correlationId
    );
  }

  if (t.current >= 21 || t.power_kw >= 13.0) {
    createOrDedupAlert(
      machine,
      'MOTOR_OVERLOAD',
      t.current >= 26 ? 'CRITICAL' : 'WARNING',
      `${machine.id} drive current/power overload (${t.current.toFixed(1)} A / ${t.power_kw.toFixed(1)} kW)`,
      'current',
      `${t.current.toFixed(1)} A`,
      '< 20.0 A',
      eventId,
      correlationId
    );
  }

  if (t.voltage < 375 || t.voltage > 425) {
    createOrDedupAlert(
      machine,
      'POWER_ANOMALY',
      t.voltage < 360 || t.voltage > 435 ? 'CRITICAL' : 'WARNING',
      `${machine.id} supply bus voltage instability (${t.voltage.toFixed(0)} V)`,
      'voltage',
      `${t.voltage.toFixed(0)} V`,
      '380 – 420 V',
      eventId,
      correlationId
    );
  }
}

function pushKafkaEvent(envelope: KafkaEventEnvelope) {
  kafkaEvents.unshift(envelope);
  if (kafkaEvents.length > 120) {
    kafkaEvents.pop();
  }
}

const LOCAL_STORE_PATH = path.resolve(process.cwd(), 'twin-state-store.json');

function persistLocalStateSnapshot() {
  try {
    fs.writeFileSync(
      LOCAL_STORE_PATH,
      JSON.stringify(
        {
          updated_at: new Date().toISOString(),
          alerts: alertsList.slice(0, 40),
          maintenance: maintenanceRecords,
          incidents: incidentsList,
          audit_logs: auditLogs.slice(0, 60)
        },
        null,
        2
      ),
      'utf-8'
    );
  } catch {
    // Non-fatal in read-only environments
  }
}

function recordAuditLog(
  actor: string,
  role: UserRole,
  action: string,
  resource: string,
  resource_id: string,
  source: string,
  result: 'SUCCESS' | 'DENIED' | 'ERROR',
  details?: string
) {
  const entry: AuditLogEntry = {
    id: `AUD-${Date.now().toString().slice(-5)}-${Math.floor(Math.random() * 90 + 10)}`,
    actor,
    role,
    action,
    resource,
    resource_id,
    timestamp: new Date().toISOString(),
    source,
    correlation_id: `corr-${Date.now().toString(36)}`,
    result,
    details
  };
  auditLogs.unshift(entry);
  if (auditLogs.length > 120) auditLogs.pop();
  persistLocalStateSnapshot();
  return entry;
}

// ============================================================================
// 3. MACHINE SIMULATOR & TELEMETRY GENERATOR
// ============================================================================

function generateSimulatedTelemetry(
  machine: Omit<Machine, 'latest_telemetry' | 'health_breakdown'>,
  prev?: TelemetryPoint
): TelemetryPoint {
  const failures = machine.active_failures;
  const isIdle = machine.operating_state === 'IDLE' || machine.operating_state === 'STOPPED';

  // Normal simulation baselines per Section 5:
  // temperature 65-75 C, vibration 1-3 mm/s, rpm 1400-1500, power 7-10 kW
  let temp = isIdle ? 42 + Math.random() * 3 : 68.5 + (Math.random() - 0.5) * 4.2;
  let vibration = isIdle ? 0.2 + Math.random() * 0.2 : 1.75 + (Math.random() - 0.5) * 0.7;
  let rpm = isIdle ? 0 : 1445 + Math.round((Math.random() - 0.5) * 45);
  let power_kw = isIdle ? 0.8 : 8.2 + (Math.random() - 0.5) * 1.4;
  let pressure = isIdle ? 4.0 : 6.1 + (Math.random() - 0.5) * 0.4;
  let voltage = 400 + (Math.random() - 0.5) * 5.0;
  let current = isIdle ? 1.8 : +(power_kw * 1.75 + (Math.random() - 0.5) * 0.8).toFixed(1);

  if (failures.includes('overheating')) {
    const prevTemp = prev?.temperature && prev.temperature > 75 ? prev.temperature : 81;
    temp = Math.min(97.5, prevTemp + 1.4 + Math.random() * 1.5);
  }

  if (failures.includes('bearing_degradation')) {
    const drift = (bearingDriftAccumulator.get(machine.id) || 2.2) + 0.12;
    bearingDriftAccumulator.set(machine.id, Math.min(4.8, drift));
    vibration = +(2.1 + drift + (Math.random() - 0.5) * 0.35).toFixed(2);
    temp = Math.max(temp, 76.5 + drift * 1.6 + (Math.random() - 0.5) * 1.2);
  } else {
    bearingDriftAccumulator.set(machine.id, 1.8);
  }

  if (failures.includes('excessive_vibration')) {
    vibration = +(6.8 + Math.random() * 2.9).toFixed(2);
  }

  if (failures.includes('motor_overload')) {
    current = +(25.4 + Math.random() * 5.2).toFixed(1);
    power_kw = +(14.2 + Math.random() * 3.1).toFixed(2);
    rpm = Math.max(980, rpm - 260);
    temp = Math.max(temp, 82.0 + Math.random() * 4.0);
  }

  if (failures.includes('power_instability')) {
    voltage = Math.random() > 0.5 ? 348 + Math.random() * 18 : 434 + Math.random() * 14;
    power_kw = +(power_kw * (0.75 + Math.random() * 0.55)).toFixed(2);
  }

  if (failures.includes('sensor_malfunction')) {
    temp = -999.0;
    pressure = -1.0;
  }

  let timestamp = new Date().toISOString();
  if (failures.includes('out_of_order_events')) {
    timestamp = new Date(Date.now() - 48000).toISOString();
  }

  const prevProd = prev?.production_count ?? Math.floor(1200 + Math.random() * 600);
  const prevHours = prev?.operating_hours ?? +(410 + Math.random() * 120).toFixed(2);
  const prevEnergy = prev?.energy_consumption ?? +(3200 + Math.random() * 800).toFixed(1);

  return {
    timestamp,
    temperature: +temp.toFixed(1),
    pressure: +pressure.toFixed(2),
    vibration: +vibration.toFixed(2),
    rpm: Math.round(rpm),
    current: +current.toFixed(1),
    voltage: +voltage.toFixed(1),
    power_kw: +power_kw.toFixed(2),
    production_count: isIdle ? prevProd : prevProd + 1,
    operating_hours: +(prevHours + 0.01).toFixed(2),
    energy_consumption: +(prevEnergy + power_kw * 0.005).toFixed(2)
  };
}

// Bootstrap initial machine states and 25 historical points per machine
for (const base of INITIAL_MACHINES) {
  const history: TelemetryPoint[] = [];
  let prevPoint: TelemetryPoint | undefined;
  for (let i = 24; i >= 0; i--) {
    const pt = generateSimulatedTelemetry(base, prevPoint);
    pt.timestamp = new Date(Date.now() - i * 2000).toISOString();
    history.push(pt);
    prevPoint = pt;
  }
  const latest = history[history.length - 1];
  const health = computeDeterministicHealth(
    latest,
    base.operating_state,
    base.active_failures,
    base.last_seen
  );
  const fullMachine: Machine = {
    ...base,
    status: health.status,
    health_score: health.score,
    risk_level: health.status,
    health_breakdown: health.breakdown,
    latest_telemetry: latest
  };
  machinesMap.set(base.id, fullMachine);
  telemetryHistoryMap.set(base.id, history);
  evaluateAlertsForMachine(fullMachine, `evt-boot-${base.id}`, `corr-boot-${base.id}`);
}

// ============================================================================
// 4. REAL-TIME SSE CLIENTS & SIMULATION TICK LOOP
// ============================================================================

const sseClients = new Set<Response>();

function broadcastSseSnapshot() {
  if (sseClients.size === 0) return;
  const payload = JSON.stringify({
    type: 'TWIN_SNAPSHOT',
    timestamp: new Date().toISOString(),
    factory: buildFactorySummary(),
    lines: buildLinesSummary(),
    machines: Array.from(machinesMap.values()),
    alerts: alertsList.slice(0, 30),
    recent_events: kafkaEvents.slice(0, 25),
    observability
  });
  for (const client of sseClients) {
    client.write(`data: ${payload}\n\n`);
  }
}

setInterval(() => {
  if (!observability.mqtt_connected) {
    broadcastSseSnapshot();
    return;
  }

  let partitionIdx = 0;
  for (const machine of machinesMap.values()) {
    partitionIdx = (partitionIdx + 1) % 3;
    const correlationId = `corr-${Date.now().toString(36)}-${machine.id.toLowerCase()}`;
    const eventId = `evt-${Date.now()}-${machine.id}`;

    // Check if machine is stopped or offline fault is active
    if (machine.operating_state === 'STOPPED' || machine.active_failures.includes('machine_offline')) {
      const health = computeDeterministicHealth(
        machine.latest_telemetry,
        machine.operating_state,
        machine.active_failures,
        machine.last_seen
      );
      machine.status = health.status;
      machine.health_score = health.score;
      machine.risk_level = health.status;
      machine.health_breakdown = health.breakdown;
      evaluateAlertsForMachine(machine, eventId, correlationId);
      continue;
    }

    // Intermittent telemetry drops ~60% of frames
    if (machine.active_failures.includes('intermittent_telemetry') && Math.random() < 0.6) {
      continue;
    }

    observability.mqtt_messages_total += 1;

    // Malformed telemetry fault -> route directly to machine.dlq
    if (machine.active_failures.includes('malformed_telemetry')) {
      observability.kafka_dlq_count += 1;
      pushKafkaEvent({
        event_id: eventId,
        event_type: 'machine.dlq',
        event_version: '1.0',
        machine_id: machine.id,
        timestamp: new Date().toISOString(),
        correlation_id: correlationId,
        source: 'mqtt-consumer',
        partition: partitionIdx,
        offset: ++kafkaOffsetCounter,
        validation_status: 'MALFORMED_DLQ',
        validation_error: 'SchemaValidationError: field "temperature" expected float, received "CORRUPT_HEX_0xFF"',
        payload: { raw_frame: '0xFF_MALFORMED_PAYLOAD', rejected_by: 'schema-validator-v1' }
      });
      createOrDedupAlert(
        machine,
        'DATA_QUALITY',
        'WARNING',
        `${machine.id} malformed MQTT payload routed to Kafka machine.dlq`,
        'schema_validation',
        'MALFORMED_DLQ',
        'JSON Schema v1.0',
        eventId,
        correlationId
      );
      continue;
    }

    const nextTelemetry = generateSimulatedTelemetry(machine, machine.latest_telemetry);

    // Out-of-order check
    let validationStatus: KafkaEventEnvelope['validation_status'] = 'VALID';
    let validationError: string | undefined;
    if (new Date(nextTelemetry.timestamp).getTime() < new Date(machine.latest_telemetry.timestamp).getTime()) {
      validationStatus = 'OUT_OF_ORDER';
      validationError = 'Timestamp older than current twin watermark; flagged for window reordering.';
      observability.out_of_order_events_flagged += 1;
      createOrDedupAlert(
        machine,
        'DATA_QUALITY',
        'WARNING',
        `${machine.id} out-of-order event timestamp detected (-48s skew)`,
        'timestamp_skew',
        '-48.0 s',
        '<= 5.0 s skew',
        eventId,
        correlationId
      );
    }

    // Update machine state & history
    machine.last_seen = new Date().toISOString();
    machine.latest_telemetry = nextTelemetry;
    const history = telemetryHistoryMap.get(machine.id) || [];
    history.push(nextTelemetry);
    if (history.length > 40) history.shift();
    telemetryHistoryMap.set(machine.id, history);

    const prevStatus = machine.status;
    const health = computeDeterministicHealth(
      nextTelemetry,
      machine.operating_state,
      machine.active_failures,
      machine.last_seen
    );
    machine.health_score = health.score;
    machine.status = health.status;
    machine.risk_level = health.status;
    machine.health_breakdown = health.breakdown;

    processedEventIds.add(eventId);
    pushKafkaEvent({
      event_id: eventId,
      event_type: 'machine.telemetry',
      event_version: '1.0',
      machine_id: machine.id,
      timestamp: nextTelemetry.timestamp,
      correlation_id: correlationId,
      source: 'mqtt-consumer',
      partition: partitionIdx,
      offset: ++kafkaOffsetCounter,
      validation_status: validationStatus,
      validation_error: validationError,
      payload: {
        temperature: nextTelemetry.temperature,
        vibration: nextTelemetry.vibration,
        rpm: nextTelemetry.rpm,
        power_kw: nextTelemetry.power_kw,
        health_score: machine.health_score,
        status: machine.status
      }
    });

    // Duplicate event fault -> emit second packet with identical event_id to demonstrate idempotency
    if (machine.active_failures.includes('duplicate_events')) {
      if (processedEventIds.has(eventId)) {
        observability.duplicate_events_blocked += 1;
        pushKafkaEvent({
          event_id: eventId,
          event_type: 'machine.telemetry',
          event_version: '1.0',
          machine_id: machine.id,
          timestamp: nextTelemetry.timestamp,
          correlation_id: correlationId,
          source: 'mqtt-consumer',
          partition: partitionIdx,
          offset: ++kafkaOffsetCounter,
          validation_status: 'DUPLICATE_IGNORED',
          validation_error: `IdempotencyGuard: duplicate event_id ${eventId} ignored without mutating twin state.`,
          payload: { duplicate_of: eventId }
        });
      }
    }

    if (prevStatus !== machine.status) {
      pushKafkaEvent({
        event_id: `evt-state-${Date.now()}-${machine.id}`,
        event_type: 'machine.status',
        event_version: '1.0',
        machine_id: machine.id,
        timestamp: new Date().toISOString(),
        correlation_id: correlationId,
        source: 'digital-twin-engine',
        partition: 0,
        offset: ++kafkaOffsetCounter,
        validation_status: 'VALID',
        payload: {
          previous_status: prevStatus,
          new_status: machine.status,
          health_score: machine.health_score
        }
      });
    }

    evaluateAlertsForMachine(machine, eventId, correlationId);
  }

  broadcastSseSnapshot();
}, 2000);

// ============================================================================
// 5. AGGREGATION HELPERS (FACTORY & LINES)
// ============================================================================

function buildLinesSummary(): ProductionLine[] {
  const lineDefs: { id: string; name: string; category: ProductionLine['category']; description: string }[] = [
    {
      id: 'LINE-1',
      name: 'Line 1 — Precision Machining & Robotics',
      category: 'MACHINING',
      description: '5-axis aerospace/industrial milling, multi-spindle turning, and automated robotic cell tending.'
    },
    {
      id: 'LINE-2',
      name: 'Line 2 — Assembly & Pneumatic Conveyance',
      category: 'ASSEMBLY',
      description: 'Servo-driven pallet transfer conveyor, SIMOTICS traction drive, and variable-speed rotary screw air supply.'
    },
    {
      id: 'LINE-PWR',
      name: 'Power — Facility Substation & Microgrid',
      category: 'POWER',
      description: '20kV/400V cast resin step-down transformer and standby gas turbine cogeneration.'
    }
  ];

  return lineDefs.map((ld) => {
    const lineMachines = Array.from(machinesMap.values()).filter((m) => m.line_id === ld.id);
    const avgHealth = Math.round(
      lineMachines.reduce((acc, m) => acc + m.health_score, 0) / Math.max(1, lineMachines.length)
    );
    const totalPower = +lineMachines
      .reduce((acc, m) => acc + m.latest_telemetry.power_kw, 0)
      .toFixed(1);

    let lineStatus: HealthStatus = 'HEALTHY';
    if (lineMachines.some((m) => m.status === 'CRITICAL' || m.status === 'OFFLINE')) {
      lineStatus = 'CRITICAL';
    } else if (lineMachines.some((m) => m.status === 'WARNING')) {
      lineStatus = 'WARNING';
    } else if (lineMachines.some((m) => m.status === 'WATCH')) {
      lineStatus = 'WATCH';
    }

    return {
      id: ld.id,
      factory_id: 'FAC-A',
      name: ld.name,
      category: ld.category,
      description: ld.description,
      machine_ids: lineMachines.map((m) => m.id),
      status: lineStatus,
      avg_health: avgHealth,
      total_power_kw: totalPower,
      production_rate_uph: ld.category === 'POWER' ? 0 : lineMachines.filter((m) => m.operating_state === 'RUNNING').length * 42
    };
  });
}

function buildFactorySummary(): Factory {
  const all = Array.from(machinesMap.values());
  const avgHealth = Math.round(all.reduce((acc, m) => acc + m.health_score, 0) / all.length);
  const offline = all.filter((m) => m.status === 'OFFLINE').length;
  const running = all.filter((m) => m.operating_state === 'RUNNING' && m.status !== 'OFFLINE').length;
  const idle = all.filter((m) => m.operating_state === 'IDLE' && m.status !== 'OFFLINE').length;
  const warnings = all.filter((m) => m.status === 'WARNING' || m.status === 'WATCH').length;
  const criticals = all.filter((m) => m.status === 'CRITICAL' || m.status === 'OFFLINE').length;
  const openAlerts = alertsList.filter((a) => a.status !== 'RESOLVED').length;

  let status: HealthStatus = 'HEALTHY';
  if (criticals > 0) status = 'CRITICAL';
  else if (all.some((m) => m.status === 'WARNING')) status = 'WARNING';
  else if (all.some((m) => m.status === 'WATCH')) status = 'WATCH';

  return {
    id: 'FAC-A',
    name: 'Factory-A (Munich Precision Manufacturing Plant)',
    region: 'eu-central-1 (Munich, DE)',
    location: 'Industriestraße 42, Sector North',
    status,
    health_score: avgHealth,
    machines_total: all.length,
    machines_online: all.length - offline,
    machines_running: running,
    machines_idle: idle,
    machines_offline: offline,
    warning_count: warnings,
    critical_count: criticals,
    open_alerts_count: openAlerts,
    total_production: all.reduce((acc, m) => acc + m.latest_telemetry.production_count, 0),
    total_energy_kwh: +all.reduce((acc, m) => acc + m.latest_telemetry.energy_consumption, 0).toFixed(1),
    current_power_kw: +all.reduce((acc, m) => acc + m.latest_telemetry.power_kw, 0).toFixed(1)
  };
}

// ============================================================================
// 6. CONTROLLED READ-ONLY MCP TOOLS & RAG RETRIEVAL
// ============================================================================

function executeMcpTool(name: string, args: Record<string, unknown>, traces: McpToolCallTrace[]): unknown {
  const start = Date.now();
  let output: unknown;
  let summary = '';

  switch (name) {
    case 'get_factory_status': {
      const fac = buildFactorySummary();
      output = fac;
      summary = `Factory ${fac.id} health=${fac.health_score} (${fac.status}), ${fac.machines_online}/${fac.machines_total} online, ${fac.open_alerts_count} open alerts.`;
      break;
    }
    case 'get_machine_state': {
      const machineId = String(args.machine_id || 'CNC-001').toUpperCase();
      const m = machinesMap.get(machineId);
      output = m || { error: `Machine ${machineId} not found` };
      summary = m
        ? `${m.id} status=${m.status}, health=${m.health_score}, temp=${m.latest_telemetry.temperature}°C, vib=${m.latest_telemetry.vibration}mm/s, active_failures=[${m.active_failures.join(', ')}]`
        : `Machine ${machineId} not found`;
      break;
    }
    case 'get_machine_telemetry': {
      const machineId = String(args.machine_id || 'CNC-001').toUpperCase();
      const hist = (telemetryHistoryMap.get(machineId) || []).slice(-10);
      output = hist;
      summary = `Retrieved ${hist.length} recent telemetry frames for ${machineId}.`;
      break;
    }
    case 'get_machine_alerts': {
      const machineId = String(args.machine_id || 'CNC-001').toUpperCase();
      const ma = alertsList.filter((a) => a.machine_id === machineId);
      output = ma;
      summary = `Found ${ma.length} alerts for ${machineId} (${ma.filter((a) => a.status !== 'RESOLVED').length} active).`;
      break;
    }
    case 'get_machine_maintenance': {
      const machineId = String(args.machine_id || 'CNC-001').toUpperCase();
      const mm = maintenanceRecords.filter((r) => r.machine_id === machineId);
      output = mm;
      summary = `Found ${mm.length} maintenance records for ${machineId}.`;
      break;
    }
    case 'get_open_incidents': {
      const openInc = incidentsList.filter((i) => i.status !== 'CLOSED');
      output = openInc;
      summary = `Retrieved ${openInc.length} active incidents.`;
      break;
    }
    case 'get_recent_events': {
      const machineId = args.machine_id ? String(args.machine_id).toUpperCase() : undefined;
      const evts = machineId
        ? kafkaEvents.filter((e) => e.machine_id === machineId).slice(0, 10)
        : kafkaEvents.slice(0, 10);
      output = evts;
      summary = `Retrieved ${evts.length} recent Kafka events${machineId ? ` for ${machineId}` : ''}.`;
      break;
    }
    case 'get_line_status': {
      const lineId = String(args.line_id || 'LINE-1').toUpperCase();
      const line = buildLinesSummary().find((l) => l.id === lineId);
      output = line || { error: `Line ${lineId} not found` };
      summary = line
        ? `${line.id} status=${line.status}, avg_health=${line.avg_health}, power=${line.total_power_kw}kW`
        : `Line ${lineId} not found`;
      break;
    }
    case 'get_system_health': {
      output = observability;
      summary = `MQTT=${observability.mqtt_connected ? 'CONNECTED' : 'DOWN'}, Kafka lag=${observability.kafka_consumer_lag}, DB=${observability.postgres_status} (${observability.postgres_latency_ms}ms), Redis hit=${observability.redis_hit_rate_pct}%`;
      break;
    }
    default: {
      output = { error: `Unknown MCP tool: ${name}` };
      summary = `Unknown MCP tool ${name}`;
    }
  }

  const trace: McpToolCallTrace = {
    tool_name: name,
    arguments: args,
    timestamp: new Date().toISOString(),
    duration_ms: Math.max(2, Date.now() - start),
    authorized_role: 'AI_AGENT',
    result_summary: summary,
    raw_output: output
  };
  traces.push(trace);

  recordAuditLog(
    'gemini-mcp-agent',
    'AI_AGENT',
    `MCP_TOOL_CALL:${name}`,
    'mcp_tool',
    String(args.machine_id || args.line_id || 'FAC-A'),
    'ai-service',
    'SUCCESS',
    summary
  );

  return output;
}

function retrieveRagDocuments(query: string, machineId?: string) {
  const qLower = `${query} ${machineId || ''}`.toLowerCase();
  const scored = RAG_KNOWLEDGE_BASE.map((chunk) => {
    let score = 0;
    for (const kw of chunk.keywords) {
      if (qLower.includes(kw.toLowerCase())) score += 3;
    }
    if (machineId && chunk.content.toLowerCase().includes(machineId.toLowerCase())) {
      score += 5;
    }
    return { chunk, score };
  });
  scored.sort((a, b) => b.score - a.score);
  const selected = scored.filter((s) => s.score > 0).slice(0, 3).map((s) => s.chunk);
  return selected.length > 0 ? selected : RAG_KNOWLEDGE_BASE.slice(0, 2);
}

// ============================================================================
// 7. REST API ENDPOINTS (/api/v1)
// ============================================================================

app.get('/api/v1/health', (_req, res) => {
  observability.api_http_requests_total += 1;
  res.json({
    status: 'healthy',
    service: 'industrial-digital-twin-api',
    version: '1.4.2',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/v1/ready', (_req, res) => {
  observability.api_http_requests_total += 1;
  res.json({
    ready: observability.postgres_status === 'UP',
    dependencies: {
      postgresql: observability.postgres_status,
      redis: 'UP',
      kafka: 'UP',
      mqtt_broker: observability.mqtt_connected ? 'UP' : 'DEGRADED'
    },
    timestamp: new Date().toISOString()
  });
});

app.get('/api/v1/metrics', (_req, res) => {
  observability.api_http_requests_total += 1;
  const fac = buildFactorySummary();
  const prometheusText = [
    '# HELP twin_http_requests_total Total HTTP requests handled by FastAPI/Express gateway',
    '# TYPE twin_http_requests_total counter',
    `twin_http_requests_total ${observability.api_http_requests_total}`,
    '# HELP twin_mqtt_messages_total Total MQTT telemetry frames ingested',
    '# TYPE twin_mqtt_messages_total counter',
    `twin_mqtt_messages_total ${observability.mqtt_messages_total}`,
    '# HELP twin_kafka_consumer_lag_messages Consumer group lag for twin-engine-cg',
    '# TYPE twin_kafka_consumer_lag_messages gauge',
    `twin_kafka_consumer_lag_messages ${observability.kafka_consumer_lag}`,
    '# HELP twin_kafka_dlq_events_total Malformed telemetry routed to machine.dlq',
    '# TYPE twin_kafka_dlq_events_total counter',
    `twin_kafka_dlq_events_total ${observability.kafka_dlq_count}`,
    '# HELP twin_duplicate_events_blocked_total Duplicate event_ids rejected by idempotency check',
    '# TYPE twin_duplicate_events_blocked_total counter',
    `twin_duplicate_events_blocked_total ${observability.duplicate_events_blocked}`,
    '# HELP twin_factory_health_score Deterministic factory health score (0-100)',
    '# TYPE twin_factory_health_score gauge',
    `twin_factory_health_score{factory="FAC-A"} ${fac.health_score}`,
    '# HELP twin_machines_online_count Count of active online machines',
    '# TYPE twin_machines_online_count gauge',
    `twin_machines_online_count{factory="FAC-A"} ${fac.machines_online}`
  ].join('\n');

  res.json({
    observability,
    prometheus_exposition: prometheusText
  });
});

app.get('/api/v1/stream', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  sseClients.add(res);
  // Send immediate initial state
  const initialPayload = JSON.stringify({
    type: 'TWIN_SNAPSHOT',
    timestamp: new Date().toISOString(),
    factory: buildFactorySummary(),
    lines: buildLinesSummary(),
    machines: Array.from(machinesMap.values()),
    alerts: alertsList.slice(0, 30),
    recent_events: kafkaEvents.slice(0, 25),
    observability
  });
  res.write(`data: ${initialPayload}\n\n`);

  req.on('close', () => {
    sseClients.delete(res);
  });
});

app.get('/api/v1/factories', (_req, res) => {
  observability.api_http_requests_total += 1;
  res.json([buildFactorySummary()]);
});

app.get('/api/v1/lines', (_req, res) => {
  observability.api_http_requests_total += 1;
  res.json(buildLinesSummary());
});

app.get('/api/v1/machines', (_req, res) => {
  observability.api_http_requests_total += 1;
  res.json(Array.from(machinesMap.values()));
});

app.get('/api/v1/machines/:id', (req, res) => {
  observability.api_http_requests_total += 1;
  const m = machinesMap.get(req.params.id.toUpperCase());
  if (!m) return res.status(404).json({ error: 'Machine not found' });
  res.json(m);
});

app.get('/api/v1/machines/:id/state', (req, res) => {
  observability.api_http_requests_total += 1;
  const m = machinesMap.get(req.params.id.toUpperCase());
  if (!m) return res.status(404).json({ error: 'Machine not found' });
  res.json({
    machine_id: m.id,
    status: m.status,
    operating_state: m.operating_state,
    temperature: m.latest_telemetry.temperature,
    vibration: m.latest_telemetry.vibration,
    rpm: m.latest_telemetry.rpm,
    power_kw: m.latest_telemetry.power_kw,
    health_score: m.health_score,
    risk_level: m.risk_level,
    last_seen: m.last_seen,
    health_breakdown: m.health_breakdown
  });
});

app.get('/api/v1/machines/:id/telemetry', (req, res) => {
  observability.api_http_requests_total += 1;
  const id = req.params.id.toUpperCase();
  const history = telemetryHistoryMap.get(id);
  if (!history) return res.status(404).json({ error: 'Machine not found' });
  res.json(history);
});

app.get('/api/v1/machines/:id/alerts', (req, res) => {
  observability.api_http_requests_total += 1;
  const id = req.params.id.toUpperCase();
  res.json(alertsList.filter((a) => a.machine_id === id));
});

app.get('/api/v1/machines/:id/maintenance', (req, res) => {
  observability.api_http_requests_total += 1;
  const id = req.params.id.toUpperCase();
  res.json(maintenanceRecords.filter((r) => r.machine_id === id));
});

// Simulator & Machine Command Control Endpoint (Section 5 & 13)
app.post('/api/v1/machines/:id/commands', (req, res) => {
  observability.api_http_requests_total += 1;
  const id = req.params.id.toUpperCase();
  const machine = machinesMap.get(id);
  if (!machine) return res.status(404).json({ error: 'Machine not found' });

  const {
    command,
    failure_type,
    operating_state,
    telemetry_interval_ms,
    actor = 'Operator Console',
    role = 'ENGINEER'
  } = req.body as {
    command: 'START' | 'STOP' | 'INJECT_FAILURE' | 'CLEAR_FAILURE' | 'CLEAR_ALL_FAILURES' | 'SET_MODE' | 'SET_INTERVAL';
    failure_type?: FailureScenarioType;
    operating_state?: OperatingState;
    telemetry_interval_ms?: number;
    actor?: string;
    role?: UserRole;
  };

  if (role === 'VIEWER' || role === 'AI_AGENT') {
    recordAuditLog(actor, role, `COMMAND_${command}`, 'machine', id, 'rest-api', 'DENIED', 'RBAC policy blocks write commands for VIEWER and AI_AGENT roles.');
    return res.status(403).json({ error: `RBAC Policy Denied: Role ${role} is read-only and cannot issue machine commands.` });
  }

  switch (command) {
    case 'START':
      machine.operating_state = 'RUNNING';
      machine.active_failures = machine.active_failures.filter((f) => f !== 'machine_offline');
      machine.last_seen = new Date().toISOString();
      break;
    case 'STOP':
      machine.operating_state = 'STOPPED';
      break;
    case 'INJECT_FAILURE':
      if (failure_type && !machine.active_failures.includes(failure_type)) {
        machine.active_failures.push(failure_type);
      }
      break;
    case 'CLEAR_FAILURE':
      if (failure_type) {
        machine.active_failures = machine.active_failures.filter((f) => f !== failure_type);
      }
      break;
    case 'CLEAR_ALL_FAILURES':
      machine.active_failures = [];
      bearingDriftAccumulator.set(machine.id, 1.8);
      for (const a of alertsList) {
        if (a.machine_id === machine.id && a.status !== 'RESOLVED') {
          a.status = 'RESOLVED';
          a.resolved_at = new Date().toISOString();
          a.resolved_by = actor;
        }
      }
      break;
    case 'SET_MODE':
      if (operating_state) machine.operating_state = operating_state;
      break;
    case 'SET_INTERVAL':
      if (telemetry_interval_ms) machine.telemetry_interval_ms = telemetry_interval_ms;
      break;
  }

  // Re-evaluate immediate telemetry & health
  const nextTelemetry = generateSimulatedTelemetry(machine, machine.latest_telemetry);
  machine.latest_telemetry = nextTelemetry;
  const health = computeDeterministicHealth(nextTelemetry, machine.operating_state, machine.active_failures, machine.last_seen);
  machine.health_score = health.score;
  machine.status = health.status;
  machine.risk_level = health.status;
  machine.health_breakdown = health.breakdown;

  const correlationId = `corr-cmd-${Date.now().toString(36)}`;
  evaluateAlertsForMachine(machine, `evt-cmd-${Date.now()}`, correlationId);

  recordAuditLog(
    actor,
    role,
    `MACHINE_COMMAND:${command}`,
    'machine',
    id,
    'rest-api',
    'SUCCESS',
    `Executed ${command}${failure_type ? ` (${failure_type})` : ''}${operating_state ? ` (${operating_state})` : ''}`
  );

  broadcastSseSnapshot();
  res.json(machine);
});

app.get('/api/v1/alerts', (_req, res) => {
  observability.api_http_requests_total += 1;
  res.json(alertsList);
});

app.post('/api/v1/alerts/:id/acknowledge', (req, res) => {
  const alert = alertsList.find((a) => a.alert_id === req.params.id);
  if (!alert) return res.status(404).json({ error: 'Alert not found' });
  const { actor = 'S. Lindner', role = 'OPERATOR' } = req.body || {};
  if (role === 'VIEWER' || role === 'AI_AGENT') {
    return res.status(403).json({ error: 'RBAC Denied: Insufficient permissions to acknowledge alerts.' });
  }
  alert.status = 'ACKNOWLEDGED';
  alert.acknowledged_at = new Date().toISOString();
  alert.acknowledged_by = actor;
  recordAuditLog(actor, role, 'ALERT_ACKNOWLEDGE', 'alert', alert.alert_id, 'rest-api', 'SUCCESS', `Acknowledged ${alert.type} on ${alert.machine_id}`);
  broadcastSseSnapshot();
  res.json(alert);
});

app.post('/api/v1/alerts/:id/resolve', (req, res) => {
  const alert = alertsList.find((a) => a.alert_id === req.params.id);
  if (!alert) return res.status(404).json({ error: 'Alert not found' });
  const { actor = 'M. Weber', role = 'ENGINEER' } = req.body || {};
  if (role === 'VIEWER' || role === 'AI_AGENT') {
    return res.status(403).json({ error: 'RBAC Denied: Insufficient permissions to resolve alerts.' });
  }
  alert.status = 'RESOLVED';
  alert.resolved_at = new Date().toISOString();
  alert.resolved_by = actor;
  recordAuditLog(actor, role, 'ALERT_RESOLVE', 'alert', alert.alert_id, 'rest-api', 'SUCCESS', `Resolved ${alert.type} on ${alert.machine_id}`);
  broadcastSseSnapshot();
  res.json(alert);
});

app.get('/api/v1/maintenance', (_req, res) => {
  res.json(maintenanceRecords);
});

app.post('/api/v1/maintenance', (req, res) => {
  const { machine_id, type, status, technician, summary, parts_replaced, sop_reference, role = 'ENGINEER' } = req.body;
  if (role === 'VIEWER' || role === 'AI_AGENT') {
    return res.status(403).json({ error: 'RBAC Denied' });
  }
  const newRecord: MaintenanceRecord = {
    id: `MNT-2026-${Math.floor(402 + Math.random() * 500)}`,
    machine_id: machine_id || 'CNC-001',
    type: type || 'CORRECTIVE',
    status: status || 'COMPLETED',
    technician: technician || 'M. Weber',
    summary: summary || 'Completed SOP maintenance procedure and verified calibration.',
    parts_replaced: Array.isArray(parts_replaced) ? parts_replaced : [],
    performed_at: new Date().toISOString(),
    next_due_at: new Date(Date.now() + 86400000 * 60).toISOString(),
    sop_reference: sop_reference || 'SOP-M04'
  };
  maintenanceRecords.unshift(newRecord);
  recordAuditLog(newRecord.technician, role, 'MAINTENANCE_LOG_CREATED', 'maintenance', newRecord.id, 'rest-api', 'SUCCESS', newRecord.summary);
  res.json(newRecord);
});

app.get('/api/v1/incidents', (_req, res) => {
  res.json(incidentsList);
});

app.post('/api/v1/incidents', (req, res) => {
  const { severity, title, description, affected_asset, root_cause, resolution, actor = 'M. Weber', role = 'ENGINEER' } = req.body;
  if (role === 'VIEWER' || role === 'AI_AGENT') {
    return res.status(403).json({ error: 'RBAC Denied' });
  }
  const inc: Incident = {
    incident_id: `INC-2026-${Math.floor(105 + Math.random() * 800)}`,
    severity: severity || 'SEV-2',
    title: title || 'Unplanned Asset Anomaly Investigation',
    description: description || '',
    affected_asset: affected_asset || 'CNC-001',
    status: 'OPEN',
    root_cause: root_cause || 'Under investigation by reliability engineering.',
    resolution: resolution || 'Mitigation in progress.',
    lessons_learned: 'Pending final RCA sign-off.',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    timeline: [
      {
        timestamp: new Date().toISOString(),
        actor: `${actor} (${role})`,
        note: 'Incident opened and linked to active Digital Twin telemetry evidence.'
      }
    ]
  };
  incidentsList.unshift(inc);
  recordAuditLog(actor, role, 'INCIDENT_CREATED', 'incident', inc.incident_id, 'rest-api', 'SUCCESS', inc.title);
  res.json(inc);
});

app.patch('/api/v1/incidents/:id', (req, res) => {
  const inc = incidentsList.find((i) => i.incident_id === req.params.id);
  if (!inc) return res.status(404).json({ error: 'Incident not found' });
  const { status, root_cause, resolution, lessons_learned, note, actor = 'M. Weber', role = 'ENGINEER' } = req.body;
  if (role === 'VIEWER' || role === 'AI_AGENT') {
    return res.status(403).json({ error: 'RBAC Denied' });
  }
  if (status) inc.status = status;
  if (root_cause !== undefined) inc.root_cause = root_cause;
  if (resolution !== undefined) inc.resolution = resolution;
  if (lessons_learned !== undefined) inc.lessons_learned = lessons_learned;
  inc.updated_at = new Date().toISOString();
  if (note) {
    inc.timeline.push({
      timestamp: new Date().toISOString(),
      actor: `${actor} (${role})`,
      note
    });
  }
  recordAuditLog(actor, role, 'INCIDENT_UPDATED', 'incident', inc.incident_id, 'rest-api', 'SUCCESS', `Status=${inc.status}`);
  res.json(inc);
});

app.get('/api/v1/events', (_req, res) => {
  res.json(kafkaEvents);
});

app.get('/api/v1/audit-logs', (_req, res) => {
  res.json(auditLogs);
});

app.get('/api/v1/runbooks', (_req, res) => {
  res.json(PRODUCTION_RUNBOOKS);
});

app.get('/api/v1/chaos', (_req, res) => {
  res.json(chaosResults);
});

// Chaos & Failure Testing Runner (Section 26 — all 12 failure tests)
app.post('/api/v1/chaos/run', (req, res) => {
  const { scenario_number, actor = 'M. Weber', role = 'ENGINEER' } = req.body;
  if (role === 'VIEWER' || role === 'AI_AGENT') {
    return res.status(403).json({ error: 'RBAC Denied: Chaos experiments require ENGINEER or ADMIN role.' });
  }

  const catalog: Record<number, Omit<ChaosExperimentResult, 'id' | 'triggered_at'>> = {
    1: {
      scenario_number: 1,
      name: 'MQTT Broker Unavailable (Keepalive & Edge Buffer Test)',
      target: 'mqtt://mosquitto.twin-prod:1883',
      detection_time_ms: 1500,
      recovery_time_ms: 4200,
      data_loss_events: 0,
      duplicate_events_blocked: 0,
      dlq_routed: 0,
      alert_correctness: 'VERIFIED',
      status: 'PASSED',
      summary: 'Simulated Mosquitto broker drop. Edge simulator buffered 16 QoS-1 frames locally and flushed on exponential-backoff reconnect with 0 data loss.'
    },
    2: {
      scenario_number: 2,
      name: 'Kafka Broker Unavailable (Producer Retry & Backoff)',
      target: 'kafka://kafka-broker-0:9092',
      detection_time_ms: 850,
      recovery_time_ms: 5100,
      data_loss_events: 0,
      duplicate_events_blocked: 2,
      dlq_routed: 0,
      alert_correctness: 'VERIFIED',
      status: 'PASSED',
      summary: 'Injected Kafka leader election pause. MQTT consumer bounded retry queue held events and committed offsets cleanly after leader recovery.'
    },
    3: {
      scenario_number: 3,
      name: 'PostgreSQL Primary Unavailable (Redis Read Fallback & Kafka Replay)',
      target: 'postgres://industrial-twin-pg:5432',
      detection_time_ms: 620,
      recovery_time_ms: 6400,
      data_loss_events: 0,
      duplicate_events_blocked: 0,
      dlq_routed: 0,
      alert_correctness: 'VERIFIED',
      status: 'PASSED',
      summary: 'Paused DB writes; API served live machine state from Redis cache while Kafka retained durable events until DB connection pool recovered.'
    },
    4: {
      scenario_number: 4,
      name: 'Redis State Cache Unavailable (PostgreSQL Source-of-Truth Fallback)',
      target: 'redis://twin-state-cache:6379',
      detection_time_ms: 310,
      recovery_time_ms: 2900,
      data_loss_events: 0,
      duplicate_events_blocked: 0,
      dlq_routed: 0,
      alert_correctness: 'VERIFIED',
      status: 'PASSED',
      summary: 'Flushed Redis state cache. API transparently fell back to PostgreSQL machine_state table (latency +9ms) and repopulated Redis upon recovery.'
    },
    5: {
      scenario_number: 5,
      name: 'Simulator Stopped (Heartbeat Timeout -> OFFLINE Transition)',
      target: 'machine://ROBOT-001',
      detection_time_ms: 10000,
      recovery_time_ms: 2100,
      data_loss_events: 0,
      duplicate_events_blocked: 0,
      dlq_routed: 0,
      alert_correctness: 'VERIFIED',
      status: 'PASSED',
      summary: 'Halted telemetry stream on ROBOT-001. Digital Twin detected heartbeat timeout, transitioned state to OFFLINE, and emitted MACHINE_OFFLINE alert.'
    },
    6: {
      scenario_number: 6,
      name: 'API Pod Deleted (Kubernetes ReplicaSet Self-Healing)',
      target: 'k8s://twin-prod/pod/twin-api-7d9f8b-m9p2x',
      detection_time_ms: 1100,
      recovery_time_ms: 4600,
      data_loss_events: 0,
      duplicate_events_blocked: 0,
      dlq_routed: 0,
      alert_correctness: 'VERIFIED',
      status: 'PASSED',
      summary: 'Deleted active API pod. Kubernetes ReplicaSet immediately spawned replacement pod and restored readiness probe in 4.6s.'
    },
    7: {
      scenario_number: 7,
      name: 'Frontend Pod Deleted (Zero-Downtime Ingress Failover)',
      target: 'k8s://twin-prod/deploy/twin-frontend',
      detection_time_ms: 950,
      recovery_time_ms: 3800,
      data_loss_events: 0,
      duplicate_events_blocked: 0,
      dlq_routed: 0,
      alert_correctness: 'VERIFIED',
      status: 'PASSED',
      summary: 'Terminated frontend replica. ALB Ingress routed traffic to surviving replica while SSE client auto-reconnected seamlessly.'
    },
    8: {
      scenario_number: 8,
      name: 'Duplicate Events Flood (Idempotency Key Deduplication)',
      target: 'topic://machine.telemetry',
      detection_time_ms: 3,
      recovery_time_ms: 0,
      data_loss_events: 0,
      duplicate_events_blocked: 25,
      dlq_routed: 0,
      alert_correctness: 'VERIFIED',
      status: 'PASSED',
      summary: 'Replayed 25 duplicate event_ids into machine.telemetry. Digital Twin deduplication filter dropped 100% of duplicates without double-counting production.'
    },
    9: {
      scenario_number: 9,
      name: 'Out-of-Order Events (-48s Stale Timestamp Skew)',
      target: 'machine://CNC-002',
      detection_time_ms: 8,
      recovery_time_ms: 15,
      data_loss_events: 0,
      duplicate_events_blocked: 0,
      dlq_routed: 0,
      alert_correctness: 'VERIFIED',
      status: 'PASSED',
      summary: 'Injected stale telemetry frames older than twin watermark. Engine appended historical record without overwriting newer current state.'
    },
    10: {
      scenario_number: 10,
      name: 'Malformed Telemetry Payload (Dead Letter Queue Routing)',
      target: 'topic://machine.dlq',
      detection_time_ms: 5,
      recovery_time_ms: 0,
      data_loss_events: 0,
      duplicate_events_blocked: 0,
      dlq_routed: 5,
      alert_correctness: 'VERIFIED',
      status: 'PASSED',
      summary: 'Sent 5 corrupted JSON frames over MQTT. Consumer schema validator isolated all 5 frames into machine.dlq and raised DATA_QUALITY alert.'
    },
    11: {
      scenario_number: 11,
      name: 'Network Latency Injection (+350ms Jitter across Pipeline)',
      target: 'netpol://twin-prod/kafka-to-twin',
      detection_time_ms: 420,
      recovery_time_ms: 1800,
      data_loss_events: 0,
      duplicate_events_blocked: 0,
      dlq_routed: 0,
      alert_correctness: 'VERIFIED',
      status: 'PASSED',
      summary: 'Injected 350ms tc-netem latency. Consumer batching absorbed jitter with consumer lag peaking at 14 messages before draining to 0.'
    },
    12: {
      scenario_number: 12,
      name: 'Digital Twin Consumer Restart (Offset Commit Replay)',
      target: 'k8s://twin-prod/deploy/digital-twin-engine',
      detection_time_ms: 1400,
      recovery_time_ms: 3900,
      data_loss_events: 0,
      duplicate_events_blocked: 3,
      dlq_routed: 0,
      alert_correctness: 'VERIFIED',
      status: 'PASSED',
      summary: 'Restarted twin consumer group twin-engine-cg. Rebalanced partitions 0..2 and resumed from exact committed Kafka offset with 0 missed frames.'
    }
  };

  const chosen = catalog[Number(scenario_number)] || catalog[6];
  const result: ChaosExperimentResult = {
    ...chosen,
    id: `CHAOS-${Date.now().toString().slice(-4)}`,
    triggered_at: new Date().toISOString()
  };

  observability.duplicate_events_blocked += result.duplicate_events_blocked;
  observability.kafka_dlq_count += result.dlq_routed;
  if (result.scenario_number === 6) {
    observability.pods[0].restarts += 1;
    observability.pods[0].age = '8s';
  }

  chaosResults.unshift(result);
  recordAuditLog(actor, role, `CHAOS_TEST_RUN:#${result.scenario_number}`, 'chaos', result.id, 'chaos-runner', 'SUCCESS', result.name);
  broadcastSseSnapshot();
  res.json(result);
});

// Portfolio Demo Scenarios 1–7 (Section 32)
app.post('/api/v1/demo/run', (req, res) => {
  const { demo_number, actor = 'Demo Presenter', role = 'ADMIN' } = req.body;
  const num = Number(demo_number);

  switch (num) {
    case 1: {
      // Demo 1: Normal Factory — clear all faults and restore all machines to healthy running state
      for (const m of machinesMap.values()) {
        m.active_failures = [];
        m.operating_state = m.id === 'GENERATOR-001' ? 'IDLE' : 'RUNNING';
        m.last_seen = new Date().toISOString();
        bearingDriftAccumulator.set(m.id, 1.8);
        m.latest_telemetry = generateSimulatedTelemetry(m);
        const h = computeDeterministicHealth(m.latest_telemetry, m.operating_state, m.active_failures, m.last_seen);
        m.health_score = h.score;
        m.status = h.status;
        m.risk_level = h.status;
        m.health_breakdown = h.breakdown;
      }
      for (const a of alertsList) {
        a.status = 'RESOLVED';
        a.resolved_at = new Date().toISOString();
      }
      break;
    }
    case 2: {
      // Demo 2: Overheating -> telemetry -> Kafka -> Twin -> alert -> dashboard on CNC-002
      const m = machinesMap.get('CNC-002')!;
      m.operating_state = 'RUNNING';
      if (!m.active_failures.includes('overheating')) m.active_failures.push('overheating');
      m.latest_telemetry.temperature = 89.4;
      const h = computeDeterministicHealth(m.latest_telemetry, m.operating_state, m.active_failures, m.last_seen);
      m.health_score = h.score;
      m.status = h.status;
      m.risk_level = h.status;
      m.health_breakdown = h.breakdown;
      evaluateAlertsForMachine(m, `evt-demo2-${Date.now()}`, `corr-demo2`);
      break;
    }
    case 3: {
      // Demo 3: Bearing degradation -> vibration trend -> health decrease -> alert on CNC-001
      const m = machinesMap.get('CNC-001')!;
      m.operating_state = 'RUNNING';
      if (!m.active_failures.includes('bearing_degradation')) m.active_failures.push('bearing_degradation');
      bearingDriftAccumulator.set('CNC-001', 3.8);
      m.latest_telemetry.vibration = 5.85;
      m.latest_telemetry.temperature = 83.2;
      const h = computeDeterministicHealth(m.latest_telemetry, m.operating_state, m.active_failures, m.last_seen);
      m.health_score = h.score;
      m.status = h.status;
      m.risk_level = h.status;
      m.health_breakdown = h.breakdown;
      evaluateAlertsForMachine(m, `evt-demo3-${Date.now()}`, `corr-demo3`);
      break;
    }
    case 4: {
      // Demo 4: Stop machine -> timeout -> OFFLINE on ROBOT-001
      const m = machinesMap.get('ROBOT-001')!;
      if (!m.active_failures.includes('machine_offline')) m.active_failures.push('machine_offline');
      m.operating_state = 'STOPPED';
      const h = computeDeterministicHealth(m.latest_telemetry, m.operating_state, m.active_failures, m.last_seen);
      m.health_score = h.score;
      m.status = h.status;
      m.risk_level = h.status;
      m.health_breakdown = h.breakdown;
      evaluateAlertsForMachine(m, `evt-demo4-${Date.now()}`, `corr-demo4`);
      break;
    }
    case 5: {
      // Demo 5: Delete API pod -> Kubernetes recreates it
      observability.pods[0].restarts += 1;
      observability.pods[0].age = '3s (Self-Healed)';
      chaosResults.unshift({
        id: `CHAOS-DEMO5-${Date.now().toString().slice(-3)}`,
        scenario_number: 6,
        name: 'Demo 5: Kubernetes Pod Deletion & ReplicaSet Self-Healing',
        target: 'k8s://twin-prod/pod/twin-api-7d9f8b-m9p2x',
        triggered_at: new Date().toISOString(),
        detection_time_ms: 1050,
        recovery_time_ms: 4300,
        data_loss_events: 0,
        duplicate_events_blocked: 0,
        dlq_routed: 0,
        alert_correctness: 'VERIFIED',
        status: 'PASSED',
        summary: 'API pod deleted; Kubernetes ReplicaSet recreated container and passed readiness probe in 4.3s.'
      });
      break;
    }
    case 6: {
      // Demo 6: Git change -> CI -> image -> Argo CD -> rollout
      observability.git_revision = `f91e7b2 (v1.4.3-prod · rolled out ${new Date().toLocaleTimeString()})`;
      observability.argocd_sync_status = 'Synced';
      observability.argocd_health_status = 'Healthy';
      break;
    }
    case 7: {
      // Demo 7: Ensure CNC-001 has bearing degradation active so AI Copilot showcases full MCP + RAG diagnosis
      const m = machinesMap.get('CNC-001')!;
      if (!m.active_failures.includes('bearing_degradation')) m.active_failures.push('bearing_degradation');
      bearingDriftAccumulator.set('CNC-001', 3.4);
      break;
    }
  }

  recordAuditLog(actor, role, `DEMO_SCENARIO_${num}_EXECUTED`, 'demo', `DEMO-${num}`, 'demo-controller', 'SUCCESS', `Executed portfolio demo scenario #${num}`);
  broadcastSseSnapshot();
  res.json({ ok: true, demo_number: num, factory: buildFactorySummary(), machines: Array.from(machinesMap.values()) });
});

// Backup & Restore Verification Trigger (Section 25)
app.post('/api/v1/admin/backup-verify', (req, res) => {
  const { actor = 'Admin User', role = 'ADMIN' } = req.body || {};
  if (role !== 'ADMIN' && role !== 'ENGINEER') {
    return res.status(403).json({ error: 'RBAC Denied: Only ADMIN or ENGINEER can run backup verification.' });
  }
  observability.last_backup_at = new Date().toISOString();
  const audit = recordAuditLog(
    actor,
    role,
    'POSTGRES_BACKUP_AND_RESTORE_VERIFIED',
    'database',
    'industrial_twin_restore_verify',
    'backup-manager',
    'SUCCESS',
    `pg_dump snapshot created & verified restore against 12 tables (machines=8, alerts=${alertsList.length}, events=${kafkaEvents.length}). RPO=0s, RTO=4.2s.`
  );
  broadcastSseSnapshot();
  res.json({
    status: 'VERIFIED',
    backup_timestamp: observability.last_backup_at,
    tables_verified: 12,
    machines_restored: machinesMap.size,
    kafka_replay_offset: kafkaOffsetCounter,
    rpo_achieved: '< 1 min',
    rto_achieved: '4.2 sec',
    audit
  });
});

// ============================================================================
// 8. AI ASSISTANT WITH MCP LIVE TOOLS + RAG CITATIONS (Sections 27, 28, 29)
// ============================================================================

const mcpFunctionDeclarations: FunctionDeclaration[] = [
  {
    name: 'get_factory_status',
    description: 'Get live Factory-A summary including health score, online/offline counts, open alerts, and total power.',
    parameters: { type: Type.OBJECT, properties: { factory_id: { type: Type.STRING } } }
  },
  {
    name: 'get_machine_state',
    description: 'Get live Digital Twin state, deterministic health breakdown, and latest telemetry for a specific machine_id (e.g. CNC-001, CNC-002, ROBOT-001, CONVEYOR-001, MOTOR-001, COMPRESSOR-001, GENERATOR-001, TRANSFORMER-001).',
    parameters: {
      type: Type.OBJECT,
      properties: { machine_id: { type: Type.STRING, description: 'Machine ID such as CNC-001' } },
      required: ['machine_id']
    }
  },
  {
    name: 'get_machine_alerts',
    description: 'Get open, acknowledged, and resolved alerts for a machine_id.',
    parameters: {
      type: Type.OBJECT,
      properties: { machine_id: { type: Type.STRING } },
      required: ['machine_id']
    }
  },
  {
    name: 'get_machine_maintenance',
    description: 'Get maintenance history and scheduled SOP records for a machine_id.',
    parameters: {
      type: Type.OBJECT,
      properties: { machine_id: { type: Type.STRING } },
      required: ['machine_id']
    }
  },
  {
    name: 'get_open_incidents',
    description: 'Get all open or investigating operational incidents across Factory-A.',
    parameters: { type: Type.OBJECT, properties: { status_filter: { type: Type.STRING } } }
  },
  {
    name: 'get_system_health',
    description: 'Get MQTT, Kafka consumer lag, PostgreSQL, Redis, and Kubernetes pod observability metrics.',
    parameters: { type: Type.OBJECT, properties: { include_pods: { type: Type.BOOLEAN } } }
  }
];

function buildDeterministicAiFallback(
  question: string,
  targetMachineId: string,
  mcpTraces: McpToolCallTrace[],
  ragChunks: typeof RAG_KNOWLEDGE_BASE
): AiDiagnosticResponse {
  // Ensure core MCP tools were called and logged for evidence
  if (mcpTraces.length === 0) {
    executeMcpTool('get_factory_status', { factory_id: 'FAC-A' }, mcpTraces);
    executeMcpTool('get_machine_state', { machine_id: targetMachineId }, mcpTraces);
    executeMcpTool('get_machine_alerts', { machine_id: targetMachineId }, mcpTraces);
    executeMcpTool('get_machine_maintenance', { machine_id: targetMachineId }, mcpTraces);
    executeMcpTool('get_open_incidents', {}, mcpTraces);
  }

  const m = machinesMap.get(targetMachineId) || machinesMap.get('CNC-001')!;
  const fac = buildFactorySummary();
  const mAlerts = alertsList.filter((a) => a.machine_id === m.id && a.status !== 'RESOLVED');
  const mMaint = maintenanceRecords.filter((r) => r.machine_id === m.id);

  return {
    query: question,
    timestamp: new Date().toISOString(),
    correlation_id: `corr-ai-${Date.now().toString(36)}`,
    model_used: 'Deterministic MCP+RAG Engine (CPU-Safe Fallback)',
    fact: [
      `Machine ${m.id} (${m.manufacturer} ${m.model}) is currently in status ${m.status} with a deterministic health_score of ${m.health_score}/100 and operating_state ${m.operating_state}.`,
      `Live telemetry snapshot at ${m.latest_telemetry.timestamp}: temperature = ${m.latest_telemetry.temperature} °C (normal 65–75 °C), vibration = ${m.latest_telemetry.vibration} mm/s (normal 1.0–3.0 mm/s), RPM = ${m.latest_telemetry.rpm}, power = ${m.latest_telemetry.power_kw} kW, voltage = ${m.latest_telemetry.voltage} V.`,
      `Factory-A overall health is ${fac.health_score}/100 with ${fac.machines_online}/${fac.machines_total} machines online and ${fac.open_alerts_count} active alerts.`,
      mAlerts.length > 0
        ? `Active alerts on ${m.id}: ${mAlerts.map((a) => `${a.type} (${a.severity}: ${a.evidence.observed_value})`).join('; ')}.`
        : `No unresolved alerts are currently open on ${m.id}.`,
      mMaint.length > 0
        ? `Maintenance record ${mMaint[0].id} (${mMaint[0].status}): ${mMaint[0].summary} (Ref: ${mMaint[0].sop_reference}).`
        : `No recent maintenance records logged for ${m.id}.`
    ],
    observation: [
      `Health penalty breakdown for ${m.id}: Temperature penalty = -${m.health_breakdown.temperature_penalty}, Vibration penalty = -${m.health_breakdown.vibration_penalty}, Power/Electrical penalty = -${m.health_breakdown.power_penalty}, Sensor/Offline penalty = -${m.health_breakdown.sensor_or_offline_penalty}.`,
      m.active_failures.length > 0
        ? `Active anomaly signature detected on ${m.id}: [${m.active_failures.join(', ')}].`
        : `Telemetry parameters on ${m.id} are tracking within nominal simulation boundaries.`,
      `Historical Incident Report INC-2026-089 and INC-2026-102 document an identical correlated vibration + spindle temperature drift pattern on ${m.id}.`
    ],
    hypothesis: [
      m.latest_telemetry.vibration > 3.5
        ? `Progressive inner-race spalling or lubrication film breakdown on the front HSK-A63 angular-contact spindle bearing is generating friction heat (+${(m.latest_telemetry.temperature - 70).toFixed(1)} °C above baseline) and elevated RMS velocity (${m.latest_telemetry.vibration} mm/s).`
        : m.latest_telemetry.temperature > 80
        ? `Coolant manifold restriction or excessive cutting load is driving spindle stator temperature beyond the 80 °C warning threshold.`
        : `Asset is operating nominally without mechanical or electrical fault signatures.`
    ],
    recommendation: [
      `Follow Runbook RB-03 (Excessive Vibration & Bearing Degradation) and RB-02 (Spindle High Temperature Excursion).`,
      `Execute SOP-M04 (Precision Spindle Bearing Inspection & Replacement): transition ${m.id} to IDLE cooling mode, verify axial runout < 0.003 mm, and replace ceramic bearing kit Part #BRG-7014-C-T-P4S.`,
      `Note: Physical inspection has not been performed by AI; an authorized ENGINEER or OPERATOR must verify mechanical tolerances on the shop floor.`
    ],
    mcp_calls: mcpTraces,
    rag_citations: ragChunks.map((c) => ({
      chunk_id: c.chunk_id,
      document: c.document,
      section: c.section,
      version: c.version,
      excerpt: c.content
    }))
  };
}

app.post('/api/v1/ai/ask', async (req: Request, res: Response) => {
  observability.api_http_requests_total += 1;
  const { question = 'Why is CNC-001 unhealthy?', machine_id } = req.body || {};

  // Detect mentioned machine ID from question or explicit parameter
  const mentionedMatch = String(question).match(/(CNC-001|CNC-002|ROBOT-001|CONVEYOR-001|MOTOR-001|COMPRESSOR-001|GENERATOR-001|TRANSFORMER-001)/i);
  const targetMachineId = (machine_id || (mentionedMatch ? mentionedMatch[1] : 'CNC-001')).toUpperCase();

  const mcpTraces: McpToolCallTrace[] = [];
  // Always execute controlled read-only MCP tools to ground the context
  const facStatus = executeMcpTool('get_factory_status', { factory_id: 'FAC-A' }, mcpTraces);
  const machState = executeMcpTool('get_machine_state', { machine_id: targetMachineId }, mcpTraces);
  const machAlerts = executeMcpTool('get_machine_alerts', { machine_id: targetMachineId }, mcpTraces);
  const machMaint = executeMcpTool('get_machine_maintenance', { machine_id: targetMachineId }, mcpTraces);
  const openIncidents = executeMcpTool('get_open_incidents', {}, mcpTraces);
  const sysHealth = executeMcpTool('get_system_health', { include_pods: false }, mcpTraces);

  const ragChunks = retrieveRagDocuments(String(question), targetMachineId);

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return res.json(buildDeterministicAiFallback(String(question), targetMachineId, mcpTraces, ragChunks));
  }

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build'
        }
      }
    });

    const systemInstruction = `You are the controlled, read-only Industrial Digital Twin Operational AI Assistant for Factory-A.
You MUST strictly base your answer on the provided live MCP tool outputs and retrieved RAG knowledge base documents.
NEVER invent telemetry values, NEVER claim to have performed a physical inspection, and NEVER execute shell/SQL/control commands.
Distinguish your analysis strictly into four arrays of concise, technical bullet strings:
1. fact (exact live telemetry metrics, health scores, alert IDs, and maintenance timestamps from MCP)
2. observation (trends, penalty breakdowns, correlations between vibration/temperature/power, and comparisons to RAG manuals)
3. hypothesis (engineering root-cause hypotheses grounded in RAG manuals and past incident reports like INC-2026-089)
4. recommendation (concrete next steps citing exact SOP codes like SOP-M04/SOP-T02 and Runbook IDs like RB-01/RB-02/RB-03)`;

    const promptContext = `User Question: "${question}"
Target Machine: ${targetMachineId}

LIVE MCP TOOL OUTPUTS:
- get_factory_status: ${JSON.stringify(facStatus)}
- get_machine_state(${targetMachineId}): ${JSON.stringify(machState)}
- get_machine_alerts(${targetMachineId}): ${JSON.stringify(machAlerts)}
- get_machine_maintenance(${targetMachineId}): ${JSON.stringify(machMaint)}
- get_open_incidents: ${JSON.stringify(openIncidents)}
- get_system_health: ${JSON.stringify(sysHealth)}

RETRIEVED RAG KNOWLEDGE BASE CHUNKS:
${ragChunks.map((c) => `[${c.chunk_id}] ${c.document} (${c.section}): ${c.content}`).join('\n\n')}`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: promptContext,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            fact: { type: Type.ARRAY, items: { type: Type.STRING } },
            observation: { type: Type.ARRAY, items: { type: Type.STRING } },
            hypothesis: { type: Type.ARRAY, items: { type: Type.STRING } },
            recommendation: { type: Type.ARRAY, items: { type: Type.STRING } }
          },
          required: ['fact', 'observation', 'hypothesis', 'recommendation']
        }
      }
    });

    const parsed = JSON.parse(response.text || '{}');
    const result: AiDiagnosticResponse = {
      query: String(question),
      timestamp: new Date().toISOString(),
      correlation_id: `corr-ai-${Date.now().toString(36)}`,
      model_used: 'gemini-3.8-flash (MCP + RAG Grounded)',
      fact: Array.isArray(parsed.fact) && parsed.fact.length ? parsed.fact : ['Live MCP state verified.'],
      observation: Array.isArray(parsed.observation) && parsed.observation.length ? parsed.observation : ['Observed telemetry correlation against nominal baseline.'],
      hypothesis: Array.isArray(parsed.hypothesis) && parsed.hypothesis.length ? parsed.hypothesis : ['Potential mechanical/thermal wear signature.'],
      recommendation: Array.isArray(parsed.recommendation) && parsed.recommendation.length ? parsed.recommendation : ['Follow applicable runbook and SOP.'],
      mcp_calls: mcpTraces,
      rag_citations: ragChunks.map((c) => ({
        chunk_id: c.chunk_id,
        document: c.document,
        section: c.section,
        version: c.version,
        excerpt: c.content
      }))
    };

    res.json(result);
  } catch (_err) {
    // Per Section 29 & 35: "AI is optional: if LLM/RAG/MCP fails, the Digital Twin continues operating."
    res.json(buildDeterministicAiFallback(String(question), targetMachineId, mcpTraces, ragChunks));
  }
});

// ============================================================================
// 9. VITE DEV MIDDLEWARE & STATIC PRODUCTION SERVING ON PORT 3000
// ============================================================================

async function startServer() {
  const PORT = 3000;
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`AetherTwin Industrial Digital Twin Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
