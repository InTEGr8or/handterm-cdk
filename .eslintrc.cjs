module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  ignorePatterns: ['dist', '.eslintrc.cjs'],
  parser: '@typescript-eslint/parser',
  plugins: [],
  rules: {
    '@typescript-eslint/no-unused-vars': ['warn', {
      'vars': 'all',
      'varsIgnorePattern': '^_',
      'argsIgnorePattern': '^_',
      'destructuredArrayIgnorePattern': '^_',
      'ignoreRestSiblings': false
    }],
    'no-incomplete-useState-destructuring': {
      create: function (context) {
        return {
          VariableDeclarator(node) {
            if (
              node.init &&
              node.init.type === 'CallExpression' &&
              node.init.callee.name === 'useState' &&
              node.id.type === 'ArrayPattern' &&
              node.id.elements.length === 2 &&
              !node.id.elements[0]
            ) {
              context.report({
                node,
                message: 'Incomplete destructuring of useState. Did you forget to include the state variable?',
              });
            }
          },
        };
      },
    },
  },
}
