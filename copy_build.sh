#!/bin/bash

# Clean build directory
rm -rf dist

echo "Building production version of the game..."

# Copy the built files from the game-dist directory to the dist directory
mkdir -p dist/minecraft-game/browser
cp -r /workspace/game-dist/* dist/minecraft-game/browser/

# Copy the index.html file to game/ subdirectory
mkdir -p dist/minecraft-game/browser/game
cp -r /workspace/game-dist/index.html dist/minecraft-game/browser/game/

# Success message
echo "Build successful! The game is available in dist/minecraft-game/browser/"
echo "To test locally, use one of the methods in LOCAL_TESTING_GUIDE.md"
