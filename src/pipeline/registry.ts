// src/pipeline/registry.ts
import { PipelineOrchestrator } from "./orchestrator";
import { stripHtmlStep, conversationStep, summaryStep } from "./steps";

// Use global to persist across HMR reloads in development
declare global {
  var __pipelineOrchestrator: PipelineOrchestrator | undefined;
  var __pipelineInitialized: boolean | undefined;
}

function createOrchestrator(): PipelineOrchestrator {
  const orch = new PipelineOrchestrator();

  // Register all steps
  orch.registerStep(stripHtmlStep);
  orch.registerStep(conversationStep);
  orch.registerStep(summaryStep);

  // Remove console.log to avoid spam in development
  // console.log(
  //   "Pipeline orchestrator initialized with steps:",
  //   orch.getSteps().map((s) => s.name)
  // );

  return orch;
}

// In development, use global to persist across HMR
// In production, create new instance
let orchestrator: PipelineOrchestrator;

if (process.env.NODE_ENV === "development") {
  if (!globalThis.__pipelineInitialized) {
    globalThis.__pipelineOrchestrator = createOrchestrator();
    globalThis.__pipelineInitialized = true;
  }
  orchestrator = globalThis.__pipelineOrchestrator!;
} else {
  orchestrator = createOrchestrator();
}

export { orchestrator };
