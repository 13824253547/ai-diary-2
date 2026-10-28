import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { DeviceAiTaskCoordinator } from '../../common/device-ai-task-coordinator';
import { PrismaService } from '../../common/prisma.service';
import { AnchorReadModelService } from '../anchors/anchor-read-model.service';
import {
  ArkGrowthInsightProvider,
  GROWTH_FLOWER_IDS,
  GROWTH_REPORT_DIMENSION_IDS,
  GrowthInsightProviderError,
  type GrowthFlowerCandidate,
  type GrowthFlowerId,
  type GrowthReportDimension,
  type GrowthReportObservation,
  type GrowthSourceDiary,
} from './ark-growth-insight-provider';

const FLOWER_TITLES: Record<GrowthFlowerId, string> = {
  pathfinder: '人生旷野的寻路者',
  'self-awareness': '觉察自我的思考者',
  healing: '压力迷茫的疗愈者',
};
const MAX_BATCH_CHARS = 10_000;
const MAX_BATCH_DIARIES = 10;
const BASELINE_RUN_KEY = 'baseline-v1';

type SourceDiaryRef = { id: string; version: number };
type DiarySnapshotRow = {
  id: string;
  version: number;
  title: string;
  date: Date;
  publishedLocalDate: string | null;
  createdAt: Date;
  contentSnapshot: Prisma.JsonValue | null;
};
type ReportDimensionWithSources = GrowthReportDimension;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validLocalDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function dateKeyFromTimestamp(value: Date | null | undefined) {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) return undefined;
  return value.toISOString().slice(0, 10);
}

export function resolveGrowthDiaryDate(row: Pick<DiarySnapshotRow, 'publishedLocalDate' | 'date' | 'createdAt'>) {
  if (validLocalDate(row.publishedLocalDate)) return row.publishedLocalDate;
  return dateKeyFromTimestamp(row.date) ?? dateKeyFromTimestamp(row.createdAt);
}

function dateDistanceInDays(previous: string, current: string) {
  const previousTime = Date.parse(`${previous}T00:00:00.000Z`);
  const currentTime = Date.parse(`${current}T00:00:00.000Z`);
  return Math.round((currentTime - previousTime) / 86_400_000);
}

export function computeCurrentConsecutiveDays(values: string[]) {
  const dates = [...new Set(values.filter(validLocalDate))].sort();
  if (!dates.length) return 0;
  let streak = 1;
  for (let index = 1; index < dates.length; index += 1) {
    streak = dateDistanceInDays(dates[index - 1], dates[index]) === 1 ? streak + 1 : 1;
  }
  return streak;
}

function sourceBlocks(snapshot: unknown): GrowthSourceDiary['blocks'] {
  if (!isRecord(snapshot) || !Array.isArray(snapshot.blocks)) return [];
  return snapshot.blocks.flatMap(block => {
    if (!isRecord(block)
      || (block.type !== 'text' && block.type !== 'quote')
      || typeof block.id !== 'string'
      || !block.id.trim()
      || typeof block.content !== 'string'
      || !block.content.trim()) return [];
    return [{
      id: block.id.trim(),
      type: block.type,
      content: block.content.trim(),
    }];
  });
}

function parseSourceRefs(value: unknown): SourceDiaryRef[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => isRecord(item)
    && typeof item.id === 'string'
    && item.id.trim()
    && Number.isSafeInteger(item.version)
    && (item.version as number) > 0
    ? [{ id: item.id, version: item.version as number }]
    : []);
}

function parseReportObservations(value: unknown): GrowthReportObservation[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is GrowthReportObservation =>
    isRecord(item)
    && typeof item.dimensionId === 'string'
    && GROWTH_REPORT_DIMENSION_IDS.includes(item.dimensionId as typeof GROWTH_REPORT_DIMENSION_IDS[number])
    && typeof item.observation === 'string'
    && Array.isArray(item.sourceDiaryIds));
}

function makeSourceVersion(refs: SourceDiaryRef[]) {
  return createHash('sha256')
    .update(JSON.stringify([...refs].sort((left, right) => left.id.localeCompare(right.id))
      .map(ref => [ref.id, ref.version])))
    .digest('hex');
}

function makeDiarySourceHash(diary: GrowthSourceDiary) {
  return createHash('sha256')
    .update(JSON.stringify([diary.id, diary.version, diary.title, diary.blocks]))
    .digest('hex');
}

function splitText(value: string, size: number) {
  const characters = Array.from(value);
  const pieces: string[] = [];
  for (let index = 0; index < characters.length; index += size) {
    pieces.push(characters.slice(index, index + size).join(''));
  }
  return pieces;
}

function makeDiaryBatches(diaries: GrowthSourceDiary[]) {
  const batches: GrowthSourceDiary[][] = [];
  let current = new Map<string, GrowthSourceDiary>();
  let currentCharacters = 0;
  const flush = () => {
    if (current.size) batches.push([...current.values()]);
    current = new Map();
    currentCharacters = 0;
  };

  for (const diary of diaries) {
    for (const block of diary.blocks) {
      for (const piece of splitText(block.content, MAX_BATCH_CHARS)) {
        let target = current.get(diary.id);
        if (currentCharacters > 0
          && (currentCharacters + piece.length > MAX_BATCH_CHARS
            || (!target && current.size >= MAX_BATCH_DIARIES))) {
          flush();
          target = undefined;
        }
        if (!target) {
          target = { ...diary, blocks: [] };
          current.set(diary.id, target);
        }
        target.blocks.push({ ...block, content: piece });
        currentCharacters += piece.length;
        if (currentCharacters >= MAX_BATCH_CHARS) flush();
      }
    }
  }
  flush();
  return batches;
}

function inputJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function parseJson(value: Prisma.JsonValue | null | undefined): unknown {
  return value ?? undefined;
}

export class GrowthInsightServiceError extends Error {
  constructor(readonly code: 'not_unlocked' | 'no_sources' | 'not_found' | 'source_changed') {
    super('成长分析请求暂时无法完成。');
    this.name = 'GrowthInsightServiceError';
  }
}

@Injectable()
export class GrowthInsightsService implements OnModuleInit {
  private readonly logger = new Logger(GrowthInsightsService.name);
  private readonly activeRecognitionRuns = new Set<string>();
  private readonly activeReportJobs = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly provider: ArkGrowthInsightProvider,
    private readonly taskCoordinator: DeviceAiTaskCoordinator,
    private readonly anchors: AnchorReadModelService,
  ) {}

  async onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    const [recognitionRuns, reportJobs] = await Promise.all([
      this.prisma.growthRecognitionRun.findMany({
        where: { status: { in: ['pending', 'running'] } },
        select: { id: true, ownerDeviceId: true, status: true, inFlightBatchIndex: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.growthReportJob.findMany({
        where: { status: { in: ['pending', 'running'] } },
        select: { id: true, ownerDeviceId: true, status: true, inFlightBatchIndex: true },
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    for (const run of recognitionRuns) {
      if (run.status === 'running' && run.inFlightBatchIndex !== null) {
        await this.prisma.growthRecognitionRun.update({
          where: { id: run.id },
          data: { status: 'failed', failureCode: 'interrupted', inFlightBatchIndex: null },
        });
        continue;
      }
      await this.prisma.growthRecognitionRun.update({
        where: { id: run.id },
        data: { status: 'pending' },
      });
      this.scheduleRecognitionRun(run.id, run.ownerDeviceId);
    }
    for (const job of reportJobs) {
      if (job.status === 'running' && job.inFlightBatchIndex !== null) {
        await this.prisma.growthReportJob.update({
          where: { id: job.id },
          data: {
            status: 'failed',
            failureCode: 'interrupted',
            candidateDimensions: Prisma.JsonNull,
            inFlightBatchIndex: null,
          },
        });
        continue;
      }
      await this.prisma.growthReportJob.update({
        where: { id: job.id },
        data: { status: 'pending' },
      });
      this.scheduleReportJob(job.id, job.ownerDeviceId);
    }
  }

  async enqueueDiaryVersion(ownerDeviceId: string, diaryId: string, diaryVersion: number) {
    if (!ownerDeviceId.trim() || !diaryId.trim() || !Number.isSafeInteger(diaryVersion) || diaryVersion < 1) return;
    const source = await this.loadDiarySource(ownerDeviceId, diaryId, diaryVersion);
    if (!source) return;
    const sourceHash = makeDiarySourceHash(source);
    const runKey = `diary:${diaryId}:${diaryVersion}`;
    const existing = await this.prisma.growthRecognitionRun.findUnique({
      where: { ownerDeviceId_runKey: { ownerDeviceId, runKey } },
    });
    if (existing) return;
    const run = await this.prisma.growthRecognitionRun.create({
      data: {
        ownerDeviceId,
        runKey,
        kind: 'diary',
        sourceVersion: sourceHash,
        sourceDiaryId: diaryId,
        sourceDiaryVersion: diaryVersion,
        sourceDiaryRefs: inputJson([{ id: diaryId, version: diaryVersion }]),
        status: 'pending',
        batchCount: makeDiaryBatches([source]).length,
        ...(makeDiaryBatches([source]).length === 0 ? { status: 'succeeded' } : {}),
      },
    });
    this.scheduleRecognitionRun(run.id, ownerDeviceId);
  }

  enqueueAfterDiarySaved(ownerDeviceId: string, diaryId: string, diaryVersion: number) {
    void this.enqueueDiaryVersion(ownerDeviceId, diaryId, diaryVersion).catch(error => {
      const code = error instanceof GrowthInsightProviderError ? error.code : 'provider_failed';
      this.logger.warn(`Growth diary task could not be queued (${code}).`);
    });
  }

  async initializeFlowers(ownerDeviceId: string) {
    const existing = await this.prisma.growthRecognitionRun.findUnique({
      where: { ownerDeviceId_runKey: { ownerDeviceId, runKey: BASELINE_RUN_KEY } },
    });
    if (existing) {
      if (existing.status === 'pending') this.scheduleRecognitionRun(existing.id, ownerDeviceId);
      return this.getState(ownerDeviceId);
    }
    const allSources = await this.listCurrentDiarySources(ownerDeviceId);
    const refs = allSources.map(({ id, version }) => ({ id, version }));
    const batches = makeDiaryBatches(allSources);
    const run = await this.prisma.growthRecognitionRun.create({
      data: {
        ownerDeviceId,
        runKey: BASELINE_RUN_KEY,
        kind: 'baseline',
        sourceVersion: makeSourceVersion(refs),
        sourceDiaryRefs: inputJson(refs),
        status: batches.length ? 'pending' : 'succeeded',
        batchCount: batches.length,
      },
    });
    this.scheduleRecognitionRun(run.id, ownerDeviceId);
    return this.getState(ownerDeviceId);
  }

  async retryFlowerAnalysis(ownerDeviceId: string) {
    const failedRuns = await this.prisma.growthRecognitionRun.findMany({
      where: { ownerDeviceId, status: 'failed' },
      orderBy: { createdAt: 'asc' },
    });
    for (const run of failedRuns) {
      if (run.kind === 'baseline') {
        const sources = await this.listCurrentDiarySources(ownerDeviceId);
        const refs = sources.map(({ id, version }) => ({ id, version }));
        const batches = makeDiaryBatches(sources);
        await this.prisma.growthRecognitionRun.update({
          where: { id: run.id },
          data: {
            sourceVersion: makeSourceVersion(refs),
            sourceDiaryRefs: inputJson(refs),
            batchResults: Prisma.JsonNull,
            nextBatchIndex: 0,
            inFlightBatchIndex: null,
            batchCount: batches.length,
            attempt: { increment: 1 },
            status: batches.length ? 'pending' : 'succeeded',
            failureCode: null,
          },
        });
        if (batches.length) this.scheduleRecognitionRun(run.id, ownerDeviceId);
        continue;
      }
      if (!run.sourceDiaryId || !run.sourceDiaryVersion) continue;
      const source = await this.loadDiarySource(ownerDeviceId, run.sourceDiaryId, run.sourceDiaryVersion);
      if (!source || makeDiarySourceHash(source) !== run.sourceVersion) continue;
      await this.prisma.growthRecognitionRun.update({
        where: { id: run.id },
        data: {
          batchResults: Prisma.JsonNull,
          nextBatchIndex: 0,
          inFlightBatchIndex: null,
          batchCount: makeDiaryBatches([source]).length,
          attempt: { increment: 1 },
          status: 'pending',
          failureCode: null,
        },
      });
      this.scheduleRecognitionRun(run.id, ownerDeviceId);
    }
    return this.getState(ownerDeviceId);
  }

  async getState(ownerDeviceId: string) {
    const [flowers, baseline, milestones, diaries, latestReport] = await Promise.all([
      this.prisma.growthFlower.findMany({
        where: { ownerDeviceId },
        orderBy: { awardedAt: 'asc' },
      }),
      this.prisma.growthRecognitionRun.findUnique({
        where: { ownerDeviceId_runKey: { ownerDeviceId, runKey: BASELINE_RUN_KEY } },
      }),
      this.prisma.growthMilestone.findUnique({
        where: { ownerDeviceId_milestoneId: { ownerDeviceId, milestoneId: 'first-trip' } },
      }),
      this.prisma.diary.findMany({
        where: { ownerDeviceId },
        select: { id: true, version: true, date: true, publishedLocalDate: true, createdAt: true },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.growthInsightReport.findFirst({
        where: { ownerDeviceId },
        orderBy: [{ generatedAt: 'desc' }, { id: 'desc' }],
      }),
    ]);
    let anchorCount: number | undefined;
    let anchorCountUnavailable = false;
    try {
      anchorCount = await this.anchors.countFeed(ownerDeviceId);
    } catch {
      anchorCountUnavailable = true;
    }
    const flowerById = new Map(flowers.map(flower => [flower.flowerKey, flower]));
    const bloomedCount = GROWTH_FLOWER_IDS.filter(flowerId => flowerById.has(flowerId)).length;
    const currentSourceVersion = makeSourceVersion(diaries.map(diary => ({
      id: diary.id,
      version: diary.version,
    })));
    const currentVersionReport = latestReport?.sourceVersion === currentSourceVersion
      ? latestReport
      : await this.prisma.growthInsightReport.findUnique({
        where: { ownerDeviceId_sourceVersion: { ownerDeviceId, sourceVersion: currentSourceVersion } },
      });
    const visibleReport = currentVersionReport ?? latestReport;
    const currentReportJob = await this.prisma.growthReportJob.findUnique({
      where: { ownerDeviceId_sourceVersion: { ownerDeviceId, sourceVersion: currentSourceVersion } },
    });
    const reportUnlocked = bloomedCount === GROWTH_FLOWER_IDS.length;
    const staleReport = Boolean(visibleReport && visibleReport.sourceVersion !== currentSourceVersion);
    const reportStatus = !reportUnlocked
      ? 'locked'
      : currentReportJob?.status === 'pending' || currentReportJob?.status === 'running'
        ? currentReportJob.status
        : currentReportJob?.status === 'failed'
          ? 'failed'
          : visibleReport && !staleReport
            ? 'succeeded'
            : visibleReport
              ? 'stale'
              : 'idle';
    const validDates = diaries.map(resolveGrowthDiaryDate).filter((date): date is string => Boolean(date));
    const progress = baseline?.batchCount
      ? Math.min(baseline.nextBatchIndex, baseline.batchCount)
      : 0;

    return {
      version: 'growth-insight-v1' as const,
      flowers: GROWTH_FLOWER_IDS.map(flowerId => {
        const flower = flowerById.get(flowerId);
        return {
          flowerId,
          title: FLOWER_TITLES[flowerId],
          status: flower ? 'bloomed' as const : 'locked' as const,
          ...(flower ? {
            summary: flower.summary,
            sourceDiaries: parseSourceRefs(flower.sourceDiaryVersions),
            awardedAt: flower.awardedAt.toISOString(),
          } : {}),
        };
      }),
      flowerAnalysis: {
        status: (baseline?.status ?? 'not_started') as 'not_started' | 'pending' | 'running' | 'succeeded' | 'failed',
        completedBatches: progress,
        totalBatches: baseline?.batchCount ?? 0,
        ...(baseline?.failureCode ? { failureCode: baseline.failureCode } : {}),
      },
      milestones: {
        firstTrip: {
          achieved: Boolean(milestones),
          sourceDiaryIds: milestones ? parseStringArray(milestones.sourceDiaryIds) : [],
        },
        streak30: {
          currentDays: computeCurrentConsecutiveDays(validDates),
          targetDays: 30 as const,
          achieved: computeCurrentConsecutiveDays(validDates) >= 30,
        },
        anchors100: {
          ...(anchorCount !== undefined ? { count: anchorCount, achieved: anchorCount >= 100 } : {}),
          target: 100 as const,
          ...(anchorCountUnavailable ? { unavailable: true } : {}),
        },
      },
      report: {
        unlocked: reportUnlocked,
        status: reportStatus as 'locked' | 'idle' | 'pending' | 'running' | 'succeeded' | 'failed' | 'stale',
        stale: staleReport,
        ...(currentReportJob?.failureCode ? { failureCode: currentReportJob.failureCode } : {}),
        ...(reportUnlocked && visibleReport ? { current: this.mapReport(visibleReport) } : {}),
      },
    };
  }

  async ensureCurrentReport(ownerDeviceId: string) {
    const flowers = await this.prisma.growthFlower.count({ where: { ownerDeviceId } });
    if (flowers < GROWTH_FLOWER_IDS.length) throw new GrowthInsightServiceError('not_unlocked');
    const sourceSnapshot = await this.listCurrentDiarySources(ownerDeviceId);
    if (!sourceSnapshot.length) throw new GrowthInsightServiceError('no_sources');
    const sourceVersion = await this.currentDiarySetVersion(ownerDeviceId);
    const existingJob = await this.prisma.growthReportJob.findUnique({
      where: { ownerDeviceId_sourceVersion: { ownerDeviceId, sourceVersion } },
    });
    if (existingJob) {
      if (existingJob.status === 'pending') this.scheduleReportJob(existingJob.id, ownerDeviceId);
      return this.getState(ownerDeviceId);
    }
    const batches = makeDiaryBatches(sourceSnapshot);
    const requestId = `growth-report-${randomUUID()}`;
    const job = await this.prisma.growthReportJob.create({
      data: {
        ownerDeviceId,
        requestId,
        sourceVersion,
        sourceDiaryRefs: inputJson(sourceSnapshot.map(({ id, version }) => ({ id, version }))),
        status: 'pending',
        batchCount: batches.length,
      },
    });
    this.scheduleReportJob(job.id, ownerDeviceId);
    return this.getState(ownerDeviceId);
  }

  async retryCurrentReport(ownerDeviceId: string) {
    const currentSourceVersion = await this.currentDiarySetVersion(ownerDeviceId);
    const job = await this.prisma.growthReportJob.findUnique({
      where: { ownerDeviceId_sourceVersion: { ownerDeviceId, sourceVersion: currentSourceVersion } },
    });
    if (!job || job.status !== 'failed') return this.ensureCurrentReport(ownerDeviceId);
    const flowers = await this.prisma.growthFlower.count({ where: { ownerDeviceId } });
    if (flowers < GROWTH_FLOWER_IDS.length) throw new GrowthInsightServiceError('not_unlocked');
    const refs = parseSourceRefs(job.sourceDiaryRefs);
    const sourceSnapshot = await this.loadSourcesByRefs(ownerDeviceId, refs);
    if (!sourceSnapshot.length || await this.currentDiarySetVersion(ownerDeviceId) !== currentSourceVersion) {
      throw new GrowthInsightServiceError('source_changed');
    }
    await this.prisma.growthReportJob.update({
      where: { id: job.id },
      data: {
        requestId: `growth-report-${randomUUID()}`,
        sourceDiaryRefs: inputJson(refs),
        candidateDimensions: Prisma.JsonNull,
        nextBatchIndex: 0,
        inFlightBatchIndex: null,
        batchCount: makeDiaryBatches(sourceSnapshot).length,
        attempt: { increment: 1 },
        status: 'pending',
        failureCode: null,
      },
    });
    this.scheduleReportJob(job.id, ownerDeviceId);
    return this.getState(ownerDeviceId);
  }

  private async listCurrentDiarySources(ownerDeviceId: string): Promise<GrowthSourceDiary[]> {
    const diaries = await this.prisma.diary.findMany({
      where: { ownerDeviceId },
      select: { id: true, version: true, title: true, contentSnapshot: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return diaries.flatMap(diary => {
      const blocks = sourceBlocks(diary.contentSnapshot);
      return blocks.length ? [{ id: diary.id, version: diary.version, title: diary.title, blocks }] : [];
    });
  }

  private async loadDiarySource(ownerDeviceId: string, diaryId: string, version: number) {
    const diary = await this.prisma.diary.findFirst({
      where: { id: diaryId, ownerDeviceId, version },
      select: { id: true, version: true, title: true, contentSnapshot: true },
    });
    if (!diary) return null;
    const blocks = sourceBlocks(diary.contentSnapshot);
    return blocks.length ? { id: diary.id, version: diary.version, title: diary.title, blocks } : null;
  }

  private async loadSourcesByRefs(ownerDeviceId: string, refs: SourceDiaryRef[]) {
    if (!refs.length) return [];
    const diaries = await this.prisma.diary.findMany({
      where: { ownerDeviceId, id: { in: refs.map(ref => ref.id) } },
      select: { id: true, version: true, title: true, contentSnapshot: true },
      orderBy: [{ id: 'asc' }],
    });
    const versionById = new Map(refs.map(ref => [ref.id, ref.version]));
    if (diaries.length !== refs.length
      || diaries.some(diary => versionById.get(diary.id) !== diary.version)) {
      throw new GrowthInsightServiceError('source_changed');
    }
    return diaries.flatMap(diary => {
      const blocks = sourceBlocks(diary.contentSnapshot);
      return blocks.length ? [{ id: diary.id, version: diary.version, title: diary.title, blocks }] : [];
    });
  }

  private async currentDiarySetVersion(ownerDeviceId: string) {
    const refs = await this.prisma.diary.findMany({
      where: { ownerDeviceId },
      select: { id: true, version: true },
      orderBy: [{ id: 'asc' }],
    });
    return makeSourceVersion(refs);
  }

  private scheduleRecognitionRun(runId: string, ownerDeviceId: string) {
    if (process.env.NODE_ENV === 'test') return;
    void this.processRecognitionRun(runId, ownerDeviceId).catch(error => {
      const code = error instanceof GrowthInsightProviderError ? error.code : 'provider_failed';
      this.logger.warn(`Growth recognition task stopped (${code}).`);
    });
  }

  private async processRecognitionRun(runId: string, ownerDeviceId: string) {
    if (this.activeRecognitionRuns.has(runId)) return;
    this.activeRecognitionRuns.add(runId);
    try {
      const run = await this.prisma.growthRecognitionRun.findFirst({
        where: { id: runId, ownerDeviceId },
      });
      if (!run || run.status === 'succeeded') return;
      if (run.status === 'failed') return;
      await this.prisma.growthRecognitionRun.update({
        where: { id: runId },
        data: { status: 'running' },
      });
      const refs = parseSourceRefs(run.sourceDiaryRefs);
      const sources = await this.loadSourcesByRefs(ownerDeviceId, refs);
      const batches = makeDiaryBatches(sources);
      if (batches.length !== run.batchCount) {
        throw new GrowthInsightServiceError('source_changed');
      }
      for (let index = run.nextBatchIndex; index < batches.length; index += 1) {
        await this.prisma.growthRecognitionRun.update({
          where: { id: runId },
          data: { status: 'running', inFlightBatchIndex: index },
        });
        const result = await this.taskCoordinator.runBackground(
          ownerDeviceId,
          () => this.provider.recognizeFlowers(batches[index]),
        );
        const allowedDiaryIds = new Set(batches[index].map(diary => diary.id));
        if (result.flowers.some(flower => flower.sourceDiaryIds.some(id => !allowedDiaryIds.has(id)))
          || result.tripDiaryIds.some(id => !allowedDiaryIds.has(id))) {
          throw new GrowthInsightProviderError('invalid_response');
        }
        await this.grantFlowers(ownerDeviceId, result, refs);
        await this.grantFirstTrip(ownerDeviceId, result.tripDiaryIds);
        await this.prisma.growthRecognitionRun.update({
          where: { id: runId },
          data: {
            nextBatchIndex: index + 1,
            inFlightBatchIndex: null,
          },
        });
      }
      await this.prisma.growthRecognitionRun.update({
        where: { id: runId },
        data: { status: 'succeeded', failureCode: null, inFlightBatchIndex: null },
      });
    } catch (error) {
      const code = error instanceof GrowthInsightProviderError
        ? error.code
        : error instanceof GrowthInsightServiceError
          ? 'source_changed'
          : 'provider_failed';
      await this.prisma.growthRecognitionRun.updateMany({
        where: { id: runId, ownerDeviceId, status: { in: ['pending', 'running'] } },
        data: { status: 'failed', failureCode: code, inFlightBatchIndex: null },
      });
    } finally {
      this.activeRecognitionRuns.delete(runId);
    }
  }

  private async grantFlowers(
    ownerDeviceId: string,
    result: GrowthFlowerRecognitionResult,
    sourceRefs: SourceDiaryRef[],
  ) {
    const versionById = new Map(sourceRefs.map(ref => [ref.id, ref.version]));
    for (const flower of result.flowers) {
      const versions = flower.sourceDiaryIds.map(id => ({ id, version: versionById.get(id) }));
      if (versions.some(ref => !ref.version)) throw new GrowthInsightProviderError('invalid_response');
      const sourceHash = createHash('sha256').update(JSON.stringify(versions)).digest('hex');
      await this.prisma.growthFlower.upsert({
        where: { ownerDeviceId_flowerKey: { ownerDeviceId, flowerKey: flower.flowerId } },
        create: {
          ownerDeviceId,
          flowerKey: flower.flowerId,
          summary: flower.summary,
          sourceDiaryIds: inputJson(flower.sourceDiaryIds),
          sourceDiaryVersions: inputJson(versions),
          sourceHash,
        },
        update: {},
      });
    }
  }

  private async grantFirstTrip(ownerDeviceId: string, sourceDiaryIds: string[]) {
    if (!sourceDiaryIds.length) return;
    await this.prisma.growthMilestone.upsert({
      where: { ownerDeviceId_milestoneId: { ownerDeviceId, milestoneId: 'first-trip' } },
      create: {
        ownerDeviceId,
        milestoneId: 'first-trip',
        sourceDiaryIds: inputJson(sourceDiaryIds),
      },
      update: {},
    });
  }

  private async scheduleReportJob(jobId: string, ownerDeviceId: string) {
    if (process.env.NODE_ENV === 'test') return;
    void this.processReportJob(jobId, ownerDeviceId).catch(error => {
      const code = error instanceof GrowthInsightProviderError ? error.code : 'provider_failed';
      this.logger.warn(`Growth report task stopped (${code}).`);
    });
  }

  private async processReportJob(jobId: string, ownerDeviceId: string) {
    if (this.activeReportJobs.has(jobId)) return;
    this.activeReportJobs.add(jobId);
    try {
      const job = await this.prisma.growthReportJob.findFirst({
        where: { id: jobId, ownerDeviceId },
      });
      if (!job || job.status === 'succeeded' || job.status === 'failed') return;
      await this.prisma.growthReportJob.update({
        where: { id: jobId },
        data: { status: 'running' },
      });
      const refs = parseSourceRefs(job.sourceDiaryRefs);
      const sources = await this.loadSourcesByRefs(ownerDeviceId, refs);
      if (!sources.length || await this.currentDiarySetVersion(ownerDeviceId) !== job.sourceVersion) {
        throw new GrowthInsightServiceError('source_changed');
      }
      const batches = makeDiaryBatches(sources);
      if (batches.length !== job.batchCount) throw new GrowthInsightServiceError('source_changed');
      let observations = parseReportObservations(parseJson(job.candidateDimensions));
      for (let index = job.nextBatchIndex; index < batches.length; index += 1) {
        await this.prisma.growthReportJob.update({
          where: { id: jobId },
          data: { status: 'running', inFlightBatchIndex: index },
        });
        const batchObservations = await this.taskCoordinator.runBackground(
          ownerDeviceId,
          () => this.provider.summarizeReportChunk(batches[index]),
        );
        const allowed = new Set(batches[index].map(diary => diary.id));
        if (batchObservations.some(item => item.sourceDiaryIds.some(id => !allowed.has(id)))) {
          throw new GrowthInsightProviderError('invalid_response');
        }
        observations = [...observations, ...batchObservations];
        await this.prisma.growthReportJob.update({
          where: { id: jobId },
          data: {
            candidateDimensions: inputJson(observations),
            nextBatchIndex: index + 1,
            inFlightBatchIndex: null,
          },
        });
      }
      const evidenceIds = [...new Set(observations.flatMap(item => item.sourceDiaryIds))];
      await this.prisma.growthReportJob.update({
        where: { id: jobId },
        data: { status: 'running', inFlightBatchIndex: batches.length },
      });
      const dimensions = await this.taskCoordinator.runBackground(
        ownerDeviceId,
        () => this.provider.synthesizeReport(observations, evidenceIds),
      );
      if (dimensions.some(item => item.sourceDiaryIds.some(id => !evidenceIds.includes(id)))) {
        throw new GrowthInsightProviderError('invalid_response');
      }
      if (await this.currentDiarySetVersion(ownerDeviceId) !== job.sourceVersion) {
        throw new GrowthInsightServiceError('source_changed');
      }
      const flowerCount = await this.prisma.growthFlower.count({ where: { ownerDeviceId } });
      if (flowerCount < GROWTH_FLOWER_IDS.length) throw new GrowthInsightServiceError('not_unlocked');
      await this.prisma.$transaction(async transaction => {
        const savedReport = await transaction.growthInsightReport.upsert({
          where: { ownerDeviceId_sourceVersion: { ownerDeviceId, sourceVersion: job.sourceVersion } },
          create: {
            ownerDeviceId,
            sourceVersion: job.sourceVersion,
            sourceDiaryIds: inputJson(refs.map(ref => ref.id)),
            sourceDiaryVersions: inputJson(refs),
            sourceDiaryCount: refs.length,
            dimensions: inputJson(dimensions),
          },
          update: {},
        });
        await transaction.growthInsightReport.deleteMany({
          where: { ownerDeviceId, id: { not: savedReport.id } },
        });
      });
      await this.prisma.growthReportJob.update({
        where: { id: jobId },
        data: {
          status: 'succeeded',
          failureCode: null,
          candidateDimensions: Prisma.JsonNull,
          inFlightBatchIndex: null,
        },
      });
    } catch (error) {
      const code = error instanceof GrowthInsightProviderError
        ? error.code
        : error instanceof GrowthInsightServiceError
          ? error.code
          : 'provider_failed';
      await this.prisma.growthReportJob.updateMany({
        where: { id: jobId, ownerDeviceId, status: { in: ['pending', 'running'] } },
        data: {
          status: 'failed',
          failureCode: code,
          candidateDimensions: Prisma.JsonNull,
          nextBatchIndex: 0,
          inFlightBatchIndex: null,
        },
      });
    } finally {
      this.activeReportJobs.delete(jobId);
    }
  }

  private async getLatestReport(ownerDeviceId: string) {
    return this.prisma.growthInsightReport.findFirst({
      where: { ownerDeviceId },
      orderBy: [{ generatedAt: 'desc' }, { id: 'desc' }],
    });
  }

  private mapReport(report: {
    id: string;
    sourceVersion: string;
    sourceDiaryIds: Prisma.JsonValue;
    sourceDiaryVersions: Prisma.JsonValue;
    sourceDiaryCount: number;
    dimensions: Prisma.JsonValue;
    generatedAt: Date;
  }) {
    return {
      reportId: report.id,
      sourceVersion: report.sourceVersion,
      sourceDiaryIds: parseStringArray(report.sourceDiaryIds),
      sourceDiaries: parseSourceRefs(report.sourceDiaryVersions),
      sourceDiaryCount: report.sourceDiaryCount,
      dimensions: Array.isArray(report.dimensions)
        ? report.dimensions as unknown as ReportDimensionWithSources[]
        : [],
      generatedAt: report.generatedAt.toISOString(),
    };
  }
}

type GrowthFlowerRecognitionResult = {
  flowers: GrowthFlowerCandidate[];
  tripDiaryIds: string[];
};

function parseStringArray(value: Prisma.JsonValue | null | undefined): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}
