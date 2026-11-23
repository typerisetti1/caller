import React, {useEffect, useMemo, useRef, useState} from 'react';
import {AlertCircle, Loader2, Play, Square, Wand2} from 'lucide-react';
import type {CampaignScript, Contact, VoiceName} from '../types';
import {interpolateScript, VOICE_OPTIONS} from '../utils/contacts';

interface ScriptStudioViewProps {
  script: CampaignScript;
  previewContact: Contact | null;
  onUpdateScript: (next: CampaignScript) => void;
}

const PLACEHOLDERS = ['{{name}}', '{{first_name}}', '{{company}}', '{{details}}'];

export const ScriptStudioView: React.FC<ScriptStudioViewProps> = ({
  script,
  previewContact,
  onUpdateScript,
}) => {
  const [refining, setRefining] = useState(false);
  const [refineError, setRefineError] = useState<string | null>(null);
  const [styleTip, setStyleTip] = useState<string | null>(null);

  const [testingVoice, setTestingVoice] = useState<VoiceName | null>(null);
  const [playingVoice, setPlayingVoice] = useState<VoiceName | null>(null);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const sampleContact = useMemo(() => {
    if (previewContact) return previewContact;
    return {
      name: 'Priya Nair',
      company: 'Harbor Dental',
      details: 'Thursday 10:30 AM appointment confirmation',
    };
  }, [previewContact]);

  const previewText = useMemo(
    () => interpolateScript(script.scriptTemplate, sampleContact, script),
    [script, sampleContact]
  );

  const updateField = <K extends keyof CampaignScript>(key: K, value: CampaignScript[K]) => {
    onUpdateScript({...script, [key]: value});
  };

  const insertPlaceholder = (token: string) => {
    const el = textareaRef.current;
    if (!el) {
      updateField('scriptTemplate', `${script.scriptTemplate} ${token}`.trim());
      return;
    }
    const start = el.selectionStart ?? script.scriptTemplate.length;
    const end = el.selectionEnd ?? script.scriptTemplate.length;
    const next =
      script.scriptTemplate.slice(0, start) + token + script.scriptTemplate.slice(end);
    updateField('scriptTemplate', next);
    window.requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const handleRefineScript = async () => {
    setRefining(true);
    setRefineError(null);
    setStyleTip(null);
    try {
      const response = await fetch('/api/script/refine', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          goal: script.callingGoal,
          agentName: script.agentName,
          organization: script.organization,
          currentScript: script.scriptTemplate,
          style: script.speakingStyle,
        }),
      });
      const data = (await response.json()) as {
        scriptTemplate?: string;
        styleTip?: string;
        error?: string;
      };
      if (!response.ok || !data.scriptTemplate) {
        throw new Error(data.error || 'Could not draft script.');
      }
      updateField('scriptTemplate', data.scriptTemplate);
      if (data.styleTip) setStyleTip(data.styleTip);
    } catch (err) {
      setRefineError(err instanceof Error ? err.message : 'Unable to refine script.');
    } finally {
      setRefining(false);
    }
  };

  const handleAuditionVoice = async (voice: VoiceName) => {
    if (playingVoice === voice && audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
      setPlayingVoice(null);
      return;
    }

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
      setPlayingVoice(null);
    }

    setTestingVoice(voice);
    setVoiceError(null);
    try {
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          text: previewText.slice(0, 320),
          voiceName: voice,
          style: script.speakingStyle,
        }),
      });
      const data = (await response.json()) as {
        audioBase64?: string;
        mimeType?: string;
        error?: string;
      };
      if (!response.ok || !data.audioBase64) {
        throw new Error(data.error || 'Voice audition failed.');
      }
      const audio = new Audio(`data:${data.mimeType || 'audio/wav'};base64,${data.audioBase64}`);
      audioRef.current = audio;
      audio.onended = () => {
        setPlayingVoice(null);
        audioRef.current = null;
      };
      await audio.play();
      setPlayingVoice(voice);
    } catch (err) {
      setVoiceError(err instanceof Error ? err.message : 'Voice preview failed.');
    } finally {
      setTestingVoice(null);
    }
  };

  return (
    <section aria-label="Campaign script and AI voice studio" className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Left: Campaign & Script Editor */}
      <div className="lg:col-span-7 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 space-y-5">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Calling Script &amp; Persona</h2>
          <p className="mt-1 text-sm text-slate-500">
            Personalize what the AI says to every person using their name and contact details.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label htmlFor="campaign-title" className="block text-sm font-medium text-slate-700">
              Campaign name
            </label>
            <input
              id="campaign-title"
              type="text"
              value={script.campaignTitle}
              onChange={(e) => updateField('campaignTitle', e.target.value)}
              className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-slate-900 focus:border-[#0D7A5F] focus:outline-none focus:ring-2 focus:ring-[#0D7A5F]/20"
            />
          </div>

          <div>
            <label htmlFor="agent-name" className="block text-sm font-medium text-slate-700">
              AI caller name
            </label>
            <input
              id="agent-name"
              type="text"
              value={script.agentName}
              onChange={(e) => updateField('agentName', e.target.value)}
              className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-slate-900 focus:border-[#0D7A5F] focus:outline-none focus:ring-2 focus:ring-[#0D7A5F]/20"
            />
          </div>

          <div>
            <label htmlFor="org-name" className="block text-sm font-medium text-slate-700">
              Organization / business
            </label>
            <input
              id="org-name"
              type="text"
              value={script.organization}
              onChange={(e) => updateField('organization', e.target.value)}
              className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-slate-900 focus:border-[#0D7A5F] focus:outline-none focus:ring-2 focus:ring-[#0D7A5F]/20"
            />
          </div>
        </div>

        <div>
          <label htmlFor="calling-goal" className="block text-sm font-medium text-slate-700">
            Calling objective
          </label>
          <input
            id="calling-goal"
            type="text"
            value={script.callingGoal}
            onChange={(e) => updateField('callingGoal', e.target.value)}
            placeholder="e.g. Confirm appointments and offer rescheduling options"
            className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-slate-900 focus:border-[#0D7A5F] focus:outline-none focus:ring-2 focus:ring-[#0D7A5F]/20"
          />
        </div>

        <div>
          <label htmlFor="speaking-style" className="block text-sm font-medium text-slate-700">
            Speaking style
          </label>
          <input
            id="speaking-style"
            type="text"
            value={script.speakingStyle}
            onChange={(e) => updateField('speakingStyle', e.target.value)}
            placeholder="e.g. Warm, calm, concise phone tone"
            className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-slate-900 focus:border-[#0D7A5F] focus:outline-none focus:ring-2 focus:ring-[#0D7A5F]/20"
          />
        </div>

        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label htmlFor="script-template" className="text-sm font-medium text-slate-700">
              Spoken script template
            </label>
            <button
              type="button"
              disabled={refining}
              onClick={() => void handleRefineScript()}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap"
            >
              {refining ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-[#0D7A5F]" />
                  <span>Drafting...</span>
                </>
              ) : (
                <>
                  <Wand2 className="h-3.5 w-3.5 text-[#0D7A5F]" />
                  <span>Draft with AI</span>
                </>
              )}
            </button>
          </div>

          <textarea
            ref={textareaRef}
            id="script-template"
            rows={5}
            value={script.scriptTemplate}
            onChange={(e) => updateField('scriptTemplate', e.target.value)}
            className="mt-2 w-full rounded-xl border border-slate-300 bg-white p-3.5 text-sm leading-relaxed text-slate-900 focus:border-[#0D7A5F] focus:outline-none focus:ring-2 focus:ring-[#0D7A5F]/20"
          />

          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-500">Insert field:</span>
            {PLACEHOLDERS.map((token) => (
              <button
                key={token}
                type="button"
                onClick={() => insertPlaceholder(token)}
                className="min-h-[34px] rounded-lg border border-slate-200 bg-slate-50 px-2.5 font-mono text-xs text-slate-700 hover:border-[#0D7A5F] hover:text-[#0D7A5F] transition-colors"
              >
                {token}
              </button>
            ))}
          </div>

          {refineError && (
            <p role="alert" className="mt-2 text-xs font-medium text-red-700">
              {refineError}
            </p>
          )}
          {styleTip && (
            <p className="mt-2 text-xs text-[#0D7A5F] font-medium">Delivery tip: {styleTip}</p>
          )}
        </div>

        <label className="flex items-center justify-between gap-4 border-t border-slate-100 pt-4 cursor-pointer">
          <div>
            <div className="text-sm font-medium text-slate-900">Auto-advance to next contact</div>
            <div className="text-xs text-slate-500">
              Automatically load the next pending person right after saving a call outcome.
            </div>
          </div>
          <input
            type="checkbox"
            checked={script.autoAdvance}
            onChange={(e) => updateField('autoAdvance', e.target.checked)}
            className="h-5 w-5 rounded border-slate-300 accent-[#0D7A5F]"
          />
        </label>
      </div>

      {/* Right: Voice Persona Picker & Live Preview */}
      <div className="lg:col-span-5 space-y-5">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 space-y-4">
          <div>
            <h3 className="text-base font-bold text-slate-900">AI Voice Selection</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Choose the voice used for both Live AI calls and spoken scripts.
            </p>
          </div>

          <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 overflow-hidden">
            {VOICE_OPTIONS.map((option) => {
              const selected = script.voiceName === option.name;
              const isTesting = testingVoice === option.name;
              const isPlaying = playingVoice === option.name;

              return (
                <div
                  key={option.name}
                  className={`flex items-center justify-between gap-3 px-4 py-3 transition-colors ${
                    selected ? 'bg-[#ECFDF5]/60' : 'bg-white'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => updateField('voiceName', option.name)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    <span
                      className={`h-4 w-4 shrink-0 rounded-full border-2 flex items-center justify-center ${
                        selected ? 'border-[#0D7A5F]' : 'border-slate-300'
                      }`}
                    >
                      {selected && <span className="h-2 w-2 rounded-full bg-[#0D7A5F]" />}
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-900">{option.name}</div>
                      <div className="text-xs text-slate-500 truncate">{option.tone}</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    disabled={isTesting}
                    onClick={() => void handleAuditionVoice(option.name)}
                    aria-label={`Preview ${option.name} voice`}
                    className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap shrink-0"
                  >
                    {isTesting ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-[#0D7A5F]" />
                    ) : isPlaying ? (
                      <Square className="h-3.5 w-3.5 fill-current text-red-600" />
                    ) : (
                      <Play className="h-3.5 w-3.5 text-[#0D7A5F]" />
                    )}
                    <span>{isPlaying ? 'Stop' : 'Test'}</span>
                  </button>
                </div>
              );
            })}
          </div>

          {voiceError && (
            <div className="flex items-start gap-2 text-xs text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{voiceError}</span>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
          <div className="text-xs font-medium text-slate-500">
            Live Preview · Next Contact ({sampleContact.name})
          </div>
          <p className="mt-2 text-sm leading-relaxed text-slate-800">“{previewText}”</p>
        </div>
      </div>
    </section>
  );
};
