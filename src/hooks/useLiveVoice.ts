import {useCallback, useEffect, useRef, useState} from 'react';
import type {TranscriptTurn, VoiceName} from '../types';

export type LiveVoiceStatus = 'idle' | 'connecting' | 'listening' | 'speaking' | 'error';

interface StartLiveOptions {
  voiceName: VoiceName;
  systemInstruction: string;
  openingPrompt?: string;
}

function float32ToBase64Pcm16(float32: Float32Array): string {
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const clamped = Math.max(-1, Math.min(1, float32[i]));
    int16[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
  }
  const bytes = new Uint8Array(int16.buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64Pcm16ToFloat32(base64: string): Float32Array<ArrayBuffer> {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const sampleCount = Math.floor(bytes.byteLength / 2);
  const view = new DataView(bytes.buffer, bytes.byteOffset, sampleCount * 2);
  const float32 = new Float32Array(new ArrayBuffer(sampleCount * 4));
  for (let i = 0; i < sampleCount; i++) {
    float32[i] = view.getInt16(i * 2, true) / 32768;
  }
  return float32;
}

function nowTimeLabel(): string {
  return new Date().toLocaleTimeString([], {hour: '2-digit', minute: '2-digit', second: '2-digit'});
}

export function useLiveVoice() {
  const [status, setStatus] = useState<LiveVoiceStatus>('idle');
  const [isMuted, setIsMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptTurn[]>([]);
  const [audioLevel, setAudioLevel] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const inputCtxRef = useRef<AudioContext | null>(null);
  const outputCtxRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const isMutedRef = useRef<boolean>(false);
  const levelTargetRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  const clearScheduledPlayback = useCallback(() => {
    for (const source of activeSourcesRef.current) {
      try {
        source.stop();
        source.disconnect();
      } catch {
        // Already stopped
      }
    }
    activeSourcesRef.current.clear();
    if (outputCtxRef.current) {
      nextStartTimeRef.current = outputCtxRef.current.currentTime;
    } else {
      nextStartTimeRef.current = 0;
    }
  }, []);

  const appendTranscriptChunk = useCallback((speaker: 'ai' | 'contact', chunkText: string) => {
    const clean = chunkText.replace(/\s+/g, ' ');
    if (!clean.trim()) return;

    setTranscript((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.speaker === speaker) {
        const needsSpace =
          last.text.length > 0 &&
          !last.text.endsWith(' ') &&
          !clean.startsWith(' ') &&
          !/^[.,!?;:'")]/.test(clean);
        const updated = {
          ...last,
          text: `${last.text}${needsSpace ? ' ' : ''}${clean.trimStart()}`.trim(),
        };
        return [...prev.slice(0, -1), updated];
      }
      return [
        ...prev,
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          speaker,
          text: clean.trim(),
          timestamp: nowTimeLabel(),
        },
      ];
    });
  }, []);

  const playPcmChunk = useCallback((base64Audio: string) => {
    const ctx = outputCtxRef.current;
    if (!ctx) return;

    if (ctx.state === 'suspended') {
      void ctx.resume();
    }

    const float32 = base64Pcm16ToFloat32(base64Audio);
    if (float32.length === 0) return;

    // Compute RMS energy for speaking animation
    let sumSq = 0;
    for (let i = 0; i < float32.length; i += 8) {
      sumSq += float32[i] * float32[i];
    }
    const rms = Math.sqrt(sumSq / Math.max(1, float32.length / 8));
    levelTargetRef.current = Math.min(1, Math.max(levelTargetRef.current, rms * 3.8));

    const buffer = ctx.createBuffer(1, float32.length, 24000);
    buffer.copyToChannel(float32, 0);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);

    const startTime = Math.max(ctx.currentTime + 0.01, nextStartTimeRef.current);
    source.start(startTime);
    nextStartTimeRef.current = startTime + buffer.duration;

    activeSourcesRef.current.add(source);
    setStatus('speaking');

    source.onended = () => {
      activeSourcesRef.current.delete(source);
      if (activeSourcesRef.current.size === 0 && wsRef.current?.readyState === WebSocket.OPEN) {
        setStatus('listening');
      }
    };
  }, []);

  const stopSession = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    clearScheduledPlayback();

    if (wsRef.current) {
      try {
        if (wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({type: 'stop'}));
        }
        wsRef.current.close();
      } catch {
        // Ignore close error
      }
      wsRef.current = null;
    }

    if (processorRef.current) {
      try {
        processorRef.current.disconnect();
      } catch {
        // Ignore
      }
      processorRef.current.onaudioprocess = null;
      processorRef.current = null;
    }

    if (mediaStreamRef.current) {
      for (const track of mediaStreamRef.current.getTracks()) {
        track.stop();
      }
      mediaStreamRef.current = null;
    }

    if (inputCtxRef.current) {
      void inputCtxRef.current.close();
      inputCtxRef.current = null;
    }

    if (outputCtxRef.current) {
      void outputCtxRef.current.close();
      outputCtxRef.current = null;
    }

    levelTargetRef.current = 0;
    setAudioLevel(0);
    setStatus('idle');
  }, [clearScheduledPlayback]);

  const startSession = useCallback(
    async (options: StartLiveOptions) => {
      stopSession();
      setError(null);
      setStatus('connecting');

      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('Microphone access is not supported in this browser.');
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            sampleRate: 16000,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        mediaStreamRef.current = stream;

        const inputCtx = new AudioContext({sampleRate: 16000});
        const outputCtx = new AudioContext({sampleRate: 24000});
        inputCtxRef.current = inputCtx;
        outputCtxRef.current = outputCtx;
        nextStartTimeRef.current = outputCtx.currentTime;

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const ws = new WebSocket(`${protocol}//${window.location.host}/ws/live`);
        wsRef.current = ws;

        // Smooth level meter animation loop
        const tickMeter = () => {
          levelTargetRef.current *= 0.86;
          setAudioLevel((prev) => prev * 0.65 + levelTargetRef.current * 0.35);
          rafRef.current = requestAnimationFrame(tickMeter);
        };
        rafRef.current = requestAnimationFrame(tickMeter);

        ws.onopen = () => {
          ws.send(
            JSON.stringify({
              type: 'start',
              voiceName: options.voiceName,
              systemInstruction: options.systemInstruction,
              openingPrompt: options.openingPrompt,
            })
          );

          const source = inputCtx.createMediaStreamSource(stream);
          const processor = inputCtx.createScriptProcessor(4096, 1, 1);
          processorRef.current = processor;

          // Route through silent gain so mic audio does not echo locally
          const silentGain = inputCtx.createGain();
          silentGain.gain.value = 0;
          source.connect(processor);
          processor.connect(silentGain);
          silentGain.connect(inputCtx.destination);

          processor.onaudioprocess = (event) => {
            if (isMutedRef.current) return;
            if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

            const inputData = event.inputBuffer.getChannelData(0);
            let sumSq = 0;
            for (let i = 0; i < inputData.length; i += 8) {
              sumSq += inputData[i] * inputData[i];
            }
            const rms = Math.sqrt(sumSq / Math.max(1, inputData.length / 8));
            levelTargetRef.current = Math.min(1, Math.max(levelTargetRef.current, rms * 4.5));

            const base64 = float32ToBase64Pcm16(inputData);
            wsRef.current.send(JSON.stringify({type: 'audio', audio: base64}));
          };
        };

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data as string) as {
              type?: string;
              status?: string;
              audio?: string;
              text?: string;
              error?: string;
            };

            if (msg.type === 'status') {
              if (msg.status === 'connected') {
                setStatus('listening');
              } else if (msg.status === 'closed') {
                setStatus('idle');
              }
            } else if (msg.type === 'audio' && msg.audio) {
              playPcmChunk(msg.audio);
            } else if (msg.type === 'interrupted') {
              clearScheduledPlayback();
              setStatus('listening');
            } else if (msg.type === 'inputTranscript' && msg.text) {
              appendTranscriptChunk('contact', msg.text);
            } else if (msg.type === 'outputTranscript' && msg.text) {
              appendTranscriptChunk('ai', msg.text);
            } else if (msg.type === 'error' && msg.error) {
              setError(msg.error);
              setStatus('error');
            }
          } catch {
            // Ignore malformed socket message
          }
        };

        ws.onerror = () => {
          setError('Connection to the live AI voice server was interrupted.');
          setStatus('error');
        };

        ws.onclose = () => {
          if (wsRef.current === ws) {
            wsRef.current = null;
            setStatus((current) => (current === 'error' ? 'error' : 'idle'));
          }
        };
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : 'Unable to start microphone or live voice session.';
        setError(message);
        stopSession();
        setStatus('error');
      }
    },
    [appendTranscriptChunk, clearScheduledPlayback, playPcmChunk, stopSession]
  );

  const sendTextCue = useCallback((text: string) => {
    const clean = text.trim();
    if (!clean || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({type: 'text', text: clean}));
  }, []);

  const resetTranscript = useCallback((initial: TranscriptTurn[] = []) => {
    setTranscript(initial);
  }, []);

  useEffect(() => {
    return () => {
      stopSession();
    };
  }, [stopSession]);

  return {
    status,
    isActive: status === 'connecting' || status === 'listening' || status === 'speaking',
    isMuted,
    setIsMuted,
    error,
    setError,
    transcript,
    resetTranscript,
    audioLevel,
    startSession,
    stopSession,
    sendTextCue,
    interruptAudio: clearScheduledPlayback,
  };
}
