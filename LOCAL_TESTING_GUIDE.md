# Local Testing Guide - CraftEvolution Game v2.0

## New in Version 2.0

- **Angular 20 Zoneless Mode**: Enhanced performance with zone.js removed
- **Surface-Level Player Spawning**: Players now spawn safely on the terrain surface
- **In-Game Settings Modal**: ESC key now toggles an overlay settings menu
- **3D Chunk-Based World Storage**: Optimized world storage using 16x16x16 chunks
- **Auto-Save System**: World changes and player position are automatically saved
- **World Persistence**: Game automatically loads previously saved worlds

## Node.js Options (Recommended)

### Option 1: http-server (Most Popular)
```bash
# Install globally
npm install -g http-server

# Navigate to game directory
cd dist/minecraft-game/browser

# Start server
http-server
# Opens automatically at http://localhost:8080
```

### Option 2: serve (Zero Config)
```bash
# Install globally
npm install -g serve

# Navigate to game directory
cd dist/minecraft-game/browser

# Start server
serve
# Opens at http://localhost:3000
```

### Option 3: live-server (Auto-reload)
```bash
# Install globally
npm install -g live-server

# Navigate to game directory
cd dist/minecraft-game/browser

# Start server with auto-reload
live-server
# Opens automatically at http://localhost:8080
```

### Option 4: Express.js (Custom)
```bash
# Create a simple server file
echo 'const express = require("express");
const path = require("path");
const app = express();

app.use(express.static(path.join(__dirname)));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Game server running at http://localhost:${PORT}`);
});
' > server.js

# Install express
npm install express

# Run server
node server.js
```

## Python Option (Alternative)
```bash
cd dist/minecraft-game/browser
python3 -m http.server 8000
# Open http://localhost:8000
```

## Other Options

### PHP (if available)
```bash
cd dist/minecraft-game/browser
php -S localhost:8000
```

### Using npx (No installation needed)
```bash
cd dist/minecraft-game/browser
npx http-server
# or
npx serve
```

## Recommended Choice

**For quick testing:** `npx http-server` (no installation needed)
**For development:** `live-server` (auto-reload when files change)
**For production-like testing:** `serve` (optimized for SPAs)

## Game Access
Once any server is running, open your browser and navigate to the provided localhost URL. Your CraftEvolution game will load and be fully playable!

## Performance Tips
- Use Chrome or Firefox for best WebGL performance
- Game runs at 60 FPS with 1000+ blocks
- Press F12 to see debug information and performance metrics

## World Persistence
The game now automatically saves your progress using IndexedDB. Your world and player position will be remembered when you return!

## Controls
- **WASD:** Move
- **Mouse:** Look around
- **Left Click:** Break blocks
- **Right Click:** Place blocks
- **1-9 Keys:** Select toolbar item
- **Tab:** Open inventory
- **ESC:** Open settings