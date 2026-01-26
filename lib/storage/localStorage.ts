import type { ChatThread, ThreadStorage } from "./types";

const STORAGE_KEY_PREFIX = "chatkit_thread_";
const USER_THREADS_KEY = "chatkit_user_threads";

/**
 * Browser localStorage implementation
 * Easy to swap out for database later
 */
export class LocalStorageThreadStorage implements ThreadStorage {
  private getStorageKey(threadId: string): string {
    return `${STORAGE_KEY_PREFIX}${threadId}`;
  }

  async saveThread(thread: ChatThread): Promise<void> {
    if (typeof window === "undefined") return;
    
    try {
      console.log("[LocalStorage] Saving thread:", {
        threadId: thread.threadId,
        userId: thread.userId,
        title: thread.title,
      });
      
      // Save thread data
      localStorage.setItem(this.getStorageKey(thread.threadId), JSON.stringify(thread));
      
      // Update user's thread list
      const userThreads = await this.getUserThreads(thread.userId);
      const existingIndex = userThreads.findIndex(t => t.threadId === thread.threadId);
      
      if (existingIndex >= 0) {
        userThreads[existingIndex] = thread;
      } else {
        userThreads.push(thread);
      }
      
      // Sort by lastMessageAt descending (most recent first)
      userThreads.sort((a, b) => b.lastMessageAt - a.lastMessageAt);
      
      // Store user's thread list
      const userThreadsKey = `${USER_THREADS_KEY}_${thread.userId}`;
      localStorage.setItem(userThreadsKey, JSON.stringify(userThreads.map(t => t.threadId)));
      
      console.log("[LocalStorage] Thread saved, user now has", userThreads.length, "threads");
    } catch (error) {
      console.error("[LocalStorage] Failed to save thread:", error);
      // Handle quota exceeded or other errors gracefully
    }
  }

  async getThread(threadId: string): Promise<ChatThread | null> {
    if (typeof window === "undefined") return null;
    
    try {
      const data = localStorage.getItem(this.getStorageKey(threadId));
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error("[LocalStorage] Failed to get thread:", error);
      return null;
    }
  }

  async getUserThreads(userId: string): Promise<ChatThread[]> {
    if (typeof window === "undefined") return [];
    
    try {
      const userThreadsKey = `${USER_THREADS_KEY}_${userId}`;
      console.log("[LocalStorage] Getting threads for userId:", userId, "key:", userThreadsKey);
      
      const threadIdsJson = localStorage.getItem(userThreadsKey);
      
      if (!threadIdsJson) {
        console.log("[LocalStorage] No thread list found for userId:", userId);
        return [];
      }
      
      const threadIds: string[] = JSON.parse(threadIdsJson);
      console.log("[LocalStorage] Found thread IDs:", threadIds);
      
      const threads: ChatThread[] = [];
      
      for (const threadId of threadIds) {
        const thread = await this.getThread(threadId);
        if (thread) {
          threads.push(thread);
        } else {
          console.warn("[LocalStorage] Thread not found:", threadId);
        }
      }
      
      // Sort by lastMessageAt descending
      threads.sort((a, b) => b.lastMessageAt - a.lastMessageAt);
      
      console.log("[LocalStorage] Returning", threads.length, "threads");
      return threads;
    } catch (error) {
      console.error("[LocalStorage] Failed to get user threads:", error);
      return [];
    }
  }

  async deleteThread(threadId: string): Promise<void> {
    if (typeof window === "undefined") return;
    
    try {
      // Get thread to find userId
      const thread = await this.getThread(threadId);
      if (!thread) return;
      
      // Remove thread data
      localStorage.removeItem(this.getStorageKey(threadId));
      
      // Update user's thread list
      const userThreads = await this.getUserThreads(thread.userId);
      const updatedThreads = userThreads.filter(t => t.threadId !== threadId);
      
      const userThreadsKey = `${USER_THREADS_KEY}_${thread.userId}`;
      if (updatedThreads.length === 0) {
        localStorage.removeItem(userThreadsKey);
      } else {
        localStorage.setItem(userThreadsKey, JSON.stringify(updatedThreads.map(t => t.threadId)));
      }
    } catch (error) {
      console.error("[LocalStorage] Failed to delete thread:", error);
    }
  }

  async updateThread(threadId: string, updates: Partial<ChatThread>): Promise<void> {
    if (typeof window === "undefined") return;
    
    try {
      const thread = await this.getThread(threadId);
      if (!thread) return;
      
      const updatedThread: ChatThread = {
        ...thread,
        ...updates,
      };
      
      await this.saveThread(updatedThread);
    } catch (error) {
      console.error("[LocalStorage] Failed to update thread:", error);
    }
  }
}

// Export singleton instance
export const threadStorage: ThreadStorage = new LocalStorageThreadStorage();
