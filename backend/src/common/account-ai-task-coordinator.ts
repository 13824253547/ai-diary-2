import { Injectable } from '@nestjs/common';

type TaskPriority = 'interactive' | 'background';

type QueuedTask = {
  priority: TaskPriority;
  run: () => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
};

@Injectable()
export class AccountAiTaskCoordinator {
  private readonly activeAccounts = new Set<string>();
  private readonly queues = new Map<string, QueuedTask[]>();

  runInteractive<T>(ownerUserId: string, run: () => Promise<T>): Promise<T> {
    return this.enqueue(ownerUserId, 'interactive', run);
  }

  runBackground<T>(ownerUserId: string, run: () => Promise<T>): Promise<T> {
    return this.enqueue(ownerUserId, 'background', run);
  }

  private enqueue<T>(
    ownerUserId: string,
    priority: TaskPriority,
    run: () => Promise<T>,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const task: QueuedTask = {
        priority,
        run,
        resolve: value => resolve(value as T),
        reject,
      };
      const queue = this.queues.get(ownerUserId) ?? [];
      if (priority === 'interactive') {
        const firstBackground = queue.findIndex(item => item.priority === 'background');
        if (firstBackground < 0) queue.push(task);
        else queue.splice(firstBackground, 0, task);
      } else {
        queue.push(task);
      }
      this.queues.set(ownerUserId, queue);
      this.drain(ownerUserId);
    });
  }

  private drain(ownerUserId: string) {
    if (this.activeAccounts.has(ownerUserId)) return;
    const queue = this.queues.get(ownerUserId);
    const next = queue?.shift();
    if (!next) {
      this.queues.delete(ownerUserId);
      return;
    }
    this.activeAccounts.add(ownerUserId);
    void Promise.resolve()
      .then(next.run)
      .then(next.resolve, next.reject)
      .finally(() => {
        this.activeAccounts.delete(ownerUserId);
        this.drain(ownerUserId);
      });
  }
}
