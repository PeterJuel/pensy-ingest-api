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

/** Detect & redact PERSON spans via Presidio. */
async function removeNames(text: string): Promise<string> {
  if (!text) return ""; // no work if empty

  // 1) Detect PERSON entities
  const analysisRes: Response = await fetch(ANALYZE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, language: "en", entities: ["PERSON"] }),
  });
  const detection: any[] = await analysisRes.json();

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
  const { text: scrubbed }: { text: string } = await anonRes.json();
  return scrubbed;
}

/** Full‐text scrub: regex → Presidio → regex (safe for empty/undefined). */
export async function scrubText(text: string = ""): Promise<string> {
  const once = scrubRegex(text);
  const named = await removeNames(once);
  return scrubRegex(named);
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
  // parse with default options
  const root = parse(html);

  // recursively visit every node
  async function visit(node: Node) {
    if (node instanceof TextNode) {
      // only scrub the text, preserve tags/attributes
      node.rawText = await scrubText(node.rawText);
    } else if (node instanceof HTMLElement) {
      for (const child of node.childNodes) {
        await visit(child);
      }
    }
  }

  await visit(root);
  return root.toString();
}