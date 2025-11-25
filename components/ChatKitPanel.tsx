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
  const [workflowId, setWorkflowId] = useState<string>(WORKFLOW_ID);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [tempWorkflowId, setTempWorkflowId] = useState<string>(WORKFLOW_ID);

  const setErrorState = useCallback((updates: Partial<ErrorState>) => {
    setErrors((current) => ({ ...current, ...updates }));
  }, []);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
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
  }, []);

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
    if (isBrowser) {
      setScriptStatus(
        window.customElements?.get("openai-chatkit") ? "ready" : "pending"
      );
    }
    setIsInitializingSession(true);
    setErrors(createInitialErrors());
    setWidgetInstanceKey((prev) => prev + 1);
  }, []);

  const handleWorkflowIdChange = useCallback(() => {
    setWorkflowId(tempWorkflowId.trim());
    setIsSettingsOpen(false);
    // Reset chat to re-establish connection with new workflow ID
    handleResetChat();
  }, [tempWorkflowId, handleResetChat]);

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
        // Generate a user ID if not already set (using a simple UUID-like string)
        const userId =
          typeof window !== "undefined" &&
          typeof window.crypto !== "undefined" &&
          typeof window.crypto.randomUUID === "function"
            ? window.crypto.randomUUID()
            : `user_${Date.now()}_${Math.random().toString(36).slice(2)}`;

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
    [isWorkflowConfigured, setErrorState, workflowId]
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
      // Enhanced logging to track widget data for debugging
      if (isDev) {
        console.info("[ChatKitPanel] Response ended - widgets should render automatically if configured in Agent Builder");
      }
      onResponseEnd();
    },
    onResponseStart: () => {
      setErrorState({ integration: null, retryable: false });
    },
    onThreadChange: () => {
      processedFacts.current.clear();
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
  }, [chatkit]);

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

  return (
    <div className="relative pb-8 flex h-[90vh] w-full rounded-2xl flex-col overflow-hidden bg-white shadow-sm transition-colors dark:bg-slate-900">
      {/* Settings Button */}
      <button
        onClick={() => {
          setTempWorkflowId(workflowId);
          setIsSettingsOpen(true);
        }}
        className="absolute top-4 right-4 z-50 p-2 rounded-lg bg-white dark:bg-slate-800 shadow-md hover:shadow-lg transition-shadow border border-gray-200 dark:border-gray-700"
        aria-label="Settings"
        title="Settings"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
          className="w-5 h-5 text-gray-700 dark:text-gray-300"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
      </button>

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
          onClick={() => setIsSettingsOpen(false)}
        >
          <div
            className="bg-white dark:bg-slate-800 rounded-lg shadow-xl p-6 w-full max-w-md mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">
              Settings
            </h2>
            <div className="mb-4">
              <label
                htmlFor="workflow-id"
                className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300"
              >
                Workflow ID
              </label>
              <input
                id="workflow-id"
                type="text"
                value={tempWorkflowId}
                onChange={(e) => setTempWorkflowId(e.target.value)}
                placeholder="wf_..."
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                Changing this will restart the chat session with the new workflow.
              </p>
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-slate-700 rounded-md hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleWorkflowIdChange}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
              >
                Save & Restart
              </button>
            </div>
          </div>
        </div>
      )}

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
