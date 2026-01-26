"use client";

import { useEffect, useState, useCallback } from "react";
import type { ChatThread } from "@/lib/storage";
import { threadStorage } from "@/lib/storage";

interface ThreadListProps {
  userId: string;
  currentThreadId: string | null;
  onSelectThread: (threadId: string) => void;
  onNewThread: () => void;
}

export function ThreadList({
  userId,
  currentThreadId,
  onSelectThread,
  onNewThread,
}: ThreadListProps) {
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingThreadId, setEditingThreadId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

  const loadThreads = useCallback(async () => {
    if (!userId) return;
    setIsLoading(true);
    try {
      const userThreads = await threadStorage.getUserThreads(userId);
      setThreads(userThreads);
    } catch (error) {
      console.error("[ThreadList] Failed to load threads:", error);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (userId) {
      loadThreads();
    }
  }, [userId, currentThreadId, loadThreads]); // Reload when current thread changes

  // Listen for storage events and thread updates to auto-refresh
  useEffect(() => {
    if (!userId) return;

    let refreshTimeout: NodeJS.Timeout | null = null;

    const handleStorageChange = () => {
      // Debounce rapid updates
      if (refreshTimeout) clearTimeout(refreshTimeout);
      refreshTimeout = setTimeout(() => {
        loadThreads();
      }, 300);
    };

    const handleThreadUpdate = () => {
      // Debounce rapid updates
      if (refreshTimeout) clearTimeout(refreshTimeout);
      refreshTimeout = setTimeout(() => {
        loadThreads();
      }, 300);
    };

    const handleVisibilityChange = () => {
      // Refresh when page becomes visible (user switches back to tab)
      if (document.visibilityState === "visible") {
        loadThreads();
      }
    };

    // Listen to storage events (when localStorage changes in other tabs)
    window.addEventListener("storage", handleStorageChange);
    // Listen to custom thread update events (same window)
    window.addEventListener("threadUpdated", handleThreadUpdate);
    // Refresh when tab becomes visible
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Periodic refresh as fallback (every 5 seconds)
    const intervalId = setInterval(() => {
      loadThreads();
    }, 5000);

    return () => {
      if (refreshTimeout) clearTimeout(refreshTimeout);
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener("threadUpdated", handleThreadUpdate);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      clearInterval(intervalId);
    };
  }, [userId, loadThreads]);

  const handleDeleteThread = async (threadId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("Delete this conversation?")) {
      await threadStorage.deleteThread(threadId);
      await loadThreads();
      if (threadId === currentThreadId) {
        onNewThread();
      }
    }
  };

  const handleStartRename = (thread: ChatThread, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingThreadId(thread.threadId);
    setEditTitle(thread.title);
  };

  const handleSaveRename = async (threadId: string, e?: React.FormEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    
    if (editTitle.trim()) {
      await threadStorage.updateThread(threadId, { title: editTitle.trim() });
      await loadThreads();
    }
    setEditingThreadId(null);
    setEditTitle("");
  };

  const handleCancelRename = () => {
    setEditingThreadId(null);
    setEditTitle("");
  };

  const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="h-full w-80 bg-white dark:bg-slate-800 border-r border-gray-200 dark:border-gray-700 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
          Chat History
        </h2>
        <button
          onClick={onNewThread}
          className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
        >
          + New Chat
        </button>
      </div>

      {/* Thread List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-4 text-center text-gray-500 dark:text-gray-400">
            Loading...
          </div>
        ) : threads.length === 0 ? (
          <div className="p-4 text-center text-gray-500 dark:text-gray-400">
            No conversations yet
          </div>
        ) : (
          <div className="p-2">
            {threads.map((thread) => (
              <div
                key={thread.threadId}
                onClick={() => onSelectThread(thread.threadId)}
                className={`p-3 mb-2 rounded-lg cursor-pointer transition-colors ${
                  thread.threadId === currentThreadId
                    ? "bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800"
                    : "bg-gray-50 dark:bg-slate-700 hover:bg-gray-100 dark:hover:bg-slate-600"
                }`}
              >
                {editingThreadId === thread.threadId ? (
                  // Edit mode
                  <form
                    onSubmit={(e) => handleSaveRename(thread.threadId, e)}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      onBlur={() => handleSaveRename(thread.threadId)}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") {
                          handleCancelRename();
                        }
                      }}
                      autoFocus
                      className="w-full px-2 py-1 text-sm border border-blue-500 rounded bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </form>
                ) : (
                  // View mode
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate">
                        {thread.title}
                      </div>
                      {thread.lastMessagePreview && (
                        <div className="text-xs text-gray-500 dark:text-gray-400 truncate mt-1">
                          {thread.lastMessagePreview}
                        </div>
                      )}
                      <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                        {formatDate(thread.lastMessageAt)}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 ml-2">
                      <button
                        onClick={(e) => handleStartRename(thread, e)}
                        className="text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors p-1"
                        title="Rename conversation"
                      >
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                          />
                        </svg>
                      </button>
                      <button
                        onClick={(e) => handleDeleteThread(thread.threadId, e)}
                        className="text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors p-1"
                        title="Delete conversation"
                      >
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
