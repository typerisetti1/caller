import React, {useMemo, useState} from 'react';
import {
  ChevronDown,
  ChevronUp,
  Download,
  PhoneCall,
  RotateCcw,
} from 'lucide-react';
import type {CallOutcome, Contact} from '../types';
import {
  exportCallReportCsv,
  formatDuration,
  formatTimestamp,
  OUTCOME_META,
} from '../utils/contacts';

interface HistoryViewProps {
  contacts: Contact[];
  campaignTitle: string;
  onCallAgain: (contactId: string) => void;
  onResetOutcome: (contactId: string) => void;
}

export const HistoryView: React.FC<HistoryViewProps> = ({
  contacts,
  campaignTitle,
  onCallAgain,
  onResetOutcome,
}) => {
  const [filter, setFilter] = useState<'all' | CallOutcome>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const calledContacts = useMemo(() => {
    return contacts
      .filter((c) => c.outcome !== 'pending' || Boolean(c.calledAt))
      .sort((a, b) => {
        const ta = a.calledAt ? new Date(a.calledAt).getTime() : 0;
        const tb = b.calledAt ? new Date(b.calledAt).getTime() : 0;
        return tb - ta;
      });
  }, [contacts]);

  const filtered = useMemo(() => {
    if (filter === 'all') return calledContacts;
    return calledContacts.filter((c) => c.outcome === filter);
  }, [calledContacts, filter]);

  const metrics = useMemo(() => {
    const answered = calledContacts.filter((c) => c.outcome === 'completed').length;
    const callbacks = calledContacts.filter((c) => c.outcome === 'callback').length;
    const totalSeconds = calledContacts.reduce((acc, c) => acc + (c.durationSec || 0), 0);
    return {
      totalCalled: calledContacts.length,
      answered,
      callbacks,
      totalSeconds,
    };
  }, [calledContacts]);

  return (
    <section aria-label="Call history and report export" className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Call History &amp; Outcomes</h2>
          <p className="mt-1 text-sm text-slate-500">
            Review logged outcomes, AI summaries, transcripts, and export your report.
          </p>
        </div>

        <button
          type="button"
          disabled={contacts.length === 0}
          onClick={() => exportCallReportCsv(contacts, campaignTitle)}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:opacity-40 whitespace-nowrap shrink-0"
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          <span>Export CSV Report</span>
        </button>
      </div>

      {/* Metrics row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 rounded-2xl border border-slate-200 bg-white">
        <div className="px-4 py-4">
          <div className="text-xs text-slate-500">Calls Logged</div>
          <div className="mt-1 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {metrics.totalCalled}
          </div>
        </div>
        <div className="px-4 py-4">
          <div className="text-xs text-slate-500">Answered</div>
          <div className="mt-1 font-mono text-2xl font-semibold text-[#0D7A5F] tabular-nums">
            {metrics.answered}
          </div>
        </div>
        <div className="px-4 py-4">
          <div className="text-xs text-slate-500">Callbacks Needed</div>
          <div className="mt-1 font-mono text-2xl font-semibold text-amber-700 tabular-nums">
            {metrics.callbacks}
          </div>
        </div>
        <div className="px-4 py-4">
          <div className="text-xs text-slate-500">Total Talk Time</div>
          <div className="mt-1 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {formatDuration(metrics.totalSeconds)}
          </div>
        </div>
      </div>

      {/* Outcome filter controls */}
      <div className="flex items-center gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1">
        {(
          [
            {id: 'all', label: 'All Logged'},
            {id: 'completed', label: 'Answered'},
            {id: 'callback', label: 'Callback'},
            {id: 'no_answer', label: 'No Answer'},
            {id: 'voicemail', label: 'Voicemail'},
            {id: 'wrong_number', label: 'Wrong Number'},
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setFilter(item.id)}
            className={`min-h-[38px] rounded-lg px-3 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              filter === item.id
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Logged calls list */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white px-6 py-12 text-center">
          <p className="text-sm font-semibold text-slate-900">No logged calls yet</p>
          <p className="mt-1 text-sm text-slate-500">
            Calls you dial and wrap up in the Dialer will appear here with timestamps, notes, and
            transcripts.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100">
          {filtered.map((contact) => {
            const meta = OUTCOME_META[contact.outcome];
            const isExpanded = expandedId === contact.id;
            const hasTranscript = (contact.transcript?.length || 0) > 0;

            return (
              <div key={contact.id} className="px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <h3 className="text-base font-semibold text-slate-900">{contact.name}</h3>
                      <span aria-hidden="true" className="text-slate-300">
                        ·
                      </span>
                      <span className={`text-xs font-semibold ${meta.textClass}`}>
                        {meta.label}
                      </span>
                    </div>

                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
                      <span className="font-mono text-slate-700 tabular-nums">{contact.phone}</span>
                      {contact.company && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{contact.company}</span>
                        </>
                      )}
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">{formatTimestamp(contact.calledAt)}</span>
                      {typeof contact.durationSec === 'number' && contact.durationSec > 0 && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">
                            {formatDuration(contact.durationSec)}
                          </span>
                        </>
                      )}
                    </div>

                    {contact.aiSummary && (
                      <p className="mt-2.5 text-sm leading-relaxed text-slate-700">
                        {contact.aiSummary}
                      </p>
                    )}

                    {contact.notes && (
                      <p className="mt-1.5 text-xs text-slate-500">Notes: {contact.notes}</p>
                    )}

                    {contact.followUpAction && (
                      <p className="mt-1 text-xs font-medium text-[#0D7A5F]">
                        Next step: {contact.followUpAction}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => onCallAgain(contact.id)}
                      className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-medium text-slate-800 hover:bg-slate-50 whitespace-nowrap"
                    >
                      <PhoneCall className="h-3.5 w-3.5 text-[#0D7A5F]" aria-hidden="true" />
                      <span>Call Again</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onResetOutcome(contact.id)}
                      title="Move back to Pending"
                      aria-label={`Move ${contact.name} back to Pending`}
                      className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                    >
                      <RotateCcw className="h-4 w-4" />
                    </button>
                    {hasTranscript && (
                      <button
                        type="button"
                        onClick={() => setExpandedId(isExpanded ? null : contact.id)}
                        aria-expanded={isExpanded}
                        className="inline-flex min-h-[44px] items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                      >
                        <span>Transcript</span>
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </button>
                    )}
                  </div>
                </div>

                {isExpanded && hasTranscript && (
                  <div className="mt-4 space-y-2.5 border-t border-slate-100 pt-3.5">
                    {contact.transcript?.map((turn) => (
                      <div key={turn.id} className="text-xs leading-relaxed">
                        <span
                          className={`font-semibold ${
                            turn.speaker === 'ai' ? 'text-[#0D7A5F]' : 'text-slate-900'
                          }`}
                        >
                          {turn.speaker === 'ai' ? 'AI Assistant' : contact.name}
                        </span>
                        <span className="ml-2 font-mono text-[11px] text-slate-400 tabular-nums">
                          {turn.timestamp}
                        </span>
                        <p className="mt-0.5 text-slate-700">{turn.text}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
