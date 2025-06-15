// src/lib/pii.ts
import fetch, { Response } from "node-fetch";
import { parse, HTMLElement, TextNode, Node } from "node-html-parser";

// Presidio endpoints from env (fallback to localhost)
const ANALYZE_URL =
  process.env.PRESIDIO_ANALYZER_URL || "http://localhost:5001/analyze";
const ANONYMIZE_URL =
  process.env.PRESIDIO_ANONYMIZER_URL || "http://localhost:5002/anonymize";

// Regex patterns
const EMAIL_RGX = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE_RGX = /\b\+?\d[\d\s().-]{6,}\d\b/g; // ≥8 digits
const CPR_RGX = /\b\d{6}-?\d{4}\b/g; // Danish CPR

/** Remove e-mail, phone, CPR via simple regex.
 *  Always safe if `text` is undefined or empty. */
export function scrubRegex(text: string = ""): string {
  return text
    .replace(EMAIL_RGX, "[email]")
    .replace(PHONE_RGX, "[phone]")
    .replace(CPR_RGX, "[cpr]");
}

/** Detect & redact PERSON spans via Presidio (with fallback if service unavailable). */
async function removeNames(text: string): Promise<string> {
  if (!text) return ""; // no work if empty

  try {
    // 1) Detect PERSON entities
    const analysisRes: Response = await fetch(ANALYZE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, language: "en", entities: ["PERSON"] }),
    });

    if (!analysisRes.ok) {
      console.warn(
        `Presidio analyzer failed: ${analysisRes.status}. Skipping name removal.`
      );
      return text; // Return original text if Presidio fails
    }

    const detection: any[] = await analysisRes.json();

    // If no person entities detected, return original text
    if (!detection || detection.length === 0) {
      return text;
    }

    // 2) Anonymize those spans → replace with "[name]"
    const anonRes: Response = await fetch(ANONYMIZE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        entities: detection,
        anonymizers: { default: { type: "replace", new_value: "[name]" } },
      }),
    });

    if (!anonRes.ok) {
      console.warn(
        `Presidio anonymizer failed: ${anonRes.status}. Skipping name removal.`
      );
      return text; // Return original text if Presidio fails
    }

    const { text: scrubbed }: { text: string } = await anonRes.json();
    return scrubbed;
  } catch (error) {
    console.error("Presidio error, skipping name removal:", error);
    return text; // Return original text if any error occurs
  }
}

/** Full‐text scrub: regex → Presidio → regex (safe for empty/undefined). */
export async function scrubText(text: string = ""): Promise<string> {
  // For now, let's be less aggressive and only use regex
  // TODO: Fix Presidio configuration to be less aggressive
  const scrubbed = scrubRegex(text);

  // Temporarily disable Presidio name removal until we can fix it
  // const named = await removeNames(scrubbed);
  // return scrubRegex(named);

  return scrubbed;
}

/** Overwrite any {name, address} to non-PII tokens. */
export function scrubAddress(addr: any) {
  if (!addr) return;
  addr.address = "[email]";
  addr.name = "[name]";
}

/**
 * Parse the HTML, scrub only the text nodes via scrubText(), and reserialize.
 */
export async function scrubHtml(html: string = ""): Promise<string> {
  if (!html || html.trim() === "") return "";

  try {
    // parse with default options
    const root = parse(html);

    // recursively visit every node
    async function visit(node: Node) {
      if (node instanceof TextNode) {
        // Only scrub actual text content, preserve whitespace and structure
        if (node.rawText && node.rawText.trim().length > 0) {
          node.rawText = await scrubText(node.rawText);
        }
      } else if (node instanceof HTMLElement) {
        for (const child of node.childNodes) {
          await visit(child);
        }
      }
    }

    await visit(root);
    return root.toString();
  } catch (error) {
    console.error("HTML scrubbing error:", error);
    // If HTML parsing fails, fall back to text-only scrubbing
    return await scrubText(html);
  }
}
