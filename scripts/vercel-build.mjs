import { spawnSync } from "node:child_process";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    env: options.env ?? process.env,
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function migrationEnvironment() {
  const directDatabaseUrl = process.env.DIRECT_DATABASE_URL?.trim();
  if (directDatabaseUrl) {
    return { ...process.env, DATABASE_URL: directDatabaseUrl };
  }

  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) return process.env;

  try {
    const url = new URL(databaseUrl);
    if (url.hostname.endsWith(".neon.tech") && url.hostname.includes("-pooler.")) {
      url.hostname = url.hostname.replace("-pooler.", ".");
      return { ...process.env, DATABASE_URL: url.toString() };
    }
  } catch {
    // Let Prisma report malformed or unsupported database URLs consistently.
  }

  return process.env;
}

if (process.env.VERCEL_ENV === "production") {
  run("npm", ["run", "db:deploy"], { env: migrationEnvironment() });
}

run("npm", ["run", "build"]);
