# Storage Migration Guide

## Current Implementation: Browser Storage (localStorage)

The app currently uses `LocalStorageThreadStorage` which stores chat threads in the browser's localStorage.

## Migration to Database

To migrate to a database (e.g., DynamoDB), follow these steps:

### Step 1: Create Database Storage Implementation

Create `lib/storage/database.ts`:

```typescript
import type { ChatThread, ThreadStorage } from "./types";

export class DatabaseThreadStorage implements ThreadStorage {
  async saveThread(thread: ChatThread): Promise<void> {
    // Call your API endpoint: POST /api/threads
    await fetch("/api/threads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(thread),
    });
  }

  async getThread(threadId: string): Promise<ChatThread | null> {
    const response = await fetch(`/api/threads/${threadId}`);
    return response.json();
  }

  async getUserThreads(userId: string): Promise<ChatThread[]> {
    const response = await fetch(`/api/threads?userId=${userId}`);
    return response.json();
  }

  async deleteThread(threadId: string): Promise<void> {
    await fetch(`/api/threads/${threadId}`, { method: "DELETE" });
  }

  async updateThread(threadId: string, updates: Partial<ChatThread>): Promise<void> {
    await fetch(`/api/threads/${threadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
  }
}
```

### Step 2: Update Storage Export

In `lib/storage/index.ts`, change:

```typescript
// OLD:
export { threadStorage } from "./localStorage";

// NEW:
export { threadStorage } from "./database";
```

### Step 3: Create API Endpoints

Create Next.js API routes:
- `app/api/threads/route.ts` - GET (list), POST (create)
- `app/api/threads/[threadId]/route.ts` - GET, PATCH, DELETE

### Step 4: That's It!

All components use the `ThreadStorage` interface, so no other code changes are needed.

## Data Structure

The `ChatThread` interface is designed to work with both localStorage and databases:

```typescript
interface ChatThread {
  threadId: string;        // Primary key
  userId: string;          // User identifier
  title: string;          // Conversation title
  createdAt: number;      // Timestamp
  lastMessageAt: number;  // Timestamp
  lastMessagePreview?: string;
  workflowId: string;
}
```

## Benefits of This Approach

1. **Zero Component Changes** - All UI components use the same interface
2. **Easy Testing** - Can switch between storage implementations
3. **Gradual Migration** - Can support both storage types during transition
4. **Type Safety** - TypeScript ensures interface compliance
