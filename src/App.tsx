/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, {useEffect, useMemo, useState} from 'react';
import {
  FileText,
  History,
  ListChecks,
  PhoneCall,
  Plus,
  Smartphone,
} from 'lucide-react';
import type {ActiveTab, CallOutcome, CampaignScript, Contact} from './types';
import {INITIAL_CONTACTS, INITIAL_SCRIPT} from './utils/contacts';
import {QueueView} from './components/QueueView';
import {ActiveDialerView} from './components/ActiveDialerView';
import {ScriptStudioView} from './components/ScriptStudioView';
import {HistoryView} from './components/HistoryView';
import {NativeAndroidView} from './components/NativeAndroidView';
import {ImportContactsSheet} from './components/ImportContactsSheet';
import {OfflineIndicator, PWAInstallButton} from './components/PWAInstallButton';

const CONTACTS_STORAGE_KEY = 'dialflow_contacts_v1';
const SCRIPT_STORAGE_KEY = 'dialflow_script_v1';

function loadStoredContacts(): Contact[] {
  try {
    const raw = window.localStorage.getItem(CONTACTS_STORAGE_KEY);
    if (!raw) return INITIAL_CONTACTS;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : INITIAL_CONTACTS;
  } catch {
    return INITIAL_CONTACTS;
  }
}

function loadStoredScript(): CampaignScript {
  try {
    const raw = window.localStorage.getItem(SCRIPT_STORAGE_KEY);
    if (!raw) return INITIAL_SCRIPT;
    const parsed = JSON.parse(raw);
    return {...INITIAL_SCRIPT, ...parsed};
  } catch {
    return INITIAL_SCRIPT;
  }
}

export default function App() {
  const [contacts, setContacts] = useState<Contact[]>(loadStoredContacts);
  const [script, setScript] = useState<CampaignScript>(loadStoredScript);
  const [activeTab, setActiveTab] = useState<ActiveTab>('queue');
  const [activeContactId, setActiveContactId] = useState<string | null>(() => {
    const initial = loadStoredContacts();
    const firstPending = initial.find((c) => c.outcome === 'pending');
    return firstPending?.id || initial[0]?.id || null;
  });
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    try {
      window.localStorage.setItem(CONTACTS_STORAGE_KEY, JSON.stringify(contacts));
    } catch {
      // Storage quota full or unavailable
    }
  }, [contacts]);

  useEffect(() => {
    try {
      window.localStorage.setItem(SCRIPT_STORAGE_KEY, JSON.stringify(script));
    } catch {
      // Storage quota full or unavailable
    }
  }, [script]);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = window.setTimeout(() => setToastMessage(null), 2800);
    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
  };

  const activeContact = useMemo(() => {
    if (!activeContactId) return contacts[0] || null;
    return contacts.find((c) => c.id === activeContactId) || contacts[0] || null;
  }, [contacts, activeContactId]);

  const pendingCount = useMemo(
    () => contacts.filter((c) => c.outcome === 'pending').length,
    [contacts]
  );

  const handleImportContacts = (
    drafts: Array<Pick<Contact, 'name' | 'phone' | 'company' | 'details'>>
  ) => {
    const now = Date.now();
    const created: Contact[] = drafts.map((d, idx) => ({
      id: `c-${now}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
      name: d.name,
      phone: d.phone,
      company: d.company,
      details: d.details,
      outcome: 'pending',
    }));

    setContacts((prev) => [...created, ...prev]);
    if (!activeContactId && created[0]) {
      setActiveContactId(created[0].id);
    }
    showToast(`Added ${created.length} ${created.length === 1 ? 'contact' : 'contacts'} to queue`);
  };

  const handleSelectContact = (contactId: string) => {
    setActiveContactId(contactId);
    setActiveTab('dialer');
  };

  const handleStartCampaign = () => {
    const nextPending = contacts.find((c) => c.outcome === 'pending') || contacts[0];
    if (nextPending) {
      setActiveContactId(nextPending.id);
      setActiveTab('dialer');
    }
  };

  const handleMoveToTop = (contactId: string) => {
    setContacts((prev) => {
      const target = prev.find((c) => c.id === contactId);
      if (!target) return prev;
      return [target, ...prev.filter((c) => c.id !== contactId)];
    });
    showToast('Moved contact to top of queue');
  };

  const handleDeleteContact = (contactId: string) => {
    setContacts((prev) => {
      const remaining = prev.filter((c) => c.id !== contactId);
      if (activeContactId === contactId) {
        setActiveContactId(remaining[0]?.id || null);
      }
      return remaining;
    });
  };

  const handleClearAll = () => {
    setContacts([]);
    setActiveContactId(null);
    showToast('Calling list cleared');
  };

  const handleLoadSample = () => {
    setContacts(INITIAL_CONTACTS);
    setActiveContactId(INITIAL_CONTACTS[0].id);
    showToast('Loaded sample calling list');
  };

  const handleSaveCallResult = (
    contactId: string,
    payload: {
      outcome: CallOutcome;
      durationSec: number;
      notes: string;
      aiSummary?: string;
      followUpAction?: string;
      transcript: Contact['transcript'];
    },
    advanceToNext: boolean
  ) => {
    const updatedContacts = contacts.map((c) =>
      c.id === contactId
        ? {
            ...c,
            outcome: payload.outcome,
            calledAt: new Date().toISOString(),
            durationSec: payload.durationSec,
            notes: payload.notes,
            aiSummary: payload.aiSummary,
            followUpAction: payload.followUpAction,
            transcript: payload.transcript,
          }
        : c
    );
    setContacts(updatedContacts);

    if (advanceToNext) {
      const currentIdx = updatedContacts.findIndex((c) => c.id === contactId);
      const nextAfter = updatedContacts
        .slice(currentIdx + 1)
        .find((c) => c.outcome === 'pending');
      const anyPending = nextAfter || updatedContacts.find((c) => c.outcome === 'pending');
      if (anyPending) {
        setActiveContactId(anyPending.id);
        showToast(`Saved outcome · Next: ${anyPending.name}`);
        return;
      }
      showToast('Saved outcome · All pending contacts reached');
      return;
    }

    showToast('Call outcome saved');
  };

  const handleResetOutcome = (contactId: string) => {
    setContacts((prev) =>
      prev.map((c) => (c.id === contactId ? {...c, outcome: 'pending'} : c))
    );
    showToast('Moved contact back to Pending');
  };

  const desktopNavItems: Array<{id: ActiveTab; label: string}> = [
    {id: 'queue', label: 'Queue'},
    {id: 'dialer', label: 'Dialer'},
    {id: 'script', label: 'Script'},
    {id: 'history', label: 'History'},
    {id: 'android', label: 'Android APK'},
  ];

  const mobileNavItems: Array<{
    id: ActiveTab;
    label: string;
    icon: React.ComponentType<{className?: string}>;
  }> = [
    {id: 'queue', label: 'Queue', icon: ListChecks},
    {id: 'dialer', label: 'Dialer', icon: PhoneCall},
    {id: 'script', label: 'Script', icon: FileText},
    {id: 'history', label: 'History', icon: History},
    {id: 'android', label: 'Android', icon: Smartphone},
  ];

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] flex flex-col">
      {/* Desktop Top Bar (Strict 3-Zone Contract) & Compact Mobile App Bar */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex h-[52px] lg:h-16 max-w-7xl items-center justify-between gap-4 lg:gap-8 px-4 sm:px-6 lg:px-8">
          {/* Zone 1: Single-line Brand Wordmark */}
          <button
            type="button"
            onClick={() => setActiveTab('queue')}
            className="font-display text-lg font-extrabold tracking-tight text-slate-900 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-[#0D7A5F] rounded"
          >
            DialFlow
          </button>

          {/* Zone 2: Desktop Single-Line Navigation Links */}
          <nav
            aria-label="Primary navigation"
            className="hidden lg:flex items-center gap-7 text-sm font-medium"
          >
            {desktopNavItems.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`relative py-1 transition-colors whitespace-nowrap shrink-0 ${
                    isActive
                      ? 'text-[#0D7A5F] font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {item.label}
                  {isActive && (
                    <span className="absolute inset-x-0 -bottom-[21px] h-0.5 bg-[#0D7A5F]" />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Single Primary Action */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setIsImportOpen(true)}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-[#0D7A5F] px-3.5 sm:px-4 text-xs sm:text-sm font-semibold text-white transition-colors hover:bg-[#095E49] active:scale-[0.98] whitespace-nowrap shrink-0"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span>Add Contacts</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 sm:px-6 lg:px-8 pt-5 sm:pt-7 pb-24 lg:pb-12">
        {/* Workspace Context Header + Install CTA (when eligible) */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 truncate">
              {script.campaignTitle || 'Calling Campaign'}
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-slate-500 tabular-nums">
              {contacts.length} {contacts.length === 1 ? 'contact' : 'contacts'} · {pendingCount}{' '}
              pending · Voice: {script.voiceName}
            </p>
          </div>
          <PWAInstallButton />
        </div>

        {/* Desktop Split Workstation (Queue + Active Dialer side-by-side) */}
        {(activeTab === 'queue' || activeTab === 'dialer') && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div
              className={`lg:col-span-5 ${
                activeTab === 'dialer' ? 'hidden lg:block' : 'block'
              }`}
            >
              <QueueView
                contacts={contacts}
                activeContactId={activeContact?.id || null}
                onSelectContact={handleSelectContact}
                onMoveToTop={handleMoveToTop}
                onDeleteContact={handleDeleteContact}
                onOpenImport={() => setIsImportOpen(true)}
                onStartCampaign={handleStartCampaign}
                onClearAll={handleClearAll}
                onLoadSample={handleLoadSample}
              />
            </div>

            <div
              className={`lg:col-span-7 ${
                activeTab === 'queue' ? 'hidden lg:block' : 'block'
              }`}
            >
              <ActiveDialerView
                contacts={contacts}
                activeContact={activeContact}
                script={script}
                onSelectContact={(id) => setActiveContactId(id)}
                onSaveCallResult={handleSaveCallResult}
                onOpenImport={() => setIsImportOpen(true)}
              />
            </div>
          </div>
        )}

        {activeTab === 'script' && (
          <ScriptStudioView
            script={script}
            previewContact={
              contacts.find((c) => c.outcome === 'pending') || activeContact
            }
            onUpdateScript={setScript}
          />
        )}

        {activeTab === 'history' && (
          <HistoryView
            contacts={contacts}
            campaignTitle={script.campaignTitle}
            onCallAgain={handleSelectContact}
            onResetOutcome={handleResetOutcome}
          />
        )}

        {activeTab === 'android' && (
          <NativeAndroidView
            contacts={contacts}
            script={script}
            onExportSuccess={showToast}
          />
        )}
      </main>

      {/* Mobile Fixed Bottom Thumb-Zone Navigation Bar (56px height -> total fixed chrome <= 15%) */}
      <nav
        aria-label="Mobile navigation"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur-md pb-safe"
      >
        <div className="grid h-14 grid-cols-5 items-center">
          {mobileNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`flex h-full min-h-[44px] flex-col items-center justify-center gap-0.5 transition-colors ${
                  isActive ? 'text-[#0D7A5F]' : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <Icon className="h-5 w-5" />
                <span className="text-[11px] font-medium tracking-tight leading-none">
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Add / Import Contacts Bottom Sheet */}
      <ImportContactsSheet
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        existingContacts={contacts}
        onImport={handleImportContacts}
      />

      {/* Offline Connectivity Banner */}
      <OfflineIndicator />

      {/* Action Confirmation Toast */}
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-20 lg:bottom-6 right-4 z-50 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-medium text-white shadow-lg"
        >
          {toastMessage}
        </div>
      )}
    </div>
  );
}
