import { Injectable } from '@nestjs/common';

type TaskPriority = 'interactive' | 'background';

type QueuedTask = {
  priority: TaskPriority;
  run: () => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
};

@Injectable()
export class DeviceAiTaskCoordinator {
  private readonly activeDevices = new Set<string>();
  private readonly queues = new Map<string, QueuedTask[]>();

  runInteractive<T>(ownerDeviceId: string, run: () => Promise<T>): Promise<T> {
    return this.enqueue(ownerDeviceId, 'interactive', run);
  }

  runBackground<T>(ownerDeviceId: string, run: () => Promise<T>): Promise<T> {
    return this.enqueue(ownerDeviceId, 'background', run);
  }

  private enqueue<T>(
    ownerDeviceId: string,
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
      const queue = this.queues.get(ownerDeviceId) ?? [];
      if (priority === 'interactive') {
        const firstBackground = queue.findIndex(item => item.priority === 'background');
        if (firstBackground < 0) queue.push(task);
        else queue.splice(firstBackground, 0, task);
      } else {
        queue.push(task);
      }
      this.queues.set(ownerDeviceId, queue);
      this.drain(ownerDeviceId);
    });
  }

  private drain(ownerDeviceId: string) {
    if (this.activeDevices.has(ownerDeviceId)) return;
    const queue = this.queues.get(ownerDeviceId);
    const next = queue?.shift();
    if (!next) {
      this.queues.delete(ownerDeviceId);
      return;
    }
    this.activeDevices.add(ownerDeviceId);
    void Promise.resolve()
      .then(next.run)
      .then(next.resolve, next.reject)
      .finally(() => {
        this.activeDevices.delete(ownerDeviceId);
        this.drain(ownerDeviceId);
      });
  }
}
