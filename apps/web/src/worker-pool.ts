import type { RelicInstanceData } from '@hsr-sim/data';

export interface SimulationRequest {
  kind: 'run_training_fixture' | 'run_scenario' | 'search_training_loadouts' | 'run_apl' | 'run_custom_enemy' | 'run_pinned_character' | 'verify_share';
  text?: string;
  shareToken?: string;
  characterId?: string;
  characterIds?: readonly string[];
  scenarioId?: string;
  relics?: readonly RelicInstanceData[];
  lightConeIds?: readonly string[];
}

export interface SimulationResult {
  enemyHp: number;
  actions: number;
  events: number;
  hash: string;
  lines: string[];
  shareToken?: string;
  search?: { candidates: number; retained: number; bestId?: string; bestScore?: number; bestEnemyHp?: number; usedImportedRelics?: number };
  replayVerified?: boolean;
  scenario?: { id: string; mode: string; version: string; waves: number; stoppedBecause: string; score?: number };
}

interface WorkerResultMessage extends SimulationResult {
  requestId: string;
  error?: string;
}

interface QueueEntry {
  requestId: string;
  request: SimulationRequest;
  resolve: (result: SimulationResult) => void;
  reject: (error: Error) => void;
}

/** Structured-clone-safe worker pool for batch simulations. */
export class SimulationWorkerPool {
  private readonly workers: Worker[];
  private readonly queues: QueueEntry[][];
  private readonly busy: boolean[];
  private nextRequest = 0;
  private nextWorker = 0;

  public constructor(size = Math.max(1, Math.min(4, (navigator.hardwareConcurrency ?? 4) - 1))) {
    this.workers = Array.from({ length: size }, () => new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module' }));
    this.queues = this.workers.map(() => []);
    this.busy = this.workers.map(() => false);
    this.workers.forEach((worker, index) => {
      worker.addEventListener('message', (message: MessageEvent<WorkerResultMessage>) => this.complete(index, message.data));
      worker.addEventListener('error', (event) => this.failWorker(index, new Error(event.message || 'Simulation worker failed')));
    });
  }

  public run(request: SimulationRequest): Promise<SimulationResult> {
    const workerIndex = this.nextWorker;
    this.nextWorker = (this.nextWorker + 1) % this.workers.length;
    const requestId = `sim-${this.nextRequest++}`;
    return new Promise((resolve, reject) => {
      this.queues[workerIndex]!.push({ requestId, request, resolve, reject });
      this.drain(workerIndex);
    });
  }

  public dispose(): void {
    for (const worker of this.workers) worker.terminate();
  }

  private drain(index: number): void {
    if (this.busy[index]) return;
    const entry = this.queues[index]![0];
    if (!entry) return;
    this.busy[index] = true;
    this.workers[index]!.postMessage({ ...entry.request, requestId: entry.requestId });
  }

  private complete(index: number, message: WorkerResultMessage): void {
    const entry = this.queues[index]![0];
    if (!entry || entry.requestId !== message.requestId) {
      this.failWorker(index, new Error('Simulation worker returned an unknown request id'));
      return;
    }
    this.queues[index]!.shift();
    this.busy[index] = false;
    if (message.error) entry.reject(new Error(message.error));
    else entry.resolve(message);
    this.drain(index);
  }

  private failWorker(index: number, error: Error): void {
    const entry = this.queues[index]!.shift();
    this.busy[index] = false;
    entry?.reject(error);
    this.drain(index);
  }
}
