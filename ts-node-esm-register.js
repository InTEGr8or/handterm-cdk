
const { register } = require('ts-node');

register({
  transpileOnly: true,
  compilerOptions: {
    module: 'commonjs'
  }
});
