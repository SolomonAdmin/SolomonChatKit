/**
 * Storage abstraction - easy to swap implementations
 * 
 * To migrate to database later:
 * 1. Create lib/storage/database.ts implementing ThreadStorage
 * 2. Change the export here to use database storage
 * 3. That's it! All components use the same interface
 */

export { threadStorage } from "./localStorage";
export type { ChatThread, ThreadStorage } from "./types";

// Future: Swap to database storage like this:
// export { threadStorage } from "./database";
