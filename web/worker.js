import { buildArchives } from "../src/core.js";

self.onmessage = async ({ data }) => {
  if (data?.type !== "build") return;
  const { token, files, assignments, capBytes } = data;
  try {
    const sources = new Map(files.map(({ path, file }) => [path, file]));
    const result = await buildArchives({
      files: files.map(({ path, file }) => ({ path, size: file.size })),
      assignments,
      capBytes,
      readFile: async (path) => {
        const file = sources.get(path);
        if (!file) throw new Error(`Selected file is unavailable: ${path}`);
        try {
          return new Uint8Array(await file.arrayBuffer());
        } catch {
          throw new Error(
            `File could not be read. Reselect your source files: ${path}`,
          );
        }
      },
      onProgress: (progress) =>
        self.postMessage({ type: "progress", token, progress }),
    });
    self.postMessage(
      {
        type: "result",
        token,
        archives: result.archives,
        receiptText: result.receiptText,
      },
      result.archives.map((archive) => archive.bytes.buffer),
    );
  } catch (error) {
    self.postMessage({
      type: "error",
      token,
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
