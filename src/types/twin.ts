export type OperatingState = 'RUNNING' | 'IDLE' | 'MAINTENANCE' | 'STOPPED' | 'FAULT';
export type HealthStatus = 'HEALTHY' | 'WATCH' | 'WARNING' | 'CRITICAL' | 'OFFLINE';
export type MaintenanceState = 'OPERATIONAL' | 'SCHEDULED' | 'OVERDUE' | 'IN_PROGRESS';
export type UserRole = 'ADMIN' | 'ENGINEER' | 'OPERATOR' | 'VIEWER' | 'AI_AGENT';

export type FailureScenarioType =
  | 'overheating'
  | 'bearing_degradation'
  | 'excessive_vibration'
  | 'motor_overload'
  | 'power_instability'
  | 'sensor_malfunction'
  | 'machine_offline'
  | 'intermittent_telemetry'
  | 'duplicate_events'
  | 'out_of_order_events'
  | 'malformed_telemetry';

export interface TelemetryPoint {
  timestamp: string;
  temperature: number;
  pressure: number;
  vibration: number;
  rpm: number;
  current: number;
  voltage: number;
  power_kw: number;
  production_count: number;
  operating_hours: number;
  energy_consumption: number;
}

export interface HealthPenaltyBreakdown {
  base_score: number;
  temperature_penalty: number;
  vibration_penalty: number;
  power_penalty: number;
  sensor_or_offline_penalty: number;
  final_score: number;
}

export interface Machine {
  id: string;
  name: string;
  type: string;
  manufacturer: string;
  model: string;
  serial_number: string;
  factory_id: string;
  factory_name: string;
  line_id: string;
  line_name: string;
  location: string;
  operating_state: OperatingState;
  status: HealthStatus;
  health_score: number;
  health_breakdown: HealthPenaltyBreakdown;
  risk_level: HealthStatus;
  firmware_version: string;
  last_seen: string;
  maintenance_state: MaintenanceState;
  telemetry_interval_ms: number;
  active_failures: FailureScenarioType[];
  latest_telemetry: TelemetryPoint;
  mqtt_topic: string;
}

export interface ProductionLine {
  id: string;
  factory_id: string;
  name: string;
  category: 'MACHINING' | 'ASSEMBLY' | 'POWER';
  description: string;
  machine_ids: string[];
  status: HealthStatus;
  avg_health: number;
  total_power_kw: number;
  production_rate_uph: number;
}

export interface Factory {
  id: string;
  name: string;
  region: string;
  location: string;
  status: HealthStatus;
  health_score: number;
  machines_total: number;
  machines_online: number;
  machines_running: number;
  machines_idle: number;
  machines_offline: number;
  warning_count: number;
  critical_count: number;
  open_alerts_count: number;
  total_production: number;
  total_energy_kwh: number;
  current_power_kw: number;
}

export type AlertType =
  | 'HIGH_TEMPERATURE'
  | 'HIGH_VIBRATION'
  | 'HIGH_PRESSURE'
  | 'MOTOR_OVERLOAD'
  | 'POWER_ANOMALY'
  | 'MACHINE_OFFLINE'
  | 'SENSOR_FAILURE'
  | 'DATA_QUALITY'
  | 'POSSIBLE_BEARING_FAILURE';

export type AlertLifecycleStatus = 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';

export interface Alert {
  alert_id: string;
  machine_id: string;
  machine_name: string;
  line_id: string;
  type: AlertType;
  severity: 'WARNING' | 'CRITICAL';
  title: string;
  evidence: {
    metric: string;
    observed_value: string | number;
    threshold: string;
    telemetry_snapshot: Partial<TelemetryPoint>;
  };
  status: AlertLifecycleStatus;
  created_at: string;
  acknowledged_at?: string;
  acknowledged_by?: string;
  resolved_at?: string;
  resolved_by?: string;
  correlation_id: string;
  event_id: string;
  dedup_count: number;
}

export interface MaintenanceRecord {
  id: string;
  machine_id: string;
  type: 'PREVENTIVE' | 'CORRECTIVE' | 'PREDICTIVE' | 'CALIBRATION';
  status: 'COMPLETED' | 'IN_PROGRESS' | 'SCHEDULED';
  technician: string;
  summary: string;
  parts_replaced: string[];
  performed_at: string;
  next_due_at: string;
  sop_reference: string;
}

export type IncidentStatus = 'OPEN' | 'INVESTIGATING' | 'MITIGATED' | 'RESOLVED' | 'CLOSED';

export interface IncidentTimelineEntry {
  timestamp: string;
  actor: string;
  note: string;
}

export interface Incident {
  incident_id: string;
  severity: 'SEV-1' | 'SEV-2' | 'SEV-3';
  title: string;
  description: string;
  affected_asset: string;
  status: IncidentStatus;
  root_cause: string;
  resolution: string;
  lessons_learned: string;
  created_at: string;
  updated_at: string;
  timeline: IncidentTimelineEntry[];
}

export type KafkaTopic =
  | 'machine.telemetry'
  | 'machine.status'
  | 'machine.alerts'
  | 'machine.maintenance'
  | 'machine.events'
  | 'machine.dlq';

export interface KafkaEventEnvelope {
  event_id: string;
  event_type: KafkaTopic;
  event_version: '1.0';
  machine_id: string;
  timestamp: string;
  correlation_id: string;
  source: 'mqtt-consumer' | 'digital-twin-engine' | 'alert-engine' | 'simulator-chaos';
  partition: number;
  offset: number;
  validation_status: 'VALID' | 'DUPLICATE_IGNORED' | 'OUT_OF_ORDER' | 'MALFORMED_DLQ';
  validation_error?: string;
  payload: Record<string, unknown>;
}

export interface AuditLogEntry {
  id: string;
  actor: string;
  role: UserRole;
  action: string;
  resource: string;
  resource_id: string;
  timestamp: string;
  source: string;
  correlation_id: string;
  result: 'SUCCESS' | 'DENIED' | 'ERROR';
  details?: string;
}

export interface Runbook {
  id: string;
  slug: string;
  title: string;
  category: 'MACHINE' | 'PIPELINE' | 'DATABASE' | 'INFRASTRUCTURE' | 'SECURITY';
  severity: 'HIGH' | 'CRITICAL' | 'MEDIUM';
  symptoms: string[];
  impact: string;
  checks: string[];
  commands: string[];
  expected_result: string;
  mitigation: string;
  recovery: string;
  escalation: string;
}

export interface RagDocumentChunk {
  chunk_id: string;
  document: string;
  machine_type: string;
  version: string;
  section: string;
  timestamp: string;
  source: 'MANUAL' | 'SOP' | 'RUNBOOK' | 'INCIDENT_REPORT' | 'ARCHITECTURE';
  content: string;
  keywords: string[];
}

export interface McpToolCallTrace {
  tool_name: string;
  arguments: Record<string, unknown>;
  timestamp: string;
  duration_ms: number;
  authorized_role: UserRole;
  result_summary: string;
  raw_output: unknown;
}

export interface AiDiagnosticResponse {
  query: string;
  timestamp: string;
  correlation_id: string;
  model_used: string;
  fact: string[];
  observation: string[];
  hypothesis: string[];
  recommendation: string[];
  mcp_calls: McpToolCallTrace[];
  rag_citations: {
    chunk_id: string;
    document: string;
    section: string;
    version: string;
    excerpt: string;
  }[];
}

export interface ChaosExperimentResult {
  id: string;
  scenario_number: number;
  name: string;
  target: string;
  triggered_at: string;
  detection_time_ms: number;
  recovery_time_ms: number;
  data_loss_events: number;
  duplicate_events_blocked: number;
  dlq_routed: number;
  alert_correctness: 'VERIFIED' | 'DEGRADED';
  status: 'PASSED' | 'RECOVERING';
  summary: string;
}

export interface KubernetesPodStatus {
  name: string;
  namespace: string;
  service: string;
  status: 'Running' | 'Terminating' | 'ContainerCreating' | 'CrashLoopBackOff';
  restarts: number;
  cpu_m: number;
  memory_mib: number;
  age: string;
  ready: string;
  node: string;
}

export interface SystemObservability {
  mqtt_messages_total: number;
  mqtt_connected: boolean;
  kafka_throughput_eps: number;
  kafka_consumer_lag: number;
  kafka_dlq_count: number;
  duplicate_events_blocked: number;
  out_of_order_events_flagged: number;
  postgres_latency_ms: number;
  postgres_status: 'UP' | 'DEGRADED';
  last_backup_at: string;
  rpo_target: string;
  rto_target: string;
  redis_hit_rate_pct: number;
  redis_cached_keys: number;
  api_http_requests_total: number;
  api_p95_latency_ms: number;
  api_error_rate_pct: number;
  argocd_sync_status: 'Synced' | 'OutOfSync' | 'Progressing';
  argocd_health_status: 'Healthy' | 'Progressing' | 'Degraded';
  git_revision: string;
  pods: KubernetesPodStatus[];
}
