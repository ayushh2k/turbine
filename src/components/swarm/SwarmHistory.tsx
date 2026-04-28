import { useEffect, useState, useCallback, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { SwarmRun, SwarmAgent, MailboxMessage } from '../../types';
import './SwarmHistory.css';

interface SwarmHistoryProps {
  projectPath: string;
}

function formatDate(iso: string | null): string {
  if (!iso) return '--';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function durationMs(start: string | null, end: string | null): number | null {
  if (!start) return null;
  const s = new Date(start).getTime();
  const e = end ? new Date(end).getTime() : Date.now();
  if (isNaN(s) || isNaN(e)) return null;
  return e - s;
}

function formatDuration(ms: number | null): string {
  if (ms === null) return '--';
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remSecs = secs % 60;
  if (mins < 60) return `${mins}m ${remSecs}s`;
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  return `${hrs}h ${remMins}m`;
}

export function SwarmHistory({ projectPath }: SwarmHistoryProps) {
  const [runs, setRuns] = useState<SwarmRun[]>([]);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [agents, setAgents] = useState<SwarmAgent[]>([]);
  const [messages, setMessages] = useState<MailboxMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailTab, setDetailTab] = useState<'agents' | 'messages' | 'timeline'>('agents');

  // Load all runs for this project
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    invoke<SwarmRun[]>('load_swarm_runs', { projectPath })
      .then((result) => {
        if (!cancelled) setRuns(result);
      })
      .catch(() => {
        if (!cancelled) setRuns([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [projectPath]);

  // Load agents and messages when a run is expanded
  useEffect(() => {
    if (!expandedRunId) {
      setAgents([]);
      setMessages([]);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    Promise.all([
      invoke<SwarmAgent[]>('load_swarm_agents', { swarmRunId: expandedRunId }),
      invoke<MailboxMessage[]>('load_mailbox_messages', { swarmRunId: expandedRunId }),
    ])
      .then(([agentResult, msgResult]) => {
        if (!cancelled) {
          setAgents(agentResult);
          setMessages(msgResult);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAgents([]);
          setMessages([]);
        }
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => { cancelled = true; };
  }, [expandedRunId]);

  const handleToggleRun = useCallback((runId: string) => {
    setExpandedRunId((prev) => (prev === runId ? null : runId));
    setDetailTab('agents');
  }, []);

  // Compute timeline bounds for the expanded run
  const timelineBounds = useMemo(() => {
    if (agents.length === 0) return null;
    const starts = agents
      .map((a) => a.started_at)
      .filter(Boolean)
      .map((t) => new Date(t!).getTime())
      .filter((t) => !isNaN(t));
    const ends = agents
      .map((a) => a.completed_at ?? a.started_at)
      .filter(Boolean)
      .map((t) => new Date(t!).getTime())
      .filter((t) => !isNaN(t));
    if (starts.length === 0) return null;
    const min = Math.min(...starts);
    const max = Math.max(...ends, Date.now());
    return { min, max, span: Math.max(max - min, 1) };
  }, [agents]);

  if (loading) {
    return (
      <div className="swarm-history">
        <div className="swarm-history__loading">Loading run history...</div>
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <div className="swarm-history">
        <div className="swarm-history__empty">
          <div className="swarm-history__empty-icon">&#x1f4cb;</div>
          <div className="swarm-history__empty-title">No past runs</div>
          <div className="swarm-history__empty-desc">
            Completed swarm runs will appear here for review and replay.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="swarm-history">
      <div className="swarm-history__list">
        {runs.map((run) => {
          const isExpanded = expandedRunId === run.id;
          return (
            <div key={run.id} className={`swarm-history__item ${isExpanded ? 'swarm-history__item--expanded' : ''}`}>
              {/* Run summary row */}
              <div
                className="swarm-history__row"
                onClick={() => handleToggleRun(run.id)}
              >
                <span className={`swarm-history__status swarm-history__status--${run.status.toLowerCase()}`}>
                  {run.status}
                </span>
                <span className="swarm-history__id" title={run.id}>
                  {run.id.slice(0, 8)}
                </span>
                <span className="swarm-history__prompt" title={run.prompt ?? undefined}>
                  {run.prompt
                    ? run.prompt.length > 60
                      ? run.prompt.slice(0, 60) + '...'
                      : run.prompt
                    : '(no prompt)'}
                </span>
                <span className="swarm-history__date">
                  {formatDate(run.started_at)}
                </span>
                <span className={`swarm-history__chevron ${isExpanded ? 'swarm-history__chevron--open' : ''}`}>
                  &#9662;
                </span>
              </div>

              {/* Expanded detail */}
              {isExpanded && (
                <div className="swarm-history__detail">
                  {/* Full prompt */}
                  {run.prompt && (
                    <div className="swarm-history__full-prompt">
                      <div className="swarm-history__detail-label">Prompt</div>
                      <p className="swarm-history__detail-text">{run.prompt}</p>
                    </div>
                  )}

                  {/* Detail tabs */}
                  <div className="swarm-history__tabs">
                    <button
                      className={`swarm-history__tab ${detailTab === 'agents' ? 'swarm-history__tab--active' : ''}`}
                      onClick={() => setDetailTab('agents')}
                    >
                      Agents
                      {agents.length > 0 && <span className="swarm-history__tab-count">{agents.length}</span>}
                    </button>
                    <button
                      className={`swarm-history__tab ${detailTab === 'messages' ? 'swarm-history__tab--active' : ''}`}
                      onClick={() => setDetailTab('messages')}
                    >
                      Messages
                      {messages.length > 0 && <span className="swarm-history__tab-count">{messages.length}</span>}
                    </button>
                    <button
                      className={`swarm-history__tab ${detailTab === 'timeline' ? 'swarm-history__tab--active' : ''}`}
                      onClick={() => setDetailTab('timeline')}
                    >
                      Timeline
                    </button>
                  </div>

                  {detailLoading && (
                    <div className="swarm-history__detail-loading">Loading details...</div>
                  )}

                  {/* Agents tab */}
                  {!detailLoading && detailTab === 'agents' && (
                    <div className="swarm-history__agents">
                      {agents.length === 0 && (
                        <div className="swarm-history__detail-empty">No agents recorded for this run.</div>
                      )}
                      {agents.map((agent) => (
                        <div key={agent.id} className={`swarm-history__agent swarm-history__agent--${agent.status}`}>
                          <div className="swarm-history__agent-header">
                            <span className={`swarm-history__agent-indicator swarm-history__agent-indicator--${agent.status}`} />
                            <span className="swarm-history__agent-role">{agent.role}</span>
                            <span className={`swarm-history__agent-status swarm-history__agent-status--${agent.status}`}>
                              {agent.status}
                            </span>
                            {agent.exit_code !== null && (
                              <span className={`swarm-history__agent-exit ${agent.exit_code === 0 ? 'swarm-history__agent-exit--ok' : 'swarm-history__agent-exit--err'}`}>
                                exit {agent.exit_code}
                              </span>
                            )}
                          </div>
                          <div className="swarm-history__agent-cmd" title={agent.command}>
                            {agent.command}
                          </div>
                          <div className="swarm-history__agent-time">
                            {formatDate(agent.started_at)}
                            {agent.completed_at && (
                              <> &mdash; {formatDate(agent.completed_at)} ({formatDuration(durationMs(agent.started_at, agent.completed_at))})</>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Messages tab */}
                  {!detailLoading && detailTab === 'messages' && (
                    <div className="swarm-history__messages">
                      {messages.length === 0 && (
                        <div className="swarm-history__detail-empty">No messages exchanged during this run.</div>
                      )}
                      {messages.map((msg) => (
                        <div key={msg.id} className={`swarm-history__msg ${msg.sender_role === 'User' ? 'swarm-history__msg--user' : 'swarm-history__msg--agent'}`}>
                          <div className="swarm-history__msg-header">
                            <span className="swarm-history__msg-role">{msg.sender_role}</span>
                            <span className="swarm-history__msg-time">{formatDate(msg.created_at)}</span>
                          </div>
                          <div className="swarm-history__msg-content">{msg.content}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Timeline tab */}
                  {!detailLoading && detailTab === 'timeline' && (
                    <div className="swarm-history__timeline">
                      {agents.length === 0 && (
                        <div className="swarm-history__detail-empty">No agents to show in the timeline.</div>
                      )}
                      {agents.length > 0 && timelineBounds && (
                        <div className="swarm-history__timeline-chart">
                          {agents.map((agent) => {
                            const start = agent.started_at ? new Date(agent.started_at).getTime() : timelineBounds.min;
                            const end = agent.completed_at ? new Date(agent.completed_at).getTime() : (agent.status === 'running' ? Date.now() : start);
                            const leftPct = ((start - timelineBounds.min) / timelineBounds.span) * 100;
                            const widthPct = Math.max(((end - start) / timelineBounds.span) * 100, 1);
                            return (
                              <div key={agent.id} className="swarm-history__timeline-row">
                                <div className="swarm-history__timeline-label">
                                  <span className={`swarm-history__agent-indicator swarm-history__agent-indicator--${agent.status}`} />
                                  <span>{agent.role}</span>
                                </div>
                                <div className="swarm-history__timeline-track">
                                  <div
                                    className={`swarm-history__timeline-bar swarm-history__timeline-bar--${agent.status}`}
                                    style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                                    title={`${formatDuration(durationMs(agent.started_at, agent.completed_at))}`}
                                  />
                                </div>
                                <span className="swarm-history__timeline-dur">
                                  {formatDuration(durationMs(agent.started_at, agent.completed_at))}
                                </span>
                              </div>
                            );
                          })}
                          <div className="swarm-history__timeline-axis">
                            <span>{formatDate(new Date(timelineBounds.min).toISOString())}</span>
                            <span>{formatDate(new Date(timelineBounds.max).toISOString())}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
