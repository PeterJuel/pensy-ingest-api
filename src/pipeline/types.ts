export interface Email {
  id: string;
  subject: string;
  body: any;
  conversation_id: string | null;
}

export interface StepResult {
  success: boolean;
  error?: string;
  metadata?: Record<string, any>;
  duration: number;
}

export interface PipelineStep {
  name: string;
  dependencies: string[];
  execute: (email: Email) => Promise<void>;
  retryable: boolean;
  priority: number;
  timeout?: number; // milliseconds
  description?: string;
}

export interface PipelineContext {
  emailId: string;
  email: Email;
  completedSteps: Set<string>;
  failedSteps: Set<string>;
  stepResults: Map<string, StepResult>;
  startTime: number;
}

export interface ExecutionPlan {
  steps: string[];
  parallelGroups: string[][];
  totalSteps: number;
}
