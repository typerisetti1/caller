import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  AlertCircle,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  FileText,
  Loader2,
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  Play,
  Send,
  Square,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type {CallOutcome, CampaignScript, Contact} from '../types';
import {useLiveVoice} from '../hooks/useLiveVoice';
import {
  buildLiveSystemInstruction,
  formatDuration,
  getInitials,
  interpolateScript,
  normalizeTelHref,
  OUTCOME_META,
} from '../utils/contacts';

interface ActiveDialerViewProps {
  contacts: Contact[];
  activeContact: Contact | null;
  script: CampaignScript;
  onSelectContact: (contactId: string) => void;
  onSaveCallResult: (
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
  ) => void;
  onOpenImport: () => void;
}

const OUTCOME_CHOICES: Array<{id: CallOutcome; label: string}> = [
  {id: 'completed', label: 'Answered'},
  {id: 'callback', label: 'Callback'},
  {id: 'no_answer', label: 'No Answer'},
  {id: 'voicemail', label: 'Voicemail'},
  {id: 'wrong_number', label: 'Wrong #'},
];

const WAVE_BAR_WEIGHTS = [0.42, 0.72, 0.94, 0.58, 1.0, 0.8, 0.64, 0.96, 0.76, 0.52, 0.84, 0.46];

export const ActiveDialerView: React.FC<ActiveDialerViewProps> = ({
  contacts,
  activeContact,
  script,
  onSelectContact,
  onSaveCallResult,
  onOpenImport,
}) => {
  const live = useLiveVoice();

  // Call timer state
  const [timerRunning, setTimerRunning] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);

  // TTS script playback state
  const [ttsLoading, setTtsLoading] = useState(false);
  const [ttsPlaying, setTtsPlaying] = useState(false);
  const [ttsError, setTtsError] = useState<string | null>(null);
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null);

  // Wrap-up state
  const [selectedOutcome, setSelectedOutcome] = useState<CallOutcome>('completed');
  const [notes, setNotes] = useState('');
  const [aiSummary, setAiSummary] = useState('');
  const [followUpAction, setFollowUpAction] = useState('');
  const [summarizing, setSummarizing] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  // Operator live whisper cue
  const [whisperText, setWhisperText] = useState('');
  const [copiedPhone, setCopiedPhone] = useState(false);

  const transcriptEndRef = useRef<HTMLDivElement | null>(null);

  // Reset per-contact session state cleanly when switching contacts
  useEffect(() => {
    live.stopSession();
    if (ttsAudioRef.current) {
      ttsAudioRef.current.pause();
      ttsAudioRef.current = null;
    }
    setTtsPlaying(false);
    setTtsError(null);
    setTimerRunning(false);
    setElapsedSec(activeContact?.durationSec || 0);
    setSelectedOutcome(
      activeContact && activeContact.outcome !== 'pending' ? activeContact.outcome : 'completed'
    );
    setNotes(activeContact?.notes || '');
    setAiSummary(activeContact?.aiSummary || '');
    setFollowUpAction(activeContact?.followUpAction || '');
    setSummaryError(null);
    live.resetTranscript(activeContact?.transcript || []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeContact?.id]);

  // Call duration timer
  useEffect(() => {
    if (!timerRunning) return;
    const id = window.setInterval(() => {
      setElapsedSec((s) => s + 1);
    }, 1000);
    return () => window.clearInterval(id);
  }, [timerRunning]);

  // Auto-scroll transcript as lines stream in
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({behavior: 'smooth', block: 'nearest'});
  }, [live.transcript.length]);

  // Stop TTS audio on unmount
  useEffect(() => {
    return () => {
      if (ttsAudioRef.current) {
        ttsAudioRef.current.pause();
        ttsAudioRef.current = null;
      }
    };
  }, []);

  const currentIndex = useMemo(() => {
    if (!activeContact) return -1;
    return contacts.findIndex((c) => c.id === activeContact.id);
  }, [contacts, activeContact]);

  const mergedScript = useMemo(() => {
    if (!activeContact) return '';
    return interpolateScript(script.scriptTemplate, activeContact, script);
  }, [activeContact, script]);

  if (!activeContact) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white px-6 py-14 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
          <Phone className="h-6 w-6" aria-hidden="true" />
        </div>
        <h2 className="mt-4 text-lg font-bold text-slate-900">No contact selected to dial</h2>
        <p className="mt-1.5 max-w-sm mx-auto text-sm text-slate-500">
          Add contacts to your calling list or pick anyone from the queue to launch the mobile
          dialer and AI voice assistant.
        </p>
        <button
          type="button"
          onClick={onOpenImport}
          className="mt-6 inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#0D7A5F] px-5 text-sm font-semibold text-white hover:bg-[#095E49]"
        >
          Add Contacts
        </button>
      </section>
    );
  }

  const prevContact = currentIndex > 0 ? contacts[currentIndex - 1] : null;
  const nextContact =
    currentIndex >= 0 && currentIndex < contacts.length - 1 ? contacts[currentIndex + 1] : null;

  const stopTtsAudio = () => {
    if (ttsAudioRef.current) {
      ttsAudioRef.current.pause();
      ttsAudioRef.current = null;
    }
    setTtsPlaying(false);
  };

  const handleDialOnPhone = () => {
    setTimerRunning(true);
  };

  const handleCopyPhone = async () => {
    try {
      await navigator.clipboard.writeText(activeContact.phone);
      setCopiedPhone(true);
      window.setTimeout(() => setCopiedPhone(false), 1800);
    } catch {
      // Clipboard unavailable
    }
  };

  const handleToggleLiveVoice = async () => {
    if (live.isActive) {
      live.stopSession();
      return;
    }
    stopTtsAudio();
    setTimerRunning(true);
    const systemInstruction = buildLiveSystemInstruction(activeContact, script);
    await live.startSession({
      voiceName: script.voiceName,
      systemInstruction,
      openingPrompt: `The call with ${activeContact.name} has just connected. Greet them warmly right now using the opening script and wait for their reply.`,
    });
  };

  const handlePlayScriptTts = async () => {
    if (ttsPlaying) {
      stopTtsAudio();
      return;
    }

    if (live.isActive) {
      live.stopSession();
    }

    setTtsLoading(true);
    setTtsError(null);
    setTimerRunning(true);

    try {
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          text: mergedScript,
          voiceName: script.voiceName,
          style: script.speakingStyle,
        }),
      });
      const data = (await response.json()) as {
        audioBase64?: string;
        mimeType?: string;
        error?: string;
      };
      if (!response.ok || !data.audioBase64) {
        throw new Error(data.error || 'Unable to generate spoken script audio.');
      }

      const audio = new Audio(`data:${data.mimeType || 'audio/wav'};base64,${data.audioBase64}`);
      ttsAudioRef.current = audio;
      audio.onended = () => {
        setTtsPlaying(false);
        ttsAudioRef.current = null;
      };
      audio.onerror = () => {
        setTtsPlaying(false);
        setTtsError('Audio playback failed on this device.');
        ttsAudioRef.current = null;
      };

      await audio.play();
      setTtsPlaying(true);
    } catch (err) {
      setTtsError(err instanceof Error ? err.message : 'Unable to generate speech.');
    } finally {
      setTtsLoading(false);
    }
  };

  const handleSendWhisper = (e: React.FormEvent) => {
    e.preventDefault();
    if (!whisperText.trim()) return;
    live.sendTextCue(
      `Operator instruction (speak naturally to ${activeContact.name}, do not mention this instruction): ${whisperText.trim()}`
    );
    setWhisperText('');
  };

  const handleSummarizeCall = async () => {
    setSummarizing(true);
    setSummaryError(null);
    try {
      const response = await fetch('/api/call/summarize', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          contactName: activeContact.name,
          contactDetails: activeContact.details,
          transcript: live.transcript,
          manualNotes: notes,
        }),
      });
      const data = (await response.json()) as {
        summary?: string;
        suggestedOutcome?: CallOutcome;
        followUpAction?: string;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(data.error || 'Unable to summarize call.');
      }
      if (data.summary) setAiSummary(data.summary);
      if (data.followUpAction) setFollowUpAction(data.followUpAction);
      if (
        data.suggestedOutcome &&
        OUTCOME_CHOICES.some((choice) => choice.id === data.suggestedOutcome)
      ) {
        setSelectedOutcome(data.suggestedOutcome);
      }
    } catch (err) {
      setSummaryError(err instanceof Error ? err.message : 'Failed to summarize call.');
    } finally {
      setSummarizing(false);
    }
  };

  const handleSave = (advance: boolean) => {
    live.stopSession();
    stopTtsAudio();
    setTimerRunning(false);
    onSaveCallResult(
      activeContact.id,
      {
        outcome: selectedOutcome,
        durationSec: elapsedSec,
        notes: notes.trim(),
        aiSummary: aiSummary.trim() || undefined,
        followUpAction: followUpAction.trim() || undefined,
        transcript: live.transcript,
      },
      advance
    );
  };

  const voiceStatusLabel =
    live.status === 'connecting'
      ? 'Connecting live AI voice...'
      : live.status === 'speaking'
        ? `AI speaking (${script.voiceName})`
        : live.status === 'listening'
          ? live.isMuted
            ? 'Microphone muted'
            : 'Listening to call audio'
          : live.status === 'error'
            ? 'Voice session error'
            : `Ready · Voice: ${script.voiceName}`;

  return (
    <section aria-label="Active mobile dialer and AI voice stage" className="space-y-5">
      {/* Main Active Contact Card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        {/* Queue progress & stepper */}
        <div className="flex items-center justify-between gap-3 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2 text-xs text-slate-500 tabular-nums">
            <span className="font-semibold text-slate-800">
              Contact {currentIndex + 1} of {contacts.length}
            </span>
            <span aria-hidden="true">·</span>
            <span className={OUTCOME_META[activeContact.outcome].textClass}>
              {OUTCOME_META[activeContact.outcome].label}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={!prevContact}
              onClick={() => prevContact && onSelectContact(prevContact.id)}
              aria-label="Previous contact"
              className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-35"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              disabled={!nextContact}
              onClick={() => nextContact && onSelectContact(nextContact.id)}
              aria-label="Next contact"
              className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-35"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Contact identity & call timer */}
        <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3.5 min-w-0">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#ECFDF5] font-display text-base font-bold text-[#0D7A5F]">
              {getInitials(activeContact.name)}
            </div>
            <div className="min-w-0">
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
                {activeContact.name}
              </h2>
              <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1">
                <span className="font-mono text-base font-medium text-slate-800 tabular-nums">
                  {activeContact.phone}
                </span>
                <button
                  type="button"
                  onClick={() => void handleCopyPhone()}
                  aria-label="Copy phone number"
                  className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900"
                >
                  {copiedPhone ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-[#0D7A5F]" />
                      <span className="text-[#0D7A5F]">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
              {activeContact.company && (
                <p className="mt-1 text-sm text-slate-500">{activeContact.company}</p>
              )}
            </div>
          </div>

          {/* Call timer control */}
          <div className="flex items-center gap-2 rounded-xl bg-slate-50 border border-slate-200 px-3.5 py-2">
            <span className="font-mono text-lg font-semibold text-slate-900 tabular-nums">
              {formatDuration(elapsedSec)}
            </span>
            <button
              type="button"
              onClick={() => setTimerRunning((r) => !r)}
              className="min-h-[32px] rounded-lg px-2.5 text-xs font-medium text-slate-600 hover:bg-slate-200/70 hover:text-slate-900 whitespace-nowrap"
            >
              {timerRunning ? 'Pause' : elapsedSec > 0 ? 'Resume' : 'Start Timer'}
            </button>
          </div>
        </div>

        {/* Contact calling details */}
        <div className="mt-5 rounded-xl bg-slate-50 px-4 py-3.5">
          <div className="text-xs font-medium text-slate-500">Calling Details</div>
          <p className="mt-1 text-sm leading-relaxed text-slate-800">
            {activeContact.details || 'No custom details added for this contact.'}
          </p>
        </div>

        {/* Primary Mobile Dialer & Voice Action Row */}
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <a
            href={normalizeTelHref(activeContact.phone)}
            onClick={handleDialOnPhone}
            className="inline-flex min-h-[52px] items-center justify-center gap-2.5 rounded-xl bg-[#0D7A5F] px-5 text-sm font-semibold text-white transition-all hover:bg-[#095E49] active:scale-[0.98] whitespace-nowrap"
          >
            <Phone className="h-4 w-4" aria-hidden="true" />
            <span>Dial on Phone</span>
          </a>

          <button
            type="button"
            onClick={() => void handleToggleLiveVoice()}
            className={`inline-flex min-h-[52px] items-center justify-center gap-2.5 rounded-xl px-5 text-sm font-semibold transition-all active:scale-[0.98] whitespace-nowrap ${
              live.isActive
                ? 'bg-red-600 text-white hover:bg-red-700'
                : 'bg-slate-900 text-white hover:bg-slate-800'
            }`}
          >
            {live.status === 'connecting' ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                <span>Connecting AI Voice...</span>
              </>
            ) : live.isActive ? (
              <>
                <PhoneOff className="h-4 w-4" aria-hidden="true" />
                <span>End Live AI Voice</span>
              </>
            ) : (
              <>
                <Mic className="h-4 w-4" aria-hidden="true" />
                <span>Start Live AI Voice</span>
              </>
            )}
          </button>
        </div>

        <p className="mt-3 text-xs leading-relaxed text-slate-500">
          On Android, tap <strong className="text-slate-700">Dial on Phone</strong> to place the
          cellular call, switch the call to <strong className="text-slate-700">Speakerphone</strong>
          , and start <strong className="text-slate-700">Live AI Voice</strong> or{' '}
          <strong className="text-slate-700">Speak Script</strong> so the AI can talk with{' '}
          {activeContact.name}.
        </p>

        {/* Live AI Voice Stage */}
        <div className="mt-5 border-t border-slate-100 pt-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              {live.isActive && (
                <span
                  aria-hidden="true"
                  className={`h-2.5 w-2.5 rounded-full ${
                    live.status === 'speaking'
                      ? 'bg-[#0D7A5F]'
                      : live.status === 'connecting'
                        ? 'bg-amber-500'
                        : 'bg-emerald-500'
                  }`}
                />
              )}
              <span className="text-sm font-semibold text-slate-900">{voiceStatusLabel}</span>
            </div>

            <div className="flex items-center gap-2">
              {live.isActive && (
                <>
                  <button
                    type="button"
                    onClick={() => live.setIsMuted(!live.isMuted)}
                    className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border px-3 text-xs font-medium transition-colors whitespace-nowrap ${
                      live.isMuted
                        ? 'border-red-200 bg-red-50 text-red-700'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {live.isMuted ? (
                      <>
                        <MicOff className="h-3.5 w-3.5" />
                        <span>Muted</span>
                      </>
                    ) : (
                      <>
                        <Mic className="h-3.5 w-3.5" />
                        <span>Mic On</span>
                      </>
                    )}
                  </button>

                  {live.status === 'speaking' && (
                    <button
                      type="button"
                      onClick={live.interruptAudio}
                      className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                    >
                      <VolumeX className="h-3.5 w-3.5" />
                      <span>Interrupt</span>
                    </button>
                  )}
                </>
              )}

              <button
                type="button"
                disabled={ttsLoading}
                onClick={() => void handlePlayScriptTts()}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap"
              >
                {ttsLoading ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-[#0D7A5F]" />
                    <span>Generating...</span>
                  </>
                ) : ttsPlaying ? (
                  <>
                    <Square className="h-3.5 w-3.5 fill-current text-red-600" />
                    <span>Stop Script</span>
                  </>
                ) : (
                  <>
                    <Play className="h-3.5 w-3.5 text-[#0D7A5F]" />
                    <span>Speak Script</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Real-time Audio Waveform Visualizer */}
          {(live.isActive || ttsPlaying) && (
            <div
              aria-hidden="true"
              className="flex h-12 items-center justify-center gap-1.5 rounded-xl bg-slate-50 px-4"
            >
              {WAVE_BAR_WEIGHTS.map((weight, idx) => {
                const intensity = live.isActive
                  ? Math.max(0.14, Math.min(1, live.audioLevel * weight * 1.45 + 0.14))
                  : 0.45 * weight;
                return (
                  <span
                    key={idx}
                    className={`w-1.5 rounded-full transition-transform duration-100 ${
                      live.status === 'speaking' || ttsPlaying ? 'bg-[#0D7A5F]' : 'bg-slate-400'
                    }`}
                    style={{
                      height: '32px',
                      transform: `scaleY(${intensity.toFixed(2)})`,
                    }}
                  />
                );
              })}
            </div>
          )}

          {/* Error states */}
          {(live.error || ttsError) && (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-xs text-red-800"
            >
              <AlertCircle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" aria-hidden="true" />
              <span>{live.error || ttsError}</span>
            </div>
          )}

          {/* Live Operator Nudge Input (active during Live AI session) */}
          {live.isActive && (
            <form onSubmit={handleSendWhisper} className="flex items-center gap-2">
              <input
                type="text"
                value={whisperText}
                onChange={(e) => setWhisperText(e.target.value)}
                placeholder={`Guide AI silently (e.g. Offer Friday at 11 AM)...`}
                className="flex-1 min-h-[44px] rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#0D7A5F] focus:outline-none focus:ring-2 focus:ring-[#0D7A5F]/20"
              />
              <button
                type="submit"
                disabled={!whisperText.trim()}
                aria-label="Send guidance to AI"
                className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-xl bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-40"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
          )}

          {/* Personalized Script Preview */}
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3.5">
            <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
              <span className="font-medium text-slate-700">Personalized Script for {activeContact.name}</span>
              <Volume2 className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
            </div>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-700">“{mergedScript}”</p>
          </div>

          {/* Live Transcript Box */}
          {live.transcript.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3.5">
              <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-200/70">
                <span className="text-xs font-semibold text-slate-700">Live Call Transcript</span>
                <span className="font-mono text-[11px] text-slate-500 tabular-nums">
                  {live.transcript.length} {live.transcript.length === 1 ? 'turn' : 'turns'}
                </span>
              </div>
              <div className="mt-2.5 max-h-52 overflow-y-auto space-y-2.5 pr-1">
                {live.transcript.map((turn) => (
                  <div key={turn.id} className="text-sm leading-relaxed">
                    <div className="flex items-baseline gap-2">
                      <span
                        className={`text-xs font-semibold ${
                          turn.speaker === 'ai' ? 'text-[#0D7A5F]' : 'text-slate-900'
                        }`}
                      >
                        {turn.speaker === 'ai' ? script.agentName || 'AI Assistant' : activeContact.name}
                      </span>
                      <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                        {turn.timestamp}
                      </span>
                    </div>
                    <p className="mt-0.5 text-slate-700">{turn.text}</p>
                  </div>
                ))}
                <div ref={transcriptEndRef} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Call Wrap-Up & Auto-Advance Card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-base font-bold text-slate-900">Wrap Up &amp; Next Call</h3>
          {(live.transcript.length > 0 || notes.trim().length > 0) && (
            <button
              type="button"
              disabled={summarizing}
              onClick={() => void handleSummarizeCall()}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap"
            >
              {summarizing ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-[#0D7A5F]" />
                  <span>Summarizing...</span>
                </>
              ) : (
                <>
                  <FileText className="h-3.5 w-3.5 text-[#0D7A5F]" />
                  <span>Summarize with AI</span>
                </>
              )}
            </button>
          )}
        </div>

        {/* Outcome selector buttons */}
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
          {OUTCOME_CHOICES.map((choice) => {
            const active = selectedOutcome === choice.id;
            return (
              <button
                key={choice.id}
                type="button"
                onClick={() => setSelectedOutcome(choice.id)}
                className={`min-h-[44px] rounded-xl border px-2.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'border-[#0D7A5F] bg-[#ECFDF5] text-[#0D7A5F]'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                {choice.label}
              </button>
            );
          })}
        </div>

        {summaryError && (
          <p role="alert" className="text-xs font-medium text-red-700">
            {summaryError}
          </p>
        )}

        {aiSummary && (
          <div className="rounded-xl bg-[#ECFDF5]/60 border border-[#0D7A5F]/20 px-4 py-3 text-xs leading-relaxed text-slate-800">
            <div className="font-semibold text-[#0D7A5F]">AI Call Summary</div>
            <p className="mt-1">{aiSummary}</p>
            {followUpAction && (
              <p className="mt-1.5 font-medium text-slate-700">Next step: {followUpAction}</p>
            )}
          </div>
        )}

        <div>
          <label htmlFor="call-notes" className="block text-xs font-medium text-slate-600">
            Call notes (optional)
          </label>
          <textarea
            id="call-notes"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Record follow-up time, confirmation, or special requests..."
            className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#0D7A5F] focus:outline-none focus:ring-2 focus:ring-[#0D7A5F]/20"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button
            type="button"
            onClick={() => handleSave(script.autoAdvance)}
            className="flex-1 min-h-[48px] inline-flex items-center justify-center gap-2 rounded-xl bg-[#0D7A5F] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#095E49] active:scale-[0.98] whitespace-nowrap"
          >
            <Check className="h-4 w-4" aria-hidden="true" />
            <span>{script.autoAdvance ? 'Save & Next Contact' : 'Save Outcome'}</span>
          </button>

          {nextContact && (
            <button
              type="button"
              onClick={() => onSelectContact(nextContact.id)}
              className="min-h-[48px] rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
            >
              Skip
            </button>
          )}
        </div>
      </div>
    </section>
  );
};
