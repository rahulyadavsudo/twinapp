import React, { useEffect, useState, useCallback } from 'react';
import {
  Activity,
  Sparkles,
  Shield,
  Sliders,
  ArrowUpRight,
  RotateCcw,
  Lock
} from 'lucide-react';
import {
  Factory,
  ProductionLine,
  Machine,
  Alert,
  MaintenanceRecord,
  Incident,
  KafkaEventEnvelope,
  AuditLogEntry,
  ChaosExperimentResult,
  SystemObservability,
  AiDiagnosticResponse,
  UserRole,
  HealthStatus,
  FailureScenarioType
} from './types/twin';
import { MachineDetailModal } from './components/MachineDetailModal';
import { OperationsWorkspace } from './components/OperationsWorkspace';
import { SimulationChaosWorkspace } from './components/SimulationChaosWorkspace';
import { AiCopilotWorkspace } from './components/AiCopilotWorkspace';

type MainTab = 'dashboard' | 'machines' | 'operations' | 'simulation' | 'ai' | 'admin';

const ROLE_PROFILES: { role: UserRole; actor: string; clearance: string }[] = [
  { role: 'ADMIN', actor: 'Dr. R. Vance (Plant Director)', clearance: 'Full Platform, RBAC, Chaos & Backup Control' },
  { role: 'ENGINEER', actor: 'M. Weber (Reliability Eng)', clearance: 'Simulator Fault Injection, Maintenance, Incidents & Alerts' },
  { role: 'OPERATOR', actor: 'S. Lindner (Shift Operator)', clearance: 'Start/Stop Machines & Acknowledge Alerts' },
  { role: 'VIEWER', actor: 'Auditor (Read-Only)', clearance: 'Read-Only Telemetry & Dashboards' },
  { role: 'AI_AGENT', actor: 'gemini-mcp-agent', clearance: 'Strictly Read-Only Controlled MCP Tool Access' }
];

function getStatusBadge(status: HealthStatus) {
  switch (status) {
    case 'HEALTHY':
      return { glyph: '●', label: 'HEALTHY', textClass: 'text-emerald-400', borderClass: 'border-emerald-500/40' };
    case 'WATCH':
      return { glyph: '◆', label: 'WATCH', textClass: 'text-cyan-400', borderClass: 'border-cyan-500/40' };
    case 'WARNING':
      return { glyph: '▲', label: 'WARNING', textClass: 'text-amber-400', borderClass: 'border-amber-500/40' };
    case 'CRITICAL':
      return { glyph: '✖', label: 'CRITICAL', textClass: 'text-rose-400', borderClass: 'border-rose-500/50' };
    case 'OFFLINE':
      return { glyph: '○', label: 'OFFLINE', textClass: 'text-slate-400', borderClass: 'border-slate-600' };
  }
}

export default function App() {
  const [activeTab, setActiveTab] = useState<MainTab>('dashboard');
  const [currentRoleIndex, setCurrentRoleIndex] = useState<number>(1); // Default ENGINEER
  const currentProfile = ROLE_PROFILES[currentRoleIndex];

  const [factory, setFactory] = useState<Factory | null>(null);
  const [lines, setLines] = useState<ProductionLine[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [maintenance, setMaintenance] = useState<MaintenanceRecord[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [events, setEvents] = useState<KafkaEventEnvelope[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [chaosResults, setChaosResults] = useState<ChaosExperimentResult[]>([]);
  const [observability, setObservability] = useState<SystemObservability | null>(null);
  const [prometheusText, setPrometheusText] = useState<string>('');

  const [selectedMachineId, setSelectedMachineId] = useState<string | null>(null);
  const [lineFilter, setLineFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [rbacBanner, setRbacBanner] = useState<string | null>(null);

  // AI Copilot state
  const [aiResponse, setAiResponse] = useState<AiDiagnosticResponse | null>(null);
  const [aiLoading, setAiLoading] = useState<boolean>(false);

  const fetchAllData = useCallback(async () => {
    try {
      const [
        facRes,
        linesRes,
        machRes,
        altRes,
        maintRes,
        incRes,
        evtRes,
        audRes,
        chaosRes,
        metRes
      ] = await Promise.all([
        fetch('/api/v1/factories'),
        fetch('/api/v1/lines'),
        fetch('/api/v1/machines'),
        fetch('/api/v1/alerts'),
        fetch('/api/v1/maintenance'),
        fetch('/api/v1/incidents'),
        fetch('/api/v1/events'),
        fetch('/api/v1/audit-logs'),
        fetch('/api/v1/chaos'),
        fetch('/api/v1/metrics')
      ]);

      if (facRes.ok) {
        const f = await facRes.json();
        setFactory(f[0] || null);
      }
      if (linesRes.ok) setLines(await linesRes.json());
      if (machRes.ok) setMachines(await machRes.json());
      if (altRes.ok) setAlerts(await altRes.json());
      if (maintRes.ok) setMaintenance(await maintRes.json());
      if (incRes.ok) setIncidents(await incRes.json());
      if (evtRes.ok) setEvents(await evtRes.json());
      if (audRes.ok) setAuditLogs(await audRes.json());
      if (chaosRes.ok) setChaosResults(await chaosRes.json());
      if (metRes.ok) {
        const m = await metRes.json();
        setObservability(m.observability);
        setPrometheusText(m.prometheus_exposition);
      }
    } catch {
      // handled gracefully
    }
  }, []);

  // Connect to Server-Sent Events (/api/v1/stream) for live 2s telemetry updates
  useEffect(() => {
    fetchAllData();
    const es = new EventSource('/api/v1/stream');
    es.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data);
        if (data.type === 'TWIN_SNAPSHOT') {
          if (data.factory) setFactory(data.factory);
          if (data.lines) setLines(data.lines);
          if (data.machines) setMachines(data.machines);
          if (data.alerts) setAlerts(data.alerts);
          if (data.recent_events) setEvents(data.recent_events);
          if (data.observability) setObservability(data.observability);
        }
      } catch {
        // ignore parse errors
      }
    };
    return () => {
      es.close();
    };
  }, [fetchAllData]);

  const handleSendMachineCommand = async (
    machineId: string,
    payload: {
      command: 'START' | 'STOP' | 'INJECT_FAILURE' | 'CLEAR_FAILURE' | 'CLEAR_ALL_FAILURES' | 'SET_MODE' | 'SET_INTERVAL';
      failure_type?: FailureScenarioType;
      operating_state?: Machine['operating_state'];
      telemetry_interval_ms?: number;
    }
  ) => {
    setRbacBanner(null);
    const res = await fetch(`/api/v1/machines/${machineId}/commands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...payload,
        actor: currentProfile.actor,
        role: currentProfile.role
      })
    });
    if (res.status === 403) {
      const err = await res.json();
      setRbacBanner(err.error);
      return;
    }
    await fetchAllData();
  };

  const handleAcknowledgeAlert = async (alertId: string) => {
    const res = await fetch(`/api/v1/alerts/${alertId}/acknowledge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actor: currentProfile.actor, role: currentProfile.role })
    });
    if (res.status === 403) {
      const err = await res.json();
      setRbacBanner(err.error);
      return;
    }
    await fetchAllData();
  };

  const handleResolveAlert = async (alertId: string) => {
    const res = await fetch(`/api/v1/alerts/${alertId}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actor: currentProfile.actor, role: currentProfile.role })
    });
    if (res.status === 403) {
      const err = await res.json();
      setRbacBanner(err.error);
      return;
    }
    await fetchAllData();
  };

  const handleCreateIncident = async (payload: Partial<Incident>) => {
    await fetch('/api/v1/incidents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, actor: currentProfile.actor, role: currentProfile.role })
    });
    await fetchAllData();
  };

  const handleUpdateIncident = async (incidentId: string, payload: Record<string, unknown>) => {
    await fetch(`/api/v1/incidents/${incidentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, actor: currentProfile.actor, role: currentProfile.role })
    });
    await fetchAllData();
  };

  const handleCreateMaintenance = async (payload: Partial<MaintenanceRecord>) => {
    await fetch('/api/v1/maintenance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...payload,
        technician: currentProfile.actor,
        role: currentProfile.role
      })
    });
    await fetchAllData();
  };

  const handleRunDemoScenario = async (demoNumber: number) => {
    await fetch('/api/v1/demo/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        demo_number: demoNumber,
        actor: currentProfile.actor,
        role: currentProfile.role
      })
    });
    await fetchAllData();
    if (demoNumber === 7) {
      setActiveTab('ai');
      handleAskAi('Why is CNC-001 unhealthy and what runbook or SOP should I follow?', 'CNC-001');
    }
  };

  const handleRunChaosExperiment = async (scenarioNumber: number) => {
    await fetch('/api/v1/chaos/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scenario_number: scenarioNumber,
        actor: currentProfile.actor,
        role: currentProfile.role
      })
    });
    await fetchAllData();
  };

  const handleVerifyBackupRestore = async () => {
    await fetch('/api/v1/admin/backup-verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        actor: currentProfile.actor,
        role: currentProfile.role
      })
    });
    await fetchAllData();
  };

  const handleAskAi = async (question: string, machineId?: string) => {
    setAiLoading(true);
    try {
      const res = await fetch('/api/v1/ai/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, machine_id: machineId })
      });
      if (res.ok) {
        const data = await res.json();
        setAiResponse(data);
      }
      await fetchAllData();
    } finally {
      setAiLoading(false);
    }
  };

  const selectedMachine = selectedMachineId
    ? machines.find((m) => m.id === selectedMachineId) || null
    : null;

  const filteredMachines = machines.filter((m) => {
    if (lineFilter !== 'ALL' && m.line_id !== lineFilter) return false;
    if (statusFilter !== 'ALL' && m.status !== statusFilter) return false;
    return true;
  });

  return (
    <div className="min-h-screen bg-[#0B0E17] text-slate-100 flex flex-col">
      {/* STRICT 3-ZONE TOP BAR CONTRACT */}
      <header className="flex items-center justify-between px-6 py-3.5 border-b border-[#1E293B] bg-[#0B0E17] sticky top-0 z-30">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#dashboard"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('dashboard');
          }}
          className="text-lg font-bold tracking-tight text-slate-100 whitespace-nowrap"
        >
          AetherTwin
        </a>

        {/* Zone 2: 5 single-line clean text navigation links */}
        <nav className="hidden md:flex items-center gap-6 text-xs font-medium text-slate-400">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`py-1 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'dashboard'
                ? 'text-cyan-400 border-b border-cyan-400 font-semibold'
                : 'hover:text-slate-100'
            }`}
          >
            Factory Dashboard
          </button>
          <button
            onClick={() => setActiveTab('machines')}
            className={`py-1 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'machines'
                ? 'text-cyan-400 border-b border-cyan-400 font-semibold'
                : 'hover:text-slate-100'
            }`}
          >
            Machines ({machines.length})
          </button>
          <button
            onClick={() => setActiveTab('operations')}
            className={`py-1 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'operations'
                ? 'text-cyan-400 border-b border-cyan-400 font-semibold'
                : 'hover:text-slate-100'
            }`}
          >
            Operations & Events
          </button>
          <button
            onClick={() => setActiveTab('simulation')}
            className={`py-1 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'simulation'
                ? 'text-cyan-400 border-b border-cyan-400 font-semibold'
                : 'hover:text-slate-100'
            }`}
          >
            Simulation & Chaos
          </button>
          <button
            onClick={() => setActiveTab('ai')}
            className={`py-1 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'ai'
                ? 'text-cyan-400 border-b border-cyan-400 font-semibold'
                : 'hover:text-slate-100'
            }`}
          >
            AI Copilot & Runbooks
          </button>
          <button
            onClick={() => setActiveTab('admin')}
            className={`py-1 transition-colors cursor-pointer whitespace-nowrap hidden xl:inline-block ${
              activeTab === 'admin'
                ? 'text-cyan-400 border-b border-cyan-400 font-semibold'
                : 'hover:text-slate-100'
            }`}
          >
            RBAC & Observability
          </button>
        </nav>

        {/* Zone 3: 2 primary actions (Role Session Switcher + AI Copilot Trigger) */}
        <div className="flex items-center gap-2.5">
          <select
            aria-label="Active RBAC Role"
            value={currentRoleIndex}
            onChange={(e) => {
              setCurrentRoleIndex(Number(e.target.value));
              setRbacBanner(null);
            }}
            className="bg-[#111827] border border-[#1E293B] px-2.5 py-1.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-500 cursor-pointer"
          >
            {ROLE_PROFILES.map((p, idx) => (
              <option key={p.role} value={idx}>
                Role: {p.role} ({p.actor.split(' ')[0]})
              </option>
            ))}
          </select>

          <button
            onClick={() => {
              setActiveTab('ai');
              if (!aiResponse) {
                handleAskAi('Why is CNC-001 unhealthy?', 'CNC-001');
              }
            }}
            className="px-3.5 py-1.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Ask AI Copilot
          </button>
        </div>
      </header>

      {/* Mobile Navigation Bar */}
      <div className="flex md:hidden items-center gap-2 overflow-x-auto px-4 py-2 border-b border-[#1E293B] bg-[#111827] text-xs">
        {(['dashboard', 'machines', 'operations', 'simulation', 'ai', 'admin'] as MainTab[]).map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`px-2.5 py-1 font-mono uppercase whitespace-nowrap ${
              activeTab === t ? 'bg-cyan-500 text-slate-950 font-semibold' : 'text-slate-400'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* RBAC Policy Denial Banner */}
      {rbacBanner && (
        <div className="bg-rose-950/70 border-b border-rose-500/50 px-6 py-2.5 flex items-center justify-between text-xs text-rose-200">
          <span className="font-mono">{rbacBanner}</span>
          <button
            onClick={() => setRbacBanner(null)}
            className="underline text-rose-300 hover:text-white ml-4 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* MAIN WORKSPACE CANVAS */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto px-6 py-6 space-y-6">
        {/* ================================================================
            VIEW 1: FACTORY DASHBOARD (Section 16)
           ================================================================ */}
        {activeTab === 'dashboard' && factory && (
          <div className="space-y-6">
            {/* Contextual Facility Header & Quick Demo Bar */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-[#1E293B] pb-4">
              <div>
                <div className="flex items-center gap-2.5 text-xs font-mono text-slate-400">
                  <span>{factory.id}</span>
                  <span>·</span>
                  <span>{factory.region}</span>
                  <span>·</span>
                  <span>{factory.location}</span>
                  <span>·</span>
                  <span className="text-emerald-400">● Live SSE Stream (2000ms Cadence)</span>
                </div>
                <h1 className="text-2xl font-semibold text-slate-100 mt-1">
                  {factory.name} — Digital Twin Operations Center
                </h1>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => handleRunDemoScenario(1)}
                  className="px-3 py-1.5 bg-[#111827] hover:bg-slate-800 border border-[#1E293B] text-xs font-mono text-slate-200 flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-emerald-400" />
                  Demo 1: Reset Normal Factory
                </button>
                <button
                  onClick={() => handleRunDemoScenario(2)}
                  className="px-3 py-1.5 bg-[#111827] hover:bg-amber-500/20 border border-[#1E293B] hover:border-amber-500/50 text-xs font-mono text-amber-300 cursor-pointer whitespace-nowrap"
                >
                  Demo 2: Inject CNC-002 Overheating
                </button>
                <button
                  onClick={() => handleRunDemoScenario(3)}
                  className="px-3 py-1.5 bg-[#111827] hover:bg-rose-500/20 border border-[#1E293B] hover:border-rose-500/50 text-xs font-mono text-rose-300 cursor-pointer whitespace-nowrap"
                >
                  Demo 3: Bearing Degradation
                </button>
                <button
                  onClick={() => handleRunDemoScenario(4)}
                  className="px-3 py-1.5 bg-[#111827] hover:bg-slate-800 border border-[#1E293B] text-xs font-mono text-slate-300 cursor-pointer whitespace-nowrap"
                >
                  Demo 4: Stop ROBOT-001 (Offline)
                </button>
              </div>
            </div>

            {/* Primary Factory Telemetry KPI Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 font-mono tabular-nums">
              <div className="bg-[#111827] border border-[#1E293B] p-4">
                <div className="text-xs font-sans text-slate-400">Factory Health Index</div>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-2xl font-bold text-slate-100">{factory.health_score}</span>
                  <span className="text-xs text-slate-400">/ 100</span>
                </div>
                <div className={`text-xs mt-1 ${getStatusBadge(factory.status).textClass}`}>
                  {getStatusBadge(factory.status).glyph} {factory.status}
                </div>
              </div>

              <div className="bg-[#111827] border border-[#1E293B] p-4">
                <div className="text-xs font-sans text-slate-400">Fleet Availability</div>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-2xl font-bold text-slate-100">
                    {factory.machines_online}/{factory.machines_total}
                  </span>
                  <span className="text-xs text-slate-400">ONLINE</span>
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  {factory.machines_running} Run · {factory.machines_idle} Idle · {factory.machines_offline} Off
                </div>
              </div>

              <div className="bg-[#111827] border border-[#1E293B] p-4">
                <div className="text-xs font-sans text-slate-400">Anomaly Distribution</div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-amber-400">{factory.warning_count}</span>
                  <span className="text-xs text-slate-400">WARN</span>
                  <span className="text-2xl font-bold text-rose-400 ml-1">{factory.critical_count}</span>
                  <span className="text-xs text-slate-400">CRIT</span>
                </div>
                <div className="text-xs text-slate-400 mt-1">Deterministic State Engine</div>
              </div>

              <div className="bg-[#111827] border border-[#1E293B] p-4">
                <div className="text-xs font-sans text-slate-400">Open Alerts</div>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-2xl font-bold text-cyan-400">{factory.open_alerts_count}</span>
                  <span className="text-xs text-slate-400">ACTIVE</span>
                </div>
                <div className="text-xs text-slate-400 mt-1">Storm Cooldown Active</div>
              </div>

              <div className="bg-[#111827] border border-[#1E293B] p-4">
                <div className="text-xs font-sans text-slate-400">Cumulative Production</div>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-2xl font-bold text-slate-100">
                    {factory.total_production.toLocaleString()}
                  </span>
                  <span className="text-xs text-slate-400">UNITS</span>
                </div>
                <div className="text-xs text-emerald-400 mt-1">Line 1 + Line 2 Output</div>
              </div>

              <div className="bg-[#111827] border border-[#1E293B] p-4">
                <div className="text-xs font-sans text-slate-400">Active Power & Energy</div>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-2xl font-bold text-slate-100">{factory.current_power_kw}</span>
                  <span className="text-xs text-slate-400">kW</span>
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  Total: {factory.total_energy_kwh.toLocaleString()} kWh
                </div>
              </div>
            </div>

            {/* Factory-A Production Lines & Asset Topology */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-slate-100">
                  Factory-A Topology & Production Line Digital Twins (Click Any Asset to Inspect or Inject Faults)
                </h2>
                <span className="text-xs font-mono text-slate-400">
                  Line 1 (Machining) · Line 2 (Assembly) · Power Substation
                </span>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {lines.map((line) => {
                  const lineMachines = machines.filter((m) => m.line_id === line.id);
                  const badge = getStatusBadge(line.status);
                  return (
                    <div key={line.id} className="bg-[#111827] border border-[#1E293B] p-4 flex flex-col justify-between space-y-4">
                      <div>
                        <div className="flex items-center justify-between font-mono text-xs mb-1">
                          <span className="text-cyan-400 font-semibold">{line.id} · {line.category}</span>
                          <span className={badge.textClass}>
                            {badge.glyph} {badge.label} (Avg {line.avg_health}%)
                          </span>
                        </div>
                        <h3 className="text-sm font-semibold text-slate-100">{line.name}</h3>
                        <p className="text-xs text-slate-400 mt-0.5">{line.description}</p>

                        <div className="mt-4 space-y-2.5">
                          {lineMachines.map((m) => {
                            const mBadge = getStatusBadge(m.status);
                            return (
                              <div
                                key={m.id}
                                onClick={() => setSelectedMachineId(m.id)}
                                className={`p-3 bg-[#0B0E17] border ${mBadge.borderClass} hover:border-cyan-400 transition-colors cursor-pointer`}
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono text-xs font-bold text-slate-100">{m.id}</span>
                                    <span className="text-xs text-slate-400 truncate max-w-[150px]">{m.name}</span>
                                  </div>
                                  <span className={`font-mono text-xs font-semibold tabular-nums ${mBadge.textClass}`}>
                                    {mBadge.glyph} {m.health_score}%
                                  </span>
                                </div>

                                <div className="grid grid-cols-4 gap-2 mt-2 pt-2 border-t border-[#1E293B] font-mono tabular-nums text-[11px]">
                                  <div>
                                    <span className="text-slate-500 block">TEMP</span>
                                    <span className={m.latest_telemetry.temperature >= 80 ? 'text-amber-400 font-semibold' : 'text-slate-200'}>
                                      {m.latest_telemetry.temperature} °C
                                    </span>
                                  </div>
                                  <div>
                                    <span className="text-slate-500 block">VIB</span>
                                    <span className={m.latest_telemetry.vibration >= 3.8 ? 'text-amber-400 font-semibold' : 'text-slate-200'}>
                                      {m.latest_telemetry.vibration} mm/s
                                    </span>
                                  </div>
                                  <div>
                                    <span className="text-slate-500 block">SPEED</span>
                                    <span className="text-slate-200">{m.latest_telemetry.rpm} RPM</span>
                                  </div>
                                  <div>
                                    <span className="text-slate-500 block">POWER</span>
                                    <span className="text-slate-200">{m.latest_telemetry.power_kw} kW</span>
                                  </div>
                                </div>

                                {m.active_failures.length > 0 && (
                                  <div className="mt-2 text-[11px] font-mono text-rose-400 flex items-center justify-between">
                                    <span>Faults: {m.active_failures.join(', ')}</span>
                                    <span className="underline text-cyan-400">Inspect →</span>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <div className="pt-3 border-t border-[#1E293B] flex items-center justify-between text-xs font-mono tabular-nums text-slate-400">
                        <span>Line Power: {line.total_power_kw} kW</span>
                        <span>Rate: {line.production_rate_uph} UPH</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Architecture Pipeline Status + Live Alerts / Events Split */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left 7 Cols: Live Active Alerts */}
              <div className="lg:col-span-7 bg-[#111827] border border-[#1E293B] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-100">
                    Active Plant Alerts (Deduplicated & Cooldown-Protected)
                  </h3>
                  <button
                    onClick={() => setActiveTab('operations')}
                    className="text-xs font-mono text-cyan-400 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    Open Alert Console <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {alerts.filter((a) => a.status !== 'RESOLVED').length === 0 ? (
                    <div className="py-8 text-center text-xs text-slate-500">
                      All Factory-A alerts resolved. Nominal operation.
                    </div>
                  ) : (
                    alerts
                      .filter((a) => a.status !== 'RESOLVED')
                      .slice(0, 6)
                      .map((a) => (
                        <div
                          key={a.alert_id}
                          className="p-3 bg-[#0B0E17] border border-[#1E293B] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                        >
                          <div>
                            <div className="flex items-center gap-2 font-mono">
                              <span
                                className={
                                  a.severity === 'CRITICAL'
                                    ? 'text-rose-400 font-semibold'
                                    : 'text-amber-400 font-semibold'
                                }
                              >
                                {a.severity === 'CRITICAL' ? '✖ CRITICAL' : '▲ WARNING'}
                              </span>
                              <span>·</span>
                              <button
                                onClick={() => setSelectedMachineId(a.machine_id)}
                                className="text-cyan-400 hover:underline font-semibold cursor-pointer"
                              >
                                {a.machine_id}
                              </button>
                              <span>·</span>
                              <span className="text-slate-300">{a.type}</span>
                              <span>·</span>
                              <span className="text-slate-500">Dedup x{a.dedup_count}</span>
                            </div>
                            <div className="text-slate-200 mt-1">{a.title}</div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {a.status === 'OPEN' && (
                              <button
                                onClick={() => handleAcknowledgeAlert(a.alert_id)}
                                className="px-2.5 py-1 bg-amber-500/15 border border-amber-500/40 text-amber-300 hover:bg-amber-500/25 font-mono text-[11px] cursor-pointer"
                              >
                                Ack
                              </button>
                            )}
                            <button
                              onClick={() => handleResolveAlert(a.alert_id)}
                              className="px-2.5 py-1 bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25 font-mono text-[11px] cursor-pointer"
                            >
                              Resolve
                            </button>
                          </div>
                        </div>
                      ))
                  )}
                </div>
              </div>

              {/* Right 5 Cols: Architecture Telemetry Backbone Health */}
              <div className="lg:col-span-5 bg-[#111827] border border-[#1E293B] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-100">
                    Event Pipeline & Infrastructure Telemetry
                  </h3>
                  <button
                    onClick={() => setActiveTab('simulation')}
                    className="text-xs font-mono text-cyan-400 hover:underline cursor-pointer"
                  >
                    Chaos & Infra →
                  </button>
                </div>

                {observability && (
                  <div className="space-y-2 text-xs font-mono tabular-nums">
                    <div className="p-2.5 bg-[#0B0E17] border border-[#1E293B] flex items-center justify-between">
                      <span className="text-slate-400">1. MQTT Broker (Mosquitto QoS 1)</span>
                      <span className="text-emerald-400">
                        ● {observability.mqtt_messages_total.toLocaleString()} msgs
                      </span>
                    </div>
                    <div className="p-2.5 bg-[#0B0E17] border border-[#1E293B] flex items-center justify-between">
                      <span className="text-slate-400">2. Kafka (`machine.telemetry`)</span>
                      <span className="text-cyan-400">
                        Lag: {observability.kafka_consumer_lag} · DLQ: {observability.kafka_dlq_count}
                      </span>
                    </div>
                    <div className="p-2.5 bg-[#0B0E17] border border-[#1E293B] flex items-center justify-between">
                      <span className="text-slate-400">3. Idempotency Deduplication</span>
                      <span className="text-emerald-400">
                        {observability.duplicate_events_blocked} Duplicates Blocked
                      </span>
                    </div>
                    <div className="p-2.5 bg-[#0B0E17] border border-[#1E293B] flex items-center justify-between">
                      <span className="text-slate-400">4. PostgreSQL + Redis Cache</span>
                      <span className="text-emerald-400">
                        {observability.postgres_latency_ms}ms · Hit {observability.redis_hit_rate_pct}%
                      </span>
                    </div>
                    <div className="p-2.5 bg-[#0B0E17] border border-[#1E293B] flex items-center justify-between">
                      <span className="text-slate-400">5. GitOps Argo CD (`twin-prod`)</span>
                      <span className="text-emerald-400">
                        ● {observability.argocd_sync_status} / {observability.argocd_health_status}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ================================================================
            VIEW 2: MACHINES FLEET MATRIX & SIMULATOR CONTROLS
           ================================================================ */}
        {activeTab === 'machines' && (
          <div className="space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#1E293B] pb-4">
              <div>
                <h1 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-cyan-400" />
                  Factory-A Asset Fleet & Simulator Control Matrix
                </h1>
                <p className="text-xs text-slate-400">
                  Click any machine row to open its full multi-channel waveform telemetry inspector and 11-fault simulator matrix.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1 bg-[#111827] p-1 border border-[#1E293B] text-xs font-mono">
                  {(['ALL', 'LINE-1', 'LINE-2', 'LINE-PWR'] as const).map((lf) => (
                    <button
                      key={lf}
                      onClick={() => setLineFilter(lf)}
                      className={`px-2.5 py-1 cursor-pointer whitespace-nowrap ${
                        lineFilter === lf ? 'bg-cyan-500 text-slate-950 font-semibold' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {lf}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-1 bg-[#111827] p-1 border border-[#1E293B] text-xs font-mono">
                  {(['ALL', 'HEALTHY', 'WATCH', 'WARNING', 'CRITICAL', 'OFFLINE'] as const).map((sf) => (
                    <button
                      key={sf}
                      onClick={() => setStatusFilter(sf)}
                      className={`px-2 py-1 cursor-pointer whitespace-nowrap ${
                        statusFilter === sf ? 'bg-slate-800 text-cyan-400 font-semibold' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {sf}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-[#111827] border border-[#1E293B] overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-[#1E293B] text-slate-400 font-mono">
                    <th className="py-3 px-4">Asset ID & Model</th>
                    <th className="py-3 px-4">Line / Location</th>
                    <th className="py-3 px-4">Twin Status</th>
                    <th className="py-3 px-4 text-right">Health Score</th>
                    <th className="py-3 px-4 text-right">Temp (°C)</th>
                    <th className="py-3 px-4 text-right">Vib (mm/s)</th>
                    <th className="py-3 px-4 text-right">Speed (RPM)</th>
                    <th className="py-3 px-4 text-right">Power (kW)</th>
                    <th className="py-3 px-4">Active Faults</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1E293B] font-mono tabular-nums">
                  {filteredMachines.map((m) => {
                    const b = getStatusBadge(m.status);
                    return (
                      <tr
                        key={m.id}
                        onClick={() => setSelectedMachineId(m.id)}
                        className="hover:bg-slate-900/70 cursor-pointer transition-colors"
                      >
                        <td className="py-3 px-4">
                          <div className="font-bold text-cyan-400">{m.id}</div>
                          <div className="font-sans text-slate-300">{m.name}</div>
                          <div className="text-[11px] text-slate-500">
                            {m.manufacturer} {m.model} · {m.firmware_version}
                          </div>
                        </td>
                        <td className="py-3 px-4 font-sans text-slate-300">
                          <div className="font-mono text-slate-200">{m.line_id}</div>
                          <div className="text-slate-500 text-[11px]">{m.location}</div>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span className={`font-semibold ${b.textClass}`}>
                            {b.glyph} {b.label}
                          </span>
                          <div className="text-[11px] text-slate-500">{m.operating_state}</div>
                        </td>
                        <td className="py-3 px-4 text-right font-semibold text-sm text-slate-100">
                          {m.health_score}%
                        </td>
                        <td
                          className={`py-3 px-4 text-right ${
                            m.latest_telemetry.temperature >= 80 ? 'text-amber-400 font-semibold' : 'text-slate-200'
                          }`}
                        >
                          {m.latest_telemetry.temperature}
                        </td>
                        <td
                          className={`py-3 px-4 text-right ${
                            m.latest_telemetry.vibration >= 3.8 ? 'text-amber-400 font-semibold' : 'text-slate-200'
                          }`}
                        >
                          {m.latest_telemetry.vibration}
                        </td>
                        <td className="py-3 px-4 text-right text-slate-200">{m.latest_telemetry.rpm}</td>
                        <td className="py-3 px-4 text-right text-slate-200">{m.latest_telemetry.power_kw}</td>
                        <td className="py-3 px-4">
                          {m.active_failures.length === 0 ? (
                            <span className="text-slate-500">Nominal</span>
                          ) : (
                            <span className="text-rose-400">{m.active_failures.join(', ')}</span>
                          )}
                        </td>
                        <td
                          className="py-3 px-4 text-right whitespace-nowrap"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            onClick={() => setSelectedMachineId(m.id)}
                            className="px-2.5 py-1 bg-cyan-500/15 border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/25 text-xs cursor-pointer"
                          >
                            Inspect Twin
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ================================================================
            VIEW 3: OPERATIONS (ALERTS, INCIDENTS, MAINTENANCE, KAFKA EVENTS)
           ================================================================ */}
        {activeTab === 'operations' && (
          <OperationsWorkspace
            alerts={alerts}
            incidents={incidents}
            maintenance={maintenance}
            events={events}
            machines={machines}
            currentRole={currentProfile.role}
            currentActor={currentProfile.actor}
            onAcknowledgeAlert={handleAcknowledgeAlert}
            onResolveAlert={handleResolveAlert}
            onCreateIncident={handleCreateIncident}
            onUpdateIncident={handleUpdateIncident}
            onCreateMaintenance={handleCreateMaintenance}
            onSelectMachine={(m) => setSelectedMachineId(m.id)}
          />
        )}

        {/* ================================================================
            VIEW 4: SIMULATION, DEMOS 1-7, CHAOS TESTS & DEVOPS INFRA
           ================================================================ */}
        {activeTab === 'simulation' && (
          <SimulationChaosWorkspace
            machines={machines}
            chaosResults={chaosResults}
            observability={observability}
            currentRole={currentProfile.role}
            onRunDemoScenario={handleRunDemoScenario}
            onRunChaosExperiment={handleRunChaosExperiment}
            onVerifyBackupRestore={handleVerifyBackupRestore}
            onSendMachineCommand={handleSendMachineCommand}
          />
        )}

        {/* ================================================================
            VIEW 5: AI COPILOT (MCP + RAG) & PRODUCTION RUNBOOKS
           ================================================================ */}
        {activeTab === 'ai' && (
          <AiCopilotWorkspace
            machines={machines}
            aiResponse={aiResponse}
            aiLoading={aiLoading}
            onAskQuestion={handleAskAi}
          />
        )}

        {/* ================================================================
            VIEW 6: RBAC, AUDIT TRAIL & PROMETHEUS OBSERVABILITY
           ================================================================ */}
        {activeTab === 'admin' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {ROLE_PROFILES.map((prof, idx) => (
                <div
                  key={prof.role}
                  onClick={() => setCurrentRoleIndex(idx)}
                  className={`p-4 border cursor-pointer transition-colors ${
                    currentRoleIndex === idx
                      ? 'bg-cyan-950/30 border-cyan-500'
                      : 'bg-[#111827] border-[#1E293B] hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between font-mono text-xs">
                    <span className="text-cyan-400 font-bold flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5" /> {prof.role}
                    </span>
                    {currentRoleIndex === idx && (
                      <span className="text-emerald-400">● ACTIVE SESSION</span>
                    )}
                  </div>
                  <div className="text-sm font-semibold text-slate-100 mt-1">{prof.actor}</div>
                  <div className="text-xs text-slate-400 mt-1">{prof.clearance}</div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Immutable Audit Log Table (Section 15) */}
              <div className="lg:col-span-8 bg-[#111827] border border-[#1E293B] p-4 space-y-3">
                <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
                  <Shield className="w-4 h-4 text-cyan-400" />
                  Immutable Security & Operational Audit Trail (Section 15)
                </h2>
                <div className="overflow-x-auto max-h-96">
                  <table className="w-full text-left border-collapse text-xs font-mono tabular-nums">
                    <thead>
                      <tr className="border-b border-[#1E293B] text-slate-400">
                        <th className="py-2 px-3">Timestamp</th>
                        <th className="py-2 px-3">Actor & Role</th>
                        <th className="py-2 px-3">Action</th>
                        <th className="py-2 px-3">Resource</th>
                        <th className="py-2 px-3">Result</th>
                        <th className="py-2 px-3">Details</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1E293B]">
                      {auditLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-slate-900/60">
                          <td className="py-2 px-3 text-slate-400 whitespace-nowrap">
                            {new Date(log.timestamp).toLocaleTimeString()}
                          </td>
                          <td className="py-2 px-3 whitespace-nowrap">
                            <span className="text-slate-200">{log.actor}</span>
                            <span className="text-slate-500"> · {log.role}</span>
                          </td>
                          <td className="py-2 px-3 text-cyan-400 whitespace-nowrap">{log.action}</td>
                          <td className="py-2 px-3 text-slate-300 whitespace-nowrap">
                            {log.resource}/{log.resource_id}
                          </td>
                          <td className="py-2 px-3 whitespace-nowrap">
                            <span className={log.result === 'SUCCESS' ? 'text-emerald-400' : 'text-rose-400'}>
                              {log.result}
                            </span>
                          </td>
                          <td className="py-2 px-3 font-sans text-slate-400 max-w-xs truncate">
                            {log.details}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Prometheus /api/v1/metrics Exposition */}
              <div className="lg:col-span-4 bg-[#111827] border border-[#1E293B] p-4 space-y-3">
                <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-cyan-400" />
                  Prometheus `/api/v1/metrics` Scrape
                </h2>
                <pre className="p-3 bg-[#0B0E17] border border-[#1E293B] text-[11px] font-mono text-slate-300 overflow-x-auto leading-relaxed max-h-96">
                  {prometheusText || 'Loading Prometheus metrics...'}
                </pre>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Machine Detail Modal */}
      {selectedMachine && (
        <MachineDetailModal
          machine={selectedMachine}
          alerts={alerts}
          onClose={() => setSelectedMachineId(null)}
          onSendCommand={handleSendMachineCommand}
          onAskAiAboutMachine={(machineId, question) => {
            setSelectedMachineId(null);
            setActiveTab('ai');
            handleAskAi(question, machineId);
          }}
          currentRole={currentProfile.role}
        />
      )}
    </div>
  );
}
