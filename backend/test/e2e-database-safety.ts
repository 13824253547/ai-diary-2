import { validateE2eDatabaseEnvironment } from '../src/scripts/run-e2e-tests';

validateE2eDatabaseEnvironment(
  process.env.E2E_DATABASE_URL,
  process.env.DATABASE_URL,
);
