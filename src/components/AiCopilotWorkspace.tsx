import React, { useState } from 'react';
import {
  Sparkles,
  BookOpen,
  Terminal,
  FileText,
  Send,
  ShieldCheck
} from 'lucide-react';
import { AiDiagnosticResponse, Machine } from '../types/twin';
import { PRODUCTION_RUNBOOKS, RAG_KNOWLEDGE_BASE } from '../data/knowledgeBase';

interface AiCopilotWorkspaceProps {
  machines: Machine[];
  aiResponse: AiDiagnosticResponse | null;
  aiLoading: boolean;
  onAskQuestion: (question: string, machineId?: string) => Promise<void>;
}

const PRESET_QUESTIONS = [
  'Why is CNC-001 unhealthy?',
  'What changed on Factory-A recently and what alerts occurred?',
  'What maintenance was performed on CNC-001 and COMPRESSOR-001?',
  'Are there similar historical incidents to the current CNC-001 bearing vibration?',
  'What runbook and SOP should I follow to mitigate CNC-001?',
  'What is the current factory status and Kafka/Kubernetes system health?'
];

export const AiCopilotWorkspace: React.FC<AiCopilotWorkspaceProps> = ({
  machines,
  aiResponse,
  aiLoading,
  onAskQuestion
}) => {
  const [questionInput, setQuestionInput] = useState('');
  const [selectedMachineId, setSelectedMachineId] = useState<string>('CNC-001');
  const [activeSubView, setActiveSubView] = useState<'copilot' | 'runbooks' | 'rag'>('copilot');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!questionInput.trim()) return;
    await onAskQuestion(questionInput, selectedMachineId);
  };

  return (
    <div className="space-y-6">
      {/* Sub-navigation */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#1E293B] pb-4">
        <div className="flex items-center gap-1 bg-[#111827] p-1 border border-[#1E293B]">
          <button
            onClick={() => setActiveSubView('copilot')}
            className={`px-3.5 py-1.5 text-xs font-medium cursor-pointer whitespace-nowrap ${
              activeSubView === 'copilot' ? 'bg-cyan-500 text-slate-950 font-semibold' : 'text-slate-300 hover:text-white'
            }`}
          >
            AI Diagnostic Copilot (MCP + RAG)
          </button>
          <button
            onClick={() => setActiveSubView('runbooks')}
            className={`px-3.5 py-1.5 text-xs font-medium cursor-pointer whitespace-nowrap ${
              activeSubView === 'runbooks' ? 'bg-cyan-500 text-slate-950 font-semibold' : 'text-slate-300 hover:text-white'
            }`}
          >
            Production Runbooks ({PRODUCTION_RUNBOOKS.length})
          </button>
          <button
            onClick={() => setActiveSubView('rag')}
            className={`px-3.5 py-1.5 text-xs font-medium cursor-pointer whitespace-nowrap ${
              activeSubView === 'rag' ? 'bg-cyan-500 text-slate-950 font-semibold' : 'text-slate-300 hover:text-white'
            }`}
          >
            RAG Knowledge Base Corpus ({RAG_KNOWLEDGE_BASE.length})
          </button>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>RBAC: AI_AGENT is strictly READ-ONLY (No shell, SQL, or PLC control access)</span>
        </div>
      </div>

      {activeSubView === 'copilot' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Query Controls & Preset Questions */}
          <div className="lg:col-span-4 space-y-4">
            <div className="bg-[#111827] border border-[#1E293B] p-4 space-y-3">
              <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-cyan-400" />
                Operational AI Assistant (Sections 27–29)
              </h2>
              <p className="text-xs text-slate-400 leading-relaxed">
                Executes controlled read-only MCP tools (<code className="text-cyan-400">get_machine_state</code>, <code className="text-cyan-400">get_machine_alerts</code>, <code className="text-cyan-400">get_machine_maintenance</code>) and retrieves RAG manuals/SOPs/runbooks.
              </p>

              <form onSubmit={handleSubmit} className="space-y-3 pt-1">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Context Asset</label>
                  <select
                    value={selectedMachineId}
                    onChange={(e) => setSelectedMachineId(e.target.value)}
                    className="w-full bg-[#0B0E17] border border-[#1E293B] px-3 py-1.5 text-xs font-mono text-slate-100"
                  >
                    {machines.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.id} — {m.name} ({m.status} · {m.health_score}/100)
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Engineering Question</label>
                  <textarea
                    rows={3}
                    value={questionInput}
                    onChange={(e) => setQuestionInput(e.target.value)}
                    placeholder="Ask why a machine is unhealthy, what changed, or which runbook applies..."
                    className="w-full bg-[#0B0E17] border border-[#1E293B] px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <button
                  type="submit"
                  disabled={aiLoading || !questionInput.trim()}
                  className="w-full py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40"
                >
                  <Send className="w-3.5 h-3.5" />
                  {aiLoading ? 'Executing MCP Tools & Querying RAG...' : 'Run Evidence-Grounded Analysis'}
                </button>
              </form>
            </div>

            <div className="bg-[#111827] border border-[#1E293B] p-4 space-y-2.5">
              <div className="text-xs font-semibold text-slate-300">
                Blueprint Diagnostic Prompts (1-Click)
              </div>
              <div className="space-y-1.5">
                {PRESET_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    disabled={aiLoading}
                    onClick={() => {
                      setQuestionInput(q);
                      onAskQuestion(q, selectedMachineId);
                    }}
                    className="w-full text-left px-3 py-2 bg-[#0B0E17] hover:bg-slate-900 border border-[#1E293B] hover:border-cyan-500/50 text-xs text-slate-300 hover:text-cyan-300 transition-colors cursor-pointer"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column: Structured FACT / OBSERVATION / HYPOTHESIS / RECOMMENDATION + MCP & RAG Evidence */}
          <div className="lg:col-span-8 space-y-4">
            {!aiResponse && !aiLoading && (
              <div className="bg-[#111827] border border-[#1E293B] p-8 text-center space-y-3">
                <Sparkles className="w-6 h-6 text-cyan-400 mx-auto" />
                <div className="text-sm font-semibold text-slate-200">
                  Ready for MCP + RAG Operational Investigation
                </div>
                <p className="text-xs text-slate-400 max-w-lg mx-auto">
                  Select a prompt on the left (e.g., &ldquo;Why is CNC-001 unhealthy?&rdquo;) to execute live read-only MCP queries against the Digital Twin state store and retrieve cited SOPs/runbooks.
                </p>
              </div>
            )}

            {aiLoading && (
              <div className="bg-[#111827] border border-[#1E293B] p-8 space-y-3 font-mono text-xs text-slate-400">
                <div className="text-cyan-400 font-semibold animate-pulse">
                  Invoking Controlled Read-Only MCP Tools & Vector/Keyword RAG...
                </div>
                <div>1. Calling get_factory_status() & get_machine_state({selectedMachineId})</div>
                <div>2. Calling get_machine_alerts({selectedMachineId}) & get_machine_maintenance({selectedMachineId})</div>
                <div>3. Retrieving matching chunks from DMG MORI Manuals, SOP-M04, and Incident Reports...</div>
              </div>
            )}

            {aiResponse && !aiLoading && (
              <div className="space-y-4">
                <div className="bg-[#111827] border border-[#1E293B] p-4 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#1E293B]">
                    <div>
                      <div className="text-xs text-slate-400">Query Analyzed</div>
                      <h3 className="text-sm font-semibold text-slate-100">{aiResponse.query}</h3>
                    </div>
                    <div className="text-xs font-mono text-slate-400">
                      <span>{aiResponse.model_used}</span>
                      <span> · </span>
                      <span>{aiResponse.correlation_id}</span>
                    </div>
                  </div>

                  {/* 4 Mandatory Epistemic Sections: FACT, OBSERVATION, HYPOTHESIS, RECOMMENDATION */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-3.5 bg-[#0B0E17] border border-[#1E293B] space-y-2">
                      <div className="text-xs font-mono font-semibold text-emerald-400">
                        01. FACT (Verified Live MCP Telemetry & State)
                      </div>
                      <ul className="space-y-1.5 text-xs text-slate-300 list-disc list-inside leading-relaxed">
                        {aiResponse.fact.map((f, i) => (
                          <li key={i}>{f}</li>
                        ))}
                      </ul>
                    </div>

                    <div className="p-3.5 bg-[#0B0E17] border border-[#1E293B] space-y-2">
                      <div className="text-xs font-mono font-semibold text-cyan-400">
                        02. OBSERVATION (Correlations & Penalty Analysis)
                      </div>
                      <ul className="space-y-1.5 text-xs text-slate-300 list-disc list-inside leading-relaxed">
                        {aiResponse.observation.map((o, i) => (
                          <li key={i}>{o}</li>
                        ))}
                      </ul>
                    </div>

                    <div className="p-3.5 bg-[#0B0E17] border border-[#1E293B] space-y-2">
                      <div className="text-xs font-mono font-semibold text-amber-400">
                        03. HYPOTHESIS (Engineering Root-Cause Inference)
                      </div>
                      <ul className="space-y-1.5 text-xs text-slate-300 list-disc list-inside leading-relaxed">
                        {aiResponse.hypothesis.map((h, i) => (
                          <li key={i}>{h}</li>
                        ))}
                      </ul>
                    </div>

                    <div className="p-3.5 bg-[#0B0E17] border border-[#1E293B] space-y-2">
                      <div className="text-xs font-mono font-semibold text-purple-300">
                        04. RECOMMENDATION (SOPs & Runbook Actions)
                      </div>
                      <ul className="space-y-1.5 text-xs text-slate-300 list-disc list-inside leading-relaxed">
                        {aiResponse.recommendation.map((r, i) => (
                          <li key={i}>{r}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>

                {/* MCP Tool Execution Evidence Trace */}
                <div className="bg-[#111827] border border-[#1E293B] p-4 space-y-3">
                  <h4 className="text-xs font-mono font-semibold text-slate-200 flex items-center gap-2">
                    <Terminal className="w-3.5 h-3.5 text-cyan-400" />
                    Controlled Read-Only MCP Tool Invocations ({aiResponse.mcp_calls.length} Calls Logged to Audit Trail)
                  </h4>
                  <div className="space-y-2">
                    {aiResponse.mcp_calls.map((call, idx) => (
                      <div key={idx} className="p-2.5 bg-[#0B0E17] border border-[#1E293B] text-xs font-mono">
                        <div className="flex items-center justify-between text-cyan-400">
                          <span>
                            {call.tool_name}({JSON.stringify(call.arguments)})
                          </span>
                          <span className="text-slate-500">
                            Role: {call.authorized_role} · {call.duration_ms}ms
                          </span>
                        </div>
                        <div className="text-slate-300 font-sans mt-1">{call.result_summary}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* RAG Cited Documents */}
                <div className="bg-[#111827] border border-[#1E293B] p-4 space-y-3">
                  <h4 className="text-xs font-mono font-semibold text-slate-200 flex items-center gap-2">
                    <FileText className="w-3.5 h-3.5 text-cyan-400" />
                    Cited RAG Knowledge Base Sources ({aiResponse.rag_citations.length})
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {aiResponse.rag_citations.map((cit) => (
                      <div key={cit.chunk_id} className="p-3 bg-[#0B0E17] border border-[#1E293B] text-xs space-y-1.5">
                        <div className="font-mono text-cyan-400 font-semibold">{cit.chunk_id} · {cit.version}</div>
                        <div className="font-medium text-slate-200">{cit.document}</div>
                        <div className="text-slate-500 font-mono text-[11px]">{cit.section}</div>
                        <p className="text-slate-400 leading-relaxed pt-1 border-t border-[#1E293B]">
                          {cit.excerpt}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUBVIEW 2: 11 PRODUCTION RUNBOOKS */}
      {activeSubView === 'runbooks' && (
        <div className="space-y-4">
          <div>
            <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-cyan-400" />
              Standardized Operational Runbooks (Section 31)
            </h2>
            <p className="text-xs text-slate-400">
              Each runbook follows the strict chain: Symptoms → Impact → Checks → Commands → Expected Result → Mitigation → Recovery → Escalation.
            </p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {PRODUCTION_RUNBOOKS.map((rb) => (
              <div key={rb.id} className="bg-[#111827] border border-[#1E293B] p-4 space-y-3 text-xs">
                <div className="flex items-center justify-between font-mono">
                  <span className="text-cyan-400 font-semibold">{rb.id} · {rb.category}</span>
                  <span className={rb.severity === 'CRITICAL' ? 'text-rose-400 font-semibold' : 'text-amber-400'}>
                    {rb.severity}
                  </span>
                </div>
                <h3 className="text-sm font-semibold text-slate-100">{rb.title}</h3>
                <div>
                  <span className="text-slate-400 font-semibold">Symptoms: </span>
                  <span className="text-slate-300">{rb.symptoms.join(' ')}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-semibold">Impact: </span>
                  <span className="text-slate-300">{rb.impact}</span>
                </div>
                <div className="bg-[#0B0E17] border border-[#1E293B] p-2.5 font-mono text-[11px] text-cyan-300 space-y-1 overflow-x-auto">
                  {rb.commands.map((cmd, idx) => (
                    <div key={idx}>$ {cmd}</div>
                  ))}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-[#1E293B]">
                  <div>
                    <span className="text-slate-400 font-semibold">Mitigation: </span>
                    <span className="text-slate-300">{rb.mitigation}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-semibold">Recovery: </span>
                    <span className="text-slate-300">{rb.recovery}</span>
                  </div>
                </div>
                <div className="text-slate-400 font-mono text-[11px]">
                  Escalation: {rb.escalation}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SUBVIEW 3: RAG KNOWLEDGE BASE CORPUS */}
      {activeSubView === 'rag' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {RAG_KNOWLEDGE_BASE.map((doc) => (
            <div key={doc.chunk_id} className="bg-[#111827] border border-[#1E293B] p-4 space-y-2 text-xs">
              <div className="flex items-center justify-between font-mono text-slate-400">
                <span className="text-cyan-400 font-semibold">{doc.chunk_id}</span>
                <span>{doc.source} · {doc.version}</span>
              </div>
              <h3 className="text-sm font-semibold text-slate-100">{doc.document}</h3>
              <div className="text-slate-400 font-mono">{doc.section} · Asset Type: {doc.machine_type}</div>
              <p className="text-slate-300 leading-relaxed pt-2 border-t border-[#1E293B]">{doc.content}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
