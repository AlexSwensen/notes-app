export default {
  extends: ['@commitlint/config-conventional'],
  // Release commits embed the generated changelog, which can have long lines.
  ignores: [(message) => message.startsWith('chore(release):')],
};
