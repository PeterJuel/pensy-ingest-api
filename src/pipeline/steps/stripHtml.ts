// src/pipeline/steps/stripHtml.ts
import { parse, HTMLElement, TextNode, Node } from "node-html-parser";
import { query } from "../../lib/db";

interface Email {
  id: string;
  subject: string;
  body: any;
  conversation_id: string | null;
}

/**
 * Convert HTML content to plain text, preserving spacing between elements.
 */
function htmlToText(html: string): string {
  if (!html || html.trim() === "") {
    return "";
  }

  // Normalize line breaks and ensure space between adjacent tags
  const normalized = html
    // Convert <br> to newline
    .replace(/<br\s*\/?>/gi, "\n")
    // Add space between tag boundaries to avoid word concatenation
    .replace(/>(?=<)/g, "> ");

  const root = parse(normalized);
  let text = root.textContent || "";

  text = text
    .replace(/\s+/g, " ") // collapse whitespace
    .replace(/\n\s*/g, "\n") // normalize newlines
    .replace(/\n\n+/g, "\n\n") // preserve paragraph breaks
    .trim();

  return text;
}

/**
 * Pipeline step: Strip HTML (including comments) and standard boilerplate from email body,
 * then store as plain_text output.
 */
export async function stripHtml(email: Email): Promise<void> {
  const startTime = Date.now();

  try {
    // Determine which field actually holds the HTML
    let htmlContent = "";
    let contentSource = "body.content";

    if (email.body?.content) {
      htmlContent = email.body.content;
    } else if ((email.body as any)?.body?.content) {
      console.warn(
        `[stripHtml] falling back to email.body.body.content for ${email.id}`
      );
      htmlContent = (email.body as any).body.content;
      contentSource = "body.body.content";
    }

    // Remove HTML comments
    htmlContent = htmlContent.replace(/<!--[\s\S]*?-->/g, "");

    // Convert to plain text with spacing fixes
    const rawText = htmlToText(htmlContent);

    // Remove common boilerplate: sender warning
    let cleanedText = rawText
      .replace(
        /You don't often get email from[\s\S]*?Learn why this is important\s*/i,
        ""
      )
      // Remove standard confidentiality notice if present
      .replace(/Please note that this message[\s\S]*/i, "")
      .trim();

    const originalLength = rawText.length;
    const finalLength = cleanedText.length;

    // Upsert into email_outputs
    await query(
      `
      INSERT INTO email_outputs
        (email_id, output_type, content, metadata, pipeline_version)
      VALUES
        ($1, $2, $3, $4, $5)
      ON CONFLICT (email_id, output_type, pipeline_version)
      DO UPDATE SET
        content = EXCLUDED.content,
        metadata = EXCLUDED.metadata,
        created_at = now()
      `,
      [
        email.id,
        "plain_text",
        { text: cleanedText },
        {
          original_length: originalLength,
          stripped_length: finalLength,
          processing_time_ms: Date.now() - startTime,
          compression_ratio:
            originalLength > 0 ? finalLength / originalLength : 0,
          content_source: contentSource,
        },
        "v1",
      ]
    );

    // Log this step
    await query(
      `
      INSERT INTO pipeline_logs (email_id, step, status, details)
      VALUES ($1, $2, $3, $4)
      `,
      [
        email.id,
        "strip_html",
        "ok",
        {
          original_length: originalLength,
          stripped_length: finalLength,
          processing_time_ms: Date.now() - startTime,
          content_source: contentSource,
        },
      ]
    );
  } catch (error) {
    // On error, log failure and rethrow
    await query(
      `
      INSERT INTO pipeline_logs (email_id, step, status, details)
      VALUES ($1, $2, $3, $4)
      `,
      [
        email.id,
        "strip_html",
        "error",
        {
          error: error instanceof Error ? error.message : String(error),
          processing_time_ms: Date.now() - startTime,
        },
      ]
    );
    throw error;
  }
}
