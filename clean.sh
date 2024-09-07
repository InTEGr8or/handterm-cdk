#!/bin/bash

# Remove all files from the dist directory
rm -rf dist/*

# Remove all .js and .d.ts files from lambda, lib, and bin directories
find lambda lib bin -type f \( -name "*.js" -o -name "*.d.ts" \) -delete

echo "Cleaned dist directory and removed compiled files from lambda, lib, and bin directories."
