const { register } = require('ts-node');

register({
  compilerOptions: {
    module: 'CommonJS',
    moduleResolution: 'Node',
    target: 'ES2022',
    esModuleInterop: true,
    allowJs: true,
    strict: true
  },
  transpileOnly: true
});
