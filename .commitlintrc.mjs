// Minimalist 6-type set. The active type-enum is what commitlint
// allows on new commits; cliff.toml has additional historical
// parsers (perf/style/revert/build/ci) that map old commits into
// these groups when regenerating the changelog.
//
// Bumping vs skipping:
//   feat      → minor bump, "Features"
//   fix       → patch bump, "Bug Fixes"
//   refactor  → patch bump, "Refactoring"
//   docs      → no bump, skipped from changelog
//   test      → no bump, skipped from changelog
//   chore     → no bump, skipped from changelog (covers ci, build, deps, releases, formatting)
export default {
  extends: ["@commitlint/config-conventional"],

  rules: {
    "type-enum": [2, "always", ["feat", "fix", "refactor", "docs", "test", "chore"]],
    "type-case": [2, "always", "lower-case"],
    "type-empty": [2, "never"],

    "scope-case": [2, "always", "lower-case"],

    "subject-empty": [2, "never"],
    "subject-case": [2, "never", ["sentence-case", "start-case", "pascal-case", "upper-case"]],
    "subject-full-stop": [2, "never", "."],

    "header-max-length": [2, "always", 120],

    "body-leading-blank": [2, "always"],
    "body-max-line-length": [0],
    "footer-leading-blank": [2, "always"],
    "footer-max-line-length": [0],
  },
};
