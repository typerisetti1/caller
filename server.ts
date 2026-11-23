import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import zlib from 'zlib';
import {fileURLToPath} from 'url';
import {WebSocketServer, WebSocket} from 'ws';
import {GoogleGenAI, Modality, Type} from '@google/genai';
import type {LiveServerMessage, Session} from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const IS_PROD = process.env.NODE_ENV === 'production';
const ALLOWED_VOICES = new Set(['Zephyr', 'Kore', 'Puck', 'Charon', 'Fenrir']);

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is not configured. Add it in Settings > Secrets to enable AI voice and script features.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    apiVersion: 'v1beta',
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function formatApiError(err: unknown): {status: number; message: string} {
  const raw = err instanceof Error ? err.message : String(err);
  if (raw.includes('API_KEY_INVALID') || raw.includes('PERMISSION_DENIED') || raw.includes('GEMINI_API_KEY')) {
    return {
      status: 403,
      message: 'API key missing or invalid. Please verify GEMINI_API_KEY in Settings > Secrets.',
    };
  }
  if (raw.includes('RESOURCE_EXHAUSTED') || raw.includes('429')) {
    return {
      status: 429,
      message: 'Rate limit reached on the AI voice service. Wait a moment and try again.',
    };
  }
  return {
    status: 500,
    message: raw || 'Unexpected server error while calling Gemini API.',
  };
}

function sanitizeVoice(voiceName: unknown): string {
  if (typeof voiceName === 'string' && ALLOWED_VOICES.has(voiceName)) {
    return voiceName;
  }
  return 'Zephyr';
}

async function startServer() {
  const app = express();
  app.use(express.json({limit: '2mb'}));

  // Health endpoint
  app.get('/api/health', (_req, res) => {
    res.json({ok: true});
  });

  // 1. Personalized Speech Generation (TTS) via gemini-3.8-flash-lite-tts
  app.post('/api/tts', async (req, res) => {
    try {
      const {text, voiceName, style} = req.body as {
        text?: string;
        voiceName?: string;
        style?: string;
      };

      const trimmedText = typeof text === 'string' ? text.trim() : '';
      if (!trimmedText) {
        res.status(400).json({error: 'Script text is required to generate speech.'});
        return;
      }
      if (trimmedText.length > 2500) {
        res.status(400).json({error: 'Script text must be under 2,500 characters.'});
        return;
      }

      const ai = getAiClient();
      const chosenVoice = sanitizeVoice(voiceName);
      const speakingStyle =
        typeof style === 'string' && style.trim()
          ? style.trim().slice(0, 160)
          : 'Warm, clear, natural phone conversation';

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash-lite-tts',
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: trimmedText,
                speechMetadata: {
                  style: speakingStyle,
                },
              },
            ],
          },
        ],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {voiceName: chosenVoice},
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!base64Audio) {
        res.status(502).json({error: 'No audio returned from speech generation model.'});
        return;
      }

      res.json({
        audioBase64: base64Audio,
        mimeType: 'audio/wav',
        voiceName: chosenVoice,
      });
    } catch (err) {
      const formatted = formatApiError(err);
      res.status(formatted.status).json({error: formatted.message});
    }
  });

  // 2. AI Script Refiner via gemini-4-hydrogen
  app.post('/api/script/refine', async (req, res) => {
    try {
      const {goal, agentName, organization, currentScript, style} = req.body as {
        goal?: string;
        agentName?: string;
        organization?: string;
        currentScript?: string;
        style?: string;
      };

      const cleanGoal = typeof goal === 'string' ? goal.trim() : '';
      if (!cleanGoal) {
        res.status(400).json({error: 'Please enter a campaign calling goal first.'});
        return;
      }

      const ai = getAiClient();
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: [
          `Calling goal: ${cleanGoal}`,
          `Agent name: ${agentName || 'Alex'}`,
          `Organization: ${organization || 'our team'}`,
          `Desired tone: ${style || 'Warm, concise, polite'}`,
          currentScript ? `Existing draft to improve: ${currentScript}` : '',
        ]
          .filter(Boolean)
          .join('\n'),
        config: {
          systemInstruction:
            'You are an expert outbound phone communication coach. Write a crisp, natural spoken phone script (3 to 5 short sentences) that sounds human when spoken aloud. Always include {{name}} for the recipient name and {{details}} where custom contact context fits naturally. Optionally use {{company}} if relevant. Avoid robotic filler or overly long monologues.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              scriptTemplate: {
                type: Type.STRING,
                description: 'Natural spoken phone script using {{name}} and {{details}} placeholders.',
              },
              styleTip: {
                type: Type.STRING,
                description: 'One short practical delivery tip for speaking this script.',
              },
              openingHook: {
                type: Type.STRING,
                description: 'Short 1-sentence opening greeting.',
              },
            },
            required: ['scriptTemplate', 'styleTip', 'openingHook'],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim());
      res.json(parsed);
    } catch (err) {
      const formatted = formatApiError(err);
      res.status(formatted.status).json({error: formatted.message});
    }
  });

  // 3. Call Transcript Summarizer via gemini-4-hydrogen
  app.post('/api/call/summarize', async (req, res) => {
    try {
      const {contactName, contactDetails, transcript, manualNotes} = req.body as {
        contactName?: string;
        contactDetails?: string;
        transcript?: Array<{speaker: string; text: string}>;
        manualNotes?: string;
      };

      const transcriptLines = Array.isArray(transcript)
        ? transcript
            .filter((t) => t && typeof t.text === 'string' && t.text.trim())
            .map((t) => `${t.speaker === 'ai' ? 'Agent' : contactName || 'Contact'}: ${t.text.trim()}`)
            .join('\n')
        : '';

      if (!transcriptLines && !(manualNotes && manualNotes.trim())) {
        res.status(400).json({error: 'No transcript or notes available to summarize.'});
        return;
      }

      const ai = getAiClient();
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: [
          `Contact: ${contactName || 'Unknown'}`,
          contactDetails ? `Context: ${contactDetails}` : '',
          transcriptLines ? `Transcript:\n${transcriptLines}` : '',
          manualNotes ? `Additional notes: ${manualNotes}` : '',
        ]
          .filter(Boolean)
          .join('\n\n'),
        config: {
          systemInstruction:
            'Summarize this outbound phone call cleanly in 1-2 factual sentences. Suggest the most accurate call outcome from: completed, callback, no_answer, voicemail, wrong_number. Provide one clear next action.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              summary: {type: Type.STRING},
              suggestedOutcome: {type: Type.STRING},
              followUpAction: {type: Type.STRING},
            },
            required: ['summary', 'suggestedOutcome', 'followUpAction'],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim());
      res.json(parsed);
    } catch (err) {
      const formatted = formatApiError(err);
      res.status(formatted.status).json({error: formatted.message});
    }
  });

  // 4. Native Android Studio Project Inspector & ZIP Export
  const androidRoot = path.resolve(__dirname, 'android');

  const collectAndroidFiles = (): Array<{path: string; content: string}> => {
    const out: Array<{path: string; content: string}> = [];
    if (!fs.existsSync(androidRoot)) return out;
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (entry.isFile()) {
          const rel = path.relative(androidRoot, full).split(path.sep).join('/');
          out.push({path: rel, content: fs.readFileSync(full, 'utf8')});
        }
      }
    };
    walk(androidRoot);
    return out.sort((a, b) => a.path.localeCompare(b.path));
  };

  const crc32Table = (() => {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      table[i] = c >>> 0;
    }
    return table;
  })();

  const computeCrc32 = (buf: Buffer): number => {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      c = crc32Table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
  };

  const buildZipArchive = (entries: Array<{name: string; data: Buffer}>): Buffer => {
    const localParts: Buffer[] = [];
    const centralParts: Buffer[] = [];
    let offset = 0;

    for (const entry of entries) {
      const nameBuf = Buffer.from(entry.name, 'utf8');
      const crc = computeCrc32(entry.data);
      const compressed = zlib.deflateRawSync(entry.data);

      const localHeader = Buffer.alloc(30);
      localHeader.writeUInt32LE(0x04034b50, 0);
      localHeader.writeUInt16LE(20, 4);
      localHeader.writeUInt16LE(0, 6);
      localHeader.writeUInt16LE(8, 8); // deflate
      localHeader.writeUInt16LE(0, 10);
      localHeader.writeUInt16LE(0, 12);
      localHeader.writeUInt32LE(crc, 14);
      localHeader.writeUInt32LE(compressed.length, 18);
      localHeader.writeUInt32LE(entry.data.length, 22);
      localHeader.writeUInt16LE(nameBuf.length, 26);
      localHeader.writeUInt16LE(0, 28);

      localParts.push(localHeader, nameBuf, compressed);

      const centralHeader = Buffer.alloc(46);
      centralHeader.writeUInt32LE(0x02014b50, 0);
      centralHeader.writeUInt16LE(20, 4);
      centralHeader.writeUInt16LE(20, 6);
      centralHeader.writeUInt16LE(0, 8);
      centralHeader.writeUInt16LE(8, 10);
      centralHeader.writeUInt16LE(0, 12);
      centralHeader.writeUInt16LE(0, 14);
      centralHeader.writeUInt32LE(crc, 16);
      centralHeader.writeUInt32LE(compressed.length, 20);
      centralHeader.writeUInt32LE(entry.data.length, 24);
      centralHeader.writeUInt16LE(nameBuf.length, 28);
      centralHeader.writeUInt16LE(0, 30);
      centralHeader.writeUInt16LE(0, 32);
      centralHeader.writeUInt16LE(0, 34);
      centralHeader.writeUInt16LE(0, 36);
      centralHeader.writeUInt32LE(0, 38);
      centralHeader.writeUInt32LE(offset, 42);

      centralParts.push(centralHeader, nameBuf);
      offset += localHeader.length + nameBuf.length + compressed.length;
    }

    const centralBuffer = Buffer.concat(centralParts);
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(0, 4);
    eocd.writeUInt16LE(0, 6);
    eocd.writeUInt16LE(entries.length, 8);
    eocd.writeUInt16LE(entries.length, 10);
    eocd.writeUInt32LE(centralBuffer.length, 12);
    eocd.writeUInt32LE(offset, 16);
    eocd.writeUInt16LE(0, 20);

    return Buffer.concat([...localParts, centralBuffer, eocd]);
  };

  app.get('/api/android/files', (_req, res) => {
    try {
      res.json({files: collectAndroidFiles()});
    } catch (err) {
      res.status(500).json({error: err instanceof Error ? err.message : 'Unable to read Android files.'});
    }
  });

  app.post('/api/android/export', (req, res) => {
    try {
      const {serverUrl, contacts, script, includeCampaign} = req.body as {
        serverUrl?: string;
        contacts?: unknown[];
        script?: Record<string, unknown>;
        includeCampaign?: boolean;
      };

      const cleanUrl =
        typeof serverUrl === 'string' && /^https?:\/\//i.test(serverUrl.trim())
          ? serverUrl.trim().replace(/\/+$/, '')
          : process.env.APP_URL || 'https://your-dialflow-server.example.com';

      const sourceFiles = collectAndroidFiles();
      const zipEntries: Array<{name: string; data: Buffer}> = sourceFiles.map((file) => {
        let content = file.content;
        if (file.path === 'gradle.properties') {
          content = content.replace(/^DIALFLOW_SERVER_URL=.*$/m, `DIALFLOW_SERVER_URL=${cleanUrl}`);
        }
        return {
          name: `DialFlow-Android/${file.path}`,
          data: Buffer.from(content, 'utf8'),
        };
      });

      if (includeCampaign !== false) {
        const campaignJson = JSON.stringify(
          {
            exportedAt: new Date().toISOString(),
            serverUrl: cleanUrl,
            script: script || {},
            contacts: Array.isArray(contacts) ? contacts : [],
          },
          null,
          2
        );
        zipEntries.push({
          name: 'DialFlow-Android/app/src/main/assets/initial_campaign.json',
          data: Buffer.from(campaignJson, 'utf8'),
        });
      }

      const zipBuffer = buildZipArchive(zipEntries);
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', 'attachment; filename="DialFlow-Android-Studio.zip"');
      res.send(zipBuffer);
    } catch (err) {
      res.status(500).json({error: err instanceof Error ? err.message : 'Failed to build Android project ZIP.'});
    }
  });

  // Create HTTP server so we can attach WebSocket bridge cleanly
  const server = http.createServer(app);

  // 4. WebSocket Bridge for Gemini Live API (gemini-3.8-live)
  const wss = new WebSocketServer({noServer: true});

  server.on('upgrade', (request, socket, head) => {
    const pathname = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`).pathname;
    if (pathname === '/ws/live') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else if (IS_PROD) {
      socket.destroy();
    }
  });

  wss.on('connection', (clientWs: WebSocket) => {
    let liveSession: Session | null = null;
    let isClosing = false;

    const safeSend = (payload: Record<string, unknown>) => {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify(payload));
      }
    };

    const closeSession = () => {
      if (isClosing) return;
      isClosing = true;
      if (liveSession) {
        try {
          liveSession.close();
        } catch {
          // Ignore already-closed live session
        }
        liveSession = null;
      }
    };

    clientWs.on('message', async (rawData) => {
      try {
        const msg = JSON.parse(rawData.toString()) as {
          type?: string;
          audio?: string;
          text?: string;
          voiceName?: string;
          systemInstruction?: string;
          openingPrompt?: string;
        };

        if (msg.type === 'start') {
          if (liveSession) {
            closeSession();
            isClosing = false;
          }

          const ai = getAiClient();
          const chosenVoice = sanitizeVoice(msg.voiceName);
          const instruction =
            typeof msg.systemInstruction === 'string' && msg.systemInstruction.trim()
              ? msg.systemInstruction.trim()
              : 'You are a polite, natural phone assistant calling a contact. Keep responses concise, friendly, and conversational.';

          safeSend({type: 'status', status: 'connecting'});

          const session = await ai.live.connect({
            model: 'gemini-3.8-live',
            config: {
              responseModalities: [Modality.AUDIO],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: {voiceName: chosenVoice},
                },
              },
              inputAudioTranscription: {},
              outputAudioTranscription: {},
              systemInstruction: instruction,
            },
            callbacks: {
              onopen: () => {
                safeSend({type: 'status', status: 'connected'});
              },
              onmessage: (message: LiveServerMessage) => {
                const content = message.serverContent;
                if (!content) return;

                if (content.interrupted) {
                  safeSend({type: 'interrupted'});
                }

                if (content.inputTranscription?.text) {
                  safeSend({
                    type: 'inputTranscript',
                    text: content.inputTranscription.text,
                  });
                }

                if (content.outputTranscription?.text) {
                  safeSend({
                    type: 'outputTranscript',
                    text: content.outputTranscription.text,
                  });
                }

                for (const part of content.modelTurn?.parts ?? []) {
                  if (part.inlineData?.data) {
                    safeSend({
                      type: 'audio',
                      audio: part.inlineData.data,
                    });
                  }
                }

                if (content.turnComplete) {
                  safeSend({type: 'turnComplete'});
                }
              },
              onerror: (event: ErrorEvent) => {
                safeSend({
                  type: 'error',
                  error: event?.message || 'Live voice session encountered a connection error.',
                });
              },
              onclose: () => {
                safeSend({type: 'status', status: 'closed'});
              },
            },
          });

          if (isClosing || clientWs.readyState !== WebSocket.OPEN) {
            session.close();
            return;
          }

          liveSession = session;

          // Trigger natural opening greeting immediately if requested
          if (typeof msg.openingPrompt === 'string' && msg.openingPrompt.trim()) {
            session.sendRealtimeInput({
              text: msg.openingPrompt.trim(),
            });
          }
          return;
        }

        if (msg.type === 'audio' && typeof msg.audio === 'string' && liveSession) {
          liveSession.sendRealtimeInput({
            audio: {
              data: msg.audio,
              mimeType: 'audio/pcm;rate=16000',
            },
          });
          return;
        }

        if (msg.type === 'text' && typeof msg.text === 'string' && liveSession) {
          liveSession.sendRealtimeInput({
            text: msg.text,
          });
          return;
        }

        if (msg.type === 'stop') {
          closeSession();
          safeSend({type: 'status', status: 'closed'});
        }
      } catch (err) {
        const formatted = formatApiError(err);
        safeSend({type: 'error', error: formatted.message});
      }
    });

    clientWs.on('close', () => {
      closeSession();
    });

    clientWs.on('error', () => {
      closeSession();
    });
  });

  // Mount Vite middleware in dev or serve built SPA in production
  if (!IS_PROD) {
    const {createServer: createViteServer} = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
        ws: {
          server,
          path: '/__vite_ws',
        },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`DialFlow server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start DialFlow server:', err);
  process.exit(1);
});
