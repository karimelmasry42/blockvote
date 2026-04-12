const path = require("path");

// When committing from a git worktree, yarn must run from the main worktree
// where node_modules are installed. The pre-commit hook exports MAIN_WORKTREE.
const mainWorktree = process.env.MAIN_WORKTREE || "";
const yarnCmd = mainWorktree ? `yarn --cwd "${mainWorktree}"` : "yarn";

const buildNextEslintCommand = (filenames) =>
  `${yarnCmd} next:lint --fix --file ${filenames
    .map((f) => path.relative(path.join("packages", "nextjs"), f))
    .join(" --file ")}`;

const checkTypesNextCommand = () => `${yarnCmd} next:check-types`;

const buildHardhatEslintCommand = (filenames) =>
  `${yarnCmd} hardhat:lint-staged --fix ${filenames
    .map((f) => path.relative(path.join("packages", "hardhat"), f))
    .join(" ")}`;

module.exports = {
  "packages/nextjs/**/*.{ts,tsx}": [
    buildNextEslintCommand,
    checkTypesNextCommand,
  ],
  "packages/hardhat/**/*.{ts,tsx}": [buildHardhatEslintCommand],
};
