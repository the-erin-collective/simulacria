import { Injectable } from '@angular/core';
import { Vector3, Block, BlockType } from '../../shared/models/block.model';
import { DBService } from './db.service';

export interface WorldChunk {
  chunkX: number;
  chunkY: number;
  chunkZ?: number; // Added Z dimension for 3D chunking
  blocks: Map<string, Block>; // "x,y,z" -> Block (relative to chunk)
  lastAccessed: number;
  isDirty: boolean; // needs saving
}

export interface ChunkCoordinates {
  chunkX: number;
  chunkY: number;
  chunkZ?: number;
  localX: number;
  localY: number;
  localZ: number;
}

@Injectable({
  providedIn: 'root'
})
export class ChunkManagerService {
  private chunks = new Map<string, WorldChunk>();
  private readonly chunkSize = 16; // 16x16x16 blocks per chunk
  private readonly maxLoadedChunks = 64; // Limit memory usage
  private renderDistance = 3; // Load chunks within 3 chunk radius
  private lastSaveTime = 0;
  private saveInterval = 60000; // 60 seconds between auto-saves
  private worldLoaded = false;

  constructor(private dbService: DBService) {}

  // Convert world coordinates to chunk coordinates
  worldToChunk(worldX: number, worldY: number, worldZ: number): ChunkCoordinates {
    const chunkX = Math.floor(worldX / this.chunkSize);
    const chunkY = Math.floor(worldY / this.chunkSize);
    const chunkZ = Math.floor(worldZ / this.chunkSize);
    const localX = ((worldX % this.chunkSize) + this.chunkSize) % this.chunkSize;
    const localY = ((worldY % this.chunkSize) + this.chunkSize) % this.chunkSize;
    const localZ = ((worldZ % this.chunkSize) + this.chunkSize) % this.chunkSize;

    return { chunkX, chunkY, chunkZ, localX, localY, localZ };
  }

  // Convert chunk coordinates to world coordinates
  chunkToWorld(chunkX: number, chunkY: number, chunkZ: number, localX: number, localY: number, localZ: number): Vector3 {
    return {
      x: chunkX * this.chunkSize + localX,
      y: chunkY * this.chunkSize + localY,
      z: chunkZ * this.chunkSize + localZ
    };
  }

  // Get chunk key for storage
  private getChunkKey(chunkX: number, chunkY: number, chunkZ: number): string {
    return `${chunkX},${chunkY},${chunkZ}`;
  }

  // Get local block key within chunk
  private getLocalBlockKey(localX: number, localY: number, localZ: number): string {
    return `${localX},${localY},${localZ}`;
  }

  // Get or create chunk
  async getChunk(chunkX: number, chunkY: number, chunkZ: number): Promise<WorldChunk> {
    const key = this.getChunkKey(chunkX, chunkY, chunkZ);
    let chunk = this.chunks.get(key);

    if (!chunk) {
      // Try to load from database if world is loaded
      if (this.worldLoaded) {
        const loadedChunk = await this.dbService.loadChunk(chunkX, chunkY, chunkZ);
        if (loadedChunk) {
          chunk = loadedChunk;
          this.chunks.set(key, chunk);
          console.log(`Loaded chunk ${key} from database with ${chunk.blocks.size} blocks`);
        }
      }

      // If still no chunk, create a new one
      if (!chunk) {
        chunk = {
          chunkX,
          chunkY,
          chunkZ,
          blocks: new Map(),
          lastAccessed: Date.now(),
          isDirty: false
        };
        this.chunks.set(key, chunk);
        console.log(`Created new chunk at ${key}`);
      }
      
      this.enforceChunkLimit();
    }

    chunk.lastAccessed = Date.now();
    return chunk;
  }

  // Set block at world coordinates
  async setBlockAt(worldX: number, worldY: number, worldZ: number, block: Block): Promise<void> {
    const coords = this.worldToChunk(worldX, worldY, worldZ);
    const chunk = await this.getChunk(coords.chunkX, coords.chunkY, coords.chunkZ!);
    const localKey = this.getLocalBlockKey(coords.localX, coords.localY, coords.localZ);
    
    chunk.blocks.set(localKey, block);
    chunk.isDirty = true;
    
    // Check if auto-save is needed
    this.checkAutoSave();
  }

  // Get block at world coordinates
  async getBlockAt(worldX: number, worldY: number, worldZ: number): Promise<Block | null> {
    const coords = this.worldToChunk(worldX, worldY, worldZ);
    const key = this.getChunkKey(coords.chunkX, coords.chunkY, coords.chunkZ!);
    
    // Check if chunk is loaded in memory
    let chunk = this.chunks.get(key);
    
    // If not in memory and world is loaded, try to load from database
    if (!chunk && this.worldLoaded) {
      chunk = await this.dbService.loadChunk(coords.chunkX, coords.chunkY, coords.chunkZ!) || undefined;
      if (chunk) {
        this.chunks.set(key, chunk);
      }
    }
    
    if (!chunk) return null;
    
    const localKey = this.getLocalBlockKey(coords.localX, coords.localY, coords.localZ);
    return chunk.blocks.get(localKey) || null;
  }

  // Remove block at world coordinates
  async removeBlockAt(worldX: number, worldY: number, worldZ: number): Promise<boolean> {
    const coords = this.worldToChunk(worldX, worldY, worldZ);
    const key = this.getChunkKey(coords.chunkX, coords.chunkY, coords.chunkZ!);
    const chunk = this.chunks.get(key);
    
    if (!chunk) return false;
    
    const localKey = this.getLocalBlockKey(coords.localX, coords.localY, coords.localZ);
    const existed = chunk.blocks.delete(localKey);
    
    if (existed) {
      chunk.isDirty = true;
      this.checkAutoSave();
    }
    
    return existed;
  }

  // Get all blocks within render distance of player
  async getVisibleBlocks(playerX: number, playerY: number, playerZ: number): Promise<Map<string, Block>> {
    const playerChunk = this.worldToChunk(playerX, playerY, playerZ);
    const visibleBlocks = new Map<string, Block>();

    // Load chunks within render distance
    for (let chunkX = playerChunk.chunkX - this.renderDistance; 
         chunkX <= playerChunk.chunkX + this.renderDistance; 
         chunkX++) {
      for (let chunkY = playerChunk.chunkY - this.renderDistance; 
           chunkY <= playerChunk.chunkY + this.renderDistance; 
           chunkY++) {
        for (let chunkZ = playerChunk.chunkZ! - this.renderDistance; 
             chunkZ <= playerChunk.chunkZ! + this.renderDistance; 
             chunkZ++) {
          
          const chunkDistanceSq = 
            Math.pow(chunkX - playerChunk.chunkX, 2) + 
            Math.pow(chunkY - playerChunk.chunkY, 2) + 
            Math.pow(chunkZ - playerChunk.chunkZ!, 2);
            
          // Skip chunks that are too far away (spherical distance check)
          if (chunkDistanceSq > Math.pow(this.renderDistance, 2)) continue;
          
          const chunk = await this.getChunk(chunkX, chunkY, chunkZ);
          
          // Add all blocks from this chunk to visible blocks
          for (const [localKey, block] of chunk.blocks) {
            const [localX, localY, localZ] = localKey.split(',').map(Number);
            const worldPos = this.chunkToWorld(chunkX, chunkY, chunkZ, localX, localY, localZ);
            const worldKey = `${worldPos.x},${worldPos.y},${worldPos.z}`;
            visibleBlocks.set(worldKey, block);
          }
        }
      }
    }

    return visibleBlocks;
  }

  // Load chunks around player position
  async loadChunksAroundPlayer(playerX: number, playerY: number, playerZ: number): Promise<void> {
    const playerChunk = this.worldToChunk(playerX, playerY, playerZ);
    console.log(`Loading chunks around player at (${playerX}, ${playerY}, ${playerZ})...`);

    const loadPromises = [];
    for (let chunkX = playerChunk.chunkX - this.renderDistance; 
         chunkX <= playerChunk.chunkX + this.renderDistance; 
         chunkX++) {
      for (let chunkY = playerChunk.chunkY - this.renderDistance; 
           chunkY <= playerChunk.chunkY + this.renderDistance; 
           chunkY++) {
        for (let chunkZ = playerChunk.chunkZ! - this.renderDistance; 
             chunkZ <= playerChunk.chunkZ! + this.renderDistance; 
             chunkZ++) {
              
          const chunkDistanceSq = 
            Math.pow(chunkX - playerChunk.chunkX, 2) + 
            Math.pow(chunkY - playerChunk.chunkY, 2) + 
            Math.pow(chunkZ - playerChunk.chunkZ!, 2);
            
          // Skip chunks that are too far away (spherical distance check)
          if (chunkDistanceSq > Math.pow(this.renderDistance, 2)) continue;
          
          // This will create chunks if they don't exist
          loadPromises.push(this.getChunk(chunkX, chunkY, chunkZ));
        }
      }
    }
    
    await Promise.all(loadPromises);
    console.log(`Loaded ${loadPromises.length} chunks around player`);
  }

  // Unload distant chunks to save memory
  private async enforceChunkLimit(): Promise<void> {
    if (this.chunks.size <= this.maxLoadedChunks) return;

    // Sort chunks by last accessed time
    const chunkEntries = Array.from(this.chunks.entries())
      .sort(([, a], [, b]) => a.lastAccessed - b.lastAccessed);

    // Remove oldest chunks
    const chunksToRemove = chunkEntries.slice(0, this.chunks.size - this.maxLoadedChunks);
    console.log(`Unloading ${chunksToRemove.length} chunks to enforce limit...`);
    
    for (const [key, chunk] of chunksToRemove) {
      if (chunk.isDirty) {
        await this.saveChunk(chunk);
      }
      this.chunks.delete(key);
    }
  }

  // Save chunk data to IndexedDB
  private async saveChunk(chunk: WorldChunk): Promise<void> {
    try {
      await this.dbService.saveChunk(chunk);
      chunk.isDirty = false;
      console.log(`Saved chunk ${chunk.chunkX},${chunk.chunkY},${chunk.chunkZ} with ${chunk.blocks.size} blocks`);
    } catch (error) {
      console.error(`Failed to save chunk ${chunk.chunkX},${chunk.chunkY},${chunk.chunkZ}:`, error);
    }
  }

  // Get all dirty chunks for bulk saving
  getDirtyChunks(): WorldChunk[] {
    return Array.from(this.chunks.values()).filter(chunk => chunk.isDirty);
  }

  // Mark all chunks as clean after save
  markChunksAsClean(): void {
    for (const chunk of this.chunks.values()) {
      chunk.isDirty = false;
    }
  }

  // Get chunk statistics
  getChunkStats(): { loadedChunks: number; totalBlocks: number; dirtyChunks: number } {
    let totalBlocks = 0;
    let dirtyChunks = 0;

    for (const chunk of this.chunks.values()) {
      totalBlocks += chunk.blocks.size;
      if (chunk.isDirty) dirtyChunks++;
    }

    return {
      loadedChunks: this.chunks.size,
      totalBlocks,
      dirtyChunks
    };
  }

  // Clear all chunks (for new world)
  async clearAllChunks(): Promise<void> {
    this.chunks.clear();
    if (this.worldLoaded) {
      try {
        await this.dbService.clearAllData();
        console.log('Cleared all world data');
      } catch (error) {
        console.error('Failed to clear database:', error);
      }
    }
  }

  // Import from flat world map to chunk system
  async importFromFlatWorld(flatWorld: Map<string, Block>): Promise<void> {
    await this.clearAllChunks();
    console.log(`Importing flat world with ${flatWorld.size} blocks to chunk system...`);

    for (const [worldKey, block] of flatWorld) {
      const [x, y, z] = worldKey.split(',').map(Number);
      await this.setBlockAt(x, y, z, block);
    }
    
    // Save all chunks after import
    await this.saveAllChunks();
    console.log('World import complete');
  }

  // Export to flat world map (for compatibility)
  exportToFlatWorld(): Map<string, Block> {
    const flatWorld = new Map<string, Block>();
    console.log(`Exporting ${this.chunks.size} chunks to flat world...`);

    for (const chunk of this.chunks.values()) {
      for (const [localKey, block] of chunk.blocks) {
        const [localX, localY, localZ] = localKey.split(',').map(Number);
        const worldPos = this.chunkToWorld(chunk.chunkX, chunk.chunkY, chunk.chunkZ!, localX, localY, localZ);
        const worldKey = `${worldPos.x},${worldPos.y},${worldPos.z}`;
        flatWorld.set(worldKey, block);
      }
    }

    console.log(`Exported ${flatWorld.size} blocks to flat world`);
    return flatWorld;
  }
  
  // Check if auto-save is needed
  private async checkAutoSave(): Promise<void> {
    const now = Date.now();
    if (now - this.lastSaveTime >= this.saveInterval) {
      await this.saveAllChunks();
      this.lastSaveTime = now;
    }
  }
  
  // Save all dirty chunks
  async saveAllChunks(): Promise<void> {
    if (!this.worldLoaded) {
      console.log('World not loaded, skipping save');
      return;
    }
    
    const dirtyChunks = this.getDirtyChunks();
    if (dirtyChunks.length === 0) {
      console.log('No dirty chunks to save');
      return;
    }
    
    console.log(`Saving ${dirtyChunks.length} dirty chunks...`);
    
    const savePromises = dirtyChunks.map(chunk => this.saveChunk(chunk));
    await Promise.all(savePromises);
    
    console.log('World saved successfully!');
  }
  
  // Load world from database
  async loadWorld(): Promise<boolean> {
    try {
      // Load world info
      const worldInfo = await this.dbService.loadWorldInfo();
      if (!worldInfo) {
        console.log('No saved world found.');
        return false;
      }
      
      // Get all chunk IDs
      const chunkIds = await this.dbService.getChunkIds();
      console.log(`Found ${chunkIds.length} saved chunks.`);
      
      if (chunkIds.length === 0) {
        return false;
      }
      
      // Clear current chunks
      this.chunks.clear();
      
      // Mark world as loaded to enable database operations
      this.worldLoaded = true;
      
      return true;
    } catch (error) {
      console.error('Failed to load world:', error);
      return false;
    }
  }
  
  // Create a new world
  async createNewWorld(): Promise<void> {
    // Clear any existing data
    await this.clearAllChunks();
    
    // Save initial world info
    await this.dbService.saveWorldInfo({
      name: 'New World',
      created: Date.now(),
      seed: Math.floor(Math.random() * 1000000)
    });
    
    // Mark world as loaded
    this.worldLoaded = true;
    
    console.log('New world created!');
  }
  
  // Set save interval
  setSaveInterval(seconds: number): void {
    this.saveInterval = seconds * 1000;
    console.log(`Auto-save interval set to ${seconds} seconds`);
  }
  
  // Set render distance
  setRenderDistance(distance: number): void {
    this.renderDistance = Math.max(1, Math.min(8, distance));
    console.log(`Render distance set to ${this.renderDistance} chunks`);
  }
  
  // Check if world is loaded
  isWorldLoaded(): boolean {
    return this.worldLoaded;
  }
}
