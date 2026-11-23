export type CallOutcome =
  | 'pending'
  | 'completed'
  | 'callback'
  | 'no_answer'
  | 'voicemail'
  | 'wrong_number';

export type VoiceName = 'Zephyr' | 'Kore' | 'Puck' | 'Charon' | 'Fenrir';

export type ActiveTab = 'queue' | 'dialer' | 'script' | 'history' | 'android';

export interface TranscriptTurn {
  id: string;
  speaker: 'ai' | 'contact';
  text: string;
  timestamp: string;
}

export interface Contact {
  id: string;
  name: string;
  phone: string;
  company: string;
  details: string;
  outcome: CallOutcome;
  calledAt?: string;
  durationSec?: number;
  notes?: string;
  aiSummary?: string;
  followUpAction?: string;
  transcript?: TranscriptTurn[];
}

export interface CampaignScript {
  campaignTitle: string;
  agentName: string;
  organization: string;
  callingGoal: string;
  voiceName: VoiceName;
  speakingStyle: string;
  scriptTemplate: string;
  autoAdvance: boolean;
}

export interface ParsedContactDraft {
  name: string;
  phone: string;
  company: string;
  details: string;
  isDuplicate: boolean;
}
