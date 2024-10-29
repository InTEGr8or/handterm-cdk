const { register } = require('ts-node');

register({
  compilerOptions: {
    module: 'commonjs',
    moduleResolution: 'node',
    target: 'ES2018',
    esModuleInterop: true,
    allowJs: true,
    strict: true
  },
  transpileOnly: true,
  esm: false
});
