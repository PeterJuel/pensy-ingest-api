// src/lib/pii.ts
import { parse, HTMLElement, TextNode } from "node-html-parser";

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
    async function visit(node: any) {
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
