"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { ChatKit, useChatKit } from "@openai/chatkit-react";
import {
  STARTER_PROMPTS,
  PLACEHOLDER_INPUT,
  GREETING,
  CREATE_SESSION_ENDPOINT,
  WORKFLOW_ID,
  getThemeConfig,
} from "@/lib/config";
import { ErrorOverlay } from "./ErrorOverlay";
import type { ColorScheme } from "@/hooks/useColorScheme";
import { parseWidgetFromText, WidgetRenderer } from "./WidgetRenderer";
import { threadStorage } from "@/lib/storage";
import type { ChatThread } from "@/lib/storage";

export type FactAction = {
  type: "save";
  factId: string;
  factText: string;
};

type ChatKitPanelProps = {
  theme: ColorScheme;
  onWidgetAction: (action: FactAction) => Promise<void>;
  onResponseEnd: () => void;
  onThemeRequest: (scheme: ColorScheme) => void;
};

type ErrorState = {
  script: string | null;
  session: string | null;
  integration: string | null;
  retryable: boolean;
};

const isBrowser = typeof window !== "undefined";
const isDev = process.env.NODE_ENV !== "production";

/** Recursively query selector inside root and all nested shadow roots */
function queryAllIncludingShadow(root: Element, selector: string): Element[] {
  const out: Element[] = [];
  try {
    root.querySelectorAll(selector).forEach((el) => out.push(el));
    const sr = (root as Element & { shadowRoot?: ShadowRoot }).shadowRoot;
    if (sr) {
      sr.querySelectorAll(selector).forEach((el) => out.push(el));
      sr.querySelectorAll("*").forEach((child) => {
        queryAllIncludingShadow(child, selector).forEach((el) => out.push(el));
      });
    }
  } catch {
    // ignore
  }
  return out;
}

/** Recursively append style into root and every nested shadow root */
function injectStyleIntoShadowRoots(root: Element, css: string): void {
  const style = document.createElement("style");
  style.textContent = css;
  root.appendChild(style);
  const sr = (root as Element & { shadowRoot?: ShadowRoot }).shadowRoot;
  if (sr) {
    const s = document.createElement("style");
    s.textContent = css;
    sr.appendChild(s);
    sr.querySelectorAll("*").forEach((child) => {
      if ((child as Element & { shadowRoot?: ShadowRoot }).shadowRoot) {
        injectStyleIntoShadowRoots(child, css);
      }
    });
  }
}

const createInitialErrors = (): ErrorState => ({
  script: null,
  session: null,
  integration: null,
  retryable: false,
});

export function ChatKitPanel({
  theme,
  onWidgetAction,
  onResponseEnd,
  onThemeRequest,
}: ChatKitPanelProps) {
  const processedFacts = useRef(new Set<string>());
  const [errors, setErrors] = useState<ErrorState>(() => createInitialErrors());
  const [isInitializingSession, setIsInitializingSession] = useState(true);
  const isMountedRef = useRef(true);
  const [scriptStatus, setScriptStatus] = useState<
    "pending" | "ready" | "error"
  >(() =>
    isBrowser && window.customElements?.get("openai-chatkit")
      ? "ready"
      : "pending"
  );
  const [widgetInstanceKey, setWidgetInstanceKey] = useState(0);
  const [workflowId] = useState<string>(WORKFLOW_ID);
  const [currentThreadId, setCurrentThreadId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const firstMessageRef = useRef<string | null>(null);

  const setErrorState = useCallback((updates: Partial<ErrorState>) => {
    setErrors((current) => ({ ...current, ...updates }));
  }, []);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Load userId from localStorage or generate new one
  useEffect(() => {
    if (!isBrowser) return;
    
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
  }, []);

  // Add event listeners for ChatKit widget events
  useEffect(() => {
    if (!isBrowser) {
      return;
    }

    // Listen for widget-related events from ChatKit
    const handleWidgetEvent = (event: Event) => {
      const customEvent = event as CustomEvent;
      if (process.env.NODE_ENV !== "production") {
        console.info("[ChatKitPanel] Widget event received", {
          type: event.type,
          detail: customEvent.detail,
        });
      }
    };

    // Listen for tool-related events
    const handleToolEvent = (event: Event) => {
      const customEvent = event as CustomEvent;
      if (process.env.NODE_ENV !== "production") {
        console.info("[ChatKitPanel] Tool event received", {
          type: event.type,
          detail: customEvent.detail,
        });
      }
    };

    // Listen for message events that might contain widget data
    const handleMessageEvent = (event: Event) => {
      const customEvent = event as CustomEvent;
      if (process.env.NODE_ENV !== "production") {
        console.info("[ChatKitPanel] Message event received", {
          type: event.type,
          detail: customEvent.detail,
        });
      }
      
      // Try to extract user message from event detail
      const detail = customEvent.detail;
      if (detail && typeof detail === "object") {
        const detailObj = detail as Record<string, unknown>;
        const role = (detailObj.role as string | undefined) || (detailObj.messageRole as string | undefined);
        const content = (detailObj.content as string | undefined) || 
                       (detailObj.text as string | undefined) || 
                       (detailObj.message as string | undefined);
        
        if (role === "user" && content && typeof content === "string" && content.trim()) {
          // Update thread title from message event
          const storedThreadId = currentThreadId || 
            (typeof window !== "undefined" ? localStorage.getItem("current_thread_id") : null);
          
          if (storedThreadId && !firstMessageRef.current) {
            firstMessageRef.current = content;
            const title = content.length > 50 ? content.slice(0, 50) + "..." : content;
            
            threadStorage.updateThread(storedThreadId, {
              title: title,
              lastMessagePreview: content.slice(0, 100),
              lastMessageAt: Date.now(),
            }).then(() => {
              if (typeof window !== "undefined") {
                window.dispatchEvent(new Event("storage"));
                window.dispatchEvent(new CustomEvent("threadUpdated", { detail: { threadId: storedThreadId } }));
              }
            }).catch(err => {
              if (isDev) console.error("[ChatKitPanel] Failed to update thread from message event:", err);
            });
          }
        }
      }
    };

    // Add event listeners for various ChatKit events
    window.addEventListener("chatkit-widget", handleWidgetEvent);
    window.addEventListener("chatkit-tool-result", handleToolEvent);
    window.addEventListener("chatkit-message", handleMessageEvent);
    window.addEventListener("chatkit-thread-item", handleMessageEvent);

    return () => {
      window.removeEventListener("chatkit-widget", handleWidgetEvent);
      window.removeEventListener("chatkit-tool-result", handleToolEvent);
      window.removeEventListener("chatkit-message", handleMessageEvent);
      window.removeEventListener("chatkit-thread-item", handleMessageEvent);
    };
  }, [currentThreadId]); // Add currentThreadId as dependency

  useEffect(() => {
    if (!isBrowser) {
      return;
    }

    let timeoutId: number | undefined;

    const handleLoaded = () => {
      if (!isMountedRef.current) {
        return;
      }
      setScriptStatus("ready");
      setErrorState({ script: null });
    };

    const handleError = (event: Event) => {
      console.error("Failed to load chatkit.js for some reason", event);
      if (!isMountedRef.current) {
        return;
      }
      setScriptStatus("error");
      const detail = (event as CustomEvent<unknown>)?.detail ?? "unknown error";
      setErrorState({ script: `Error: ${detail}`, retryable: false });
      setIsInitializingSession(false);
    };

    window.addEventListener("chatkit-script-loaded", handleLoaded);
    window.addEventListener(
      "chatkit-script-error",
      handleError as EventListener
    );

    if (window.customElements?.get("openai-chatkit")) {
      handleLoaded();
    } else if (scriptStatus === "pending") {
      timeoutId = window.setTimeout(() => {
        if (!window.customElements?.get("openai-chatkit")) {
          handleError(
            new CustomEvent("chatkit-script-error", {
              detail:
                "ChatKit web component is unavailable. Verify that the script URL is reachable.",
            })
          );
        }
      }, 5000);
    }

    return () => {
      window.removeEventListener("chatkit-script-loaded", handleLoaded);
      window.removeEventListener(
        "chatkit-script-error",
        handleError as EventListener
      );
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [scriptStatus, setErrorState]);

  const isWorkflowConfigured = Boolean(
    workflowId && !workflowId.startsWith("wf_replace")
  );

  useEffect(() => {
    if (!isWorkflowConfigured && isMountedRef.current) {
      setErrorState({
        session: "Missing Workflow ID. Please configure it in Settings.",
        retryable: false,
      });
      setIsInitializingSession(false);
    }
  }, [isWorkflowConfigured, setErrorState]);

  const handleResetChat = useCallback(() => {
    processedFacts.current.clear();
    // Clear current thread ID when resetting
    setCurrentThreadId(null);
    firstMessageRef.current = null;
    if (typeof window !== "undefined") {
      localStorage.removeItem("current_thread_id");
    }
    if (isBrowser) {
      setScriptStatus(
        window.customElements?.get("openai-chatkit") ? "ready" : "pending"
      );
    }
    setIsInitializingSession(true);
    setErrors(createInitialErrors());
    setWidgetInstanceKey((prev) => prev + 1);
  }, []);


  const getClientSecret = useCallback(
    async (currentSecret: string | null) => {
      if (isDev) {
        console.info("[ChatKitPanel] getClientSecret invoked", {
          currentSecretPresent: Boolean(currentSecret),
          workflowId: workflowId,
          endpoint: CREATE_SESSION_ENDPOINT,
        });
      }

      if (!isWorkflowConfigured) {
        const detail =
          "Missing Workflow ID. Please configure it in Settings.";
        if (isMountedRef.current) {
          setErrorState({ session: detail, retryable: false });
          setIsInitializingSession(false);
        }
        throw new Error(detail);
      }

      if (isMountedRef.current) {
        if (!currentSecret) {
          setIsInitializingSession(true);
        }
        setErrorState({ session: null, integration: null, retryable: false });
      }

      try {
        // Use stored userId or generate new one
        const currentUserId = userId || 
          (typeof window !== "undefined" &&
          typeof window.crypto !== "undefined" &&
          typeof window.crypto.randomUUID === "function"
            ? window.crypto.randomUUID()
            : `user_${Date.now()}_${Math.random().toString(36).slice(2)}`);
        
        if (!userId && currentUserId) {
          localStorage.setItem("chatkit_user_id", currentUserId);
          setUserId(currentUserId);
        }

        // New conversation = no stored thread id (e.g. user clicked "+ New Chat" or first visit)
        let threadId = currentThreadId;
        let isNewConversation = false;
        if (typeof window !== "undefined") {
          const storedThreadId = localStorage.getItem("current_thread_id");
          if (storedThreadId) {
            threadId = storedThreadId;
          } else {
            threadId = `thread_${Date.now()}_${Math.random().toString(36).slice(2)}`;
            isNewConversation = true;
          }
        } else if (!threadId) {
          threadId = `thread_${Date.now()}_${Math.random().toString(36).slice(2)}`;
          isNewConversation = true;
        }
        
        setCurrentThreadId(threadId);
        if (typeof window !== "undefined") {
          localStorage.setItem("current_thread_id", threadId);
        }
        firstMessageRef.current = null;

        const response = await fetch(CREATE_SESSION_ENDPOINT, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            user: userId,
            workflow: { id: workflowId },
            chatkit_configuration: {
              // enable attachments
              file_upload: {
                enabled: true,
              },
            },
          }),
        });

        const raw = await response.text();

        if (isDev) {
          console.info("[ChatKitPanel] createSession response", {
            status: response.status,
            ok: response.ok,
            bodyPreview: raw.slice(0, 1600),
          });
        }

        let data: Record<string, unknown> = {};
        if (raw) {
          try {
            data = JSON.parse(raw) as Record<string, unknown>;
          } catch (parseError) {
            console.error(
              "Failed to parse create-session response",
              parseError
            );
          }
        }

        if (!response.ok) {
          const detail = extractErrorDetail(data, response.statusText);
          console.error("Create session request failed", {
            status: response.status,
            body: data,
          });
          throw new Error(detail);
        }

        const clientSecret = data?.client_secret as string | undefined;
        if (!clientSecret) {
          throw new Error("Missing client secret in response");
        }

        // Save thread only for new conversations so it appears in left panel (use same userId as App)
        const uidForStorage = typeof window !== "undefined"
          ? (localStorage.getItem("chatkit_user_id") || currentUserId)
          : currentUserId;
        if (isNewConversation && threadId && uidForStorage) {
          const thread: ChatThread = {
            threadId,
            userId: uidForStorage,
            title: "New conversation",
            createdAt: Date.now(),
            lastMessageAt: Date.now(),
            workflowId: workflowId,
          };
          threadStorage.saveThread(thread).then(() => {
            if (typeof window !== "undefined") {
              window.dispatchEvent(new CustomEvent("threadUpdated", { detail: { threadId } }));
            }
          }).catch((err) => console.error("[ChatKitPanel] Failed to save thread:", err));
        }

        if (isMountedRef.current) {
          setErrorState({ session: null, integration: null });
        }

        return clientSecret;
      } catch (error) {
        console.error("Failed to create ChatKit session", error);
        const detail =
          error instanceof Error
            ? error.message
            : "Unable to start ChatKit session.";
        if (isMountedRef.current) {
          setErrorState({ session: detail, retryable: false });
        }
        throw error instanceof Error ? error : new Error(detail);
      } finally {
        if (isMountedRef.current && !currentSecret) {
          setIsInitializingSession(false);
        }
      }
    },
    [isWorkflowConfigured, setErrorState, workflowId, userId, currentThreadId]
  );

  const chatkit = useChatKit({
    api: { getClientSecret },
    theme: {
      colorScheme: theme,
      ...getThemeConfig(theme),
    },
    startScreen: {
      greeting: GREETING,
      prompts: STARTER_PROMPTS,
    },
    composer: {
      placeholder: PLACEHOLDER_INPUT,
      attachments: {
        // Enable attachments
        enabled: true,
      },
    },
    threadItemActions: {
      feedback: false,
    },
    onClientTool: async (invocation: {
      name: string;
      params: Record<string, unknown>;
    }) => {
      // Log all tool invocations for debugging widget support
      if (isDev) {
        console.info("[ChatKitPanel] Client tool invoked", {
          name: invocation.name,
          params: invocation.params,
        });
      }

      if (invocation.name === "switch_theme") {
        const requested = invocation.params.theme;
        if (requested === "light" || requested === "dark") {
          if (isDev) {
            console.debug("[ChatKitPanel] switch_theme", requested);
          }
          onThemeRequest(requested);
          return { success: true };
        }
        return { success: false };
      }

      if (invocation.name === "record_fact") {
        const id = String(invocation.params.fact_id ?? "");
        const text = String(invocation.params.fact_text ?? "");
        if (!id || processedFacts.current.has(id)) {
          return { success: true };
        }
        processedFacts.current.add(id);
        void onWidgetAction({
          type: "save",
          factId: id,
          factText: text.replace(/\s+/g, " ").trim(),
        });
        return { success: true };
      }

      return { success: false };
    },
    onResponseEnd: () => {
      if (isDev) {
        console.info("[ChatKitPanel] Response ended");
      }

      const tid = currentThreadId ?? (typeof window !== "undefined" ? localStorage.getItem("current_thread_id") : null);
      const uid = userId ?? (typeof window !== "undefined" ? localStorage.getItem("chatkit_user_id") : null);

      // Fallback: if we still don't have a title, scan DOM (including shadow) for user message
      if (tid && uid && !firstMessageRef.current && typeof window !== "undefined") {
        const runScan = () => {
          if (firstMessageRef.current) return;
          const root = document.querySelector("openai-chatkit");
          if (!root) return;
          const selectors = [
            '[class*="user"]', '[class*="User"]', '[class*="human"]',
            '[class*="message"]', '[class*="content"]', '[role="article"]',
            'p', '[data-role="user"]', 'div[class*="bubble"]', '[class*="turn"]',
          ];
          for (const sel of selectors) {
            const possible = queryAllIncludingShadow(root, sel);
            for (const el of possible) {
              const text = (el as HTMLElement).innerText?.trim() || (el as HTMLElement).textContent?.trim() || "";
              if (text.length < 6 || text.length > 400) continue;
              if (/^(Thought|Loading|Error|Yes\.|No\.)/i.test(text)) continue;
              if (/^(How can I|What can you|I can help)/i.test(text)) continue;
              firstMessageRef.current = text;
              const title = text.length > 50 ? text.slice(0, 50) + "…" : text;
              threadStorage.updateThread(tid, {
                title,
                lastMessagePreview: text.slice(0, 100),
                lastMessageAt: Date.now(),
              }).then(() => {
                window.dispatchEvent(new CustomEvent("threadUpdated", { detail: { threadId: tid } }));
              }).catch(() => {});
              return;
            }
          }
        };
        [800, 1500, 2500].forEach((ms) => setTimeout(runScan, ms));
      }

      if (tid) {
        threadStorage.updateThread(tid, { lastMessageAt: Date.now() }).then(() => {
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("threadUpdated", { detail: { threadId: tid } }));
          }
        }).catch(() => {});
      }

      onResponseEnd();
    },
    onResponseStart: () => {
      setErrorState({ integration: null, retryable: false });
    },
    onThreadChange: (event: { threadId: string | null }) => {
      processedFacts.current.clear();
      // Reset first message ref when thread changes
      firstMessageRef.current = null;

      const threadId = event.threadId;
      setCurrentThreadId(threadId);
      if (typeof window !== "undefined" && threadId) {
        localStorage.setItem("current_thread_id", threadId);
      } else if (typeof window !== "undefined") {
        localStorage.removeItem("current_thread_id");
      }
    },
    onError: ({ error }: { error: unknown }) => {
      // Check for domain verification errors
      const isDomainVerificationError =
        error instanceof Error &&
        (error.message.includes("DomainVerification") ||
          error.message.includes("domain verification") ||
          error.message.includes("401") ||
          error.name === "DomainVerificationRequestError");

      if (isDomainVerificationError) {
        const currentOrigin =
          typeof window !== "undefined"
            ? window.location.origin
            : "http://localhost:3000";
        const errorMessage = `Domain verification required. Please add "${currentOrigin}" to your OpenAI domain allowlist at: https://platform.openai.com/settings/organization/security/domain-allowlist`;
        
        console.error("[ChatKitPanel] Domain verification error:", error);
        console.error("[ChatKitPanel] Current origin:", currentOrigin);
        console.error(
          "[ChatKitPanel] Add this domain to allowlist:",
          currentOrigin
        );
        
        if (isMountedRef.current) {
          setErrorState({
            integration: errorMessage,
            retryable: true,
          });
        }
        return;
      }

      // Log other errors
      console.error("ChatKit error", error);
      
      // For other errors, still show them but allow retry
      if (error instanceof Error && isMountedRef.current) {
        setErrorState({
          integration: error.message,
          retryable: true,
        });
      }
    },
  });

  // Track user messages to update thread titles
  useEffect(() => {
    if (!isBrowser || !chatkit.control || !currentThreadId || !userId) {
      return;
    }

    const updateThreadFromMessage = async (messageText: string) => {
      if (!firstMessageRef.current && messageText.trim() && currentThreadId && userId) {
        firstMessageRef.current = messageText;
        const title = messageText.length > 50 ? messageText.slice(0, 50) + "..." : messageText;
        
        if (isDev) {
          console.log("[ChatKitPanel] Creating/updating thread from first message:", title);
        }
        
        // Check if thread exists, if not create it
        const existingThread = await threadStorage.getThread(currentThreadId);
        
        if (!existingThread) {
          // Create new thread
          const thread: ChatThread = {
            threadId: currentThreadId,
            userId: userId,
            title: title,
            createdAt: Date.now(),
            lastMessageAt: Date.now(),
            lastMessagePreview: messageText.slice(0, 100),
            workflowId: workflowId,
          };
          
          await threadStorage.saveThread(thread);
          if (isDev) {
            console.log("[ChatKitPanel] New thread created:", thread);
          }
        } else {
          // Update existing thread
          await threadStorage.updateThread(currentThreadId, {
            title: title,
            lastMessagePreview: messageText.slice(0, 100),
            lastMessageAt: Date.now(),
          });
        }
        
        // Dispatch storage event to notify ThreadList
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("storage"));
          window.dispatchEvent(new CustomEvent("threadUpdated", { detail: { threadId: currentThreadId } }));
        }
      }
    };

    // Watch for user messages in ChatKit - improved detection
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as Element;
            
            // Try multiple selectors to find user messages
            const selectors = [
              '[class*="user-message"]',
              '[class*="UserMessage"]',
              '[class*="message"][class*="user"]',
              '[data-role="user"]',
              '[data-message-role="user"]',
              '[aria-label*="user"]',
              // ChatKit specific selectors
              'div[class*="chatkit"][class*="message"]:not([class*="assistant"]):not([class*="system"])',
            ];
            
            for (const selector of selectors) {
              const userMessages = element.matches?.(selector) 
                ? [element] 
                : element.querySelectorAll?.(selector) || [];
              
              userMessages.forEach((msgEl) => {
                // Get text content, excluding buttons and icons
                const clone = msgEl.cloneNode(true) as Element;
                clone.querySelectorAll?.('button, svg, [class*="icon"], [class*="button"]').forEach(el => el.remove());
                const text = clone.textContent?.trim() || msgEl.textContent?.trim();
                
                if (text && text.length > 0 && text.length < 500) { // Reasonable message length
                  if (isDev) {
                    console.log("[ChatKitPanel] Found user message:", text.substring(0, 50));
                  }
                  updateThreadFromMessage(text);
                }
              });
            }
            
            // Also check if the element itself contains user message text
            if (element.textContent && element.textContent.trim().length > 0) {
              // Check if it's likely a user message (not assistant/system)
              const classes = element.className || '';
              const isNotAssistant = !classes.includes('assistant') && 
                                     !classes.includes('Assistant') &&
                                     !classes.includes('system') &&
                                     !classes.includes('System');
              
              if (isNotAssistant && element.textContent.trim().length < 500) {
                const text = element.textContent.trim();
                // Only update if it looks like a user message (not just UI text)
                if (text.length > 5 && !text.includes('Loading') && !text.includes('Error')) {
                  updateThreadFromMessage(text);
                }
              }
            }
          }
        });
      });
    });

    // Wait for ChatKit to render, then observe
    const startObserving = () => {
      const chatkitElement = document.querySelector("openai-chatkit");
      if (chatkitElement) {
        observer.observe(chatkitElement, {
          childList: true,
          subtree: true,
          characterData: true,
        });
        if (isDev) {
          console.log("[ChatKitPanel] Started observing for user messages");
        }
      } else {
        // Retry after a short delay
        setTimeout(startObserving, 500);
      }
    };

    startObserving();

    return () => {
      observer.disconnect();
    };
  }, [chatkit.control, currentThreadId, userId, workflowId]);

  // Widget rendering: Parse widget JSON from text messages and render widgets
  useEffect(() => {
    if (!isBrowser || !chatkit.control) {
      return;
    }

    const processedMessages = new WeakSet<Node>();

    const processMessageContent = (node: Node) => {
      // Skip if already processed
      if (processedMessages.has(node)) {
        return;
      }

      // Only process text nodes and elements containing text
      if (node.nodeType === Node.TEXT_NODE) {
        const textContent = node.textContent || "";
        const widgetData = parseWidgetFromText(textContent);

        if (widgetData) {
          if (isDev) {
            console.info("[ChatKitPanel] Found widget JSON in message", {
              widget: widgetData.widget,
              data: widgetData.data,
            });
          }

          // Find the parent element that contains this text
          let parent = node.parentElement;
          while (parent && !parent.classList.contains("chatkit-message-content")) {
            parent = parent.parentElement;
          }

          if (parent) {
            // Find the message content wrapper
            const messageContent = parent.querySelector(".chatkit-message-content") || 
                                   parent.querySelector('[class*="message"]') || 
                                   parent;
            
            // Create a container for the widget
            const widgetContainer = document.createElement("div");
            widgetContainer.className = "chatkit-custom-widget my-4";
            widgetContainer.setAttribute("data-widget-type", widgetData.widget);
            widgetContainer.setAttribute("data-widget-data", JSON.stringify(widgetData.data));

            // Render React component using createRoot
            try {
              const root = createRoot(widgetContainer);
              root.render(
                <WidgetRenderer
                  widget={widgetData.widget}
                  data={widgetData.data}
                />
              );
              
              // Replace the text content with the widget
              // Find the parent element containing the text and replace its content
              if (node.parentElement) {
                const textParent = node.parentElement;
                // Clear existing text and add widget
                textParent.innerHTML = "";
                textParent.appendChild(widgetContainer);
                processedMessages.add(widgetContainer);
                processedMessages.add(textParent);
              } else {
                // Fallback: append to message content
                messageContent.appendChild(widgetContainer);
                processedMessages.add(widgetContainer);
              }
            } catch (error) {
              if (isDev) {
                console.error("[ChatKitPanel] Failed to render widget:", error);
              }
              // Fallback: render as formatted JSON
              widgetContainer.innerHTML = `
                <div class="p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800">
                  <div class="text-sm font-semibold mb-2">Widget: ${widgetData.widget}</div>
                  <pre class="text-xs overflow-auto">${JSON.stringify(widgetData.data, null, 2)}</pre>
                </div>
              `;
              if (node.parentElement) {
                node.parentElement.innerHTML = "";
                node.parentElement.appendChild(widgetContainer);
              } else {
                messageContent.appendChild(widgetContainer);
              }
              processedMessages.add(widgetContainer);
            }
          }
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const element = node as Element;
        const textContent = element.textContent || "";

        // Skip if this element already has a widget
        if (element.querySelector(".chatkit-custom-widget")) {
          return;
        }

        const widgetData = parseWidgetFromText(textContent);
        if (widgetData) {
          if (isDev) {
            console.info("[ChatKitPanel] Found widget JSON in element", {
              widget: widgetData.widget,
              data: widgetData.data,
            });
          }

          // Check if the text content is mostly JSON (indicating it's a widget response)
          const jsonRatio = textContent.trim().match(/^[\s\n]*\{/) ? 1 : 0;
          
          if (jsonRatio > 0) {
            // Create widget container
            const widgetContainer = document.createElement("div");
            widgetContainer.className = "chatkit-custom-widget my-4";
            widgetContainer.setAttribute("data-widget-type", widgetData.widget);
            widgetContainer.setAttribute("data-widget-data", JSON.stringify(widgetData.data));

            // Clear the element content and add widget
            element.innerHTML = "";
            element.appendChild(widgetContainer);
            
            // Mark as processed
            processedMessages.add(element);
            processedMessages.add(widgetContainer);

            // Render React component using createRoot
            try {
              const root = createRoot(widgetContainer);
              root.render(
                <WidgetRenderer
                  widget={widgetData.widget}
                  data={widgetData.data}
                />
              );
              processedMessages.add(widgetContainer);
            } catch (error) {
              if (isDev) {
                console.error("[ChatKitPanel] Failed to render widget:", error);
              }
              // Fallback: render as formatted JSON
              widgetContainer.innerHTML = `
                <div class="p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800">
                  <div class="text-sm font-semibold mb-2">Widget: ${widgetData.widget}</div>
                  <pre class="text-xs overflow-auto">${JSON.stringify(widgetData.data, null, 2)}</pre>
                </div>
              `;
            }
          }
        }
      }
    };

    // Use MutationObserver to watch for new messages in ChatKit
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          // Process the node and its children
          if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as Element;
            
            // Look for message content in ChatKit
            const messageElements = element.querySelectorAll?.(
              '[class*="message"], [class*="Message"], [class*="thread-item"], [class*="ThreadItem"]'
            ) || [];

            // Process each message element
            messageElements.forEach((msgEl) => {
              // Process all text nodes in this message
              const walker = document.createTreeWalker(
                msgEl,
                NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
                null
              );

              let textNode;
              while ((textNode = walker.nextNode())) {
                processMessageContent(textNode);
              }
            });

            // Also process the element itself
            processMessageContent(element);
          } else {
            processMessageContent(node);
          }
        });
      });
    });

    // Start observing when ChatKit element is available
    const startObserving = () => {
      const chatkitElement = document.querySelector("openai-chatkit");
      if (chatkitElement) {
        observer.observe(chatkitElement, {
          childList: true,
          subtree: true,
          characterData: true,
        });
        if (isDev) {
          console.info("[ChatKitPanel] Widget observer started");
        }
      } else {
        // Retry after a short delay
        setTimeout(startObserving, 500);
      }
    };

    startObserving();

    return () => {
      observer.disconnect();
    };
  }, [chatkit.control]);

  const activeError = errors.session ?? errors.integration;
  const blockingError = errors.script ?? activeError;

  if (isDev) {
    console.debug("[ChatKitPanel] render state", {
      isInitializingSession,
      hasControl: Boolean(chatkit.control),
      scriptStatus,
      hasError: Boolean(blockingError),
      workflowId: workflowId,
    });
  }

  // Global CSS for light-DOM (backup)
  useEffect(() => {
    if (!isBrowser) return;
    const styleId = "hide-chatkit-history";
    if (document.getElementById(styleId)) return;
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      openai-chatkit button[aria-label*="history" i], openai-chatkit button[aria-label*="History" i],
      openai-chatkit [class*="history"] button, openai-chatkit header button:not(:first-of-type),
      openai-chatkit header button:last-of-type { display: none !important; }
    `;
    document.head.appendChild(style);
    return () => { document.getElementById(styleId)?.remove(); };
  }, []);

  // Pierce shadow DOM to hide history/clock button (ChatKit renders inside shadow)
  useEffect(() => {
    if (!isBrowser || !chatkit.control) return;
    const shadowCss = `
      button[aria-label*="history" i], button[aria-label*="History" i], button[title*="history" i], button[title*="History" i],
      button[aria-label*="time" i], button[title*="time" i], [class*="history"] button, [class*="thread-history"] button,
      header button:not(:first-of-type), header button:last-of-type, [class*="clock"] { display: none !important; }
    `;
    let tries = 0;
    const tryInject = () => {
      const host = document.querySelector("openai-chatkit");
      const sr = host ? (host as Element & { shadowRoot?: ShadowRoot }).shadowRoot : null;
      if (sr) {
        if (!sr.querySelector("#hide-chatkit-clock")) {
          const s = document.createElement("style");
          s.id = "hide-chatkit-clock";
          s.textContent = shadowCss;
          sr.appendChild(s);
        }
      } else if (tries < 20) {
        tries += 1;
        setTimeout(tryInject, 300);
      }
    };
    const t = setTimeout(tryInject, 500);
    return () => clearTimeout(t);
  }, [chatkit.control]);

  return (
    <div className="relative flex h-full w-full rounded-3xl flex-col overflow-hidden bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm shadow-2xl border border-white/20 dark:border-slate-700/50 transition-all duration-300">
      
      <ChatKit
        key={widgetInstanceKey}
        control={chatkit.control}
        className={
          blockingError || isInitializingSession
            ? "pointer-events-none opacity-0"
            : "block h-full w-full"
        }
      />
      <ErrorOverlay
        error={blockingError}
        fallbackMessage={
          blockingError || !isInitializingSession
            ? null
            : "Loading assistant session..."
        }
        onRetry={blockingError && errors.retryable ? handleResetChat : null}
        retryLabel="Restart chat"
      />
    </div>
  );
}

function extractErrorDetail(
  payload: Record<string, unknown> | undefined,
  fallback: string
): string {
  if (!payload) {
    return fallback;
  }

  const error = payload.error;
  if (typeof error === "string") {
    return error;
  }

  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    return (error as { message: string }).message;
  }

  const details = payload.details;
  if (typeof details === "string") {
    return details;
  }

  if (details && typeof details === "object" && "error" in details) {
    const nestedError = (details as { error?: unknown }).error;
    if (typeof nestedError === "string") {
      return nestedError;
    }
    if (
      nestedError &&
      typeof nestedError === "object" &&
      "message" in nestedError &&
      typeof (nestedError as { message?: unknown }).message === "string"
    ) {
      return (nestedError as { message: string }).message;
    }
  }

  if (typeof payload.message === "string") {
    return payload.message;
  }

  return fallback;
}
