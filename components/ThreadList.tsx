"use client";

import { useEffect, useState } from "react";
import type { ChatThread } from "@/lib/storage";
import { threadStorage } from "@/lib/storage";

interface ThreadListProps {
  userId: string;
  currentThreadId: string | null;
  onSelectThread: (threadId: string) => void;
  onNewThread: () => void;
  isOpen: boolean;
  onClose: () => void;
}

export function ThreadList({
  userId,
  currentThreadId,
  onSelectThread,
  onNewThread,
  isOpen,
  onClose,
}: ThreadListProps) {
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (isOpen && userId) {
      loadThreads();
    }
  }, [isOpen, userId]);

  const loadThreads = async () => {
    setIsLoading(true);
    try {
      const userThreads = await threadStorage.getUserThreads(userId);
      setThreads(userThreads);
    } catch (error) {
      console.error("[ThreadList] Failed to load threads:", error);
    } finally {
      setIsLoading(false);
    }
  };

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

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-40"
        onClick={onClose}
      />
      
      {/* Sidebar */}
      <div className="fixed left-0 top-0 bottom-0 w-80 bg-white dark:bg-slate-800 shadow-2xl z-50 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Chat History
            </h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
          <button
            onClick={() => {
              onNewThread();
              onClose();
            }}
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
                  onClick={() => {
                    onSelectThread(thread.threadId);
                    onClose();
                  }}
                  className={`p-3 mb-2 rounded-lg cursor-pointer transition-colors ${
                    thread.threadId === currentThreadId
                      ? "bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800"
                      : "bg-gray-50 dark:bg-slate-700 hover:bg-gray-100 dark:hover:bg-slate-600"
                  }`}
                >
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
                    <button
                      onClick={(e) => handleDeleteThread(thread.threadId, e)}
                      className="ml-2 text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
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
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
