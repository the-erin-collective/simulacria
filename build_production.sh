#!/bin/bash

# Clean build directory
rm -rf dist

echo "Building production version of the game..."

# Install dependencies
npm install --silent

# Build production version
npm run build:prod

# Success message
echo "Build successful! The game is available in dist/minecraft-game/browser/"
echo "To test locally, use one of the methods in LOCAL_TESTING_GUIDE.md"
