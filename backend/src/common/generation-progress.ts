export const GENERATION_PROGRESS_MILESTONE_IDS = [
  'queued',
  'photo-processing-started',
  'photos-ready',
  'provider-submitted',
  'provider-response-received',
  'result-validated',
  'completed',
] as const;

export type GenerationProgressMilestoneId = typeof GENERATION_PROGRESS_MILESTONE_IDS[number];
export type GenerationProgressStage =
  | 'queued'
  | 'analyzing-photos'
  | 'drafting'
  | 'structuring'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type GenerationProgressMilestone = {
  milestoneId: GenerationProgressMilestoneId;
  stage: GenerationProgressStage;
  progressPercent: number;
  reachedAt: number;
  attemptCount: number;
};

export const GENERATION_PROGRESS_MILESTONE_DEFINITIONS: Record<
  GenerationProgressMilestoneId,
  Pick<GenerationProgressMilestone, 'stage' | 'progressPercent'>
> = {
  queued: { stage: 'queued', progressPercent: 0 },
  'photo-processing-started': { stage: 'analyzing-photos', progressPercent: 0 },
  'photos-ready': { stage: 'analyzing-photos', progressPercent: 15 },
  'provider-submitted': { stage: 'drafting', progressPercent: 25 },
  'provider-response-received': { stage: 'structuring', progressPercent: 80 },
  'result-validated': { stage: 'structuring', progressPercent: 95 },
  completed: { stage: 'completed', progressPercent: 100 },
};

export const MAX_GENERATION_PROGRESS_MILESTONES = GENERATION_PROGRESS_MILESTONE_IDS.length;

export function isGenerationProgressMilestone(value: unknown): value is GenerationProgressMilestone {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const milestone = value as Record<string, unknown>;
  if (!GENERATION_PROGRESS_MILESTONE_IDS.includes(
    milestone.milestoneId as GenerationProgressMilestoneId,
  )) return false;
  const definition = GENERATION_PROGRESS_MILESTONE_DEFINITIONS[
    milestone.milestoneId as GenerationProgressMilestoneId
  ];
  return milestone.stage === definition.stage
    && milestone.progressPercent === definition.progressPercent
    && Number.isSafeInteger(milestone.reachedAt)
    && (milestone.reachedAt as number) >= 0
    && Number.isSafeInteger(milestone.attemptCount)
    && (milestone.attemptCount as number) >= 0;
}

export function readGenerationProgressMilestones(value: unknown): GenerationProgressMilestone[] {
  if (!Array.isArray(value) || value.length > MAX_GENERATION_PROGRESS_MILESTONES) return [];
  if (!value.every(isGenerationProgressMilestone)) return [];
  const milestones = value as GenerationProgressMilestone[];
  let previousIdIndex = -1;
  let previousAttemptCount = 0;
  if (new Set(milestones.map(item => item.milestoneId)).size !== milestones.length) return [];
  for (let index = 1; index < milestones.length; index += 1) {
    if (milestones[index].progressPercent < milestones[index - 1].progressPercent
      || milestones[index].reachedAt < milestones[index - 1].reachedAt
      || milestones[index].attemptCount < milestones[index - 1].attemptCount) return [];
  }
  for (const milestone of milestones) {
    const idIndex = GENERATION_PROGRESS_MILESTONE_IDS.indexOf(milestone.milestoneId);
    if (idIndex < previousIdIndex || milestone.attemptCount < previousAttemptCount) return [];
    previousIdIndex = idIndex;
    previousAttemptCount = milestone.attemptCount;
  }
  return milestones;
}
