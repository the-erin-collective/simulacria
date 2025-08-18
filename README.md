# CraftEvolution

A Minecraft-like game built with Angular, NgRx, and BabylonJS.

## Features

- First-person 3D voxel-based gameplay
- Procedural terrain generation with evolutionary algorithms
- Block breaking and placement mechanics
- Inventory system
- Chunked world storage with persistence
- Auto-save functionality

## Recent Improvements

- Upgraded to Angular 20 with zoneless mode for better performance
- Implemented pointer lock API for natural mouse controls
- Added smart player spawning on solid ground
- Implemented chunk-based world storage system
- Added in-game settings modal (accessible via ESC key)
- Implemented IndexedDB save/load system with auto-save

## Requirements

- Node.js v20.19.0 or later
- NPM v8.0.0 or later

## Installation

```bash
# Clone the repository
git clone <repository-url>
cd minecraft-game

# Install dependencies
npm install --legacy-peer-deps
```

## Development Server

```bash
npm start
```

Navigate to `http://localhost:4200/`. The application will automatically reload if you change any of the source files.

## Production Build

```bash
# Build for production
npm run build:prod

# Or use the build script
./build_production.sh
```

The build artifacts will be stored in the `dist/minecraft-game/browser` directory.

## Game Controls

- **WASD**: Move
- **Mouse**: Look around
- **Left Click**: Break blocks
- **Right Click**: Place blocks
- **1-9 Keys**: Select inventory slot
- **Tab**: Toggle inventory
- **ESC**: Open settings

## Settings

The game settings include:

- Mouse sensitivity
- Render distance
- Sound and music volume
- Auto-save interval
- Display options (FPS, coordinates, debug info)

## Technology Stack

- **Angular 20**: Frontend framework
- **NgRx**: State management
- **BabylonJS**: 3D rendering engine
- **TypeScript**: Programming language
- **IndexedDB**: Local data storage

## Architecture

The game uses:

- Zoneless mode for better performance
- Chunk-based world storage
- Persistent data with IndexedDB
- Component-based UI
- NgRx for state management

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
