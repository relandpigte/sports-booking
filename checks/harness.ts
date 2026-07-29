// The smallest thing that counts as a test runner.
//
// There is no test framework in this project, and one check that runs is worth
// more than a suite that never got set up. Each check is a plain script: it
// asserts, it prints, and it exits non-zero if anything failed.
//
// Checks write to the REAL database — that is the point, since the bugs worth
// catching here live in Postgres semantics — so every one seeds its own
// fixtures on a far-future date, asserts the row counts return to where they
// started, and refuses to run in production.

let passed = 0;
const failures: string[] = [];

export function ok(label: string, condition: boolean): void {
  if (condition) passed++;
  else failures.push(label);
}

// Guard first, before a check writes anything.
export function assertNotProduction(): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Checks seed fixtures and must never run against production."
    );
  }
  const url = process.env.DATABASE_URL ?? "";
  if (!url) throw new Error("DATABASE_URL is not set.");
}

export function report(): void {
  console.log(`${passed} passed, ${failures.length} failed`);
  for (const failure of failures) console.log(`  FAIL: ${failure}`);
  if (failures.length) process.exitCode = 1;
}

// Wraps a check so a thrown error is reported rather than printed as an
// unhandled rejection, and the exit code is always meaningful.
export async function run(
  check: () => Promise<void>,
  cleanup?: () => Promise<void>
): Promise<void> {
  try {
    assertNotProduction();
    await check();
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    if (cleanup) await cleanup();
    report();
  }
}
