import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { AnchorReadModelService } from '../anchors/anchor-read-model.service';

@Injectable()
export class PetChatMemoryService {
  private readonly cache = new Map<string, { fingerprint: string; text: string; expiresAt: number }>();

  constructor(private readonly anchors: AnchorReadModelService) {}

  async getContext(ownerDeviceId: string): Promise<string> {
    // Revalidate ownership, current diary versions and source blocks before any cache hit.
    const page = await this.anchors.listFeed({
      page: 1, pageSize: 10, sourceType: 'diary',
    }, ownerDeviceId);
    const records = page.items
      .filter(item => item.sourceType === 'diary' && item.diary && item.excerpt.trim())
      .map(item => ({
        diaryId: item.diary!.id,
        version: item.diary!.version,
        title: item.title.slice(0, 120),
        savedAt: item.displayDate,
        summary: item.excerpt.slice(0, 240),
      }));
    const fingerprint = createHash('sha256').update(JSON.stringify(records)).digest('hex');
    const cached = this.cache.get(ownerDeviceId);
    if (cached?.fingerprint === fingerprint && cached.expiresAt > Date.now()) return cached.text;
    const text = records.length ? JSON.stringify(records) : '';
    for (const [key, entry] of this.cache) {
      if (entry.expiresAt <= Date.now()) this.cache.delete(key);
    }
    if (this.cache.size >= 100) this.cache.delete(this.cache.keys().next().value!);
    this.cache.set(ownerDeviceId, { fingerprint, text, expiresAt: Date.now() + 60_000 });
    return text;
  }
}
