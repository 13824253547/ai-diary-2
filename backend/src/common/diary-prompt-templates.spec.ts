import {
  buildFullDiaryPhotoLabel,
  buildFullDiarySystemPrompt,
  buildFullDiaryUserPrompt,
  buildRewriteSystemPrompt,
  buildRewriteUserPrompt,
  getDiaryCharacterStyleName,
} from './diary-prompt-templates';

describe('diary prompt templates', () => {
  test('defines a distinct server-side prompt profile for each selectable character', () => {
    const characterIds = ['character-blue', 'character-green', 'character-brown'];
    const names = characterIds.map(getDiaryCharacterStyleName);
    const prompts = characterIds.map(buildFullDiarySystemPrompt);

    expect(new Set(names).size).toBe(3);
    expect(new Set(prompts).size).toBe(3);
    expect(prompts[0]).toContain('日式旅行杂志');
    expect(prompts[1]).toContain('复古明信片');
    expect(prompts[2]).toContain('北欧简约');
  });

  test('distinguishes writing mechanics while keeping photo truth and output contract shared', () => {
    const profiles = [
      {
        id: 'character-blue',
        focus: '一个小动作、颜色或构图',
        rhythm: '短句和中等长度的完整句交替',
        boundary: '不要写成给某人的信',
      },
      {
        id: 'character-green',
        focus: '风景和旅途所见',
        rhythm: '句子比杂志随笔稍舒展',
        boundary: '不制造旅伴、对白',
      },
      {
        id: 'character-brown',
        focus: '一两个照片中真正可见',
        rhythm: '简洁的完整句和自然停顿',
        boundary: '不靠刻意短碎句假装留白',
      },
    ];

    for (const { id, focus, rhythm, boundary } of profiles) {
      const full = buildFullDiarySystemPrompt(id);
      const rewrite = buildRewriteSystemPrompt(id, 'text');
      for (const prompt of [full, rewrite]) {
        expect(prompt).toContain(focus);
        expect(prompt).toContain(rhythm);
        expect(prompt).toContain(boundary);
        expect(prompt).toContain('不虚构照片外的具体经历');
      }
      expect(full).toContain('第 i 个正文块必须且只能');
      expect(full).toContain('标题和摘要也使用同一种语气');
      expect(rewrite).toContain('不能覆盖原文核心事实');
    }
  });

  test('keeps full generation and single-block rewrite instructions separate', () => {
    const full = buildFullDiarySystemPrompt('character-blue');
    const rewrite = buildRewriteSystemPrompt('character-blue', 'text');

    expect(full).toContain('恰好包含 N 个正文块');
    expect(full).toContain('每个正文块都必须显式包含 type:"text"');
    expect(full).toContain('"photoIds":["photo-id"]');
    expect(full).toContain('不生成 quote 块');
    expect(rewrite).toContain('只输出一个 JSON object，且只包含 content 字段');
    expect(rewrite).toContain('只读上下文');
    expect(rewrite).not.toContain('恰好包含 N 个正文块');
  });

  test('limits both tasks to photo-grounded diary writing', () => {
    const full = buildFullDiarySystemPrompt('character-blue');
    const rewrite = buildRewriteSystemPrompt('character-blue', 'text');

    for (const prompt of [full, rewrite]) {
      expect(prompt).toContain('不得把任务扩展成通用内容生成');
      expect(prompt).toContain('不要生成程序、代码、脚本、小说、剧本');
      expect(prompt).toContain('广告、营销、带货');
      expect(prompt).toContain('危险操作的步骤');
    }
  });

  test('sends capture dates only and does not treat filenames or album names as image facts', () => {
    const system = buildFullDiarySystemPrompt('character-blue');
    const user = buildFullDiaryUserPrompt({
      draftId: 'draft-1',
      draftVersion: 1,
      type: 'travel',
      selectedPhotoIds: ['photo-1'],
    });
    const label = buildFullDiaryPhotoLabel({
      photoId: 'photo-1',
      date: '2026.10.20',
    }, 0, 1);

    expect(system).toContain('不包含文件名或相册名称');
    expect(system).toContain('没有明确可信地点时');
    expect(system).toContain('默认不写日期');
    expect(system).toContain('作品正式日期由保存发布时间决定');
    expect(user).toContain('拍摄日期作为辅助事实');
    expect(user).toMatch(/本地今天参考日期（仅用于判断过去14天，不得写入日记正文）：\d{4}-\d{2}-\d{2}/);
    expect(label).toContain('拍摄日期元数据（不得照抄到正文）：2026.10.20');
    expect(label).not.toContain('标题=');
    expect(label).not.toContain('地点=');
  });

  test('supports grounded inner reflections and flexible date, place, and paragraph transitions', () => {
    const full = buildFullDiarySystemPrompt('character-blue');
    const rewrite = buildRewriteSystemPrompt('character-blue', 'text');
    const quote = buildRewriteSystemPrompt('character-blue', 'quote');

    for (const prompt of [full, rewrite]) {
      expect(prompt).toContain('第一人称叙述者的心理活动');
      expect(prompt).toContain('由照片可见细节或用户提供的背景触发');
      expect(prompt).toContain('默认不写日期');
      expect(prompt).toContain('拍摄日期在过去14天内时');
      expect(prompt).toContain('更早或未来的日期不进入正文');
      expect(prompt).toContain('正文绝不出现具体年月日、月日或数字日期');
      expect(prompt).toContain('节假日名称只有在日期可靠且确实对应时才自然提及');
      expect(prompt).toContain('不强行编造因果、连续事件或旅程');
      expect(prompt).toContain('画中其他人物的心理状态');
    }

    expect(full).toContain('字段要求只用于填写元数据');
    expect(rewrite).toContain('添加画面不支持的背景解释');
    expect(quote).not.toContain('第一人称叙述者的心理活动');
  });

  test('serializes other paragraph text as context while excluding the target block', () => {
    const prompt = buildRewriteUserPrompt({
      draftId: 'draft-1',
      blockId: 'block-2',
      draftVersion: 1,
      blockType: 'text',
      content: '当前目标内容',
      photoIds: ['photo-2'],
      selectedPhotoIds: ['photo-1', 'photo-2', 'photo-3'],
      contextBlocks: [
        { id: 'block-1', type: 'text', content: '前段上下文' },
        { id: 'block-2', type: 'text', content: '旧的目标副本不能再次注入' },
        { id: 'block-3', type: 'quote', content: '后段上下文' },
      ],
      photoFacts: [{ photoId: 'photo-2', date: '2026.10.20' }],
    });

    expect(prompt).toContain('前段上下文');
    expect(prompt).toContain('后段上下文');
    expect(prompt).toContain('当前目标内容');
    expect(prompt).toMatch(/本地今天参考日期（仅用于判断过去14天，不得写入日记正文）：\d{4}-\d{2}-\d{2}/);
    expect(prompt).not.toContain('旧的目标副本不能再次注入');
  });
});
