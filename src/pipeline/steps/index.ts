// src/pipeline/steps/index.ts
import { PipelineStep } from "../types";
import { stripHtml } from "./stripHtml";
import { conversation } from "./conversation";
import { summary } from "./summary";

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

// Conversation aggregation step
export const conversationStep: PipelineStep = {
  name: "conversation",
  dependencies: ["strip_html"], // Depends on plain text being available
  execute: conversation,
  retryable: true,
  priority: 5, // Lower priority (runs later)
  timeout: 30000, // 30 seconds (might process many emails)
  description: "Aggregate all emails in a conversation into a single thread",
};

// Summary generation step
export const summaryStep: PipelineStep = {
  name: "summary",
  dependencies: ["conversation"], // Depends on conversation aggregation
  execute: summary,
  retryable: true,
  priority: 10, // Runs after conversation
  timeout: 60000, // 60 seconds (will include LLM calls later)
  description: "Generate conversation summary, title, tags, and category",
};
