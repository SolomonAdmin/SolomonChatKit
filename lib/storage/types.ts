/**
 * Thread metadata stored for chat history
 */
export interface ChatThread {
  threadId: string;
  userId: string;
  title: string;
  createdAt: number; // timestamp
  lastMessageAt: number; // timestamp
  lastMessagePreview?: string;
  workflowId: string;
}

/**
 * Storage interface - swap implementations easily
 */
export interface ThreadStorage {
  saveThread(thread: ChatThread): Promise<void>;
  getThread(threadId: string): Promise<ChatThread | null>;
  getUserThreads(userId: string): Promise<ChatThread[]>;
  deleteThread(threadId: string): Promise<void>;
  updateThread(threadId: string, updates: Partial<ChatThread>): Promise<void>;
}
