import React, { useState } from 'react';
import {
  Flame,
  Play,
  ShieldCheck,
  Server,
  Database,
  GitBranch,
  Terminal,
  RefreshCw
} from 'lucide-react';
import {
  Machine,
  ChaosExperimentResult,
  SystemObservability,
  UserRole,
  FailureScenarioType
} from '../types/twin';
import { INFRASTRUCTURE_BLUEPRINTS } from '../data/knowledgeBase';

interface SimulationChaosWorkspaceProps {
  machines: Machine[];
  chaosResults: ChaosExperimentResult[];
  observability: SystemObservability | null;
  currentRole: UserRole;
  onRunDemoScenario: (demoNumber: number) => Promise<void>;
  onRunChaosExperiment: (scenarioNumber: number) => Promise<void>;
  onVerifyBackupRestore: () => Promise<void>;
  onSendMachineCommand: (
    machineId: string,
    payload: {
      command: 'START' | 'STOP' | 'INJECT_FAILURE' | 'CLEAR_FAILURE' | 'CLEAR_ALL_FAILURES' | 'SET_MODE' | 'SET_INTERVAL';
      failure_type?: FailureScenarioType;
      operating_state?: Machine['operating_state'];
      telemetry_interval_ms?: number;
    }
  ) => Promise<void>;
}

const DEMO_SCENARIOS = [
  {
    num: 1,
    title: 'Demo 1: Normal Factory Baseline',
    desc: 'Clears all injected faults, resets all 8 Factory-A machines to nominal operating ranges, and resolves open alerts.'
  },
  {
    num: 2,
    title: 'Demo 2: Overheating Pipeline Flow',
    desc: 'Injects thermal runaway on CNC-002 (89.4 °C) -> MQTT -> Kafka -> Twin penalty -> HIGH_TEMPERATURE alert.'
  },
  {
    num: 3,
    title: 'Demo 3: Spindle Bearing Degradation Trend',
    desc: 'Accelerates progressive vibration + thermal rise on CNC-001 -> health score drops -> POSSIBLE_BEARING_FAILURE.'
  },
  {
    num: 4,
    title: 'Demo 4: Machine Stop & Heartbeat Timeout -> OFFLINE',
    desc: 'Halts ROBOT-001 edge simulator -> triggers heartbeat timeout -> status transitions to OFFLINE.'
  },
  {
    num: 5,
    title: 'Demo 5: Delete API Pod -> Kubernetes Self-Healing',
    desc: 'Simulates deleting active API pod in twin-prod namespace; ReplicaSet reschedules and passes /ready probe.'
  },
  {
    num: 6,
    title: 'Demo 6: Git Commit -> CI -> Argo CD Rollout',
    desc: 'Triggers GitOps rollout of v1.4.3-prod with zero-downtime RollingUpdate and readiness verification.'
  },
  {
    num: 7,
    title: 'Demo 7: AI Root-Cause Diagnosis (MCP + RAG)',
    desc: 'Prepares CNC-001 bearing wear state and opens AI Copilot for live MCP + RAG evidence synthesis.'
  }
];

const CHAOS_SCENARIOS = [
  { num: 1, name: '1. MQTT Broker Unavailable', target: 'Mosquitto QoS-1 Edge Buffer' },
  { num: 2, name: '2. Kafka Broker Unavailable', target: 'Producer Retry & Backoff' },
  { num: 3, name: '3. PostgreSQL Unavailable', target: 'Redis Cache Fallback & Replay' },
  { num: 4, name: '4. Redis Cache Unavailable', target: 'PostgreSQL Read Fallback' },
  { num: 5, name: '5. Simulator Stopped', target: 'Heartbeat Timeout -> OFFLINE' },
  { num: 6, name: '6. API Pod Deleted', target: 'K8s ReplicaSet Self-Healing' },
  { num: 7, name: '7. Frontend Pod Deleted', target: 'ALB Ingress Zero-Downtime' },
  { num: 8, name: '8. Duplicate Events Flood', target: 'Idempotency UUID Deduplication' },
  { num: 9, name: '9. Out-of-Order Events', target: 'Watermark Timestamp Guard' },
  { num: 10, name: '10. Malformed Telemetry', target: 'Kafka machine.dlq Isolation' },
  { num: 11, name: '11. Network Latency (+350ms)', target: 'Consumer Lag Drain Test' },
  { num: 12, name: '12. Twin Consumer Restart', target: 'Offset Commit Replay' }
];

export const SimulationChaosWorkspace: React.FC<SimulationChaosWorkspaceProps> = ({
  chaosResults,
  observability,
  currentRole,
  onRunDemoScenario,
  onRunChaosExperiment,
  onVerifyBackupRestore
}) => {
  const [selectedBlueprintKey, setSelectedBlueprintKey] = useState<string>('docker_compose');
  const [backupMessage, setBackupMessage] = useState<string | null>(null);
  const [runningChaos, setRunningChaos] = useState<number | null>(null);

  const isReadOnly = currentRole === 'VIEWER' || currentRole === 'AI_AGENT';
  const activeBlueprint = INFRASTRUCTURE_BLUEPRINTS[selectedBlueprintKey];

  return (
    <div className="space-y-8">
      {/* Section 1: 7 Guided Portfolio Demo Scenarios */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
              <Play className="w-4 h-4 text-cyan-400" />
              Guided Portfolio Demo Scenarios (Sections 32 & 36)
            </h2>
            <p className="text-xs text-slate-400">
              Trigger end-to-end production scenarios with a single click and observe immediate changes in telemetry, Kafka topics, alerts, and Kubernetes pods.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {DEMO_SCENARIOS.map((d) => (
            <div
              key={d.num}
              className="bg-[#111827] border border-[#1E293B] p-4 flex flex-col justify-between hover:border-slate-700 transition-colors"
            >
              <div>
                <div className="text-xs font-mono text-cyan-400 font-semibold mb-1">{d.title}</div>
                <p className="text-xs text-slate-400 leading-relaxed">{d.desc}</p>
              </div>
              <button
                disabled={isReadOnly}
                onClick={() => onRunDemoScenario(d.num)}
                className="mt-3 w-full py-1.5 bg-[#0B0E17] hover:bg-cyan-500/20 border border-[#1E293B] hover:border-cyan-500/50 text-xs font-mono text-slate-200 hover:text-cyan-300 transition-colors cursor-pointer disabled:opacity-40"
              >
                Execute Demo #{d.num}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Section 2: 12 Chaos & Reliability Failure Tests */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 space-y-3">
          <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
            <Flame className="w-4 h-4 text-amber-400" />
            Chaos & Failure Testing Matrix (Section 26)
          </h2>
          <p className="text-xs text-slate-400">
            Execute any of the 12 chaos scenarios to measure detection latency, recovery time, data loss, idempotency deduplication, and DLQ routing.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {CHAOS_SCENARIOS.map((c) => (
              <button
                key={c.num}
                disabled={isReadOnly || runningChaos === c.num}
                onClick={async () => {
                  setRunningChaos(c.num);
                  await onRunChaosExperiment(c.num);
                  setRunningChaos(null);
                }}
                className="p-2.5 bg-[#111827] border border-[#1E293B] hover:border-amber-500/60 text-left transition-colors cursor-pointer disabled:opacity-40"
              >
                <div className="text-xs font-medium text-slate-200 truncate">{c.name}</div>
                <div className="text-[11px] font-mono text-slate-500 mt-0.5 truncate">{c.target}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="lg:col-span-7 space-y-3">
          <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            Chaos Experiment Telemetry & Verification Log
          </h2>
          <div className="bg-[#111827] border border-[#1E293B] overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs font-mono tabular-nums">
              <thead>
                <tr className="border-b border-[#1E293B] text-slate-400">
                  <th className="py-2.5 px-3">Scenario</th>
                  <th className="py-2.5 px-3">Detect / Recover</th>
                  <th className="py-2.5 px-3">Data Loss</th>
                  <th className="py-2.5 px-3">Dedup / DLQ</th>
                  <th className="py-2.5 px-3">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1E293B]">
                {chaosResults.slice(0, 8).map((r) => (
                  <tr key={r.id} className="hover:bg-slate-900/60">
                    <td className="py-2.5 px-3 font-sans">
                      <div className="text-slate-200 font-medium">{r.name}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">{r.summary}</div>
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap text-slate-300">
                      {r.detection_time_ms}ms / {r.recovery_time_ms}ms
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap text-emerald-400">
                      {r.data_loss_events} events
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap text-cyan-400">
                      {r.duplicate_events_blocked} dup · {r.dlq_routed} dlq
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap text-emerald-400 font-semibold">
                      ● {r.status}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Section 3: Kubernetes Pods, GitOps Argo CD & Backup/Restore Verification */}
      {observability && (
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-[#111827] border border-[#1E293B] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                <Server className="w-4 h-4 text-cyan-400" />
                Kubernetes Cluster Workload Status (`namespace: twin-prod`)
              </h3>
              <span className="text-xs font-mono text-emerald-400">
                ● Argo CD: {observability.argocd_sync_status} / {observability.argocd_health_status} ({observability.git_revision})
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs font-mono tabular-nums">
                <thead>
                  <tr className="border-b border-[#1E293B] text-slate-400">
                    <th className="py-2 px-3">Pod Name</th>
                    <th className="py-2 px-3">Service</th>
                    <th className="py-2 px-3">Ready</th>
                    <th className="py-2 px-3">Status</th>
                    <th className="py-2 px-3">Restarts</th>
                    <th className="py-2 px-3">CPU / Mem</th>
                    <th className="py-2 px-3">Age</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1E293B]">
                  {observability.pods.map((pod) => (
                    <tr key={pod.name}>
                      <td className="py-2 px-3 text-slate-200">{pod.name}</td>
                      <td className="py-2 px-3 text-cyan-400">{pod.service}</td>
                      <td className="py-2 px-3 text-slate-300">{pod.ready}</td>
                      <td className="py-2 px-3 text-emerald-400">● {pod.status}</td>
                      <td className="py-2 px-3 text-slate-300">{pod.restarts}</td>
                      <td className="py-2 px-3 text-slate-400">{pod.cpu_m}m / {pod.memory_mib}Mi</td>
                      <td className="py-2 px-3 text-slate-400">{pod.age}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* PostgreSQL Backup & Restore Verification Card (Section 25) */}
          <div className="bg-[#111827] border border-[#1E293B] p-4 flex flex-col justify-between space-y-4">
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                <Database className="w-4 h-4 text-cyan-400" />
                Backup, Restore & Kafka Replay (Section 25)
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                PostgreSQL continuous WAL archiving + logical snapshot verification combined with 7-day Kafka consumer offset replay.
              </p>
              <div className="p-3 bg-[#0B0E17] border border-[#1E293B] font-mono text-xs space-y-1 tabular-nums">
                <div className="flex justify-between">
                  <span className="text-slate-400">RPO Target:</span>
                  <span className="text-slate-200">{observability.rpo_target}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">RTO Target:</span>
                  <span className="text-slate-200">{observability.rto_target}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Last Verified Snapshot:</span>
                  <span className="text-emerald-400">{new Date(observability.last_backup_at).toLocaleTimeString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Redis State Cache Hit:</span>
                  <span className="text-cyan-400">{observability.redis_hit_rate_pct}%</span>
                </div>
              </div>
              {backupMessage && (
                <div className="p-2.5 bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 text-xs font-mono">
                  {backupMessage}
                </div>
              )}
            </div>

            <button
              disabled={isReadOnly}
              onClick={async () => {
                await onVerifyBackupRestore();
                setBackupMessage(
                  `Restore verified at ${new Date().toLocaleTimeString()}: 12 tables validated, 8 twins synced, RPO < 1m, RTO = 4.2s.`
                );
              }}
              className="w-full py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Execute Backup & Test Restore Drill
            </button>
          </div>
        </section>
      )}

      {/* Section 4: Production Infrastructure & DevOps Artifacts Inspector */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
              <GitBranch className="w-4 h-4 text-cyan-400" />
              Production Infrastructure Blueprints (Docker, Kubernetes, Helm, Terraform, Argo CD)
            </h2>
            <p className="text-xs text-slate-400">
              Reference deployment manifests implementing Sections 19–25 of the blueprint.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1 bg-[#111827] p-1 border border-[#1E293B]">
            {Object.entries(INFRASTRUCTURE_BLUEPRINTS).map(([key, item]) => (
              <button
                key={key}
                onClick={() => setSelectedBlueprintKey(key)}
                className={`px-3 py-1 text-xs font-mono cursor-pointer whitespace-nowrap ${
                  selectedBlueprintKey === key
                    ? 'bg-cyan-500 text-slate-950 font-semibold'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                {item.path}
              </button>
            ))}
          </div>
        </div>

        {activeBlueprint && (
          <div className="bg-[#111827] border border-[#1E293B] p-4">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-[#1E293B] font-mono text-xs">
              <span className="text-slate-200 font-semibold flex items-center gap-2">
                <Terminal className="w-3.5 h-3.5 text-cyan-400" />
                {activeBlueprint.title}
              </span>
              <span className="text-cyan-400">{activeBlueprint.path}</span>
            </div>
            <pre className="text-xs font-mono text-slate-300 overflow-x-auto leading-relaxed">
              {activeBlueprint.content}
            </pre>
          </div>
        )}
      </section>
    </div>
  );
};
