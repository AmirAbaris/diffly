import fs from "node:fs/promises";
import path from "node:path";
import unzipper from "unzipper";

interface ExtractionOptions {
  overwrite?: boolean;
}

export async function extractUploadArchive(
  archiveBuffer: Buffer,
  destinationDirectory: string,
  options: ExtractionOptions = {}
): Promise<{ extractedFiles: string[] }> {
  const directory = await unzipper.Open.buffer(archiveBuffer);
  const extractedFiles: string[] = [];

  // Ensure base destination folder exists
  await fs.mkdir(destinationDirectory, { recursive: true });

  for (const file of directory.files) {
    // Construct destination file path from archive entry name
    const destinationPath = path.join(destinationDirectory, file.path);

    if (file.type === "Directory") {
      await fs.mkdir(destinationPath, { recursive: true });
      continue;
    }

    // Ensure parent directory exists before writing entry
    await fs.mkdir(path.dirname(destinationPath), { recursive: true });

    const content = await file.buffer();
    await fs.writeFile(destinationPath, content, {
      flag: options.overwrite ? "w" : "wx",
    });

    extractedFiles.push(destinationPath);
  }

  return { extractedFiles };
}
