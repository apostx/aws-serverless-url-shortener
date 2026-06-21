/** @type {import('@commitlint/types').UserConfig} */
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // Scopes used across the project (optional but encouraged):
    // db, lambda, api, cdn, security, observability, ci, release, docs, deps
    'scope-enum': [
      1,
      'always',
      [
        'db',
        'lambda',
        'api',
        'cdn',
        'security',
        'observability',
        'ci',
        'release',
        'docs',
        'deps',
        'test',
      ],
    ],
    'body-max-line-length': [0, 'always'],
  },
};
