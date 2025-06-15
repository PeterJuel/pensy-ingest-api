// src/pipeline/steps/stripHtml.ts
import { parse } from "node-html-parser";
import { query } from "../../lib/db";

interface Email {
  id: string;
  subject: string;
  body: any;
  conversation_id: string | null;
}

/**
 * Convert HTML content to plain text
 */
function htmlToText(html: string): string {
  if (!html || html.trim() === "") {
    return "";
  }

  const root = parse(html);
  let text = root.textContent || "";

  text = text
    .replace(/\s+/g, " ") // collapse whitespace
    .replace(/\n\s*\n/g, "\n\n") // preserve paragraph breaks
    .trim();

  return text;
}

/**
 * Pipeline step: Strip HTML from email body and store as plain_text output
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

    const originalLength = htmlContent.length;
    console.log(
      `[stripHtml] Email ${email.id}: content source = ${contentSource}`
    );
    console.log(
      `[stripHtml] Email ${email.id}: original content length = ${originalLength}`
    );
    console.log(`[stripHtml] Content preview:`, htmlContent.substring(0, 200));

    // Perform the HTML→text conversion
    const plainText = htmlToText(htmlContent);
    const strippedLength = plainText.length;

    console.log(
      `[stripHtml] Email ${email.id}: stripped length = ${strippedLength}`
    );
    console.log(`[stripHtml] Plain text preview:`, plainText.substring(0, 200));

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
        { text: plainText },
        {
          original_length: originalLength,
          stripped_length: strippedLength,
          processing_time_ms: Date.now() - startTime,
          compression_ratio:
            originalLength > 0 ? strippedLength / originalLength : 0,
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
          stripped_length: strippedLength,
          processing_time_ms: Date.now() - startTime,
          content_source: contentSource,
        },
      ]
    );

    console.log(
      `HTML stripped for email ${email.id}: ${originalLength} → ${strippedLength} chars`
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
