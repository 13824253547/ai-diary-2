import { validateE2eDatabaseUrl } from './run-e2e-tests';

describe('e2e database guard', () => {
  it('requires an explicit isolated database URL', () => {
    expect(() => validateE2eDatabaseUrl(undefined)).toThrow('E2E_DATABASE_URL');
    expect(() => validateE2eDatabaseUrl('mysql://root:root@127.0.0.1:33306/ai_diary')).toThrow(
      'ai_diary_test_* or ai_diary_e2e_*',
    );
  });

  it('rejects non-local database servers', () => {
    expect(() =>
      validateE2eDatabaseUrl('mysql://user:secret@db.example.com:3306/ai_diary_e2e_run'),
    ).toThrow('local MySQL server');
  });

  it('accepts disposable local test schemas', () => {
    expect(
      validateE2eDatabaseUrl('mysql://root:root@127.0.0.1:33306/ai_diary_e2e_run_123'),
    ).toBe('mysql://root:root@127.0.0.1:33306/ai_diary_e2e_run_123');
  });
});
