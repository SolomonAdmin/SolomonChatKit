"use client";

import { useCallback, useState, useEffect } from "react";
import { ChatKitPanel, type FactAction } from "@/components/ChatKitPanel";
import { useColorScheme } from "@/hooks/useColorScheme";
import { ThreadList } from "@/components/ThreadList";

export default function App() {
  const { scheme, setScheme } = useColorScheme();
  const [showThreadList, setShowThreadList] = useState(false);
  const [currentThreadId, setCurrentThreadId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const handleWidgetAction = useCallback(async (action: FactAction) => {
    if (process.env.NODE_ENV !== "production") {
      console.info("[ChatKitPanel] widget action", action);
    }
  }, []);

  const handleResponseEnd = useCallback(() => {
    if (process.env.NODE_ENV !== "production") {
      console.debug("[ChatKitPanel] response end");
    }
  }, []);

  // Load userId from localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      const storedUserId = localStorage.getItem("chatkit_user_id");
      if (storedUserId) {
        setUserId(storedUserId);
      }
    }
  }, []);

  const handleNewThread = useCallback(() => {
    setCurrentThreadId(null);
    // Force chat reset by reloading or using a key
    window.location.reload();
  }, []);

  const handleSelectThread = useCallback((threadId: string) => {
    setCurrentThreadId(threadId);
    // Note: ChatKit manages threads internally via session IDs
    // For now, we'll need to reload to start fresh - can enhance later
    window.location.reload();
  }, []);

  return (
    <main className="h-screen w-screen flex flex-col overflow-hidden bg-gradient-to-br from-blue-900 via-blue-800 to-indigo-900 dark:from-slate-900 dark:via-blue-900 dark:to-indigo-900">
      {/* Sleek Header with Logos */}
      <header className="flex-shrink-0 px-6 py-4 bg-gradient-to-r from-blue-900/90 via-blue-800/90 to-indigo-900/90 backdrop-blur-sm border-b border-blue-700/30 dark:border-blue-600/20">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          {/* Left: Solomon Consulting Group Logo */}
          <div className="flex items-center gap-3">
            {/* TODO: Replace with actual Solomon logo image */}
            {/* <Image src="/logos/solomon-logo.png" alt="Solomon Consulting Group" width={40} height={40} className="h-10 w-auto" /> */}
            <div className="w-10 h-10 rounded-lg bg-white/10 backdrop-blur-sm flex items-center justify-center border border-white/20 shadow-lg">
              <span className="text-white font-bold text-xl">S</span>
            </div>
            <div className="text-white/90 text-sm font-medium hidden sm:block">
              <div className="font-semibold">Solomon</div>
              <div className="text-xs text-white/70">Consulting Group</div>
            </div>
          </div>

          {/* Center: Title */}
          <div className="flex-1 text-center">
            <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-white via-blue-100 to-white bg-clip-text text-transparent drop-shadow-lg">
              Workato Genie Helper
            </h1>
          </div>

          {/* Right: Workato Logo */}
          <div className="flex items-center gap-3">
            <div className="text-white/90 text-sm font-bold tracking-wider hidden sm:block">
              Workato
            </div>
            {/* TODO: Replace with actual Workato logo image */}
            {/* <Image src="/logos/workato-logo.png" alt="Workato" width={40} height={40} className="h-10 w-auto" /> */}
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-white/20 to-white/10 backdrop-blur-sm flex items-center justify-center border border-white/20 shadow-lg">
              <span className="text-white font-bold text-lg">W</span>
            </div>
          </div>
        </div>
      </header>

      {/* Chat Panel - Full Height, No Wasted Space */}
      <div className="flex-1 overflow-hidden p-4 md:p-6">
        <div className="h-full max-w-7xl mx-auto">
          <ChatKitPanel
            theme={scheme}
            onWidgetAction={handleWidgetAction}
            onResponseEnd={handleResponseEnd}
            onThemeRequest={setScheme}
            onShowThreadList={() => setShowThreadList(true)}
          />
        </div>
      </div>

      {/* Thread List Sidebar */}
      {userId && (
        <ThreadList
          userId={userId}
          currentThreadId={currentThreadId}
          onSelectThread={handleSelectThread}
          onNewThread={handleNewThread}
          isOpen={showThreadList}
          onClose={() => setShowThreadList(false)}
        />
      )}
    </main>
  );
}
