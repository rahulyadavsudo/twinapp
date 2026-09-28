import React, { useState } from 'react';
import {
  CheckCircle2,
  ShieldAlert,
  Wrench,
  Radio,
  Plus,
  Search
} from 'lucide-react';
import {
  Alert,
  Incident,
  IncidentStatus,
  MaintenanceRecord,
  KafkaEventEnvelope,
  Machine,
  UserRole
} from '../types/twin';

interface OperationsWorkspaceProps {
  alerts: Alert[];
  incidents: Incident[];
  maintenance: MaintenanceRecord[];
  events: KafkaEventEnvelope[];
  machines: Machine[];
  currentRole: UserRole;
  currentActor: string;
  onAcknowledgeAlert: (alertId: string) => Promise<void>;
  onResolveAlert: (alertId: string) => Promise<void>;
  onCreateIncident: (payload: Partial<Incident>) => Promise<void>;
  onUpdateIncident: (incidentId: string, payload: Record<string, unknown>) => Promise<void>;
  onCreateMaintenance: (payload: Partial<MaintenanceRecord>) => Promise<void>;
  onSelectMachine: (machine: Machine) => void;
}

export const OperationsWorkspace: React.FC<OperationsWorkspaceProps> = ({
  alerts,
  incidents,
  maintenance,
  events,
  machines,
  currentRole,
  onAcknowledgeAlert,
  onResolveAlert,
  onCreateIncident,
  onUpdateIncident,
  onCreateMaintenance,
  onSelectMachine
}) => {
  const [subTab, setSubTab] = useState<'alerts' | 'incidents' | 'maintenance' | 'events'>('alerts');
  const [alertFilter, setAlertFilter] = useState<'ALL' | 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED'>('ALL');
  const [topicFilter, setTopicFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // New Incident Form state
  const [newIncTitle, setNewIncTitle] = useState('');
  const [newIncAsset, setNewIncAsset] = useState('CNC-001');
  const [newIncSeverity, setNewIncSeverity] = useState<'SEV-1' | 'SEV-2' | 'SEV-3'>('SEV-2');
  const [newIncDesc, setNewIncDesc] = useState('');

  // New Maintenance Form state
  const [newMaintMachine, setNewMaintMachine] = useState('CNC-001');
  const [newMaintType, setNewMaintType] = useState<MaintenanceRecord['type']>('CORRECTIVE');
  const [newMaintSop, setNewMaintSop] = useState('SOP-M04');
  const [newMaintSummary, setNewMaintSummary] = useState('');

  const isReadOnly = currentRole === 'VIEWER' || currentRole === 'AI_AGENT';

  const filteredAlerts = alerts.filter((a) => {
    if (alertFilter !== 'ALL' && a.status !== alertFilter) return false;
    if (
      searchQuery &&
      !`${a.machine_id} ${a.type} ${a.title}`.toLowerCase().includes(searchQuery.toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  const filteredEvents = events.filter((e) => {
    if (topicFilter !== 'ALL' && e.event_type !== topicFilter) return false;
    if (
      searchQuery &&
      !`${e.machine_id} ${e.event_type} ${e.event_id} ${e.validation_status}`
        .toLowerCase()
        .includes(searchQuery.toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Sub-navigation & Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#1E293B] pb-4">
        <div className="flex items-center gap-1 bg-[#111827] p-1 border border-[#1E293B]">
          <button
            onClick={() => setSubTab('alerts')}
            className={`px-3.5 py-1.5 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
              subTab === 'alerts' ? 'bg-cyan-500 text-slate-950 font-semibold' : 'text-slate-300 hover:text-white'
            }`}
          >
            Alert Engine ({alerts.filter((a) => a.status !== 'RESOLVED').length} Active)
          </button>
          <button
            onClick={() => setSubTab('incidents')}
            className={`px-3.5 py-1.5 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
              subTab === 'incidents' ? 'bg-cyan-500 text-slate-950 font-semibold' : 'text-slate-300 hover:text-white'
            }`}
          >
            Incidents & RCA ({incidents.length})
          </button>
          <button
            onClick={() => setSubTab('maintenance')}
            className={`px-3.5 py-1.5 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
              subTab === 'maintenance' ? 'bg-cyan-500 text-slate-950 font-semibold' : 'text-slate-300 hover:text-white'
            }`}
          >
            Maintenance Logs ({maintenance.length})
          </button>
          <button
            onClick={() => setSubTab('events')}
            className={`px-3.5 py-1.5 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
              subTab === 'events' ? 'bg-cyan-500 text-slate-950 font-semibold' : 'text-slate-300 hover:text-white'
            }`}
          >
            MQTT / Kafka Stream & DLQ ({events.length})
          </button>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter by machine ID, type, correlation..."
            className="w-full bg-[#111827] border border-[#1E293B] pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500"
          />
        </div>
      </div>

      {/* TAB 1: ALERTS */}
      {subTab === 'alerts' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-slate-100">
                Alert Engine — Lifecycle & Storm Deduplication (Section 10)
              </h2>
              <p className="text-xs text-slate-400">
                Lifecycle: OPEN → ACKNOWLEDGED → RESOLVED. Alert storms are suppressed via per-asset cooldown windows and deduplication counters.
              </p>
            </div>
            <div className="flex items-center gap-1 bg-[#111827] p-1 border border-[#1E293B]">
              {(['ALL', 'OPEN', 'ACKNOWLEDGED', 'RESOLVED'] as const).map((st) => (
                <button
                  key={st}
                  onClick={() => setAlertFilter(st)}
                  className={`px-2.5 py-1 text-xs font-mono cursor-pointer whitespace-nowrap ${
                    alertFilter === st ? 'bg-slate-800 text-cyan-400 font-semibold' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-[#111827] border border-[#1E293B] overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[#1E293B] text-slate-400 font-mono">
                  <th className="py-2.5 px-4">Alert ID</th>
                  <th className="py-2.5 px-4">Severity & Type</th>
                  <th className="py-2.5 px-4">Machine</th>
                  <th className="py-2.5 px-4">Evidence & Threshold</th>
                  <th className="py-2.5 px-4">Dedup</th>
                  <th className="py-2.5 px-4">Lifecycle Status</th>
                  <th className="py-2.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1E293B]">
                {filteredAlerts.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-500">
                      No matching alerts in current view.
                    </td>
                  </tr>
                ) : (
                  filteredAlerts.map((a) => (
                    <tr key={a.alert_id} className="hover:bg-slate-900/60">
                      <td className="py-2.5 px-4 font-mono tabular-nums text-slate-300 whitespace-nowrap">
                        <div>{a.alert_id}</div>
                        <div className="text-[11px] text-slate-500">
                          {new Date(a.created_at).toLocaleTimeString()}
                        </div>
                      </td>
                      <td className="py-2.5 px-4 font-mono whitespace-nowrap">
                        <span
                          className={
                            a.severity === 'CRITICAL'
                              ? 'text-rose-400 font-semibold'
                              : 'text-amber-400 font-semibold'
                          }
                        >
                          {a.severity === 'CRITICAL' ? '✖ CRITICAL' : '▲ WARNING'}
                        </span>
                        <div className="text-slate-300 mt-0.5">{a.type}</div>
                      </td>
                      <td className="py-2.5 px-4 font-mono whitespace-nowrap">
                        <button
                          onClick={() => {
                            const m = machines.find((x) => x.id === a.machine_id);
                            if (m) onSelectMachine(m);
                          }}
                          className="text-cyan-400 hover:underline cursor-pointer font-semibold"
                        >
                          {a.machine_id}
                        </button>
                        <div className="text-slate-500 text-[11px]">{a.line_id}</div>
                      </td>
                      <td className="py-2.5 px-4">
                        <div className="text-slate-200">{a.title}</div>
                        <div className="text-slate-400 font-mono tabular-nums text-[11px] mt-0.5">
                          Observed: {a.evidence.observed_value} · Limit: {a.evidence.threshold} · Corr: {a.correlation_id}
                        </div>
                      </td>
                      <td className="py-2.5 px-4 font-mono tabular-nums text-slate-300">
                        {a.dedup_count}x
                      </td>
                      <td className="py-2.5 px-4 font-mono whitespace-nowrap">
                        <span
                          className={
                            a.status === 'OPEN'
                              ? 'text-rose-400'
                              : a.status === 'ACKNOWLEDGED'
                              ? 'text-amber-400'
                              : 'text-emerald-400'
                          }
                        >
                          {a.status}
                        </span>
                        {a.acknowledged_by && (
                          <div className="text-[11px] text-slate-500">Ack: {a.acknowledged_by}</div>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          {a.status === 'OPEN' && (
                            <button
                              disabled={isReadOnly}
                              onClick={() => onAcknowledgeAlert(a.alert_id)}
                              className="px-2.5 py-1 bg-amber-500/15 border border-amber-500/40 text-amber-300 hover:bg-amber-500/25 text-xs font-medium disabled:opacity-40 cursor-pointer"
                            >
                              Acknowledge
                            </button>
                          )}
                          {a.status !== 'RESOLVED' && (
                            <button
                              disabled={isReadOnly}
                              onClick={() => onResolveAlert(a.alert_id)}
                              className="px-2.5 py-1 bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25 text-xs font-medium disabled:opacity-40 cursor-pointer"
                            >
                              Resolve
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: INCIDENT MANAGEMENT */}
      {subTab === 'incidents' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-cyan-400" />
              Operational Incidents & Engineering Root Cause Analysis (Section 30)
            </h2>
            {incidents.map((inc) => (
              <div key={inc.incident_id} className="bg-[#111827] border border-[#1E293B] p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 font-mono text-xs">
                    <span className="text-cyan-400 font-semibold">{inc.incident_id}</span>
                    <span>·</span>
                    <span className={inc.severity === 'SEV-1' ? 'text-rose-400 font-semibold' : 'text-amber-400 font-semibold'}>
                      {inc.severity}
                    </span>
                    <span>·</span>
                    <span className="text-slate-300">Asset: {inc.affected_asset}</span>
                    <span>·</span>
                    <span className="text-emerald-400">Status: {inc.status}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {(['OPEN', 'INVESTIGATING', 'MITIGATED', 'RESOLVED', 'CLOSED'] as IncidentStatus[]).map((st) => (
                      <button
                        key={st}
                        disabled={isReadOnly}
                        onClick={() =>
                          onUpdateIncident(inc.incident_id, {
                            status: st,
                            note: `Transitioned incident status to ${st}`
                          })
                        }
                        className={`px-2 py-0.5 text-[11px] font-mono border cursor-pointer disabled:opacity-40 ${
                          inc.status === st
                            ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300'
                            : 'border-[#1E293B] text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {st}
                      </button>
                    ))}
                  </div>
                </div>
                <h3 className="text-sm font-semibold text-slate-100">{inc.title}</h3>
                <p className="text-xs text-slate-300 leading-relaxed">{inc.description}</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 border-t border-[#1E293B] text-xs">
                  <div>
                    <div className="text-slate-500 font-mono mb-0.5">Verified Root Cause</div>
                    <div className="text-slate-300">{inc.root_cause}</div>
                  </div>
                  <div>
                    <div className="text-slate-500 font-mono mb-0.5">Resolution / Mitigation</div>
                    <div className="text-slate-300">{inc.resolution}</div>
                  </div>
                  <div>
                    <div className="text-slate-500 font-mono mb-0.5">Lessons Learned</div>
                    <div className="text-slate-300">{inc.lessons_learned}</div>
                  </div>
                </div>
                <div className="pt-2 border-t border-[#1E293B]">
                  <div className="text-[11px] font-mono text-slate-400 mb-1.5">Audit Timeline</div>
                  <div className="space-y-1">
                    {inc.timeline.map((t, idx) => (
                      <div key={idx} className="text-xs font-mono text-slate-400 flex items-center gap-2">
                        <span className="text-slate-500 tabular-nums">{new Date(t.timestamp).toLocaleTimeString()}</span>
                        <span className="text-cyan-400">{t.actor}:</span>
                        <span className="text-slate-300 font-sans">{t.note}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Open New Incident Form */}
          <div className="bg-[#111827] border border-[#1E293B] p-4 h-fit space-y-3">
            <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-1.5">
              <Plus className="w-4 h-4 text-cyan-400" />
              Declare Operational Incident
            </h3>
            <div className="space-y-2.5 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Incident Title</label>
                <input
                  type="text"
                  value={newIncTitle}
                  onChange={(e) => setNewIncTitle(e.target.value)}
                  placeholder="e.g., CNC-002 Thermal Excursion"
                  className="w-full bg-[#0B0E17] border border-[#1E293B] px-3 py-1.5 text-slate-100"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-400 mb-1">Affected Asset</label>
                  <select
                    value={newIncAsset}
                    onChange={(e) => setNewIncAsset(e.target.value)}
                    className="w-full bg-[#0B0E17] border border-[#1E293B] px-2.5 py-1.5 text-slate-100 font-mono"
                  >
                    {machines.map((m) => (
                      <option key={m.id} value={m.id}>{m.id}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Severity</label>
                  <select
                    value={newIncSeverity}
                    onChange={(e) => setNewIncSeverity(e.target.value as 'SEV-1' | 'SEV-2' | 'SEV-3')}
                    className="w-full bg-[#0B0E17] border border-[#1E293B] px-2.5 py-1.5 text-slate-100 font-mono"
                  >
                    <option value="SEV-1">SEV-1 (Critical)</option>
                    <option value="SEV-2">SEV-2 (Major)</option>
                    <option value="SEV-3">SEV-3 (Minor)</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Description & Telemetry Evidence</label>
                <textarea
                  rows={3}
                  value={newIncDesc}
                  onChange={(e) => setNewIncDesc(e.target.value)}
                  placeholder="Describe anomaly symptoms and impacted line..."
                  className="w-full bg-[#0B0E17] border border-[#1E293B] px-3 py-1.5 text-slate-100"
                />
              </div>
              <button
                disabled={isReadOnly || !newIncTitle.trim()}
                onClick={async () => {
                  await onCreateIncident({
                    title: newIncTitle,
                    affected_asset: newIncAsset,
                    severity: newIncSeverity,
                    description: newIncDesc
                  });
                  setNewIncTitle('');
                  setNewIncDesc('');
                }}
                className="w-full py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs disabled:opacity-40 cursor-pointer"
              >
                Create Incident Record
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: MAINTENANCE LOGS */}
      {subTab === 'maintenance' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-[#111827] border border-[#1E293B] overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[#1E293B] text-slate-400 font-mono">
                  <th className="py-2.5 px-4">Record ID</th>
                  <th className="py-2.5 px-4">Machine</th>
                  <th className="py-2.5 px-4">Type & SOP</th>
                  <th className="py-2.5 px-4">Summary & Parts Replaced</th>
                  <th className="py-2.5 px-4">Technician</th>
                  <th className="py-2.5 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1E293B]">
                {maintenance.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-900/60">
                    <td className="py-2.5 px-4 font-mono text-slate-300 whitespace-nowrap">{r.id}</td>
                    <td className="py-2.5 px-4 font-mono text-cyan-400 font-semibold whitespace-nowrap">{r.machine_id}</td>
                    <td className="py-2.5 px-4 font-mono whitespace-nowrap">
                      <div className="text-slate-200">{r.type}</div>
                      <div className="text-slate-500">{r.sop_reference}</div>
                    </td>
                    <td className="py-2.5 px-4">
                      <div className="text-slate-200">{r.summary}</div>
                      {r.parts_replaced.length > 0 && (
                        <div className="text-slate-500 font-mono text-[11px] mt-0.5">
                          Parts: {r.parts_replaced.join(' · ')}
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-slate-300 whitespace-nowrap">{r.technician}</td>
                    <td className="py-2.5 px-4 font-mono whitespace-nowrap">
                      <span className={r.status === 'COMPLETED' ? 'text-emerald-400' : 'text-amber-400'}>
                        {r.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="bg-[#111827] border border-[#1E293B] p-4 h-fit space-y-3">
            <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-1.5">
              <Wrench className="w-4 h-4 text-cyan-400" />
              Log Maintenance Work Order
            </h3>
            <div className="space-y-2.5 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-400 mb-1">Asset</label>
                  <select
                    value={newMaintMachine}
                    onChange={(e) => setNewMaintMachine(e.target.value)}
                    className="w-full bg-[#0B0E17] border border-[#1E293B] px-2.5 py-1.5 text-slate-100 font-mono"
                  >
                    {machines.map((m) => (
                      <option key={m.id} value={m.id}>{m.id}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Category</label>
                  <select
                    value={newMaintType}
                    onChange={(e) => setNewMaintType(e.target.value as MaintenanceRecord['type'])}
                    className="w-full bg-[#0B0E17] border border-[#1E293B] px-2.5 py-1.5 text-slate-100 font-mono"
                  >
                    <option value="PREVENTIVE">PREVENTIVE</option>
                    <option value="CORRECTIVE">CORRECTIVE</option>
                    <option value="PREDICTIVE">PREDICTIVE</option>
                    <option value="CALIBRATION">CALIBRATION</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-slate-400 mb-1">SOP Reference</label>
                <input
                  type="text"
                  value={newMaintSop}
                  onChange={(e) => setNewMaintSop(e.target.value)}
                  className="w-full bg-[#0B0E17] border border-[#1E293B] px-3 py-1.5 text-slate-100 font-mono"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Work Performed Summary</label>
                <textarea
                  rows={3}
                  value={newMaintSummary}
                  onChange={(e) => setNewMaintSummary(e.target.value)}
                  placeholder="e.g., Replaced ceramic angular contact bearings per SOP-M04 and verified vibration < 1.8 mm/s."
                  className="w-full bg-[#0B0E17] border border-[#1E293B] px-3 py-1.5 text-slate-100"
                />
              </div>
              <button
                disabled={isReadOnly || !newMaintSummary.trim()}
                onClick={async () => {
                  await onCreateMaintenance({
                    machine_id: newMaintMachine,
                    type: newMaintType,
                    sop_reference: newMaintSop,
                    summary: newMaintSummary,
                    status: 'COMPLETED'
                  });
                  setNewMaintSummary('');
                }}
                className="w-full py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs disabled:opacity-40 cursor-pointer"
              >
                Record Maintenance Entry
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: MQTT & KAFKA EVENT STREAM + DLQ */}
      {subTab === 'events' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
                <Radio className="w-4 h-4 text-cyan-400" />
                Kafka Durable Event Backbone & Dead Letter Queue Inspector (Sections 6, 7, 18)
              </h2>
              <p className="text-xs text-slate-400">
                Real-time event envelopes consumed from MQTT (`factory/FAC-A/line/+/machine/+/telemetry`) with partition offsets, correlation IDs, idempotency checks, and `machine.dlq` isolation.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1 bg-[#111827] p-1 border border-[#1E293B]">
              {(['ALL', 'machine.telemetry', 'machine.status', 'machine.alerts', 'machine.dlq'] as const).map((tp) => (
                <button
                  key={tp}
                  onClick={() => setTopicFilter(tp)}
                  className={`px-2.5 py-1 text-xs font-mono cursor-pointer whitespace-nowrap ${
                    topicFilter === tp ? 'bg-slate-800 text-cyan-400 font-semibold' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {tp}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-[#111827] border border-[#1E293B] overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs font-mono tabular-nums">
              <thead>
                <tr className="border-b border-[#1E293B] text-slate-400">
                  <th className="py-2.5 px-3">Partition / Offset</th>
                  <th className="py-2.5 px-3">Topic</th>
                  <th className="py-2.5 px-3">Machine</th>
                  <th className="py-2.5 px-3">Validation</th>
                  <th className="py-2.5 px-3">Event ID & Correlation</th>
                  <th className="py-2.5 px-3">Payload Snapshot</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1E293B]">
                {filteredEvents.slice(0, 35).map((ev, idx) => (
                  <tr key={`${ev.event_id}-${idx}`} className="hover:bg-slate-900/60">
                    <td className="py-2 px-3 text-slate-400 whitespace-nowrap">
                      P{ev.partition} · #{ev.offset}
                    </td>
                    <td className="py-2 px-3 whitespace-nowrap">
                      <span
                        className={
                          ev.event_type === 'machine.dlq'
                            ? 'text-rose-400 font-semibold'
                            : ev.event_type === 'machine.alerts'
                            ? 'text-amber-400'
                            : 'text-cyan-400'
                        }
                      >
                        {ev.event_type}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-slate-200 font-semibold whitespace-nowrap">{ev.machine_id}</td>
                    <td className="py-2 px-3 whitespace-nowrap">
                      <span
                        className={
                          ev.validation_status === 'VALID'
                            ? 'text-emerald-400'
                            : ev.validation_status === 'MALFORMED_DLQ'
                            ? 'text-rose-400 font-semibold'
                            : 'text-amber-400'
                        }
                      >
                        {ev.validation_status}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-slate-400 whitespace-nowrap">
                      <div>{ev.event_id}</div>
                      <div className="text-[10px] text-slate-500">{ev.correlation_id}</div>
                    </td>
                    <td className="py-2 px-3 text-slate-300 max-w-md truncate">
                      {ev.validation_error ? (
                        <span className="text-rose-300">{ev.validation_error}</span>
                      ) : (
                        JSON.stringify(ev.payload)
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
