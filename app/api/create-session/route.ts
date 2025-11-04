import { WORKFLOW_ID } from "@/lib/config";

// Using Node.js runtime instead of Edge Runtime for better environment variable support in Amplify
// export const runtime = "edge";

interface CreateSessionRequestBody {
  workflow?: { id?: string | null } | null;
  scope?: { user_id?: string | null } | null;
  workflowId?: string | null;
  user?: string | null;
  chatkit_configuration?: {
    file_upload?: {
      enabled?: boolean;
    };
  };
}

const DEFAULT_CHATKIT_BASE = "https://api.openai.com";
const SESSION_COOKIE_NAME = "chatkit_session_id";
const SESSION_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export async function POST(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowedResponse();
  }
  let sessionCookie: string | null = null;
  try {
    // Check both variable names for flexibility (LOCAL_OPENAI_API_KEY for local, OPENAI_API_KEY for Amplify)
    const openaiApiKey = process.env.LOCAL_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
    
    // Always log environment variable status (including production) for debugging in CloudWatch
    console.info("[create-session] Environment variable check", {
      nodeEnv: process.env.NODE_ENV,
      hasLocalKey: !!process.env.LOCAL_OPENAI_API_KEY,
      hasOpenAiKey: !!process.env.OPENAI_API_KEY,
      hasApiKey: !!openaiApiKey,
      keyLength: openaiApiKey?.length ?? 0,
      // Log available env var keys that contain "OPENAI" or "API" (without values)
      envKeysWithOpenAI: Object.keys(process.env).filter(k => 
        k.includes('OPENAI') || k.includes('API')
      ),
    });
    
    if (!openaiApiKey) {
      // Log all available env vars (without values) for debugging
      const allEnvKeys = Object.keys(process.env).sort();
      console.error("[create-session] Missing API key - available environment variables:", {
        totalEnvVars: allEnvKeys.length,
        sampleKeys: allEnvKeys.slice(0, 20), // First 20 for debugging
        keysWithOpenAI: allEnvKeys.filter(k => k.includes('OPENAI') || k.includes('API')),
      });
      
      return new Response(
        JSON.stringify({
          error: "Missing LOCAL_OPENAI_API_KEY or OPENAI_API_KEY environment variable",
          hint: "Please set either LOCAL_OPENAI_API_KEY or OPENAI_API_KEY in your environment settings (Amplify Console or .env.local for local development)",
          debug: process.env.NODE_ENV !== "production" ? {
            availableEnvKeys: allEnvKeys.filter(k => k.includes('OPENAI') || k.includes('API')),
          } : undefined,
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const parsedBody = await safeParseJson<CreateSessionRequestBody>(request);
    const { userId: resolvedUserId, sessionCookie: resolvedSessionCookie } =
      await resolveUserId(request);
    sessionCookie = resolvedSessionCookie;
    // Use user from request body if provided, otherwise use resolved userId from cookie
    const userId = parsedBody?.user?.trim() || resolvedUserId;
    const resolvedWorkflowId =
      parsedBody?.workflow?.id ?? parsedBody?.workflowId ?? WORKFLOW_ID;

    if (process.env.NODE_ENV !== "production") {
      console.info("[create-session] handling request", {
        userId,
        resolvedWorkflowId,
        body: JSON.stringify(parsedBody),
      });
    }

    if (!resolvedWorkflowId) {
      return buildJsonResponse(
        { error: "Missing workflow id" },
        400,
        { "Content-Type": "application/json" },
        sessionCookie
      );
    }

    if (!userId || userId.trim() === "") {
      return buildJsonResponse(
        { error: "Missing or empty user id" },
        400,
        { "Content-Type": "application/json" },
        sessionCookie
      );
    }

    const apiBase = process.env.CHATKIT_API_BASE ?? DEFAULT_CHATKIT_BASE;
    const url = `${apiBase}/v1/chatkit/sessions`;
    const requestBody = {
      workflow: { id: resolvedWorkflowId },
      user: userId,
      chatkit_configuration: {
        file_upload: {
          enabled:
            parsedBody?.chatkit_configuration?.file_upload?.enabled ?? false,
        },
      },
    };
    
    if (process.env.NODE_ENV !== "production") {
      console.info("[create-session] sending request to OpenAI", {
        url,
        workflowId: resolvedWorkflowId,
        userId: userId,
        hasApiKey: Boolean(openaiApiKey),
        apiKeyLength: openaiApiKey?.length ?? 0,
      });
    }
    
    const upstreamResponse = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiApiKey}`,
        "OpenAI-Beta": "chatkit_beta=v1",
      },
      body: JSON.stringify(requestBody),
    });

    if (process.env.NODE_ENV !== "production") {
      console.info("[create-session] upstream response", {
        status: upstreamResponse.status,
        statusText: upstreamResponse.statusText,
      });
    }

    const upstreamJson = (await upstreamResponse.json().catch(() => ({}))) as
      | Record<string, unknown>
      | undefined;

    if (!upstreamResponse.ok) {
      const upstreamError = extractUpstreamError(upstreamJson);
      const errorMessage = upstreamError ?? `Failed to create session: ${upstreamResponse.statusText}`;
      console.error("OpenAI ChatKit session creation failed", {
        status: upstreamResponse.status,
        statusText: upstreamResponse.statusText,
        workflowId: resolvedWorkflowId,
        userId: userId,
        error: errorMessage,
        body: upstreamJson,
      });
      
      // Provide more helpful error messages for common issues
      let helpfulMessage = errorMessage;
      if (errorMessage.includes("not found")) {
        helpfulMessage = `Workflow not found: ${resolvedWorkflowId}. Please verify: 1) The workflow ID is correct, 2) The workflow is published in Agent Builder, 3) The API key has access to this workflow in the same organization/project.`;
      } else if (upstreamResponse.status === 401 || upstreamResponse.status === 403) {
        helpfulMessage = `Authentication failed. Please verify your LOCAL_OPENAI_API_KEY is correct and has access to the workflow. Status: ${upstreamResponse.status}`;
      }
      
      return buildJsonResponse(
        {
          error: helpfulMessage,
          details: upstreamJson,
          workflowId: resolvedWorkflowId,
        },
        upstreamResponse.status,
        { "Content-Type": "application/json" },
        sessionCookie
      );
    }

    const clientSecret = upstreamJson?.client_secret ?? null;
    const expiresAfter = upstreamJson?.expires_after ?? null;
    const responsePayload = {
      client_secret: clientSecret,
      expires_after: expiresAfter,
    };

    return buildJsonResponse(
      responsePayload,
      200,
      { "Content-Type": "application/json" },
      sessionCookie
    );
  } catch (error) {
    console.error("Create session error", error);
    return buildJsonResponse(
      { error: "Unexpected error" },
      500,
      { "Content-Type": "application/json" },
      sessionCookie
    );
  }
}

export async function GET(): Promise<Response> {
  return methodNotAllowedResponse();
}

function methodNotAllowedResponse(): Response {
  return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
    status: 405,
    headers: { "Content-Type": "application/json" },
  });
}

async function resolveUserId(request: Request): Promise<{
  userId: string;
  sessionCookie: string | null;
}> {
  const existing = getCookieValue(
    request.headers.get("cookie"),
    SESSION_COOKIE_NAME
  );
  if (existing) {
    return { userId: existing, sessionCookie: null };
  }

  const generated =
    typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);

  return {
    userId: generated,
    sessionCookie: serializeSessionCookie(generated),
  };
}

function getCookieValue(
  cookieHeader: string | null,
  name: string
): string | null {
  if (!cookieHeader) {
    return null;
  }

  const cookies = cookieHeader.split(";");
  for (const cookie of cookies) {
    const [rawName, ...rest] = cookie.split("=");
    if (!rawName || rest.length === 0) {
      continue;
    }
    if (rawName.trim() === name) {
      return rest.join("=").trim();
    }
  }
  return null;
}

function serializeSessionCookie(value: string): string {
  const attributes = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(value)}`,
    "Path=/",
    `Max-Age=${SESSION_COOKIE_MAX_AGE}`,
    "HttpOnly",
    "SameSite=Lax",
  ];

  if (process.env.NODE_ENV === "production") {
    attributes.push("Secure");
  }
  return attributes.join("; ");
}

function buildJsonResponse(
  payload: unknown,
  status: number,
  headers: Record<string, string>,
  sessionCookie: string | null
): Response {
  const responseHeaders = new Headers(headers);

  if (sessionCookie) {
    responseHeaders.append("Set-Cookie", sessionCookie);
  }

  return new Response(JSON.stringify(payload), {
    status,
    headers: responseHeaders,
  });
}

async function safeParseJson<T>(req: Request): Promise<T | null> {
  try {
    const text = await req.text();
    if (!text) {
      return null;
    }
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function extractUpstreamError(
  payload: Record<string, unknown> | undefined
): string | null {
  if (!payload) {
    return null;
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
  return null;
}
