import React, {useMemo, useRef, useState} from 'react';
import {FileSpreadsheet, Plus, Upload, X} from 'lucide-react';
import type {Contact, ParsedContactDraft} from '../types';
import {
  normalizePhoneForCompare,
  parseBulkTextContacts,
  parseCsvContacts,
} from '../utils/contacts';

type ImportMode = 'csv' | 'paste' | 'manual';

interface ImportContactsSheetProps {
  isOpen: boolean;
  onClose: () => void;
  existingContacts: Contact[];
  onImport: (newContacts: Array<Pick<Contact, 'name' | 'phone' | 'company' | 'details'>>) => void;
}

export const ImportContactsSheet: React.FC<ImportContactsSheetProps> = ({
  isOpen,
  onClose,
  existingContacts,
  onImport,
}) => {
  const [mode, setMode] = useState<ImportMode>('manual');
  const [skipDuplicates, setSkipDuplicates] = useState(true);

  // Manual form state
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [company, setCompany] = useState('');
  const [details, setDetails] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  // Bulk paste state
  const [pasteText, setPasteText] = useState('');

  // CSV upload state
  const [csvFileName, setCsvFileName] = useState<string | null>(null);
  const [csvRawText, setCsvRawText] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const parsedDrafts: ParsedContactDraft[] = useMemo(() => {
    if (mode === 'csv') return parseCsvContacts(csvRawText, existingContacts);
    if (mode === 'paste') return parseBulkTextContacts(pasteText, existingContacts);
    return [];
  }, [mode, csvRawText, pasteText, existingContacts]);

  const importableDrafts = useMemo(() => {
    return skipDuplicates ? parsedDrafts.filter((d) => !d.isDuplicate) : parsedDrafts;
  }, [parsedDrafts, skipDuplicates]);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      setCsvRawText(typeof reader.result === 'string' ? reader.result : '');
    };
    reader.readAsText(file);
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim();
    const cleanPhone = phone.trim();
    if (!cleanName) {
      setFormError('Enter the contact name.');
      return;
    }
    if (!cleanPhone || !/\d{4,}/.test(cleanPhone)) {
      setFormError('Enter a valid phone number with at least 4 digits.');
      return;
    }
    const existingSet = new Set(existingContacts.map((c) => normalizePhoneForCompare(c.phone)));
    if (skipDuplicates && existingSet.has(normalizePhoneForCompare(cleanPhone))) {
      setFormError('This phone number is already in your calling list.');
      return;
    }

    onImport([
      {
        name: cleanName,
        phone: cleanPhone,
        company: company.trim(),
        details: details.trim(),
      },
    ]);
    setName('');
    setPhone('');
    setCompany('');
    setDetails('');
    setFormError(null);
    onClose();
  };

  const handleBatchImport = () => {
    if (importableDrafts.length === 0) return;
    onImport(
      importableDrafts.map((d) => ({
        name: d.name,
        phone: d.phone,
        company: d.company,
        details: d.details,
      }))
    );
    setPasteText('');
    setCsvRawText('');
    setCsvFileName(null);
    onClose();
  };

  const duplicateCount = parsedDrafts.filter((d) => d.isDuplicate).length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/50 backdrop-blur-xs p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-contacts-title"
    >
      <div className="flex max-h-[90vh] w-full sm:max-w-2xl flex-col rounded-t-3xl sm:rounded-2xl bg-white border border-slate-200 shadow-xl overflow-hidden">
        {/* Grab handle on mobile */}
        <div className="pt-3 sm:hidden">
          <div className="mx-auto h-1.5 w-10 rounded-full bg-slate-300" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 sm:px-6 py-4">
          <div>
            <h2 id="import-contacts-title" className="text-lg font-bold text-slate-900">
              Add Calling List Contacts
            </h2>
            <p className="mt-0.5 text-sm text-slate-500">
              Add one person, paste multiple lines, or upload a CSV sheet.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Segmented mode switcher */}
        <div className="px-5 sm:px-6 pt-4">
          <div
            role="tablist"
            aria-label="Import method"
            className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1"
          >
            {(
              [
                {id: 'manual', label: 'Single Entry'},
                {id: 'paste', label: 'Bulk Paste'},
                {id: 'csv', label: 'Upload CSV'},
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={mode === tab.id}
                onClick={() => {
                  setMode(tab.id);
                  setFormError(null);
                }}
                className={`min-h-[40px] rounded-lg px-3 text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
                  mode === tab.id
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5">
          {mode === 'manual' && (
            <form id="manual-contact-form" onSubmit={handleManualSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="contact-name" className="block text-sm font-medium text-slate-700">
                    Full name
                  </label>
                  <input
                    id="contact-name"
                    type="text"
                    required
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      setFormError(null);
                    }}
                    placeholder="e.g. Ananya Rao"
                    className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#0D7A5F] focus:outline-none focus:ring-2 focus:ring-[#0D7A5F]/20"
                  />
                </div>
                <div>
                  <label htmlFor="contact-phone" className="block text-sm font-medium text-slate-700">
                    Phone number
                  </label>
                  <input
                    id="contact-phone"
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => {
                      setPhone(e.target.value);
                      setFormError(null);
                    }}
                    placeholder="e.g. +1 415 555 0198"
                    className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-3.5 font-mono text-sm text-slate-900 placeholder:font-sans placeholder:text-slate-400 focus:border-[#0D7A5F] focus:outline-none focus:ring-2 focus:ring-[#0D7A5F]/20"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="contact-company" className="block text-sm font-medium text-slate-700">
                  Company or label (optional)
                </label>
                <input
                  id="contact-company"
                  type="text"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="e.g. Bayside Clinic"
                  className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#0D7A5F] focus:outline-none focus:ring-2 focus:ring-[#0D7A5F]/20"
                />
              </div>

              <div>
                <label htmlFor="contact-details" className="block text-sm font-medium text-slate-700">
                  Calling details &amp; talking points
                </label>
                <textarea
                  id="contact-details"
                  rows={3}
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  placeholder="What should the AI mention when talking to them? e.g. Order #4812 ready for pickup today before 6 PM"
                  className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white p-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#0D7A5F] focus:outline-none focus:ring-2 focus:ring-[#0D7A5F]/20"
                />
              </div>

              {formError && (
                <p role="alert" className="text-sm font-medium text-red-700">
                  {formError}
                </p>
              )}
            </form>
          )}

          {mode === 'paste' && (
            <div className="space-y-4">
              <div>
                <label htmlFor="bulk-paste-area" className="block text-sm font-medium text-slate-700">
                  Paste one contact per line (Name, Phone, Details)
                </label>
                <p className="mt-0.5 text-xs text-slate-500">
                  Works with commas, pipes (`|`), or tab-separated rows copied from Excel or Google
                  Sheets.
                </p>
                <textarea
                  id="bulk-paste-area"
                  rows={6}
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  placeholder={
                    'Rohan Mehta, +91 98201 44510, Policy renewal due next Monday\nSarah Chen, +1 415 555 0164, Summit Builders, Confirm site visit at 2 PM'
                  }
                  className="mt-2 w-full rounded-xl border border-slate-300 bg-white p-3.5 font-mono text-xs leading-relaxed text-slate-900 placeholder:text-slate-400 focus:border-[#0D7A5F] focus:outline-none focus:ring-2 focus:ring-[#0D7A5F]/20"
                />
              </div>

              <DraftPreviewTable
                drafts={parsedDrafts}
                duplicateCount={duplicateCount}
                skipDuplicates={skipDuplicates}
                onToggleSkipDuplicates={setSkipDuplicates}
              />
            </div>
          )}

          {mode === 'csv' && (
            <div className="space-y-4">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv,.txt"
                onChange={handleFileChange}
                className="sr-only"
                id="csv-file-input"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex w-full flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-8 text-center transition-colors hover:border-[#0D7A5F] hover:bg-[#ECFDF5]/40"
              >
                <Upload className="h-7 w-7 text-[#0D7A5F]" aria-hidden="true" />
                <span className="mt-3 text-sm font-semibold text-slate-900">
                  {csvFileName ? csvFileName : 'Choose a CSV file from your device'}
                </span>
                <span className="mt-1 text-xs text-slate-500">
                  Auto-maps Name, Phone, Company, and Details/Notes columns
                </span>
              </button>

              {csvRawText && (
                <DraftPreviewTable
                  drafts={parsedDrafts}
                  duplicateCount={duplicateCount}
                  skipDuplicates={skipDuplicates}
                  onToggleSkipDuplicates={setSkipDuplicates}
                />
              )}

              {!csvRawText && (
                <div className="flex items-start gap-2.5 text-xs text-slate-500">
                  <FileSpreadsheet className="h-4 w-4 shrink-0 text-slate-400 mt-0.5" aria-hidden="true" />
                  <span>
                    Expected columns: <strong className="text-slate-700">Name, Phone, Company, Details</strong>{' '}
                    (header row optional).
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sticky footer actions */}
        <div className="flex items-center justify-end gap-3 border-t border-slate-200 bg-slate-50/70 px-5 sm:px-6 py-3.5 pb-safe">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
          >
            Cancel
          </button>

          {mode === 'manual' ? (
            <button
              type="submit"
              form="manual-contact-form"
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#0D7A5F] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#095E49] active:scale-[0.98] whitespace-nowrap shrink-0"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span>Add to Queue</span>
            </button>
          ) : (
            <button
              type="button"
              disabled={importableDrafts.length === 0}
              onClick={handleBatchImport}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#0D7A5F] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#095E49] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 whitespace-nowrap shrink-0"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span>
                Import {importableDrafts.length}{' '}
                {importableDrafts.length === 1 ? 'Contact' : 'Contacts'}
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

interface DraftPreviewTableProps {
  drafts: ParsedContactDraft[];
  duplicateCount: number;
  skipDuplicates: boolean;
  onToggleSkipDuplicates: (skip: boolean) => void;
}

const DraftPreviewTable: React.FC<DraftPreviewTableProps> = ({
  drafts,
  duplicateCount,
  skipDuplicates,
  onToggleSkipDuplicates,
}) => {
  if (drafts.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
        <span className="font-medium text-slate-800 tabular-nums">
          Detected {drafts.length} {drafts.length === 1 ? 'contact' : 'contacts'}
          {duplicateCount > 0 ? ` · ${duplicateCount} duplicate phone` : ''}
        </span>
        {duplicateCount > 0 && (
          <label className="inline-flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={skipDuplicates}
              onChange={(e) => onToggleSkipDuplicates(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 accent-[#0D7A5F]"
            />
            <span>Skip duplicates</span>
          </label>
        )}
      </div>

      <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100">
        {drafts.slice(0, 20).map((item, idx) => (
          <div
            key={`${item.phone}-${idx}`}
            className={`px-3.5 py-2.5 text-xs ${
              item.isDuplicate && skipDuplicates ? 'opacity-45 bg-slate-50' : 'bg-white'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-slate-900 truncate">{item.name}</span>
              <span className="font-mono text-slate-600 tabular-nums shrink-0">{item.phone}</span>
            </div>
            {(item.company || item.details || item.isDuplicate) && (
              <p className="mt-0.5 text-slate-500 truncate">
                {[item.company, item.details, item.isDuplicate ? 'Duplicate' : '']
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            )}
          </div>
        ))}
        {drafts.length > 20 && (
          <div className="px-3.5 py-2 text-xs text-slate-500 bg-slate-50 tabular-nums">
            + {drafts.length - 20} more contacts ready to import
          </div>
        )}
      </div>
    </div>
  );
};
