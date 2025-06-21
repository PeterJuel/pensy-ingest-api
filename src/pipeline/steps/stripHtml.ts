// src/pipeline/steps/stripHtml.ts - Updated for new interface
import { parse, HTMLElement, TextNode, Node } from "node-html-parser";
import { query } from "../../lib/db";
import logger from "../../lib/logger";
import { Email } from "../types";

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
 * Extract attachment information from the full email object
 */
function extractAttachments(email: Email): string[] {
  const attachments: string[] = [];

  try {
    // The email.body contains the full email JSON from Office 365
    // Looking at your sample, attachments are at the top level of this JSON
    let emailData = email.body;

    // Check for attachments at the top level (this should be where they are)
    if (emailData?.attachments && Array.isArray(emailData.attachments)) {
      emailData.attachments.forEach((attachment: any, index: number) => {
        if (attachment.name) {
          attachments.push(attachment.name);
        }
      });
    }

    // Also check if it's nested deeper in case of different email structures
    if (
      emailData?.body?.attachments &&
      Array.isArray(emailData.body.attachments)
    ) {
      emailData.body.attachments.forEach((attachment: any) => {
        if (attachment.name && !attachments.includes(attachment.name)) {
          attachments.push(attachment.name);
        }
      });
    }
  } catch (error) {
    logger.warn("Failed to extract attachments", "STRIP_HTML", { 
      emailId: email.id, 
      error: error instanceof Error ? error.message : String(error) 
    });
  }

  return attachments;
}

/**
 * Pipeline step: Strip HTML (including comments) and standard boilerplate from email body,
 * then store as plain_text output with attachment information.
 *
 * This function is now compatible with the PipelineStep interface.
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
      logger.warn("Falling back to email.body.body.content", "STRIP_HTML", { emailId: email.id });
      htmlContent = (email.body as any).body.content;
      contentSource = "body.body.content";
    }

    if (!htmlContent) {
      throw new Error(`No HTML content found in email ${email.id}`);
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

    // Extract attachment information from the full email object
    const attachments = extractAttachments(email);

    const originalLength = rawText.length;
    const finalLength = cleanedText.length;

    // Create content object with text and attachments
    const contentObject = {
      text: cleanedText,
      attachments: attachments,
    };
 
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
        contentObject, // Now includes both text and attachments
        {
          original_length: originalLength,
          stripped_length: finalLength,
          processing_time_ms: Date.now() - startTime,
          compression_ratio:
            originalLength > 0 ? finalLength / originalLength : 0,
          content_source: contentSource,
          attachment_count: attachments.length
        },
        "v1",
      ]
    );

    logger.info("stripHtml completed", "STRIP_HTML", {
      emailId: email.id,
      originalLength,
      finalLength,
      attachmentsCount: attachments.length
    });
  } catch (error) {
    // Error logging is now handled by the orchestrator
    logger.error("stripHtml failed", "STRIP_HTML", { 
      emailId: email.id, 
      error: error instanceof Error ? error.message : String(error) 
    });
    throw error;
  }
}
