import React, { useEffect, useState } from 'react';
import {
  X,
  Play,
  Square,
  Wrench,
  Sparkles,
  RotateCcw,
  Activity
} from 'lucide-react';
import {
  Machine,
  TelemetryPoint,
  Alert,
  MaintenanceRecord,
  FailureScenarioType,
  UserRole,
  HealthStatus
} from '../types/twin';

interface MachineDetailModalProps {
  machine: Machine;
  alerts: Alert[];
  onClose: () => void;
  onSendCommand: (
    machineId: string,
    payload: {
      command: 'START' | 'STOP' | 'INJECT_FAILURE' | 'CLEAR_FAILURE' | 'CLEAR_ALL_FAILURES' | 'SET_MODE' | 'SET_INTERVAL';
      failure_type?: FailureScenarioType;
      operating_state?: Machine['operating_state'];
      telemetry_interval_ms?: number;
    }
  ) => Promise<void>;
  onAskAiAboutMachine: (machineId: string, question: string) => void;
  currentRole: UserRole;
}

const FAILURE_OPTIONS: { id: FailureScenarioType; label: string; category: string }[] = [
  { id: 'overheating', label: 'Overheating (>85 °C)', category: 'Thermal' },
  { id: 'bearing_degradation', label: 'Bearing Degradation Drift', category: 'Mechanical' },
  { id: 'excessive_vibration', label: 'Excessive Vibration Spike', category: 'Mechanical' },
  { id: 'motor_overload', label: 'Motor Current Overload', category: 'Electrical' },
  { id: 'power_instability', label: 'Bus Voltage Instability', category: 'Electrical' },
  { id: 'sensor_malfunction', label: 'Sensor Fault (-999 °C)', category: 'Instrumentation' },
  { id: 'machine_offline', label: 'Machine Offline Timeout', category: 'Connectivity' },
  { id: 'intermittent_telemetry', label: 'Intermittent Packet Loss', category: 'Connectivity' },
  { id: 'duplicate_events', label: 'Duplicate Event IDs', category: 'Data Quality' },
  { id: 'out_of_order_events', label: 'Out-of-Order Timestamps', category: 'Data Quality' },
  { id: 'malformed_telemetry', label: 'Malformed Payload -> DLQ', category: 'Data Quality' }
];

function formatStatusLabel(status: HealthStatus) {
  switch (status) {
    case 'HEALTHY':
      return { glyph: '●', text: 'HEALTHY', color: 'text-emerald-400' };
    case 'WATCH':
      return { glyph: '◆', text: 'WATCH', color: 'text-cyan-400' };
    case 'WARNING':
      return { glyph: '▲', text: 'WARNING', color: 'text-amber-400' };
    case 'CRITICAL':
      return { glyph: '✖', text: 'CRITICAL', color: 'text-rose-400' };
    case 'OFFLINE':
      return { glyph: '○', text: 'OFFLINE', color: 'text-slate-400' };
  }
}

export const MachineDetailModal: React.FC<MachineDetailModalProps> = ({
  machine,
  alerts,
  onClose,
  onSendCommand,
  onAskAiAboutMachine,
  currentRole
}) => {
  const [history, setHistory] = useState<TelemetryPoint[]>([]);
  const [maintenance, setMaintenance] = useState<MaintenanceRecord[]>([]);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    const fetchDetails = async () => {
      try {
        const [telRes, maintRes] = await Promise.all([
          fetch(`/api/v1/machines/${machine.id}/telemetry`),
          fetch(`/api/v1/machines/${machine.id}/maintenance`)
        ]);
        if (!active) return;
        if (telRes.ok) {
          const data = await telRes.json();
          setHistory(data);
        }
        if (maintRes.ok) {
          const mData = await maintRes.json();
          setMaintenance(mData);
        }
      } catch {
        // ignore transient fetch errors
      }
    };
    fetchDetails();
    const timer = setInterval(fetchDetails, 2000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [machine.id]);

  const statusMeta = formatStatusLabel(machine.status);
  const machineAlerts = alerts.filter((a) => a.machine_id === machine.id);
  const isReadOnly = currentRole === 'VIEWER' || currentRole === 'AI_AGENT';

  const renderSvgSparkChart = (
    title: string,
    unit: string,
    accessor: (p: TelemetryPoint) => number,
    minBound: number,
    maxBound: number,
    strokeColor: string,
    warnThreshold?: number
  ) => {
    const pts = history.length > 1 ? history : [machine.latest_telemetry, machine.latest_telemetry];
    const width = 360;
    const height = 105;
    const padX = 8;
    const padY = 12;

    const coords = pts.map((pt, i) => {
      const val = accessor(pt);
      const clamped = Math.max(minBound, Math.min(maxBound, val));
      const x = padX + (i / Math.max(1, pts.length - 1)) * (width - padX * 2);
      const y = height - padY - ((clamped - minBound) / Math.max(1, maxBound - minBound)) * (height - padY * 2);
      return { x, y, val, timestamp: pt.timestamp };
    });

    const polyline = coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
    const latestVal = coords[coords.length - 1]?.val ?? 0;
    const activePoint = hoverIdx !== null && coords[hoverIdx] ? coords[hoverIdx] : coords[coords.length - 1];

    let thresholdY: number | null = null;
    if (warnThreshold !== undefined && warnThreshold >= minBound && warnThreshold <= maxBound) {
      thresholdY =
        height - padY - ((warnThreshold - minBound) / Math.max(1, maxBound - minBound)) * (height - padY * 2);
    }

    return (
      <div className="bg-[#0B0E17] border border-[#1E293B] p-3.5">
        <div className="flex items-baseline justify-between mb-2">
          <span className="text-xs text-slate-400 font-medium">{title}</span>
          <div className="font-mono tabular-nums">
            <span className="text-lg font-semibold text-slate-100">{activePoint.val}</span>
            <span className="text-xs text-slate-400 ml-1">{unit}</span>
          </div>
        </div>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-24 overflow-visible cursor-crosshair"
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const relX = e.clientX - rect.left;
            const idx = Math.round((relX / rect.width) * (coords.length - 1));
            if (idx >= 0 && idx < coords.length) setHoverIdx(idx);
          }}
          onMouseLeave={() => setHoverIdx(null)}
        >
          <line x1={padX} y1={padY} x2={width - padX} y2={padY} stroke="#1E293B" strokeDasharray="2 2" />
          <line x1={padX} y1={height / 2} x2={width - padX} y2={height / 2} stroke="#1E293B" strokeDasharray="2 2" />
          <line x1={padX} y1={height - padY} x2={width - padX} y2={height - padY} stroke="#1E293B" />
          {thresholdY !== null && (
            <line
              x1={padX}
              y1={thresholdY}
              x2={width - padX}
              y2={thresholdY}
              stroke="#F59E0B"
              strokeWidth="1"
              strokeDasharray="4 3"
            />
          )}
          <polyline
            fill="none"
            stroke={strokeColor}
            strokeWidth="2"
            points={polyline}
          />
          {activePoint && (
            <>
              <line
                x1={activePoint.x}
                y1={padY}
                x2={activePoint.x}
                y2={height - padY}
                stroke="#475569"
                strokeWidth="1"
              />
              <circle cx={activePoint.x} cy={activePoint.y} r="3.5" fill={strokeColor} />
            </>
          )}
        </svg>
        <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-500 mt-1">
          <span>Bounds: {minBound}–{maxBound} {unit}</span>
          <span>Now: {latestVal} {unit}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-[#111827] border border-[#1E293B] w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Top Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1E293B] bg-[#0B0E17]">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-semibold text-slate-100 font-mono">{machine.id}</h2>
              <span className="text-slate-500">·</span>
              <span className="text-base font-medium text-slate-200">{machine.name}</span>
              <span className="text-slate-500">·</span>
              <span className={`font-mono text-sm font-semibold ${statusMeta.color}`}>
                {statusMeta.glyph} {statusMeta.text} ({machine.health_score}/100)
              </span>
            </div>
            <div className="text-xs text-slate-400 mt-1 flex flex-wrap items-center gap-2">
              <span>{machine.manufacturer} {machine.model}</span>
              <span>·</span>
              <span className="font-mono">SN: {machine.serial_number}</span>
              <span>·</span>
              <span>{machine.line_name}</span>
              <span>·</span>
              <span>{machine.location}</span>
              <span>·</span>
              <span className="font-mono">FW: {machine.firmware_version}</span>
              <span>·</span>
              <span className="font-mono text-cyan-400">{machine.mqtt_topic}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() =>
                onAskAiAboutMachine(
                  machine.id,
                  `Why is ${machine.id} currently in ${machine.status} state (health ${machine.health_score}/100) and what runbook or SOP should I execute?`
                )
              }
              className="px-3.5 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Diagnose with AI Copilot (MCP + RAG)
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-100 border border-[#1E293B] hover:border-slate-700 cursor-pointer"
              aria-label="Close modal"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Row 1: Deterministic Health Model Breakdown + Quick Controls */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 bg-[#0B0E17] border border-[#1E293B] p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-slate-200">
                  Deterministic Digital Twin Health Model (Section 9)
                </h3>
                <span className="text-xs font-mono text-slate-400 tabular-nums">
                  Last Seen: {new Date(machine.last_seen).toLocaleTimeString()}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 font-mono tabular-nums text-xs">
                <div className="p-2.5 border border-[#1E293B]">
                  <div className="text-slate-400">Base Score</div>
                  <div className="text-lg font-semibold text-slate-100 mt-0.5">100</div>
                </div>
                <div className="p-2.5 border border-[#1E293B]">
                  <div className="text-slate-400">Thermal Penalty</div>
                  <div className="text-lg font-semibold text-amber-400 mt-0.5">
                    -{machine.health_breakdown.temperature_penalty}
                  </div>
                </div>
                <div className="p-2.5 border border-[#1E293B]">
                  <div className="text-slate-400">Vibration Penalty</div>
                  <div className="text-lg font-semibold text-amber-400 mt-0.5">
                    -{machine.health_breakdown.vibration_penalty}
                  </div>
                </div>
                <div className="p-2.5 border border-[#1E293B]">
                  <div className="text-slate-400">Power Penalty</div>
                  <div className="text-lg font-semibold text-amber-400 mt-0.5">
                    -{machine.health_breakdown.power_penalty}
                  </div>
                </div>
                <div className="p-2.5 border border-[#1E293B]">
                  <div className="text-slate-400">Final Twin Score</div>
                  <div className={`text-lg font-semibold mt-0.5 ${statusMeta.color}`}>
                    {machine.health_score} / 100
                  </div>
                </div>
              </div>
              <div className="mt-3 text-xs text-slate-400 flex items-center justify-between">
                <span>Thresholds: 90–100 HEALTHY · 70–89 WATCH · 40–69 WARNING · 0–39 CRITICAL</span>
                <span className="font-mono text-slate-300">
                  Mode: {machine.operating_state} · Interval: {machine.telemetry_interval_ms}ms
                </span>
              </div>
            </div>

            {/* Simulator Direct Control Box */}
            <div className="bg-[#0B0E17] border border-[#1E293B] p-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-slate-200">Edge Simulator Controls</h3>
                  <span className="text-xs font-mono text-slate-400">Role: {currentRole}</span>
                </div>
                <p className="text-xs text-slate-400 mb-3">
                  Command operating state or clear injected faults via <code className="text-cyan-400">POST /api/v1/machines/{machine.id}/commands</code>
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  disabled={isReadOnly}
                  onClick={() => onSendCommand(machine.id, { command: 'START' })}
                  className="px-3 py-1.5 bg-emerald-600/20 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-600/30 text-xs font-medium flex items-center gap-1.5 disabled:opacity-40 cursor-pointer whitespace-nowrap"
                >
                  <Play className="w-3.5 h-3.5" /> Start / Resume
                </button>
                <button
                  disabled={isReadOnly}
                  onClick={() => onSendCommand(machine.id, { command: 'STOP' })}
                  className="px-3 py-1.5 bg-rose-600/20 border border-rose-500/40 text-rose-300 hover:bg-rose-600/30 text-xs font-medium flex items-center gap-1.5 disabled:opacity-40 cursor-pointer whitespace-nowrap"
                >
                  <Square className="w-3.5 h-3.5" /> Stop Machine
                </button>
                <button
                  disabled={isReadOnly}
                  onClick={() => onSendCommand(machine.id, { command: 'SET_MODE', operating_state: 'IDLE' })}
                  className="px-3 py-1.5 bg-slate-800 border border-slate-700 text-slate-200 hover:bg-slate-700 text-xs font-medium disabled:opacity-40 cursor-pointer whitespace-nowrap"
                >
                  Set IDLE Cooling
                </button>
                <button
                  disabled={isReadOnly}
                  onClick={() => onSendCommand(machine.id, { command: 'CLEAR_ALL_FAILURES' })}
                  className="px-3 py-1.5 bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/30 text-xs font-medium flex items-center gap-1.5 disabled:opacity-40 cursor-pointer whitespace-nowrap"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Clear All Faults
                </button>
              </div>
            </div>
          </div>

          {/* Row 2: Live Multi-Channel Waveforms */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                <Activity className="w-4 h-4 text-cyan-400" />
                Live Telemetry Waveforms (Hover Crosshair to Inspect Time-Series)
              </h3>
              <div className="text-xs font-mono tabular-nums text-slate-400">
                Voltage: {machine.latest_telemetry.voltage} V · Current: {machine.latest_telemetry.current} A · Pressure: {machine.latest_telemetry.pressure} bar · Energy: {machine.latest_telemetry.energy_consumption} kWh
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              {renderSvgSparkChart('Temperature (Normal 65–75 °C)', '°C', (p) => p.temperature, 40, 105, '#F59E0B', 80)}
              {renderSvgSparkChart('Vibration RMS (Normal 1–3 mm/s)', 'mm/s', (p) => p.vibration, 0, 10, '#06B6D4', 3.8)}
              {renderSvgSparkChart('Spindle / Rotor Speed', 'RPM', (p) => p.rpm, 0, 1700, '#10B981')}
              {renderSvgSparkChart('Active Power Draw (Normal 7–10 kW)', 'kW', (p) => p.power_kw, 0, 20, '#38BDF8', 12.5)}
            </div>
          </div>

          {/* Row 3: Inject / Clear 11 Failure Scenarios */}
          <div className="bg-[#0B0E17] border border-[#1E293B] p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-200">
                Fault Injection Matrix — 11 Blueprint Failure Scenarios (Section 5)
              </h3>
              <span className="text-xs text-slate-400">
                Active Faults: {machine.active_failures.length ? machine.active_failures.join(', ') : 'None (Nominal)'}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {FAILURE_OPTIONS.map((f) => {
                const isActive = machine.active_failures.includes(f.id);
                return (
                  <button
                    key={f.id}
                    disabled={isReadOnly}
                    onClick={() =>
                      onSendCommand(machine.id, {
                        command: isActive ? 'CLEAR_FAILURE' : 'INJECT_FAILURE',
                        failure_type: f.id
                      })
                    }
                    className={`px-3 py-2 text-left border transition-colors cursor-pointer disabled:opacity-40 ${
                      isActive
                        ? 'bg-rose-950/50 border-rose-500/70 text-rose-200'
                        : 'bg-[#111827] border-[#1E293B] text-slate-300 hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs font-medium">
                      <span className="truncate">{f.label}</span>
                      <span className="font-mono text-[10px] ml-1 shrink-0">
                        {isActive ? 'ACTIVE' : 'INJECT'}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">{f.category}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Row 4: Machine Alerts & Maintenance History */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-[#0B0E17] border border-[#1E293B] p-4">
              <h3 className="text-sm font-semibold text-slate-200 mb-3">
                Asset Alerts ({machineAlerts.length})
              </h3>
              {machineAlerts.length === 0 ? (
                <p className="text-xs text-slate-500 py-4">No alerts recorded for {machine.id}.</p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {machineAlerts.map((a) => (
                    <div key={a.alert_id} className="p-2.5 border border-[#1E293B] bg-[#111827] text-xs">
                      <div className="flex items-center justify-between font-mono">
                        <span className={a.severity === 'CRITICAL' ? 'text-rose-400 font-semibold' : 'text-amber-400 font-semibold'}>
                          {a.severity === 'CRITICAL' ? '✖' : '▲'} {a.type}
                        </span>
                        <span className="text-slate-400">
                          {a.status} · Dedup x{a.dedup_count}
                        </span>
                      </div>
                      <div className="text-slate-200 mt-1">{a.title}</div>
                      <div className="text-slate-500 font-mono mt-1">
                        Observed: {a.evidence.observed_value} (Threshold: {a.evidence.threshold})
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-[#0B0E17] border border-[#1E293B] p-4">
              <h3 className="text-sm font-semibold text-slate-200 mb-3 flex items-center gap-1.5">
                <Wrench className="w-4 h-4 text-cyan-400" />
                Maintenance & Calibration Records ({maintenance.length})
              </h3>
              {maintenance.length === 0 ? (
                <p className="text-xs text-slate-500 py-4">No maintenance logs found for {machine.id}.</p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {maintenance.map((m) => (
                    <div key={m.id} className="p-2.5 border border-[#1E293B] bg-[#111827] text-xs">
                      <div className="flex items-center justify-between font-mono text-slate-300">
                        <span>{m.id} · {m.type} · {m.status}</span>
                        <span className="text-cyan-400">{m.sop_reference}</span>
                      </div>
                      <div className="text-slate-200 mt-1">{m.summary}</div>
                      <div className="text-slate-500 mt-1">
                        Technician: {m.technician} · Next Due: {new Date(m.next_due_at).toLocaleDateString()}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
