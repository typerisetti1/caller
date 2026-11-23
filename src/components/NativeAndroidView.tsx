import React, {useEffect, useState} from 'react';
import {
  AlertCircle,
  Check,
  Code2,
  Copy,
  Download,
  Loader2,
  Smartphone,
} from 'lucide-react';
import type {CampaignScript, Contact} from '../types';

interface AndroidSourceFile {
  path: string;
  content: string;
}

interface NativeAndroidViewProps {
  contacts: Contact[];
  script: CampaignScript;
  onExportSuccess: (message: string) => void;
}

export const NativeAndroidView: React.FC<NativeAndroidViewProps> = ({
  contacts,
  script,
  onExportSuccess,
}) => {
  const [serverUrl, setServerUrl] = useState(() =>
    typeof window !== 'undefined' ? window.location.origin : ''
  );
  const [includeCampaign, setIncludeCampaign] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const [files, setFiles] = useState<AndroidSourceFile[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [selectedPath, setSelectedPath] = useState<string>('');
  const [copiedFile, setCopiedFile] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoadingFiles(true);
      try {
        const res = await fetch('/api/android/files');
        const data = (await res.json()) as {files?: AndroidSourceFile[]};
        if (active && Array.isArray(data.files)) {
          setFiles(data.files);
          const defaultFile =
            data.files.find((f) => f.path.endsWith('AutoDialerService.kt')) || data.files[0];
          if (defaultFile) setSelectedPath(defaultFile.path);
        }
      } catch {
        // Handled cleanly via empty state
      } finally {
        if (active) setLoadingFiles(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, []);

  const selectedFile = files.find((f) => f.path === selectedPath) || files[0] || null;

  const handleDownloadZip = async () => {
    setDownloading(true);
    setDownloadError(null);
    try {
      const response = await fetch('/api/android/export', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          serverUrl: serverUrl.trim(),
          includeCampaign,
          contacts,
          script,
        }),
      });
      if (!response.ok) {
        const err = (await response.json().catch(() => ({}))) as {error?: string};
        throw new Error(err.error || 'Could not generate Android Studio ZIP archive.');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'DialFlow-Android-Studio.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      onExportSuccess('Downloaded DialFlow-Android-Studio.zip');
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : 'Download failed.');
    } finally {
      setDownloading(false);
    }
  };

  const handleCopySource = async () => {
    if (!selectedFile) return;
    try {
      await navigator.clipboard.writeText(selectedFile.content);
      setCopiedFile(true);
      window.setTimeout(() => setCopiedFile(false), 1800);
    } catch {
      // Clipboard unavailable
    }
  };

  return (
    <section aria-label="Native Android Kotlin Studio Project" className="space-y-6">
      {/* Top Export & Configuration Card */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 space-y-5">
          <div className="flex items-start gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#ECFDF5] text-[#0D7A5F]">
              <Smartphone className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900">
                Native Android App (Kotlin + Jetpack Compose)
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Download the complete Android Studio project configured with your live AI voice
                server and current calling list, ready to build an installable APK.
              </p>
            </div>
          </div>

          <div className="space-y-4 border-t border-slate-100 pt-4">
            <div>
              <label htmlFor="android-server-url" className="block text-sm font-medium text-slate-700">
                DialFlow AI Voice Backend URL
              </label>
              <p className="mt-0.5 text-xs text-slate-500">
                Baked into Gradle <code className="font-mono">BuildConfig.SERVER_BASE_URL</code> so
                no API keys are stored inside the APK.
              </p>
              <input
                id="android-server-url"
                type="url"
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
                placeholder="https://your-dialflow-url.run.app"
                className="mt-2 w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-3.5 font-mono text-xs sm:text-sm text-slate-900 focus:border-[#0D7A5F] focus:outline-none focus:ring-2 focus:ring-[#0D7A5F]/20"
              />
            </div>

            <label className="flex items-start justify-between gap-4 cursor-pointer">
              <div>
                <div className="text-sm font-medium text-slate-900">
                  Bundle current calling list &amp; script ({contacts.length}{' '}
                  {contacts.length === 1 ? 'contact' : 'contacts'})
                </div>
                <div className="text-xs text-slate-500">
                  Pre-loads your active contacts and voice persona into{' '}
                  <code className="font-mono">assets/initial_campaign.json</code> on first APK launch.
                </div>
              </div>
              <input
                type="checkbox"
                checked={includeCampaign}
                onChange={(e) => setIncludeCampaign(e.target.checked)}
                className="mt-1 h-5 w-5 rounded border-slate-300 accent-[#0D7A5F]"
              />
            </label>

            {downloadError && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-800"
              >
                <AlertCircle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
                <span>{downloadError}</span>
              </div>
            )}

            <button
              type="button"
              disabled={downloading}
              onClick={() => void handleDownloadZip()}
              className="w-full sm:w-auto inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-[#0D7A5F] px-6 text-sm font-semibold text-white transition-colors hover:bg-[#095E49] active:scale-[0.98] disabled:opacity-50 whitespace-nowrap"
            >
              {downloading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  <span>Packaging Android Project...</span>
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" aria-hidden="true" />
                  <span>Download Android Studio Project (.zip)</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Right: What Native Unlocks + Build Steps */}
        <div className="lg:col-span-5 space-y-5">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 space-y-3.5">
            <h3 className="text-base font-bold text-slate-900">What Native Android Adds</h3>
            <ul className="space-y-2.5 text-sm text-slate-600">
              <li>
                <strong className="text-slate-900">Direct Auto-Dialing:</strong> Uses{' '}
                <code className="font-mono text-xs text-slate-800">Intent.ACTION_CALL</code> to
                place calls immediately without tapping Dial for each contact.
              </li>
              <li>
                <strong className="text-slate-900">Auto-Advance on Hangup:</strong> Monitors{' '}
                <code className="font-mono text-xs text-slate-800">TelephonyCallback</code> to
                detect when each call ends and automatically dial the next contact.
              </li>
              <li>
                <strong className="text-slate-900">Auto Speakerphone + Live AI:</strong> Switches
                audio to speakerphone on connect and streams 16kHz/24kHz PCM via{' '}
                <code className="font-mono text-xs text-slate-800">AudioRecord</code> /{' '}
                <code className="font-mono text-xs text-slate-800">AudioTrack</code>.
              </li>
              <li>
                <strong className="text-slate-900">Android Contacts Import:</strong> Pulls names
                and numbers directly from the phonebook via{' '}
                <code className="font-mono text-xs text-slate-800">ContactsContract</code>.
              </li>
            </ul>
            <p className="border-t border-slate-100 pt-3 text-xs leading-relaxed text-slate-500">
              Note: Stock Android blocks all third-party apps from injecting audio directly into
              cellular uplink channels, so the native app automatically routes AI voice over
              speakerphone during calls.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 space-y-2.5">
            <h3 className="text-base font-bold text-slate-900">Build APK in 4 Steps</h3>
            <ol className="list-decimal pl-5 space-y-1.5 text-sm text-slate-600">
              <li>Unzip the downloaded folder and open it in Android Studio.</li>
              <li>Wait for Gradle sync (Kotlin 2.0, Jetpack Compose, OkHttp).</li>
              <li>
                Choose <strong className="text-slate-900">Build &gt; Build APK(s)</strong> or click{' '}
                <strong className="text-slate-900">Run</strong> on a connected Android phone.
              </li>
              <li>Grant Phone, Microphone, and Contacts permissions on first launch.</li>
            </ol>
          </div>
        </div>
      </div>

      {/* Native Kotlin Source Code Explorer */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3.5">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Code2 className="h-4 w-4 text-[#0D7A5F]" aria-hidden="true" />
            <span>Native Android Source Files ({files.length})</span>
          </div>
          {selectedFile && (
            <button
              type="button"
              onClick={() => void handleCopySource()}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
            >
              {copiedFile ? (
                <>
                  <Check className="h-3.5 w-3.5 text-[#0D7A5F]" />
                  <span className="text-[#0D7A5F]">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  <span>Copy File</span>
                </>
              )}
            </button>
          )}
        </div>

        {loadingFiles ? (
          <div className="px-6 py-10 text-center text-sm text-slate-500">
            Loading Android project files...
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
            <div className="lg:col-span-4 max-h-64 lg:max-h-[520px] overflow-y-auto divide-y divide-slate-100">
              {files.map((file) => {
                const isSelected = file.path === selectedFile?.path;
                const shortName = file.path.split('/').pop() || file.path;
                return (
                  <button
                    key={file.path}
                    type="button"
                    onClick={() => setSelectedPath(file.path)}
                    className={`w-full px-4 py-3 text-left transition-colors ${
                      isSelected ? 'bg-[#ECFDF5]/70' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div
                      className={`text-xs font-semibold truncate ${
                        isSelected ? 'text-[#0D7A5F]' : 'text-slate-900'
                      }`}
                    >
                      {shortName}
                    </div>
                    <div className="mt-0.5 font-mono text-[11px] text-slate-500 truncate">
                      {file.path}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="lg:col-span-8 bg-slate-950 text-slate-100 overflow-x-auto max-h-[520px] overflow-y-auto p-4 sm:p-5">
              {selectedFile ? (
                <pre className="font-mono text-xs leading-relaxed">
                  <code>{selectedFile.content}</code>
                </pre>
              ) : (
                <p className="text-xs text-slate-400">Select a file to inspect its code.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
