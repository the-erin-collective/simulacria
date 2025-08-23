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
  private readonly maxLoadedChunks = 5000; // Support large render distances
  private renderDistance = 3; // Load chunks within 3 chunk radius
  private lastSaveTime = 0;
  private saveInterval = 60000; // 60 seconds between auto-saves
  private worldLoaded = false;
  private currentWorldId = 'current'; // Track current world
  private dirtyChunks = new Set<string>(); // Track dirty chunks for efficient saving

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

  // Get or create chunk with proper dirty tracking
  async getChunk(chunkX: number, chunkY: number, chunkZ: number): Promise<WorldChunk> {
    const key = this.getChunkKey(chunkX, chunkY, chunkZ);
    let chunk = this.chunks.get(key);

    if (!chunk) {
      // Try to load from database if world is loaded
      if (this.worldLoaded) {
        try {
          const loadedChunk = await this.dbService.loadChunk(chunkX, chunkY, chunkZ, this.currentWorldId);
          if (loadedChunk) {
            chunk = loadedChunk;
            this.chunks.set(key, chunk);
            console.log(`Loaded chunk ${key} from database with ${chunk.blocks.size} blocks`);
          }
        } catch (error) {
          console.error(`Failed to load chunk ${key} from database:`, error);
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
      
      await this.enforceChunkLimit();
    }

    chunk.lastAccessed = Date.now();
    return chunk;
  }

  // Set block at world coordinates with proper dirty tracking
  async setBlockAt(worldX: number, worldY: number, worldZ: number, block: Block): Promise<void> {
    const coords = this.worldToChunk(worldX, worldY, worldZ);
    const chunk = await this.getChunk(coords.chunkX, coords.chunkY, coords.chunkZ!);
    const localKey = this.getLocalBlockKey(coords.localX, coords.localY, coords.localZ);
    
    chunk.blocks.set(localKey, block);
    
    if (!chunk.isDirty) {
      chunk.isDirty = true;
      this.dirtyChunks.add(this.getChunkKey(coords.chunkX, coords.chunkY, coords.chunkZ!));
    }
    
    // Check if auto-save is needed
    await this.checkAutoSave();
  }

  // Get block at world coordinates with error handling
  async getBlockAt(worldX: number, worldY: number, worldZ: number): Promise<Block | null> {
    const coords = this.worldToChunk(worldX, worldY, worldZ);
    const key = this.getChunkKey(coords.chunkX, coords.chunkY, coords.chunkZ!);
    
    // Check if chunk is loaded in memory
    let chunk = this.chunks.get(key);
    
    // If not in memory and world is loaded, try to load from database
    if (!chunk && this.worldLoaded) {
      try {
        chunk = await this.dbService.loadChunk(coords.chunkX, coords.chunkY, coords.chunkZ!, this.currentWorldId) || undefined;
        if (chunk) {
          this.chunks.set(key, chunk);
        }
      } catch (error) {
        console.error(`Failed to load chunk for getBlockAt(${worldX}, ${worldY}, ${worldZ}):`, error);
      }
    }
    
    if (!chunk) return null;
    
    const localKey = this.getLocalBlockKey(coords.localX, coords.localY, coords.localZ);
    return chunk.blocks.get(localKey) || null;
  }

  // Remove block at world coordinates with proper dirty tracking
  async removeBlockAt(worldX: number, worldY: number, worldZ: number): Promise<boolean> {
    const coords = this.worldToChunk(worldX, worldY, worldZ);
    const key = this.getChunkKey(coords.chunkX, coords.chunkY, coords.chunkZ!);
    const chunk = this.chunks.get(key);
    
    if (!chunk) return false;
    
    const localKey = this.getLocalBlockKey(coords.localX, coords.localY, coords.localZ);
    const existed = chunk.blocks.delete(localKey);
    
    if (existed) {
      if (!chunk.isDirty) {
        chunk.isDirty = true;
        this.dirtyChunks.add(key);
      }
      await this.checkAutoSave();
    }
    
    return existed;
  }

  // Get all blocks within render distance of player
  async getVisibleBlocks(playerX: number, playerY: number, playerZ: number): Promise<Map<string, Block>> {
    const playerChunk = this.worldToChunk(playerX, playerY, playerZ);
    const visibleBlocks = new Map<string, Block>();
    let chunksWithBlocks = 0;

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
          
          if (chunk.blocks.size > 0) {
            chunksWithBlocks++;
          }
          
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

    if (visibleBlocks.size === 0) {
      console.warn(`No blocks found around player at (${playerX}, ${playerY}, ${playerZ})`);
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

    // Sort chunks by last accessed time, but never unload chunks with blocks
    const chunkEntries = Array.from(this.chunks.entries())
      .filter(([, chunk]) => chunk.blocks.size === 0) // Only consider empty chunks for removal
      .sort(([, a], [, b]) => a.lastAccessed - b.lastAccessed);

    // Remove oldest empty chunks first
    const chunksToRemove = chunkEntries.slice(0, Math.max(0, this.chunks.size - this.maxLoadedChunks));
    
    if (chunksToRemove.length > 0) {
      console.log(`Unloading ${chunksToRemove.length} empty chunks to enforce limit...`);
      
      for (const [key, chunk] of chunksToRemove) {
        if (chunk.isDirty) {
          await this.saveChunk(chunk);
        }
        this.chunks.delete(key);
      }
    }
  }

  // Save chunk data to IndexedDB with error handling
  private async saveChunk(chunk: WorldChunk): Promise<void> {
    try {
      await this.dbService.saveChunk(chunk, this.currentWorldId);
      chunk.isDirty = false;
      const chunkKey = this.getChunkKey(chunk.chunkX, chunk.chunkY, chunk.chunkZ!);
      this.dirtyChunks.delete(chunkKey);
      console.log(`Saved chunk ${chunk.chunkX},${chunk.chunkY},${chunk.chunkZ} with ${chunk.blocks.size} blocks`);
    } catch (error) {
      console.error(`Failed to save chunk ${chunk.chunkX},${chunk.chunkY},${chunk.chunkZ}:`, error);
      throw error;
    }
  }

  // Get all dirty chunks for bulk saving (optimized)
  getDirtyChunks(): WorldChunk[] {
    const dirtyChunksList: WorldChunk[] = [];
    for (const chunkKey of this.dirtyChunks) {
      const chunk = this.chunks.get(chunkKey);
      if (chunk && chunk.isDirty) {
        dirtyChunksList.push(chunk);
      }
    }
    return dirtyChunksList;
  }

  // Mark all chunks as clean after save
  markChunksAsClean(): void {
    for (const chunk of this.chunks.values()) {
      chunk.isDirty = false;
    }
    this.dirtyChunks.clear();
  }

  // Get current world ID
  getCurrentWorldId(): string {
    return this.currentWorldId;
  }
  
  // Check if world is loaded
  isWorldLoaded(): boolean {
    return this.worldLoaded;
  }

  // Get detailed chunk statistics
  getChunkStats(): { loadedChunks: number; totalBlocks: number; dirtyChunks: number; memoryUsage: string } {
    let totalBlocks = 0;
    let memoryEstimate = 0;

    for (const chunk of this.chunks.values()) {
      totalBlocks += chunk.blocks.size;
      // Rough memory estimate: each block ~100 bytes
      memoryEstimate += chunk.blocks.size * 100;
    }

    return {
      loadedChunks: this.chunks.size,
      totalBlocks,
      dirtyChunks: this.dirtyChunks.size,
      memoryUsage: `${Math.round(memoryEstimate / 1024 / 1024 * 100) / 100} MB`
    };
  }

  // Clear all chunks (for new world) with proper cleanup
  async clearAllChunks(): Promise<void> {
    this.chunks.clear();
    this.dirtyChunks.clear();
    
    if (this.worldLoaded) {
      try {
        await this.dbService.clearAllData(this.currentWorldId);
        console.log(`Cleared all data for world ${this.currentWorldId}`);
      } catch (error) {
        console.error('Failed to clear database:', error);
      }
    }
  }

  // Switch to a different world
  async switchToWorld(worldId: string): Promise<void> {
    // Save current world before switching
    if (this.worldLoaded) {
      await this.saveAllChunks();
    }
    
    // Clear current chunks from memory
    this.chunks.clear();
    this.dirtyChunks.clear();
    
    // Switch to new world
    this.currentWorldId = worldId;
    this.worldLoaded = true;
    
    console.log(`Switched to world: ${worldId}`);
  }

  // Import from flat world map to chunk system with progress reporting
  async importFromFlatWorld(flatWorld: Map<string, Block>): Promise<void> {
    await this.clearAllChunks();
    console.log(`Importing flat world with ${flatWorld.size} blocks to chunk system...`);

    const startTime = Date.now();
    let processedBlocks = 0;
    const totalBlocks = flatWorld.size;
    
    for (const [worldKey, block] of flatWorld) {
      const [x, y, z] = worldKey.split(',').map(Number);
      await this.setBlockAt(x, y, z, block);
      processedBlocks++;
      
      // Log progress every 1000 blocks
      if (processedBlocks % 1000 === 0) {
        const progress = Math.round((processedBlocks / totalBlocks) * 100);
        console.log(`Import progress: ${progress}% (${processedBlocks}/${totalBlocks} blocks)`);
      }
    }
    
    // Save all chunks after import with bulk operation
    await this.saveAllChunks();
    const duration = Date.now() - startTime;
    console.log(`World import complete: ${totalBlocks} blocks processed in ${duration}ms`);
  }
  
  // Bulk save blocks for terrain generation with optimized performance
  async saveBulkBlocks(blocks: Map<string, Block>): Promise<void> {
    console.log(`Bulk saving ${blocks.size} blocks to chunk system...`);
    
    const startTime = Date.now();
    const affectedChunks = new Map<string, WorldChunk>();
    
    // Add all blocks to appropriate chunks
    for (const [worldKey, block] of blocks) {
      const [x, y, z] = worldKey.split(',').map(Number);
      const coords = this.worldToChunk(x, y, z);
      const chunkKey = this.getChunkKey(coords.chunkX, coords.chunkY, coords.chunkZ!);
      
      let chunk = affectedChunks.get(chunkKey);
      if (!chunk) {
        chunk = await this.getChunk(coords.chunkX, coords.chunkY, coords.chunkZ!);
        affectedChunks.set(chunkKey, chunk);
      }
      
      const localKey = this.getLocalBlockKey(coords.localX, coords.localY, coords.localZ);
      chunk.blocks.set(localKey, block);
      
      if (!chunk.isDirty) {
        chunk.isDirty = true;
        this.dirtyChunks.add(chunkKey);
      }
    }
    
    // Use bulk save for better performance
    const chunksToSave = Array.from(affectedChunks.values()).filter(chunk => chunk.isDirty);
    if (chunksToSave.length > 0) {
      try {
        await this.dbService.saveBulkChunks(chunksToSave, this.currentWorldId);
        
        // Mark chunks as clean
        chunksToSave.forEach(chunk => {
          chunk.isDirty = false;
          const chunkKey = this.getChunkKey(chunk.chunkX, chunk.chunkY, chunk.chunkZ!);
          this.dirtyChunks.delete(chunkKey);
        });
        
        const duration = Date.now() - startTime;
        console.log(`Bulk save complete: ${blocks.size} blocks saved to ${chunksToSave.length} chunks in ${duration}ms`);
      } catch (error) {
        console.error('Bulk save failed:', error);
        throw error;
      }
    }
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
  
  // Save all dirty chunks with optimized bulk operations
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
    
    try {
      // Use bulk save for better performance when there are many chunks
      if (dirtyChunks.length > 5) {
        await this.dbService.saveBulkChunks(dirtyChunks, this.currentWorldId);
        this.markChunksAsClean();
      } else {
        // Use individual saves for small numbers of chunks
        const savePromises = dirtyChunks.map(chunk => this.saveChunk(chunk));
        await Promise.all(savePromises);
      }
      
      console.log('World saved successfully!');
    } catch (error) {
      console.error('Failed to save world chunks:', error);
      throw error;
    }
  }
  
  // Load world from database with proper world ID support
  async loadWorld(worldId?: string): Promise<boolean> {
    try {
      if (worldId) {
        // Load specific world
        const worldData = await this.dbService.loadWorld(worldId);
        if (!worldData) {
          console.log(`World ${worldId} not found.`);
          return false;
        }
        
        await this.switchToWorld(worldId);
        console.log(`Loaded world: ${worldData.name} (${worldId})`);
      } else {
        // Try to load any existing world (backwards compatibility)
        const worlds = await this.dbService.loadAllWorlds();
        if (worlds.length === 0) {
          console.log('No saved worlds found.');
          return false;
        }
        
        // Load the most recently played world
        const latestWorld = worlds.sort((a, b) => b.lastPlayed - a.lastPlayed)[0];
        await this.switchToWorld(latestWorld.id);
        console.log(`Loaded latest world: ${latestWorld.name} (${latestWorld.id})`);
      }
      
      // Get chunk count for logging
      const chunkIds = await this.dbService.getChunkIds(this.currentWorldId);
      console.log(`Found ${chunkIds.length} saved chunks for world ${this.currentWorldId}`);
      
      return true;
    } catch (error) {
      console.error('Failed to load world:', error);
      return false;
    }
  }
  
  // Create a new world with proper database integration
  async createNewWorld(worldName?: string, settings?: any): Promise<string> {
    try {
      const worldId = await this.dbService.createWorld({
        name: worldName || `New World ${Date.now()}`,
        settings: settings || {},
        metadata: {
          createdBy: 'ChunkManager',
          terrainGenerated: false
        }
      });
      
      // Switch to the new world
      await this.switchToWorld(worldId);
      
      console.log(`Created and loaded new world: ${worldName || 'Unnamed'} (${worldId})`);
      return worldId;
    } catch (error) {
      console.error('Failed to create new world:', error);
      throw error;
    }
  }
  
  // Set save interval
  setSaveInterval(seconds: number): void {
    this.saveInterval = Math.max(10, seconds * 1000); // Minimum 10 seconds
    console.log(`Auto-save interval set to ${seconds} seconds`);
  }
  
  // Set render distance
  setRenderDistance(distance: number): void {
    this.renderDistance = Math.max(1, Math.min(8, distance));
    console.log(`Render distance set to ${this.renderDistance} chunks`);
  }

  // Enhanced auto-save check with error handling
  private async checkAutoSave(): Promise<void> {
    const now = Date.now();
    if (now - this.lastSaveTime >= this.saveInterval && this.dirtyChunks.size > 0) {
      try {
        await this.saveAllChunks();
        this.lastSaveTime = now;
      } catch (error) {
        console.error('Auto-save failed:', error);
        // Don't update lastSaveTime on failure to retry soon
      }
    }
  }
}
