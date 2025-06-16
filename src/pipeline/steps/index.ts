import { PipelineStep } from "../types";
import { stripHtml } from "./stripHtml";

// Convert your existing stripHtml function to the new interface
export const stripHtmlStep: PipelineStep = {
  name: "strip_html",
  dependencies: [], // No dependencies
  execute: stripHtml,
  retryable: true,
  priority: 1,
  timeout: 10000, // 10 seconds
  description: "Convert HTML email content to plain text",
};