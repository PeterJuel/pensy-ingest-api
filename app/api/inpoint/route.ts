// app/api/inpoint/route.ts
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { query } from "@lib/db";
import { enqueueEmailProcess } from "@lib/jobQueue";
import { scrubText, scrubAddress, scrubHtml } from "@lib/pii";

export async function POST(req: NextRequest) {
  try {
    const messages = await req.json();
    if (!Array.isArray(messages)) {
      return NextResponse.json({ error: "Expected array" }, { status: 400 });
    }

    const batchId = randomUUID();
    let inserted = 0;
    let duplicates = 0;

    for (const msg of messages) {
      // Deduplication key
      const sourceId = msg.internetMessageId ?? msg.id;
      const receivedAt = msg.receivedDateTime;

      // Scrub subject (remove emails, phones, CPR, names)
      const subject = msg.subject ? await scrubText(msg.subject) : null;

      // Deep‐clone and scrub body HTML
      const safeJson: any = JSON.parse(JSON.stringify(msg));

      // pick raw HTML if present, else fall back to preview text wrapped in <pre>
      const rawBodyHtml =
        msg.body?.content && msg.body.content.trim().length > 0
          ? msg.body.content
          : `<pre>${(msg.bodyPreview ?? "").replace(/</g, "&lt;")}</pre>`;

      safeJson.body = {
        contentType: "html",
        content: await scrubHtml(rawBodyHtml),
      };
      safeJson.subject = subject;

      // Scrub explicit address fields (from/to/cc/bcc)
      scrubAddress(safeJson.from?.emailAddress);
      (safeJson.toRecipients ?? []).forEach((r: any) =>
        scrubAddress(r.emailAddress)
      );
      (safeJson.ccRecipients ?? []).forEach((r: any) =>
        scrubAddress(r.emailAddress)
      );
      (safeJson.bccRecipients ?? []).forEach((r: any) =>
        scrubAddress(r.emailAddress)
      );

      // Build metadata without any PII
      const meta = {
        graphId: msg.id,
        conversationId: msg.conversationId ?? null,
        folder: msg.folderName,
        hasAttachments: !!msg.hasAttachments,
      };

      // Check for existing email
      const [exists] = await query<{ id: string }>(
        "SELECT id FROM emails WHERE source_id = $1",
        [sourceId]
      );

      if (exists) {
        duplicates++;
        await query(
          `INSERT INTO pipeline_logs (email_id, batch_id, step, status, details)
           VALUES ($1, $2, 'inpoint', 'duplicate', $3)`,
          [exists.id, batchId, JSON.stringify({ note: "already ingested" })]
        );
        continue;
      }

      // Insert new email
      const [row] = await query<{ id: string }>(
        `INSERT INTO emails
           (source_id, received_at, subject, meta, body, conversation_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [
          sourceId,
          receivedAt,
          subject,
          JSON.stringify(meta),
          JSON.stringify(safeJson),
          msg.conversationId ?? null,
        ]
      );

      inserted++;
      console.log(
        `[ROUTE DEBUG] About to call enqueueEmailProcess for email ID: ${row.id}`
      );

      await enqueueEmailProcess(row.id);
      console.log(
        `[ROUTE DEBUG] enqueueEmailProcess call completed for email ID: ${row.id}`
      );

      // Log success
      await query(
        `INSERT INTO pipeline_logs (email_id, batch_id, step, status, details)
         VALUES ($1, $2, 'inpoint', 'ok', $3)`,
        [
          row.id,
          batchId,
          JSON.stringify({ bodySize: JSON.stringify(safeJson).length }),
        ]
      );
    }

    return NextResponse.json({
      batchId,
      inserted,
      duplicates,
      status: "queued",
    });
  } catch (err) {
    console.error("Inpoint error", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
