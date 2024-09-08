#!/bin/bash

# Remove all files from the dist directory
rm -rf dist/*

# Remove all .js and .d.ts files from lambda, lib, and bin directories
find lambda lib bin -type f \( -name "*.js" -o -name "*.d.ts" -o -name "*.js.map" \) -delete

echo "Cleaned dist directory and removed compiled files from lambda, lib, and bin directories."
echo "Don't forget to run 'yarn install' if you've made changes to package.json."
