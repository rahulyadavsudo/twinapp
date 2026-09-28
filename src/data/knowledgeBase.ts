import { Runbook, RagDocumentChunk } from '../types/twin';

export const PRODUCTION_RUNBOOKS: Runbook[] = [
  {
    id: 'RB-01',
    slug: 'machine-offline',
    title: 'Machine Offline / Telemetry Heartbeat Timeout',
    category: 'MACHINE',
    severity: 'CRITICAL',
    symptoms: [
      'Machine status transitions to OFFLINE in Digital Twin state store.',
      'No MQTT messages received on factory/FAC-A/line/*/machine/{id}/telemetry for > 10 seconds.',
      'Alert MACHINE_OFFLINE triggered with severity CRITICAL.'
    ],
    impact: 'Production line throughput degraded; blind spot in real-time thermal and vibration safety monitoring.',
    checks: [
      'Verify PLC edge gateway power and Ethernet link LED on local cabinet.',
      'Check Mosquitto/EMQX broker active client sessions for machine client_id.',
      'Inspect mqtt-consumer structured logs for TLS handshake or ACL rejection errors.'
    ],
    commands: [
      'curl -s http://localhost:3000/api/v1/machines/CNC-001/state | jq .',
      'mosquitto_sub -h mqtt.factory-a.local -t "factory/FAC-A/+/machine/CNC-001/#" -v -C 1',
      'kubectl logs -n twin-prod deploy/mqtt-consumer --tail=50 | grep "CNC-001"'
    ],
    expected_result: 'Edge gateway responds to ping and reconnects MQTT session with QoS 1 keepalive=15s.',
    mitigation: 'Switch upstream material routing to redundant machining cell if downtime exceeds 5 minutes.',
    recovery: 'Restart machine simulator/edge agent or issue START command via /api/v1/machines/{id}/commands. Confirm 3 consecutive telemetry frames clear MACHINE_OFFLINE alert.',
    escalation: 'Page Plant Controls Engineer (On-Call Rotation Tier 2) if physical PLC cabinet is unresponsive.'
  },
  {
    id: 'RB-02',
    slug: 'high-temperature',
    title: 'Spindle / Stator High Temperature Excursion (> 80 °C)',
    category: 'MACHINE',
    severity: 'CRITICAL',
    symptoms: [
      'Telemetry temperature exceeds 80.0 °C (WATCH at 76 °C, WARNING at 80 °C, CRITICAL at 88 °C).',
      'Deterministic health score drops below 70 due to thermal penalty.',
      'HIGH_TEMPERATURE alert active on CNC or Motor asset.'
    ],
    impact: 'Risk of thermal expansion inaccuracy, lubrication breakdown, or stator winding insulation damage.',
    checks: [
      'Compare spindle/motor current draw (A) and power (kW) against normal baseline (7–10 kW).',
      'Verify glycol chiller loop pressure (should be 5.5–6.8 bar) and heat exchanger fan operation.',
      'Check if bearing_degradation or motor_overload fault is co-occurring.'
    ],
    commands: [
      'curl -s http://localhost:3000/api/v1/machines/CNC-001/telemetry?limit=10',
      'curl -X POST http://localhost:3000/api/v1/machines/CNC-001/commands -d \'{"command":"SET_MODE","mode":"IDLE"}\''
    ],
    expected_result: 'Machine transitions to IDLE cooling cycle; temperature decays toward 68–72 °C nominal band within 60 seconds.',
    mitigation: 'Throttle spindle feed rate to 70% or command IDLE mode to maintain coolant circulation without cutting load.',
    recovery: 'Flush cooling manifold per SOP-T02, clear thermal fault injection, and verify temperature stabilizes < 74 °C.',
    escalation: 'Escalate to Mechanical Reliability Lead if temperature exceeds 92 °C.'
  },
  {
    id: 'RB-03',
    slug: 'high-vibration',
    title: 'Excessive Vibration & Bearing Degradation Signature',
    category: 'MACHINE',
    severity: 'HIGH',
    symptoms: [
      'Vibration velocity RMS exceeds 3.5 mm/s (normal 1.0–3.0 mm/s).',
      'Gradual upward trend in vibration paired with secondary temperature rise (+4 to +9 °C).',
      'Alerts HIGH_VIBRATION or POSSIBLE_BEARING_FAILURE emitted.'
    ],
    impact: 'Surface finish defects on machined parts; imminent catastrophic spindle bearing seizure if unaddressed.',
    checks: [
      'Inspect vibration time-series chart for monotonic climb vs sudden step spike.',
      'Query maintenance history via MCP get_machine_maintenance(machine_id) for last bearing lubrication date.',
      'Check tool holder balance and chuck clamping pressure.'
    ],
    commands: [
      'curl -s http://localhost:3000/api/v1/machines/CNC-001/alerts',
      'curl -s http://localhost:3000/api/v1/machines/CNC-001/maintenance'
    ],
    expected_result: 'Root cause isolated to either unbalanced tooling (step spike) or inner-race spalling (progressive climb).',
    mitigation: 'Reduce RPM from 1450 to 1100 RPM and schedule predictive bearing replacement window.',
    recovery: 'Execute Bearing Replacement SOP-M04, log maintenance record, and clear bearing_degradation fault.',
    escalation: 'Notify Quality Assurance to quarantine batch if vibration exceeded 6.5 mm/s during cutting.'
  },
  {
    id: 'RB-04',
    slug: 'kafka-lag',
    title: 'Kafka Consumer Lag Spike on machine.telemetry',
    category: 'PIPELINE',
    severity: 'HIGH',
    symptoms: [
      'kafka_consumer_group_lag on group twin-engine-cg exceeds 500 messages.',
      'Dashboard last_seen timestamps trail real wall-clock time by > 5 seconds.'
    ],
    impact: 'Delayed anomaly detection and stale Digital Twin state projections.',
    checks: [
      'Check partition skew across machine.telemetry partitions (0, 1, 2).',
      'Inspect PostgreSQL write latency (db_write_duration_ms) for lock contention.',
      'Check if duplicate/malformed event flood is saturating consumer validation.'
    ],
    commands: [
      'kafka-consumer-groups.sh --bootstrap-server kafka:9092 --describe --group twin-engine-cg',
      'kubectl scale deploy/digital-twin-engine -n twin-prod --replicas=3'
    ],
    expected_result: 'Consumer group rebalances partitions across replicas and drains lag to < 15 messages.',
    mitigation: 'Enable batch upsert mode on telemetry history table while keeping Redis state hot.',
    recovery: 'Verify consumer lag returns to 0 and DLQ rate is nominal.',
    escalation: 'Escalate to Data Platform Engineering if broker disk I/O exceeds 85%.'
  },
  {
    id: 'RB-05',
    slug: 'mqtt-unavailable',
    title: 'MQTT Broker Unavailable / Connection Storm',
    category: 'PIPELINE',
    severity: 'CRITICAL',
    symptoms: [
      'mqtt-consumer service reports ECONNREFUSED or keepalive timeout to broker.',
      'All factory telemetry ingestion halts simultaneously.'
    ],
    impact: 'Total loss of live edge ingestion until broker availability is restored.',
    checks: [
      'Check Mosquitto/EMQX pod status and PVC mount health.',
      'Verify TLS server certificate validity and port 1883/8883 network policy.'
    ],
    commands: [
      'kubectl get pods -n twin-prod -l app=mqtt-broker',
      'kubectl rollout restart statefulset/mqtt-broker -n twin-prod'
    ],
    expected_result: 'Broker pod passes TCP readiness probe and simulator clients auto-reconnect with exponential backoff.',
    mitigation: 'Edge simulators buffer up to 1,000 QoS 1 messages locally during broker outage.',
    recovery: 'Confirm mqtt_messages_total counter resumes incrementing in Prometheus.',
    escalation: 'Page Edge Infrastructure On-Call.'
  },
  {
    id: 'RB-06',
    slug: 'database-unavailable',
    title: 'PostgreSQL Primary Unavailable / Connection Pool Exhaustion',
    category: 'DATABASE',
    severity: 'CRITICAL',
    symptoms: [
      'GET /api/v1/ready returns HTTP 503 with postgres_status: DEGRADED.',
      'SQLAlchemy/Pool timeout errors in digital-twin-engine and api logs.'
    ],
    impact: 'Durable telemetry history, alert persistence, and audit logging degraded; Redis serves cached reads.',
    checks: [
      'Check pg_stat_activity for idle-in-transaction locks or maxed connections.',
      'Verify RDS/StatefulSet storage volume free space.'
    ],
    commands: [
      'pg_isready -h postgres.twin-prod.svc.cluster.local -p 5432',
      'psql -U twin_admin -d industrial_twin -c "SELECT state, count(*) FROM pg_stat_activity GROUP BY state;"'
    ],
    expected_result: 'PostgreSQL accepts connections and transaction commit latency is < 10ms.',
    mitigation: 'Digital Twin engine buffers uncommitted events in Kafka (durable 7-day retention) for zero data loss.',
    recovery: 'Restore DB connection pool; Kafka consumer automatically replays from last committed offset.',
    escalation: 'Engage DBA / Cloud Infrastructure team for PITR or failover.'
  },
  {
    id: 'RB-07',
    slug: 'redis-unavailable',
    title: 'Redis State Cache Unavailable',
    category: 'DATABASE',
    severity: 'MEDIUM',
    symptoms: [
      'Redis health check fails; cache hit rate drops to 0%.',
      'API latency increases from ~4ms to ~18ms as reads fall back to PostgreSQL.'
    ],
    impact: 'Increased read load on PostgreSQL; rate-limiting and short-lived cache degraded, but zero data loss.',
    checks: [
      'Check Redis memory usage against maxmemory policy (allkeys-lru).',
      'Inspect redis pod logs for OOM or AOF rewrite stalls.'
    ],
    commands: [
      'redis-cli -h redis.twin-prod.svc.cluster.local INFO memory',
      'kubectl rollout restart deploy/redis-cache -n twin-prod'
    ],
    expected_result: 'Redis responds to PING with PONG and Twin Engine repopulates hot machine state keys.',
    mitigation: 'Automatic fallback to PostgreSQL machine_state table (Redis is never the sole source of truth).',
    recovery: 'Confirm redis_hit_rate_pct recovers above 90% within 30 seconds.',
    escalation: 'Notify Platform Engineering during business hours.'
  },
  {
    id: 'RB-08',
    slug: 'api-unavailable',
    title: 'FastAPI / Backend Service Pod Crash or 5xx Spike',
    category: 'INFRASTRUCTURE',
    severity: 'CRITICAL',
    symptoms: [
      'Kubernetes liveness probe on /api/v1/health fails.',
      'Dashboard SSE stream disconnects and triggers auto-reconnect backoff.'
    ],
    impact: 'Operators temporarily unable to issue commands or query historical REST endpoints.',
    checks: [
      'Inspect pod termination reason (OOMKilled vs Error) via kubectl describe pod.',
      'Check recent Argo CD sync revision for regressions.'
    ],
    commands: [
      'kubectl get pods -n twin-prod -l app=twin-api',
      'kubectl logs -n twin-prod -l app=twin-api --previous --tail=100'
    ],
    expected_result: 'Kubernetes ReplicaSet self-heals deleted/crashed pod within 5–10 seconds.',
    mitigation: 'Ingress load-balances traffic across remaining healthy API replicas.',
    recovery: 'Verify /api/v1/health and /api/v1/ready return 200 OK.',
    escalation: 'Rollback deployment via Argo CD if crash persists across replicas.'
  },
  {
    id: 'RB-09',
    slug: 'kubernetes-crash',
    title: 'Kubernetes Pod CrashLoopBackOff & Self-Healing Verification',
    category: 'INFRASTRUCTURE',
    severity: 'HIGH',
    symptoms: [
      'Pod restart count increments rapidly; status shows CrashLoopBackOff.',
      'kube_pod_container_status_restarts_total alert fires in Prometheus.'
    ],
    impact: 'Reduced replica capacity for affected microservice.',
    checks: [
      'Check ConfigMap and Secret mounts required by startup validation.',
      'Verify container memory limits (e.g. 512Mi) are not exceeded.'
    ],
    commands: [
      'kubectl describe pod -n twin-prod -l app=digital-twin-engine',
      'kubectl get events -n twin-prod --sort-by=.lastTimestamp'
    ],
    expected_result: 'Startup validation passes and container enters Running (1/1 Ready) state.',
    mitigation: 'PodDisruptionBudget ensures at least 1 replica remains active.',
    recovery: 'Fix misconfigured env var or resource limit in Helm values and sync Argo CD.',
    escalation: 'Escalate to DevOps Lead.'
  },
  {
    id: 'RB-10',
    slug: 'failed-deployment',
    title: 'Failed GitOps Rollout / Argo CD Degraded State',
    category: 'INFRASTRUCTURE',
    severity: 'HIGH',
    symptoms: [
      'Argo CD application status shows Synced / Degraded after Git commit.',
      'New ReplicaSet pods fail readiness probe /api/v1/ready.'
    ],
    impact: 'Rollout halted; old ReplicaSet continues serving production traffic safely.',
    checks: [
      'Inspect GitHub Actions CI build logs and container image tag in Helm values.',
      'Check Alembic migration compatibility with previous schema.'
    ],
    commands: [
      'argocd app get industrial-twin-prod',
      'argocd app rollback industrial-twin-prod'
    ],
    expected_result: 'Application rolls back to previous healthy Git revision within 30 seconds.',
    mitigation: 'RollingUpdate strategy (maxUnavailable: 0, maxSurge: 1) prevents downtime during bad rollout.',
    recovery: 'Revert offending commit in GitOps repo and verify Argo CD transitions to Synced / Healthy.',
    escalation: 'Notify Release Author and SRE On-Call.'
  },
  {
    id: 'RB-11',
    slug: 'certificate-expiration',
    title: 'TLS / MQTT Broker Certificate Expiration',
    category: 'SECURITY',
    severity: 'HIGH',
    symptoms: [
      'x509: certificate has expired or is not yet valid errors in MQTT consumer or Ingress.',
      'cert-manager Certificate resource shows Ready=False.'
    ],
    impact: 'Mutual TLS authentication between factory edge gateways and MQTT broker rejected.',
    checks: [
      'Check certificate expiry timestamp via openssl s_client.',
      'Inspect cert-manager Challenges and Order status.'
    ],
    commands: [
      'kubectl get certificate -n twin-prod',
      'cmctl renew -n twin-prod mqtt-broker-tls'
    ],
    expected_result: 'Renewed TLS secret mounted and broker reloads cert without dropping active sessions.',
    mitigation: 'Rotate cert 14 days prior to expiration (automated Prometheus alert at < 21 days).',
    recovery: 'Verify TLS handshake succeeds for all 8 Factory-A machine clients.',
    escalation: 'Escalate to Security Operations.'
  }
];

export const RAG_KNOWLEDGE_BASE: RagDocumentChunk[] = [
  {
    chunk_id: 'DOC-CNC-001-M1',
    document: 'DMG MORI DMU 50 5-Axis Spindle & Thermal Manual',
    machine_type: 'CNC Milling Center',
    version: 'v4.2 (2026)',
    section: 'Section 4.3 — Spindle Bearing & Thermal Thresholds',
    timestamp: '2026-02-15T10:00:00Z',
    source: 'MANUAL',
    content: 'Nominal operating temperature for the DMU 50 HSK-A63 spindle is 65.0 °C to 75.0 °C at 1400–1500 RPM continuous duty. Vibration RMS must remain between 1.0 mm/s and 3.0 mm/s. If vibration exceeds 3.8 mm/s accompanied by a +4 °C thermal rise above 76 °C, inner-race angular contact bearing degradation is indicated. Immediate action: reduce spindle speed and schedule SOP-M04 bearing replacement before vibration reaches 6.0 mm/s.',
    keywords: ['cnc-001', 'cnc', 'spindle', 'bearing', 'vibration', 'temperature', 'overheating', 'dmu 50', 'unhealthy', 'degradation']
  },
  {
    chunk_id: 'DOC-CNC-002-M1',
    document: 'Mazak Integrex i-200 Multi-Tasking Turning Manual',
    machine_type: 'CNC Turning Center',
    version: 'v3.8 (2026)',
    section: 'Section 6.1 — Main Spindle Overload & Chuck Pressure',
    timestamp: '2026-03-01T08:30:00Z',
    source: 'MANUAL',
    content: 'Mazak Integrex i-200 nominal power draw is 7.2–9.8 kW with current draw of 12.5–15.8 A at 400V. Motor overload occurs when current exceeds 22.0 A or power exceeds 13.0 kW, typically caused by dull carbide inserts, excessive depth of cut, or hydraulic chuck pressure drop below 4.8 bar.',
    keywords: ['cnc-002', 'mazak', 'overload', 'current', 'power', 'pressure', 'chuck', 'rpm']
  },
  {
    chunk_id: 'DOC-SOP-M04',
    document: 'SOP-M04: Precision Spindle Bearing Inspection & Replacement',
    machine_type: 'CNC Milling / Turning',
    version: 'Rev 2.1',
    section: 'Procedure Steps 1–6',
    timestamp: '2026-04-10T14:00:00Z',
    source: 'SOP',
    content: 'SOP-M04 applies when POSSIBLE_BEARING_FAILURE or HIGH_VIBRATION (> 4.0 mm/s) is triggered. Step 1: Command machine to IDLE and lock out 400V isolator. Step 2: Measure axial runout with dial indicator (tolerance < 0.003 mm). Step 3: Replace hybrid ceramic angular contact bearings (Part #BRG-7014-C-T-P4S). Step 4: Execute 30-minute grease run-in cycle at 800 RPM and verify vibration < 1.8 mm/s.',
    keywords: ['sop-m04', 'bearing', 'maintenance', 'vibration', 'cnc-001', 'cnc-002', 'replacement', 'runbook']
  },
  {
    chunk_id: 'DOC-SOP-T02',
    document: 'SOP-T02: Thermal Cooling Loop & Chiller Manifold Flush',
    machine_type: 'All Liquid-Cooled Assets',
    version: 'Rev 1.9',
    section: 'Thermal Recovery Protocol',
    timestamp: '2026-05-02T09:15:00Z',
    source: 'SOP',
    content: 'When HIGH_TEMPERATURE (> 80 °C) is recorded on CNC-001, CNC-002, or COMPRESSOR-001, transition machine operating_state to IDLE to keep circulation pumps active while shedding cutting/compression load. Inspect inline Y-strainer for swarf blockage and verify glycol-water concentration (35%) and supply pressure (5.8–6.4 bar).',
    keywords: ['sop-t02', 'temperature', 'overheating', 'cooling', 'chiller', 'thermal', 'high_temperature']
  },
  {
    chunk_id: 'DOC-INC-2026-089',
    document: 'Incident Report INC-2026-089: CNC-001 Unplanned Thermal & Vibration Excursion',
    machine_type: 'CNC Milling Center',
    version: 'Final RCA',
    section: 'Root Cause & Lessons Learned',
    timestamp: '2026-08-19T16:40:00Z',
    source: 'INCIDENT_REPORT',
    content: 'On 2026-08-19, CNC-001 health score dropped from 96 to 48 over 18 minutes. Telemetry showed vibration climbing from 2.1 mm/s to 5.6 mm/s while temperature rose from 71.2 °C to 84.5 °C. Root cause: micro-spalling on front spindle bearing race due to coolant seal ingress. Resolution: Replaced bearing assembly per SOP-M04 and added deterministic twin rule combining vibration + thermal penalty to trigger early POSSIBLE_BEARING_FAILURE alerts.',
    keywords: ['incident', 'similar', 'cnc-001', 'bearing', 'vibration', 'temperature', 'unhealthy', 'inc-2026-089']
  },
  {
    chunk_id: 'DOC-INC-2026-094',
    document: 'Incident Report INC-2026-094: Line 2 Conveyor & Motor Voltage Sag',
    machine_type: 'Power & Drive Systems',
    version: 'Final RCA',
    section: 'Electrical Transient Analysis',
    timestamp: '2026-09-04T11:20:00Z',
    source: 'INCIDENT_REPORT',
    content: 'Line 2 (CONVEYOR-001, MOTOR-001, COMPRESSOR-001) experienced POWER_ANOMALY alerts when bus voltage oscillated between 352V and 432V. Root cause: harmonic tap changer drift on TRANSFORMER-001 during peak compressor startup. Resolution: Recalibrated ABB RESIBLOC tap regulator and staggered COMPRESSOR-001 VSD soft-start ramp.',
    keywords: ['incident', 'power', 'voltage', 'motor-001', 'conveyor-001', 'compressor-001', 'transformer-001', 'generator-001', 'inc-2026-094']
  },
  {
    chunk_id: 'DOC-ARCH-001',
    document: 'Industrial Digital Twin Architecture & Reliability Specification',
    machine_type: 'Platform Infrastructure',
    version: 'v2.4',
    section: 'Deterministic Health Model & Event Backbone',
    timestamp: '2026-09-15T12:00:00Z',
    source: 'ARCHITECTURE',
    content: 'Telemetry flows from Machine Simulators over MQTT (factory/{factory_id}/line/{line_id}/machine/{machine_id}/telemetry) -> MQTT Consumer -> Kafka topics (machine.telemetry, machine.status, machine.alerts, machine.maintenance, machine.events, machine.dlq). The Digital Twin Engine validates event schemas, deduplicates event_ids for idempotency, rejects malformed events to machine.dlq, and computes a deterministic 0–100 health score (90–100 HEALTHY, 70–89 WATCH, 40–69 WARNING, 0–39 CRITICAL). AI_AGENT has strictly read-only MCP tool access and never executes shell, SQL, or PLC control commands.',
    keywords: ['architecture', 'kafka', 'mqtt', 'dlq', 'health', 'score', 'security', 'rbac', 'mcp', 'factory']
  }
];

export const INFRASTRUCTURE_BLUEPRINTS: Record<string, { title: string; path: string; language: string; content: string }> = {
  docker_compose: {
    title: 'Multi-Container Docker Compose Stack',
    path: 'docker-compose.yml',
    language: 'yaml',
    content: `version: "3.9"
services:
  mqtt-broker:
    image: eclipse-mosquitto:2.0.18
    container_name: twin-mosquitto
    restart: unless-stopped
    ports: ["1883:1883", "8883:8883"]
    volumes:
      - ./infrastructure/docker/mosquitto.conf:/mosquitto/config/mosquitto.conf:ro
    healthcheck:
      test: ["CMD", "mosquitto_sub", "-t", "$$SYS/#", "-C", "1", "-i", "probe", "-W", "3"]
      interval: 10s
      timeout: 5s
      retries: 3

  kafka:
    image: bitnami/kafka:3.7
    container_name: twin-kafka
    environment:
      - KAFKA_CFG_NODE_ID=0
      - KAFKA_CFG_PROCESS_ROLES=controller,broker
      - KAFKA_CFG_LISTENERS=PLAINTEXT://:9092,CONTROLLER://:9093
      - KAFKA_CFG_LOG_RETENTION_HOURS=168 # 7-day replay retention
    healthcheck:
      test: ["CMD-SHELL", "kafka-topics.sh --bootstrap-server localhost:9092 --list"]
      interval: 15s
      timeout: 10s
      retries: 5

  postgres:
    image: postgres:16.4-alpine
    container_name: twin-postgres
    environment:
      POSTGRES_DB: industrial_twin
      POSTGRES_USER: twin_app
      POSTGRES_PASSWORD_FILE: /run/secrets/db_password
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U twin_app -d industrial_twin"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7.2-alpine
    container_name: twin-redis
    command: ["redis-server", "--maxmemory", "256mb", "--maxmemory-policy", "allkeys-lru"]
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 3

  digital-twin-engine:
    build:
      context: .
      dockerfile: apps/digital-twin-engine/Dockerfile
    user: "10001:10001" # Non-root securityContext
    depends_on:
      kafka: { condition: service_healthy }
      postgres: { condition: service_healthy }
      redis: { condition: service_healthy }
    environment:
      - KAFKA_BROKERS=kafka:9092
      - OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4317`
  },
  kubernetes: {
    title: 'Kubernetes Deployment, Probes & NetworkPolicy',
    path: 'infrastructure/kubernetes/twin-engine-deployment.yaml',
    language: 'yaml',
    content: `apiVersion: apps/v1
kind: Deployment
metadata:
  name: digital-twin-engine
  namespace: twin-prod
  labels:
    app.kubernetes.io/name: digital-twin-engine
    app.kubernetes.io/part-of: industrial-digital-twin
spec:
  replicas: 2
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 0
      maxSurge: 1
  selector:
    matchLabels:
      app: digital-twin-engine
  template:
    metadata:
      labels:
        app: digital-twin-engine
    spec:
      serviceAccountName: twin-engine-sa
      securityContext:
        runAsNonRoot: true
        runAsUser: 10001
        fsGroup: 10001
      containers:
        - name: engine
          image: ghcr.io/org/industrial-twin-engine:v1.4.2
          resources:
            requests:
              cpu: "250m"
              memory: "256Mi"
            limits:
              cpu: "500m"
              memory: "512Mi"
          livenessProbe:
            httpGet:
              path: /api/v1/health
              port: 8000
            initialDelaySeconds: 10
            periodSeconds: 15
          readinessProbe:
            httpGet:
              path: /api/v1/ready
              port: 8000
            initialDelaySeconds: 5
            periodSeconds: 10
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: twin-engine-netpol
  namespace: twin-prod
spec:
  podSelector:
    matchLabels:
      app: digital-twin-engine
  policyTypes: ["Ingress", "Egress"]
  egress:
    - to:
        - podSelector:
            matchLabels:
              app: kafka
        - podSelector:
            matchLabels:
              app: postgres
        - podSelector:
            matchLabels:
              app: redis`
  },
  terraform_aws: {
    title: 'Terraform AWS Production Modules (EKS, RDS, ElastiCache)',
    path: 'infrastructure/terraform/main.tf',
    language: 'hcl',
    content: `terraform {
  required_version = ">= 1.8.0"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.60" }
  }
}

module "vpc" {
  source               = "./modules/vpc"
  environment          = var.environment
  cidr_block           = "10.40.0.0/16"
  availability_zones   = ["eu-central-1a", "eu-central-1b", "eu-central-1c"]
  enable_nat_gateway   = true
}

module "eks" {
  source               = "./modules/eks"
  cluster_name         = "industrial-twin-\${var.environment}"
  cluster_version      = "1.30"
  vpc_id               = module.vpc.vpc_id
  private_subnet_ids   = module.vpc.private_subnet_ids
  enable_irsa          = true
}

module "rds_postgres" {
  source                  = "./modules/rds"
  identifier              = "industrial-twin-pg-\${var.environment}"
  engine_version          = "16.4"
  instance_class          = "db.m6i.large"
  allocated_storage       = 100
  multi_az                = true
  backup_retention_period = 14 # RPO < 5 min via continuous WAL archiving to S3
  kms_key_id              = aws_kms_key.twin_data.arn
}

module "elasticache_redis" {
  source               = "./modules/elasticache"
  replication_group_id = "twin-state-cache-\${var.environment}"
  node_type            = "cache.t4g.medium"
  num_cache_clusters   = 2
  automatic_failover   = true
  at_rest_encryption   = true
  transit_encryption   = true
}`
  },
  argocd_gitops: {
    title: 'Argo CD GitOps Application & CI/CD Pipeline',
    path: 'infrastructure/argocd/application-prod.yaml',
    language: 'yaml',
    content: `apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: industrial-twin-prod
  namespace: argocd
spec:
  project: industrial-platform
  source:
    repoURL: https://github.com/org/industrial-digital-twin.git
    targetRevision: main
    path: infrastructure/helm/industrial-twin
    helm:
      valueFiles:
        - values.yaml
        - values-staging.yaml
  destination:
    server: https://kubernetes.default.svc
    namespace: twin-prod
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - CreateNamespace=true
      - ApplyOutOfSyncOnly=true`
  },
  backup_recovery: {
    title: 'PostgreSQL Backup, Restore & Verification Runbook',
    path: 'docs/runbooks/backup-restore-verification.md',
    language: 'markdown',
    content: `# PostgreSQL Backup, Restore & Verification Specification

## Targets
- **RPO (Recovery Point Objective):** <= 5 minutes (Continuous WAL shipping to S3 + hourly pg_dump snapshots)
- **RTO (Recovery Time Objective):** <= 15 minutes (Automated restore + Alembic schema verification + Kafka offset replay)
- **Schedule:** Full logical + physical snapshot every 6 hours; WAL segments archived every 60 seconds.

## Restore & Verification Procedure
1. Provision isolated verification database \`industrial_twin_restore_verify\`:
   \`pg_restore -h localhost -U twin_admin -d industrial_twin_restore_verify --clean --if-exists latest_backup.dump\`
2. Verify row counts and latest checkpoint integrity:
   \`SELECT count(*) AS machines_count FROM machines;\`
   \`SELECT max(timestamp) AS latest_telemetry FROM telemetry;\`
3. Replay Kafka durable events since backup watermark timestamp:
   \`kafka-consumer-groups.sh --bootstrap-server kafka:9092 --group twin-engine-cg --topic machine.telemetry --reset-offsets --to-datetime 2026-09-28T00:00:00.000Z --execute\``
  }
};
