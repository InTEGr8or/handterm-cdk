#!/bin/bash

# Remove the dist directory completely and recreate it
rm -rf dist
mkdir -p dist

# Remove all .js, .d.ts, and .js.map files from lambda, lib, and bin directories
find lambda lib bin -type f \( -name "*.js" -o -name "*.d.ts" -o -name "*.js.map" \) -delete

echo "Cleaned dist directory and removed compiled files from lambda, lib, and bin directories."
echo "Don't forget to run 'yarn install' if you've made changes to package.json."
