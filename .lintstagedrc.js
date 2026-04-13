const path = require("path");

// When committing from a git worktree, yarn must run from the main worktree
// where node_modules and .yarn/install-state.gz live. The pre-commit hook
// exports MAIN_WORKTREE so we can cd there before invoking yarn.
const mainWorktree = process.env.MAIN_WORKTREE || "";
const cdPrefix = mainWorktree ? `cd "${mainWorktree}" && ` : "";

const buildNextEslintCommand = (filenames) =>
  `${cdPrefix}yarn next:lint --fix --file ${filenames
    .map((f) => path.relative(path.join("packages", "nextjs"), f))
    .join(" --file ")}`;

const checkTypesNextCommand = () => `${cdPrefix}yarn next:check-types`;

const buildHardhatEslintCommand = (filenames) =>
  `${cdPrefix}yarn hardhat:lint-staged --fix ${filenames
    .map((f) => path.relative(path.join("packages", "hardhat"), f))
    .join(" ")}`;

module.exports = {
  "packages/nextjs/**/*.{ts,tsx}": [
    buildNextEslintCommand,
    checkTypesNextCommand,
  ],
  "packages/hardhat/**/*.{ts,tsx}": [buildHardhatEslintCommand],
};
