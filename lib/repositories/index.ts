import "server-only";

import { getEnv } from "@/lib/config/env";
import { createFileRepository } from "./file-repository";
import type { SentinelRepository } from "./types";

export type { SentinelRepository } from "./types";
export {
  AppendOnlyViolationError,
  RecordNotFoundError,
  UniqueConstraintError,
} from "./types";

/**
 * Resolves the active repository adapter.
 *
 * The file-backed adapter is the default and the only one the demo workflow
 * needs. The Prisma adapter is selected only when BOTH a DATABASE_URL is
 * configured and SENTINEL_MODE is "live", so setting a database URL while
 * exploring the demo cannot accidentally point the application at a database
 * that has never been migrated.
 *
 * The Prisma module is imported dynamically so demo mode never loads the
 * Prisma client at all.
 */

const GLOBAL_KEY = "__sentinelRepository__";

type GlobalWithRepository = typeof globalThis & {
  [GLOBAL_KEY]?: { repository: SentinelRepository; signature: string };
};

let initializing: Promise<SentinelRepository> | null = null;

async function createRepository(): Promise<SentinelRepository> {
  const env = getEnv();

  if (env.SENTINEL_MODE === "live" && env.DATABASE_URL) {
    const { createPrismaRepository } = await import("./prisma-repository");
    const repository = createPrismaRepository(env.DATABASE_URL);
    await repository.initialize();
    return repository;
  }

  const repository = createFileRepository();
  await repository.initialize();
  return repository;
}

export async function getRepository(): Promise<SentinelRepository> {
  const env = getEnv();
  const signature = `${env.SENTINEL_MODE}:${env.DATABASE_URL ?? "none"}:${env.SENTINEL_DATA_DIR}`;

  const globalScope = globalThis as GlobalWithRepository;
  const cached = globalScope[GLOBAL_KEY];
  if (cached && cached.signature === signature) {
    return cached.repository;
  }

  initializing ??= createRepository().then(
    (repository) => {
      (globalThis as GlobalWithRepository)[GLOBAL_KEY] = { repository, signature };
      initializing = null;
      return repository;
    },
    (error: unknown) => {
      initializing = null;
      throw error;
    },
  );

  return initializing;
}

/** Test helper: drop the cached repository so the next call rebuilds it. */
export function clearRepositoryCache(): void {
  delete (globalThis as GlobalWithRepository)[GLOBAL_KEY];
  initializing = null;
}
