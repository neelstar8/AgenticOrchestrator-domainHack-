import "server-only";
import { constants as fsConstants } from "node:fs";
import { access, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { getEnv } from "@/lib/config/env";
import { DATASET_COLLECTIONS, emptyDataset, type Dataset } from "./dataset";

/**
 * File-backed persistence for the demo repository.
 *
 * Each collection is stored as its own pretty-printed JSON file under the data
 * directory, which makes the demo dataset inspectable and diffable — useful
 * when explaining to a reviewer exactly what the application is showing them.
 *
 * Three properties matter:
 *
 *  1. Atomic writes. Every file is written to a sibling `.tmp` path and then
 *     renamed, so a crash mid-write cannot leave a truncated JSON file that
 *     would make the application unbootable.
 *  2. Serialised writes. A promise-chain mutex means two concurrent requests
 *     cannot interleave read-modify-write cycles and lose an update.
 *  3. One in-process cache. The dataset is read from disk once and held in
 *     memory; it survives Turbopack hot reloads via a globalThis handle so a
 *     running scan is not orphaned by an unrelated file edit.
 */

export interface FileStore {
  readonly dataDir: string;
  /** Loads (and lazily seeds) the dataset. */
  load(): Promise<Dataset>;
  /**
   * Runs `mutate` under the write lock and persists whatever it touched.
   * The callback receives the live dataset and may mutate it in place.
   */
  write<T>(mutate: (data: Dataset) => T | Promise<T>): Promise<T>;
  /** Runs `read` under the lock without persisting. */
  read<T>(read: (data: Dataset) => T | Promise<T>): Promise<T>;
  /** Discards everything on disk and in memory, then reseeds. */
  reset(): Promise<void>;
}

interface StoreState {
  dataset: Dataset | null;
  queue: Promise<unknown>;
  dataDir: string;
  seedFactory: () => Promise<Dataset>;
}

const GLOBAL_KEY = "__sentinelFileStore__";

type GlobalWithStore = typeof globalThis & {
  [GLOBAL_KEY]?: { state: StoreState; store: FileStore };
};

function collectionPath(dataDir: string, collection: string): string {
  return path.join(dataDir, `${collection}.json`);
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await access(target, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function writeJsonAtomic(target: string, value: unknown): Promise<void> {
  const tmp = `${target}.${process.pid}.tmp`;
  await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(tmp, target);
}

async function persist(dataDir: string, dataset: Dataset): Promise<void> {
  await mkdir(dataDir, { recursive: true });
  await Promise.all(
    DATASET_COLLECTIONS.map((collection) =>
      writeJsonAtomic(collectionPath(dataDir, collection), dataset[collection]),
    ),
  );
  await writeJsonAtomic(path.join(dataDir, "_meta.json"), {
    writtenAt: new Date().toISOString(),
    schemaVersion: 1,
    note:
      "Sentinel demo dataset. Synthetic data for demonstration only. Safe to delete; " +
      "it is recreated from lib/demo/seed.ts on next start.",
  });
}

async function readFromDisk(dataDir: string): Promise<Dataset | null> {
  const marker = collectionPath(dataDir, "domains");
  if (!(await pathExists(marker))) return null;

  const dataset = emptyDataset();
  for (const collection of DATASET_COLLECTIONS) {
    const file = collectionPath(dataDir, collection);
    if (!(await pathExists(file))) {
      // A missing collection file means a partial or older dataset. Treat the
      // whole thing as unusable rather than silently running with gaps.
      return null;
    }
    const raw = await readFile(file, "utf8");
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (dataset as any)[collection] = parsed;
    } catch {
      return null;
    }
  }
  return dataset;
}

function createStore(state: StoreState): FileStore {
  /** Serialises every load/read/write through one promise chain. */
  function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = state.queue.then(task, task);
    // Keep the chain alive even if a task rejects.
    state.queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  async function ensureLoaded(): Promise<Dataset> {
    if (state.dataset) return state.dataset;
    const fromDisk = await readFromDisk(state.dataDir);
    if (fromDisk) {
      state.dataset = fromDisk;
      return fromDisk;
    }
    const seeded = await state.seedFactory();
    state.dataset = seeded;
    await persist(state.dataDir, seeded);
    return seeded;
  }

  return {
    dataDir: state.dataDir,

    load() {
      return enqueue(ensureLoaded);
    },

    read<T>(reader: (data: Dataset) => T | Promise<T>): Promise<T> {
      return enqueue(async () => {
        const dataset = await ensureLoaded();
        return reader(dataset);
      });
    },

    write<T>(mutate: (data: Dataset) => T | Promise<T>): Promise<T> {
      return enqueue(async () => {
        const dataset = await ensureLoaded();
        const result = await mutate(dataset);
        await persist(state.dataDir, dataset);
        return result;
      });
    },

    reset() {
      return enqueue(async () => {
        state.dataset = null;
        await rm(state.dataDir, { recursive: true, force: true });
        const seeded = await state.seedFactory();
        state.dataset = seeded;
        await persist(state.dataDir, seeded);
      });
    },
  };
}

export interface GetFileStoreOptions {
  /** Overrides the configured data directory. Used by tests for isolation. */
  dataDir?: string;
  seedFactory?: () => Promise<Dataset>;
  /** Forces a fresh store rather than reusing the process-wide one. */
  isolated?: boolean;
}

async function defaultSeedFactory(): Promise<Dataset> {
  const { buildSeedDataset } = await import("@/lib/demo/seed");
  return buildSeedDataset();
}

export function getFileStore(options: GetFileStoreOptions = {}): FileStore {
  const dataDir = path.resolve(
    process.cwd(),
    options.dataDir ?? getEnv().SENTINEL_DATA_DIR,
  );
  const seedFactory = options.seedFactory ?? defaultSeedFactory;

  if (options.isolated) {
    return createStore({ dataset: null, queue: Promise.resolve(), dataDir, seedFactory });
  }

  const globalScope = globalThis as GlobalWithStore;
  const existing = globalScope[GLOBAL_KEY];
  if (existing && existing.state.dataDir === dataDir) {
    return existing.store;
  }

  const state: StoreState = { dataset: null, queue: Promise.resolve(), dataDir, seedFactory };
  const store = createStore(state);
  globalScope[GLOBAL_KEY] = { state, store };
  return store;
}

/** Test helper: forget the process-wide store. */
export function clearFileStoreCache(): void {
  delete (globalThis as GlobalWithStore)[GLOBAL_KEY];
}
