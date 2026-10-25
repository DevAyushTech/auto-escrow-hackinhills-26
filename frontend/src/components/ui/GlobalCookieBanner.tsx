"use client";

import { useState, useEffect } from "react";
import { Cookie, X } from "lucide-react";
import Link from "next/link";

export function GlobalCookieBanner() {
  const [showBanner, setShowBanner] = useState(false);

  // Check if user already consented when the component loads
  useEffect(() => {
    const consent = localStorage.getItem("ae-cookie-consent");
    if (!consent) {
      setShowBanner(true);
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem("ae-cookie-consent", "accepted");
    setShowBanner(false);
  };

  if (!showBanner) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 w-[calc(100%-3rem)] md:w-[400px] bg-white dark:bg-[#12121a]/95 backdrop-blur-2xl border border-zinc-200 dark:border-white/10 rounded-2xl p-6 shadow-2xl animate-in slide-in-from-bottom-10 fade-in duration-500">
      <button 
        onClick={() => setShowBanner(false)}
        className="absolute top-4 right-4 text-zinc-400 hover:text-black dark:hover:text-white transition-colors"
      >
        <X size={16} />
      </button>
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 bg-blue-100 dark:bg-blue-500/10 rounded-full text-blue-600 dark:text-blue-400">
          <Cookie size={18} />
        </div>
        <h3 className="font-bold text-zinc-900 dark:text-white text-sm">Cookie Preferences</h3>
      </div>
      <p className="text-xs text-zinc-500 dark:text-zinc-400 font-light mb-6 leading-relaxed">
        We use strictly necessary cookies to keep your sessions secure. We also use optional analytics cookies to measure protocol performance. 
      </p>
      <div className="flex items-center gap-3">
        <button 
          onClick={handleAccept}
          className="flex-1 bg-zinc-900 text-white dark:bg-white dark:text-black py-2.5 rounded-xl text-xs font-bold hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors shadow-lg"
        >
          Accept All
        </button>
        <Link 
          href="/settings"
          onClick={() => setShowBanner(false)}
          className="flex-1 text-center bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10 text-zinc-900 dark:text-white py-2.5 rounded-xl text-xs font-bold hover:bg-zinc-200 dark:hover:bg-white/10 transition-colors"
        >
          Manage
        </Link>
      </div>
    </div>
  );
}