# Module System Mismatch Troubleshooting Guide

## Module System Types

1. **CommonJS (CJS)**
   - Traditional Node.js module system
   - Uses `require()` and `module.exports`
   - Default for Node.js
   - Files typically use `.cjs` extension when explicit

2. **ECMAScript Modules (ESM)**
   - Modern JavaScript module system
   - Uses `import` and `export`
   - Becoming more common in newer packages
   - Files typically use `.mjs` extension when explicit

## Identifying ESM Dependencies

1. **Package.json Type Field**
   ```json
   {
     "type": "module"  // Indicates ESM package
   }
   ```

2. **Common ESM-only Libraries**
   - @octokit/rest (v16+)
   - chalk (v5+)
   - execa (v6+)
   - got (v12+)
   - node-fetch (v3+)

3. **Import Syntax Check**
   ```javascript
   // ESM-only exports
   export const foo = () => {};
   export default class Bar {};
   
   // No CommonJS exports
   // module.exports or exports.foo not present
   ```

## Detection Methods

1. **Package Analysis**
   - Check `package.json` "type" field
     - "type": "module" indicates ESM
     - "type": "commonjs" or absent indicates CJS
   - Look for "exports" field defining entry points
   - Check file extensions (.mjs, .cjs)

2. **Error Messages**
   - `ReferenceError: exports is not defined in ES module scope`
   - `ERR_REQUIRE_ESM`
   - `Cannot use import statement outside a module`
   - `__dirname is not defined in ES module scope`

3. **Build Warnings**
   - `The CommonJS 'exports' variable is treated as a global variable in an ECMAScript module`
   - `File is being treated as an ES module because it has a '.js' file extension`

4. **Automated Tools**
   - `cjs-module-lexer` for analyzing CommonJS modules
   - `es-module-lexer` for analyzing ES modules
   - `type-fest` for TypeScript module type definitions

## Interoperability Strategies

1. **Dynamic Imports with createRequire**
   ```javascript
   // Using ESM package (like Octokit) in CommonJS
   import { createRequire } from 'module';
   const require = createRequire(import.meta.url);
   
   // Method 1: Dynamic import
   const { Octokit } = await import('@octokit/rest');
   
   // Method 2: createRequire for CJS deps
   const cjsPackage = require('some-cjs-package');
   
   // Method 3: Mixed usage
   const { Octokit } = await import('@octokit/rest');
   const cjsUtil = require('./utils.cjs');
   ```

2. **Dual Package Hazard Solutions**
   ```json
   {
     "exports": {
       "import": "./dist/esm/index.js",
       "require": "./dist/cjs/index.js",
       "types": "./dist/types/index.d.ts"
     },
     "type": "module",
     "main": "./dist/cjs/index.js",
     "module": "./dist/esm/index.js",
     "types": "./dist/types/index.d.ts"
   }
   ```

3. **Configuration Updates**
   ```json
   // tsconfig.json
   {
     "compilerOptions": {
       "module": "ESNext",
       "moduleResolution": "Node",
       "allowSyntheticDefaultImports": true,
       "esModuleInterop": true
     }
   }
   ```

   ```javascript
   // esbuild.config.js
   export default {
     format: 'esm',
     platform: 'node',
     target: 'node18',
     external: ['@octokit/*'],
     bundle: true
   }
   ```

## Octokit Integration Example

### Problem
Integrating the ESM-only @octokit/rest package into a CommonJS project.

### Solution Steps

1. **Update Package Configuration**
   ```json
   {
     "type": "module",
     "dependencies": {
       "@octokit/rest": "^21.0.0"
     }
   }
   ```

2. **Import Strategy**
   ```javascript
   // oauth_callback.ts
   import { Octokit } from '@octokit/rest';
   import { createOAuthAppAuth } from '@octokit/auth-oauth-app';
   
   const getOctokit = async () => {
     try {
       return { Octokit, createOAuthAppAuth };
     } catch (error) {
       console.error('Octokit import error:', error);
       throw error;
     }
   };
   ```

3. **Build Configuration**
   ```javascript
   // esbuild.config.js
   {
     bundle: true,
     platform: 'node',
     target: 'node18',
     format: 'esm',
     external: ['@aws-sdk/*', '@octokit/*']
   }
   ```

4. **Error Handling**
   ```javascript
   try {
     const { Octokit } = await getOctokit();
     const octokit = new Octokit({
       auth: token
     });
   } catch (error) {
     console.error('Octokit initialization failed:', error);
     // Handle error appropriately
   }
   ```

### Common Issues and Solutions

1. **ERR_REQUIRE_ESM**
   - Use dynamic import() instead of require()
   - Update tsconfig.json module setting

2. **Type Errors**
   - Add appropriate type declarations
   - Use --moduleResolution bundler

3. **Runtime Errors**
   - Ensure all imports are async/await
   - Check for CommonJS dependencies

## Resolution Steps

1. **Package Configuration**
   - Check `package.json` "type" field
   - Ensure consistent module system across project
   - Use appropriate file extensions (.cjs, .mjs)

2. **TypeScript Configuration**
   - Verify `tsconfig.json` module settings
   - Check `moduleResolution` setting
   - Ensure `esModuleInterop` is enabled

3. **Build Tools**
   - Configure esbuild format (cjs/esm)
   - Set appropriate platform and target
   - Handle external dependencies correctly

4. **Code Changes**
   - Update import/export syntax
   - Replace __dirname/require with ESM equivalents
   - Use dynamic imports when needed

## Prevention

1. **Project Setup**
   - Choose module system upfront
   - Document decision in README
   - Use consistent file extensions

2. **Dependencies**
   - Check package compatibility
   - Prefer dual ESM/CommonJS packages
   - Document any special import requirements

3. **Testing**
   - Add module system tests
   - Verify builds in CI
   - Test both development and production

## Common Solutions

| Problem | Solution |
|---------|----------|
| exports undefined | Change package.json type to "commonjs" |
| require not found | Use dynamic import() |
| __dirname undefined | Use import.meta.url + fileURLToPath |
| Mixed modules | Standardize on one system |

## Lessons Learned

1. **Consistency is Key**
   - Stick to one module system
   - Use consistent import patterns
   - Maintain uniform file extensions

2. **Testing Matters**
   - Test builds early
   - Verify in multiple environments
   - Include module system tests

3. **Documentation**
   - Record module system decisions
   - Document special cases
   - Keep troubleshooting notes
