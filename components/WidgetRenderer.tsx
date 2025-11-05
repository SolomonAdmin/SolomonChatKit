"use client";

import React from "react";

type WidgetData = {
  widget: string;
  data: Record<string, unknown>;
};

type WidgetRendererProps = {
  widget: string;
  data: Record<string, unknown>;
};

/**
 * Renders a widget based on its type and data
 */
export function WidgetRenderer({ widget, data }: WidgetRendererProps) {
  switch (widget) {
    case "contact_card":
      return <ContactCardWidget data={data} />;
    default:
      // For unknown widget types, render the data as JSON
      return (
        <div className="widget-container p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800">
          <div className="text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300">
            Widget: {widget}
          </div>
          <pre className="text-xs text-gray-600 dark:text-gray-400 overflow-auto">
            {JSON.stringify(data, null, 2)}
          </pre>
        </div>
      );
  }
}

/**
 * Contact Card Widget Component
 * Renders contact information in a card format
 */
function ContactCardWidget({ data }: { data: Record<string, unknown> }) {
  const name = String(data.name || "");
  const title = String(data.title || "");
  const phone = String(data.phone || "");
  const email = String(data.email || "");

  return (
    <div className="widget-contact-card p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 shadow-sm">
      <div className="flex items-start space-x-4">
        {/* Avatar placeholder */}
        <div className="flex-shrink-0">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold text-lg">
            {name
              .split(" ")
              .map((n) => n[0])
              .join("")
              .toUpperCase()
              .slice(0, 2)}
          </div>
        </div>

        {/* Contact Info */}
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
            {name || "Unknown Contact"}
          </h3>
          {title && (
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
              {title}
            </p>
          )}

          {/* Contact Details */}
          <div className="space-y-2">
            {phone && (
              <div className="flex items-center space-x-2 text-sm">
                <svg
                  className="w-4 h-4 text-gray-500 dark:text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                  />
                </svg>
                <a
                  href={`tel:${phone}`}
                  className="text-blue-600 dark:text-blue-400 hover:underline"
                >
                  {phone}
                </a>
              </div>
            )}
            {email && (
              <div className="flex items-center space-x-2 text-sm">
                <svg
                  className="w-4 h-4 text-gray-500 dark:text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  />
                </svg>
                <a
                  href={`mailto:${email}`}
                  className="text-blue-600 dark:text-blue-400 hover:underline"
                >
                  {email}
                </a>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Parses widget JSON from text content
 * Looks for JSON objects with a "widget" property
 */
export function parseWidgetFromText(text: string): WidgetData | null {
  if (!text || typeof text !== "string") {
    return null;
  }

  // Try to find JSON object in text
  // Look for patterns like: {"widget": "...", "data": {...}}
  const jsonPatterns = [
    /\{[\s\n]*"widget"[\s\n]*:[\s\n]*"[^"]+"[\s\n]*,[\s\n]*"data"[\s\n]*:[\s\n]*\{[^}]*\}\s*\}/,
    /\{[\s\n]*"widget"[\s\n]*:[\s\n]*"[^"]+"[\s\n]*,[\s\n]*"data"[\s\n]*:[\s\n]*\{[^}]*\{[^}]*\}[^}]*\}[^}]*\}/, // nested objects
  ];

  for (const pattern of jsonPatterns) {
    const match = text.match(pattern);
    if (match) {
      try {
        const parsed = JSON.parse(match[0]);
        if (parsed.widget && parsed.data) {
          return {
            widget: String(parsed.widget),
            data: parsed.data || {},
          };
        }
      } catch (e) {
        // Continue to next pattern
        if (process.env.NODE_ENV !== "production") {
          console.warn("[WidgetRenderer] Failed to parse widget JSON:", e);
        }
      }
    }
  }

  // Try to parse the entire text as JSON
  try {
    const parsed = JSON.parse(text.trim());
    if (parsed.widget && parsed.data) {
      return {
        widget: String(parsed.widget),
        data: parsed.data || {},
      };
    }
  } catch {
    // Not valid JSON
  }

  return null;
}

