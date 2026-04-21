const { execSync } = require("child_process");

// Resolve the main worktree path so yarn commands run where node_modules live.
// This is necessary when committing from a git worktree (e.g. Claude Code worktrees).
let mainWorktree = "";
try {
  const lines = execSync("git worktree list --porcelain", { encoding: "utf-8" }).split("\n");
  const worktreeLine = lines.find(l => l.startsWith("worktree "));
  mainWorktree = worktreeLine
    ? worktreeLine.slice("worktree ".length).trim()
    : execSync("git rev-parse --show-toplevel", { encoding: "utf-8" }).trim();
} catch {
  // fall through — cdPrefix will be empty and yarn runs from CWD
}
const cdPrefix = mainWorktree ? `cd "${mainWorktree}" && ` : "";

// Pass absolute paths so ESLint finds the correct files even when yarn runs from a different worktree.
const buildNextEslintCommand = filenames =>
  `${cdPrefix}yarn next:lint --fix --file ${filenames.join(" --file ")}`;

const checkTypesNextCommand = () => `${cdPrefix}yarn next:check-types`;

const buildHardhatEslintCommand = filenames =>
  `${cdPrefix}yarn hardhat:lint-staged --fix ${filenames.join(" ")}`;

module.exports = {
  "packages/nextjs/**/*.{ts,tsx}": [buildNextEslintCommand, checkTypesNextCommand],
  "packages/hardhat/**/*.{ts,tsx}": [buildHardhatEslintCommand],
};
