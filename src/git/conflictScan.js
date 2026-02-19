import { execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";

const PLACEHOLDER = "/* conflict removed by CyberSolve V0 */";
const CONFLICT_BLOCK_REGEX =
  /^<{7}[^\n]*\n[\s\S]*?^={7}[^\n]*\n[\s\S]*?^>{7}[^\n]*(?:\n|$)/gm;

function listTrackedFiles() {
  const output = execFileSync("git", ["ls-files", "-z"], {
    encoding: "utf8",
  });

  return output.split("\0").filter(Boolean);
}

function removeConflictBlocks(content) {
  let blocksRemoved = 0;

  const nextContent = content.replace(CONFLICT_BLOCK_REGEX, () => {
    blocksRemoved += 1;
    return `${PLACEHOLDER}\n`;
  });

  return { nextContent, blocksRemoved };
}

export async function removeConflictBlocksInWorkingTree() {
  const files = listTrackedFiles();
  const details = [];
  let totalBlocksRemoved = 0;

  for (const filePath of files) {
    let content;

    try {
      content = await fs.readFile(filePath, "utf8");
    } catch {
      continue;
    }

    if (!content.includes("<<<<<<<")) {
      continue;
    }

    const { nextContent, blocksRemoved } = removeConflictBlocks(content);
    if (blocksRemoved === 0 || nextContent === content) {
      continue;
    }

    await fs.writeFile(filePath, nextContent, "utf8");
    totalBlocksRemoved += blocksRemoved;
    details.push({ path: filePath, blocksRemoved });
  }

  return {
    placeholder: PLACEHOLDER,
    totalBlocksRemoved,
    filesModified: details.map((item) => item.path),
    details,
  };
}
