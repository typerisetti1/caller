import React, {useState} from 'react';
import {Download, Share, WifiOff, X} from 'lucide-react';
import {useOnlineStatus, usePWAInstall} from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  compact?: boolean;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({compact = false}) => {
  const {isInstallable, isInstalled, isIOS, install} = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={() => void install()}
        className={`inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white font-medium text-slate-800 transition-colors hover:bg-slate-50 active:scale-[0.98] whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0D7A5F] ${
          compact ? 'min-h-[44px] px-3 text-xs' : 'min-h-[44px] px-4 text-sm'
        }`}
      >
        <Download className="h-4 w-4 text-[#0D7A5F]" aria-hidden="true" />
        <span>{compact ? 'Install' : 'Install Android App'}</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className={`inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white font-medium text-slate-800 transition-colors hover:bg-slate-50 active:scale-[0.98] whitespace-nowrap shrink-0 ${
            compact ? 'min-h-[44px] px-3 text-xs' : 'min-h-[44px] px-4 text-sm'
          }`}
        >
          <Share className="h-4 w-4 text-[#0D7A5F]" aria-hidden="true" />
          <span>Install App</span>
        </button>

        {showIOSGuide && (
          <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/50 backdrop-blur-xs p-0 sm:p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ios-install-title"
          >
            <div className="w-full sm:max-w-sm rounded-t-3xl sm:rounded-2xl bg-white p-6 shadow-xl border border-slate-200">
              <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-slate-300 sm:hidden" />
              <div className="flex items-center justify-between gap-4">
                <h3 id="ios-install-title" className="text-lg font-bold text-slate-900">
                  Add DialFlow to Home Screen
                </h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  aria-label="Close install instructions"
                  className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <ol className="mt-4 space-y-3 text-sm leading-relaxed text-slate-600 list-decimal pl-5">
                <li>
                  Tap the <strong className="text-slate-900">Share</strong> button in your browser
                  toolbar.
                </li>
                <li>
                  Scroll down and tap <strong className="text-slate-900">Add to Home Screen</strong>.
                </li>
                <li>
                  Launch <strong className="text-slate-900">DialFlow</strong> anytime like a native
                  mobile app.
                </li>
              </ol>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-6 w-full min-h-[44px] rounded-xl bg-slate-900 px-4 text-sm font-medium text-white transition-colors hover:bg-slate-800"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-20 lg:bottom-5 left-4 right-4 sm:right-auto z-50 flex items-center gap-2.5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-xs font-medium text-amber-950 shadow-sm"
    >
      <WifiOff className="h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
      <span>Offline mode — Calling list &amp; native dialer stay ready; AI voice requires internet.</span>
    </div>
  );
};
