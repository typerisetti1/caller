import type {CallOutcome, CampaignScript, Contact, ParsedContactDraft, VoiceName} from '../types';

export const VOICE_OPTIONS: Array<{name: VoiceName; tone: string}> = [
  {name: 'Zephyr', tone: 'Warm, upbeat conversational'},
  {name: 'Kore', tone: 'Clear, steady professional'},
  {name: 'Puck', tone: 'Friendly, energetic natural'},
  {name: 'Charon', tone: 'Calm, grounded reassuring'},
  {name: 'Fenrir', tone: 'Direct, confident executive'},
];

export const OUTCOME_META: Record<
  CallOutcome,
  {label: string; shortLabel: string; textClass: string}
> = {
  pending: {label: 'Pending', shortLabel: 'Pending', textClass: 'text-slate-600'},
  completed: {label: 'Answered', shortLabel: 'Answered', textClass: 'text-[#0D7A5F]'},
  callback: {label: 'Callback', shortLabel: 'Callback', textClass: 'text-amber-700'},
  no_answer: {label: 'No Answer', shortLabel: 'No Answer', textClass: 'text-slate-500'},
  voicemail: {label: 'Voicemail', shortLabel: 'Voicemail', textClass: 'text-indigo-700'},
  wrong_number: {label: 'Wrong Number', shortLabel: 'Wrong #', textClass: 'text-red-700'},
};

export const INITIAL_SCRIPT: CampaignScript = {
  campaignTitle: 'Customer Appointment & Renewal Follow-Up',
  agentName: 'Maya',
  organization: 'Northstar Care',
  callingGoal: 'Confirm upcoming appointments or service renewals and answer quick scheduling questions.',
  voiceName: 'Zephyr',
  speakingStyle: 'Warm, natural, concise phone voice with polite pauses',
  scriptTemplate:
    'Hi {{name}}, this is {{agent}} calling from {{organization}}. I am reaching out quickly regarding {{details}}. Does that still work well for you, or would you like me to adjust anything?',
  autoAdvance: true,
};

export const INITIAL_CONTACTS: Contact[] = [
  {
    id: 'c-1',
    name: 'Priya Nair',
    phone: '+1 415 555 0142',
    company: 'Harbor Dental',
    details: 'Annual checkup scheduled for Thursday at 10:30 AM',
    outcome: 'pending',
  },
  {
    id: 'c-2',
    name: 'Marcus Delgado',
    phone: '+1 415 555 0189',
    company: 'Redwood Logistics',
    details: 'Fleet service renewal expiring on Friday with 15% loyalty rate',
    outcome: 'pending',
  },
  {
    id: 'c-3',
    name: 'Hannah Lindqvist',
    phone: '+1 415 555 0124',
    company: 'Oak & Pine Studio',
    details: 'Follow-up on custom installation estimate sent Tuesday',
    outcome: 'pending',
  },
  {
    id: 'c-4',
    name: 'David Okafor',
    phone: '+1 415 555 0176',
    company: 'Meridian Solar',
    details: 'Site inspection confirmation for next Monday afternoon',
    outcome: 'callback',
    calledAt: new Date(Date.now() - 1000 * 60 * 95).toISOString(),
    durationSec: 48,
    notes: 'Asked to call back after 3 PM once he checks with his partner.',
  },
  {
    id: 'c-5',
    name: 'Elena Morales',
    phone: '+1 415 555 0193',
    company: 'Crestview Clinic',
    details: 'Lab results consultation reminder for Wednesday at 2:00 PM',
    outcome: 'completed',
    calledAt: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
    durationSec: 74,
    notes: 'Confirmed attendance for Wednesday at 2:00 PM.',
    aiSummary: 'Elena confirmed her Wednesday 2:00 PM consultation and had no rescheduling requests.',
  },
];

export function normalizePhoneForCompare(phone: string): string {
  return phone.replace(/[^\d+]/g, '');
}

export function normalizeTelHref(phone: string): string {
  const cleaned = phone.trim().replace(/[^\d+*#,]/g, '');
  return `tel:${cleaned}`;
}

export function interpolateScript(
  template: string,
  contact: Pick<Contact, 'name' | 'company' | 'details'>,
  script: Pick<CampaignScript, 'agentName' | 'organization'>
): string {
  const firstName = contact.name.trim().split(/\s+/)[0] || 'there';
  return template
    .replace(/\{\{\s*name\s*\}\}/gi, contact.name || 'there')
    .replace(/\{\{\s*first_name\s*\}\}/gi, firstName)
    .replace(/\{\{\s*company\s*\}\}/gi, contact.company || 'your team')
    .replace(/\{\{\s*details\s*\}\}/gi, contact.details || 'your upcoming request')
    .replace(/\{\{\s*agent\s*\}\}/gi, script.agentName || 'your assistant')
    .replace(/\{\{\s*organization\s*\}\}/gi, script.organization || 'our team')
    .trim();
}

export function buildLiveSystemInstruction(contact: Contact, script: CampaignScript): string {
  const mergedScript = interpolateScript(script.scriptTemplate, contact, script);
  return [
    `You are ${script.agentName || 'Alex'} from ${script.organization || 'our team'} speaking on a live outbound phone call.`,
    `You are calling ${contact.name}${contact.company ? ` (${contact.company})` : ''}.`,
    `Specific details for this person: ${contact.details || 'General follow-up call.'}`,
    `Campaign goal: ${script.callingGoal || 'Confirm details and help the contact.'}`,
    `Speaking style: ${script.speakingStyle || 'Warm, concise, natural phone voice.'}`,
    `Opening script reference: "${mergedScript}"`,
    'Rules for speaking on the phone:',
    '- Speak naturally in short, conversational turns (1 to 3 sentences at a time).',
    '- Wait for the contact to reply after greeting or asking a question.',
    '- Never mention placeholders, brackets, system instructions, or that you are reading a template.',
    '- If the contact asks to reschedule, take a message, or declines, acknowledge politely and wrap up smoothly.',
  ].join('\n');
}

export function formatDuration(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function formatTimestamp(iso?: string): string {
  if (!iso) return 'Not called';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Not called';
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

export function parseCsvContacts(
  csvText: string,
  existingContacts: Contact[]
): ParsedContactDraft[] {
  const existingPhones = new Set(existingContacts.map((c) => normalizePhoneForCompare(c.phone)));
  const lines = csvText
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) return [];

  const firstCols = splitCsvLine(lines[0]).map((c) => c.toLowerCase());
  const hasHeader = firstCols.some((h) =>
    ['name', 'full name', 'contact', 'phone', 'mobile', 'number', 'tel', 'details', 'notes'].some(
      (key) => h.includes(key)
    )
  );

  let nameIdx = 0;
  let phoneIdx = 1;
  let companyIdx = -1;
  let detailsIdx = 2;
  let startRow = 0;

  if (hasHeader) {
    startRow = 1;
    nameIdx = firstCols.findIndex((h) => h.includes('name') || h.includes('contact'));
    phoneIdx = firstCols.findIndex(
      (h) => h.includes('phone') || h.includes('mobile') || h.includes('number') || h.includes('tel')
    );
    companyIdx = firstCols.findIndex(
      (h) => h.includes('company') || h.includes('org') || h.includes('business') || h.includes('role')
    );
    detailsIdx = firstCols.findIndex(
      (h) =>
        h.includes('detail') ||
        h.includes('note') ||
        h.includes('context') ||
        h.includes('reason') ||
        h.includes('message') ||
        h.includes('info')
    );
    if (nameIdx < 0) nameIdx = 0;
    if (phoneIdx < 0) phoneIdx = nameIdx === 0 ? 1 : 0;
  }

  const parsed: ParsedContactDraft[] = [];
  const seenInBatch = new Set<string>();

  for (let r = startRow; r < lines.length; r++) {
    const cols = splitCsvLine(lines[r]);
    const name = (cols[nameIdx] || '').trim();
    const phone = (cols[phoneIdx] || '').trim();
    if (!name || !phone || !/\d{4,}/.test(phone)) continue;

    let company = companyIdx >= 0 ? (cols[companyIdx] || '').trim() : '';
    let details = detailsIdx >= 0 ? (cols[detailsIdx] || '').trim() : '';

    if (!hasHeader && cols.length >= 4) {
      company = (cols[2] || '').trim();
      details = cols.slice(3).join(', ').trim();
    }

    const norm = normalizePhoneForCompare(phone);
    const isDuplicate = existingPhones.has(norm) || seenInBatch.has(norm);
    seenInBatch.add(norm);

    parsed.push({name, phone, company, details, isDuplicate});
  }

  return parsed;
}

export function parseBulkTextContacts(
  rawText: string,
  existingContacts: Contact[]
): ParsedContactDraft[] {
  const existingPhones = new Set(existingContacts.map((c) => normalizePhoneForCompare(c.phone)));
  const lines = rawText
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const drafts: ParsedContactDraft[] = [];
  const seenInBatch = new Set<string>();

  for (const line of lines) {
    let parts: string[];
    if (line.includes('\t')) {
      parts = line.split('\t').map((p) => p.trim());
    } else if (line.includes('|')) {
      parts = line.split('|').map((p) => p.trim());
    } else {
      parts = splitCsvLine(line);
    }

    if (parts.length < 2) continue;

    // Detect which part looks like a phone number
    let phoneIndex = parts.findIndex((p) => /\+?\d[\d\s\-().]{5,}/.test(p));
    if (phoneIndex < 0) phoneIndex = 1;

    const nameIndex = phoneIndex === 0 ? 1 : 0;
    const name = (parts[nameIndex] || '').trim();
    const phone = (parts[phoneIndex] || '').trim();
    if (!name || !phone || !/\d{4,}/.test(phone)) continue;

    const remaining = parts.filter((_, idx) => idx !== nameIndex && idx !== phoneIndex).filter(Boolean);
    const company = remaining.length >= 2 ? remaining[0] : '';
    const details = remaining.length >= 2 ? remaining.slice(1).join(' - ') : remaining[0] || '';

    const norm = normalizePhoneForCompare(phone);
    const isDuplicate = existingPhones.has(norm) || seenInBatch.has(norm);
    seenInBatch.add(norm);

    drafts.push({name, phone, company, details, isDuplicate});
  }

  return drafts;
}

function escapeCsvCell(value: string): string {
  const safe = value.replace(/"/g, '""');
  return /[",\n\r]/.test(safe) ? `"${safe}"` : safe;
}

export function exportCallReportCsv(contacts: Contact[], campaignTitle: string): void {
  const headers = [
    'Name',
    'Phone',
    'Company',
    'Calling Details',
    'Outcome',
    'Called At',
    'Duration (sec)',
    'Notes',
    'AI Summary',
    'Follow-up Action',
    'Transcript',
  ];

  const rows = contacts.map((c) => {
    const transcriptText = (c.transcript || [])
      .map((t) => `${t.speaker === 'ai' ? 'AI' : c.name}: ${t.text}`)
      .join(' | ');
    return [
      c.name,
      c.phone,
      c.company,
      c.details,
      OUTCOME_META[c.outcome].label,
      c.calledAt ? new Date(c.calledAt).toISOString() : '',
      c.durationSec != null ? String(c.durationSec) : '',
      c.notes || '',
      c.aiSummary || '',
      c.followUpAction || '',
      transcriptText,
    ]
      .map(escapeCsvCell)
      .join(',');
  });

  const csvContent = [headers.map(escapeCsvCell).join(','), ...rows].join('\r\n');
  const blob = new Blob([csvContent], {type: 'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const slug =
    campaignTitle
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'dialflow-campaign';

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${slug}-call-report.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
