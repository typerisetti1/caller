import React, {useMemo, useState} from 'react';
import {
  ArrowUpToLine,
  Phone,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  UserPlus,
} from 'lucide-react';
import type {Contact} from '../types';
import {getInitials, OUTCOME_META} from '../utils/contacts';

type QueueFilter = 'all' | 'pending' | 'completed' | 'followup';

interface QueueViewProps {
  contacts: Contact[];
  activeContactId: string | null;
  onSelectContact: (contactId: string) => void;
  onMoveToTop: (contactId: string) => void;
  onDeleteContact: (contactId: string) => void;
  onOpenImport: () => void;
  onStartCampaign: () => void;
  onClearAll: () => void;
  onLoadSample: () => void;
}

export const QueueView: React.FC<QueueViewProps> = ({
  contacts,
  activeContactId,
  onSelectContact,
  onMoveToTop,
  onDeleteContact,
  onOpenImport,
  onStartCampaign,
  onClearAll,
  onLoadSample,
}) => {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<QueueFilter>('all');
  const [confirmClear, setConfirmClear] = useState(false);

  const stats = useMemo(() => {
    const total = contacts.length;
    const pending = contacts.filter((c) => c.outcome === 'pending').length;
    const completed = contacts.filter((c) => c.outcome === 'completed').length;
    const followup = contacts.filter(
      (c) => c.outcome === 'callback' || c.outcome === 'no_answer' || c.outcome === 'voicemail'
    ).length;
    return {total, pending, completed, followup};
  }, [contacts]);

  const filteredContacts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return contacts.filter((c) => {
      if (filter === 'pending' && c.outcome !== 'pending') return false;
      if (filter === 'completed' && c.outcome !== 'completed') return false;
      if (
        filter === 'followup' &&
        c.outcome !== 'callback' &&
        c.outcome !== 'no_answer' &&
        c.outcome !== 'voicemail'
      ) {
        return false;
      }
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q) ||
        c.company.toLowerCase().includes(q) ||
        c.details.toLowerCase().includes(q)
      );
    });
  }, [contacts, filter, search]);

  return (
    <section aria-label="Calling queue" className="space-y-5">
      {/* Summary metrics strip */}
      <div className="grid grid-cols-4 divide-x divide-slate-200 rounded-2xl border border-slate-200 bg-white">
        <div className="px-3 py-3.5 sm:px-4">
          <div className="text-xs text-slate-500">Total</div>
          <div className="mt-1 font-mono text-xl sm:text-2xl font-semibold text-slate-900 tabular-nums">
            {stats.total}
          </div>
        </div>
        <div className="px-3 py-3.5 sm:px-4">
          <div className="text-xs text-slate-500">Pending</div>
          <div className="mt-1 font-mono text-xl sm:text-2xl font-semibold text-[#0D7A5F] tabular-nums">
            {stats.pending}
          </div>
        </div>
        <div className="px-3 py-3.5 sm:px-4">
          <div className="text-xs text-slate-500">Answered</div>
          <div className="mt-1 font-mono text-xl sm:text-2xl font-semibold text-slate-900 tabular-nums">
            {stats.completed}
          </div>
        </div>
        <div className="px-3 py-3.5 sm:px-4">
          <div className="text-xs text-slate-500">Retry</div>
          <div className="mt-1 font-mono text-xl sm:text-2xl font-semibold text-amber-700 tabular-nums">
            {stats.followup}
          </div>
        </div>
      </div>

      {/* Primary mobile/queue action bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          disabled={contacts.length === 0}
          onClick={onStartCampaign}
          className="flex-1 sm:flex-none inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-[#0D7A5F] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#095E49] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 whitespace-nowrap shrink-0"
        >
          <Phone className="h-4 w-4" aria-hidden="true" />
          <span>{stats.pending > 0 ? `Start Calling (${stats.pending} left)` : 'Open Dialer'}</span>
        </button>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenImport}
            className="inline-flex min-h-[48px] items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-800 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0"
          >
            <Plus className="h-4 w-4 text-[#0D7A5F]" aria-hidden="true" />
            <span>Import List</span>
          </button>

          {contacts.length > 0 && !confirmClear && (
            <button
              type="button"
              onClick={() => setConfirmClear(true)}
              aria-label="Clear calling list"
              className="inline-flex min-h-[48px] min-w-[44px] items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-slate-500 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-700"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {confirmClear && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          <span>Remove all {contacts.length} contacts from this list?</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setConfirmClear(false)}
              className="min-h-[36px] rounded-lg border border-red-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                onClearAll();
                setConfirmClear(false);
              }}
              className="min-h-[36px] rounded-lg bg-red-600 px-3 text-xs font-semibold text-white hover:bg-red-700"
            >
              Clear All
            </button>
          </div>
        </div>
      )}

      {/* Search & Interactive Filter Tabs */}
      <div className="space-y-3">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, phone, company, or details..."
            className="w-full min-h-[44px] rounded-xl border border-slate-200 bg-white pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#0D7A5F] focus:outline-none focus:ring-2 focus:ring-[#0D7A5F]/20"
          />
        </div>

        <div className="grid grid-cols-4 gap-1 rounded-xl bg-slate-100 p-1">
          {(
            [
              {id: 'all', label: `All (${stats.total})`},
              {id: 'pending', label: `Pending (${stats.pending})`},
              {id: 'followup', label: `Retry (${stats.followup})`},
              {id: 'completed', label: `Done (${stats.completed})`},
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id)}
              className={`min-h-[38px] rounded-lg px-2 text-xs font-medium transition-colors whitespace-nowrap truncate ${
                filter === tab.id
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Contact List */}
      {contacts.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white px-6 py-12 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
            <UserPlus className="h-6 w-6" aria-hidden="true" />
          </div>
          <h3 className="mt-4 text-base font-bold text-slate-900">Your calling list is empty</h3>
          <p className="mt-1.5 max-w-sm mx-auto text-sm text-slate-500">
            Import a CSV file, paste names and phone numbers, or add contacts individually to start
            calling.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={onOpenImport}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#0D7A5F] px-5 text-sm font-semibold text-white hover:bg-[#095E49]"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span>Add Contacts</span>
            </button>
            <button
              type="button"
              onClick={onLoadSample}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              <span>Load Sample List</span>
            </button>
          </div>
        </div>
      ) : filteredContacts.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white px-6 py-10 text-center">
          <p className="text-sm font-medium text-slate-700">No contacts match your current filter.</p>
          <button
            type="button"
            onClick={() => {
              setSearch('');
              setFilter('all');
            }}
            className="mt-3 min-h-[40px] rounded-lg px-4 text-sm font-medium text-[#0D7A5F] hover:bg-[#ECFDF5]"
          >
            Reset search &amp; filter
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100">
          {filteredContacts.map((contact, idx) => {
            const isSelected = contact.id === activeContactId;
            const outcomeInfo = OUTCOME_META[contact.outcome];

            return (
              <div
                key={contact.id}
                className={`group flex items-start gap-3 px-4 py-3.5 transition-colors ${
                  isSelected ? 'bg-[#ECFDF5]/60' : 'hover:bg-slate-50'
                }`}
              >
                {/* Main clickable row area */}
                <button
                  type="button"
                  onClick={() => onSelectContact(contact.id)}
                  className="flex min-w-0 flex-1 items-start gap-3 text-left focus-visible:outline-2 focus-visible:outline-[#0D7A5F] rounded-lg"
                >
                  <div
                    className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      isSelected
                        ? 'bg-[#0D7A5F] text-white'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {getInitials(contact.name)}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-semibold text-slate-900">
                        {contact.name}
                      </span>
                      <span
                        className={`shrink-0 text-xs font-medium ${outcomeInfo.textClass}`}
                      >
                        {outcomeInfo.shortLabel}
                      </span>
                    </div>

                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
                      <span className="font-mono text-slate-700 tabular-nums">{contact.phone}</span>
                      {contact.company && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="truncate">{contact.company}</span>
                        </>
                      )}
                    </div>

                    {contact.details && (
                      <p className="mt-1 line-clamp-1 text-xs text-slate-600">{contact.details}</p>
                    )}
                  </div>
                </button>

                {/* Row touch affordances */}
                <div className="flex shrink-0 items-center gap-1">
                  {idx > 0 && contact.outcome === 'pending' && (
                    <button
                      type="button"
                      onClick={() => onMoveToTop(contact.id)}
                      title="Move to top of queue"
                      aria-label={`Move ${contact.name} to top of queue`}
                      className="min-h-[44px] min-w-[40px] inline-flex items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                    >
                      <ArrowUpToLine className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onSelectContact(contact.id)}
                    title={`Dial ${contact.name}`}
                    aria-label={`Open dialer for ${contact.name}`}
                    className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-xl bg-[#ECFDF5] text-[#0D7A5F] hover:bg-[#0D7A5F] hover:text-white transition-colors"
                  >
                    <Phone className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteContact(contact.id)}
                    title={`Remove ${contact.name}`}
                    aria-label={`Remove ${contact.name}`}
                    className="min-h-[44px] min-w-[40px] inline-flex items-center justify-center rounded-xl text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
