"use client";

import { useCallback, useState, useEffect } from "react";
import { ChatKitPanel, type FactAction } from "@/components/ChatKitPanel";
import { useColorScheme } from "@/hooks/useColorScheme";
import { ThreadList } from "@/components/ThreadList";

export default function App() {
  const { scheme, setScheme } = useColorScheme();
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

  // Load userId and currentThreadId from localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      const storedUserId = localStorage.getItem("chatkit_user_id");
      if (storedUserId) {
        setUserId(storedUserId);
      } else {
        const newUserId =
          typeof window.crypto !== "undefined" &&
          typeof window.crypto.randomUUID === "function"
            ? window.crypto.randomUUID()
            : `user_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        localStorage.setItem("chatkit_user_id", newUserId);
        setUserId(newUserId);
      }
      const storedThreadId = localStorage.getItem("current_thread_id");
      if (storedThreadId) {
        setCurrentThreadId(storedThreadId);
      }
    }
  }, []);

  const handleNewThread = useCallback(() => {
    setCurrentThreadId(null);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("current_thread_id");
    }
    // No reload — ChatKitPanel will call setThreadId(null) and ChatKit starts a new thread
  }, []);

  const handleSelectThread = useCallback((threadId: string) => {
    setCurrentThreadId(threadId);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("current_thread_id", threadId);
    }
    // ChatKitPanel receives selectedThreadId and calls setThreadId(thread.chatkitThreadId) so that thread loads
  }, []);

  return (
    <main className="h-screen w-screen flex flex-col overflow-hidden bg-gradient-to-br from-blue-900 via-blue-800 to-indigo-900 dark:from-slate-900 dark:via-blue-900 dark:to-indigo-900">
      {/* Sleek Header with Logos */}
      <header className="flex-shrink-0 px-6 py-4 bg-gradient-to-r from-blue-900/90 via-blue-800/90 to-indigo-900/90 backdrop-blur-sm border-b border-blue-700/30 dark:border-blue-600/20">
        <div className="max-w-full mx-auto flex items-center justify-between">
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

      {/* Main Content Area - Sidebar + Chat */}
      <div className="flex-1 overflow-hidden flex">
        {/* Left Sidebar - Thread List */}
        {userId && (
          <ThreadList
            userId={userId}
            currentThreadId={currentThreadId}
            onSelectThread={handleSelectThread}
            onNewThread={handleNewThread}
          />
        )}

        {/* Right Side - Chat Panel */}
        <div className="flex-1 overflow-hidden p-4 md:p-6">
          <div className="h-full max-w-7xl mx-auto">
            <ChatKitPanel
              theme={scheme}
              selectedThreadId={currentThreadId}
              onCurrentThreadChange={setCurrentThreadId}
              onWidgetAction={handleWidgetAction}
              onResponseEnd={handleResponseEnd}
              onThemeRequest={setScheme}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
