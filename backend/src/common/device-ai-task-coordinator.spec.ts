import { DeviceAiTaskCoordinator } from './device-ai-task-coordinator';

describe('DeviceAiTaskCoordinator', () => {
  test('serializes one device and prioritizes queued interactive chat over background work', async () => {
    const coordinator = new DeviceAiTaskCoordinator();
    const order: string[] = [];
    let releaseBackground!: () => void;
    const backgroundGate = new Promise<void>(resolve => { releaseBackground = resolve; });

    const activeBackground = coordinator.runBackground('device-1', async () => {
      order.push('background-active-start');
      await backgroundGate;
      order.push('background-active-end');
    });
    const queuedBackground = coordinator.runBackground('device-1', async () => {
      order.push('background-queued');
    });
    const queuedChat = coordinator.runInteractive('device-1', async () => {
      order.push('chat-interactive');
    });
    await Promise.resolve();
    expect(order).toEqual(['background-active-start']);

    releaseBackground();
    await Promise.all([activeBackground, queuedChat, queuedBackground]);

    expect(order).toEqual([
      'background-active-start',
      'background-active-end',
      'chat-interactive',
      'background-queued',
    ]);
  });

  test('allows independent devices to run concurrently', async () => {
    const coordinator = new DeviceAiTaskCoordinator();
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>(resolve => { releaseFirst = resolve; });
    let secondStarted = false;

    const first = coordinator.runBackground('device-1', () => firstGate);
    const second = coordinator.runInteractive('device-2', async () => {
      secondStarted = true;
    });
    await Promise.resolve();

    expect(secondStarted).toBe(true);
    releaseFirst();
    await Promise.all([first, second]);
  });
});
