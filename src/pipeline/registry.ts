// src/pipeline/registry.ts
import { PipelineOrchestrator } from "./orchestrator";
import { stripHtmlStep, conversationStep, summaryStep } from "./steps";

// Singleton guard
let isInitialized = false;

// Create and configure the global orchestrator
export const orchestrator = new PipelineOrchestrator();

// Only register steps once
if (!isInitialized) {
  orchestrator.registerStep(stripHtmlStep);
  orchestrator.registerStep(conversationStep);
  orchestrator.registerStep(summaryStep);

  console.log(
    "Pipeline orchestrator initialized with steps:",
    orchestrator.getSteps().map((s) => s.name)
  );

  isInitialized = true;
} else {
  console.log(
    "Pipeline orchestrator already initialized, skipping registration"
  );
}
