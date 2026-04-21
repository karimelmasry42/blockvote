const path = require("path");

// When committing from a git worktree, yarn must run from the main worktree
// where node_modules and .yarn/install-state.gz live. The pre-commit hook
// exports MAIN_WORKTREE so we can cd there before invoking yarn.
const mainWorktree = process.env.MAIN_WORKTREE || "";
const cdPrefix = mainWorktree ? `cd "${mainWorktree}" && ` : "";

const buildNextEslintCommand = (filenames) => {
  // In a worktree, keep absolute paths so next:lint targets the worktree files
  // after the cd to the main worktree.
  const fileArgs = mainWorktree
    ? filenames.join(" --file ")
    : filenames.map((f) => path.relative(path.join("packages", "nextjs"), f)).join(" --file ");
  return `${cdPrefix}yarn next:lint --fix --file ${fileArgs}`;
};

const checkTypesNextCommand = () => `${cdPrefix}yarn next:check-types`;

const buildHardhatEslintCommand = (filenames) => {
  // In a worktree, keep absolute paths so eslint targets the worktree files
  // after the cd to the main worktree.
  const fileArgs = mainWorktree
    ? filenames.join(" ")
    : filenames.map((f) => path.relative(path.join("packages", "hardhat"), f)).join(" ");
  return `${cdPrefix}yarn hardhat:lint-staged --fix ${fileArgs}`;
};

module.exports = {
  "packages/nextjs/**/*.{ts,tsx}": [
    buildNextEslintCommand,
    checkTypesNextCommand,
  ],
  "packages/hardhat/**/*.{ts,tsx}": [buildHardhatEslintCommand],
};
