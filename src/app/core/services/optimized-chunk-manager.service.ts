import { Injectable } from '@angular/core';
import { Vector3, Block, BlockType } from '../../shared/models/block.model';
import { DBService } from './db.service';
import { 
  CompressedChunk, 
  OptimizedBlockData, 
  MemoryMonitor,
  BlockFlags 
} from '../../shared/models/optimized-block.model';

export interface OptimizedChunkStats {
  loadedChunks: number;
  totalBlocks: number;
  memoryUsage: string;
  compressionRatio: string;
  dirtyChunks: number;
}

@Injectable({
  providedIn: 'root'
})
export class OptimizedChunkManagerService {
  private chunks = new Map<string, CompressedChunk>();
  private readonly chunkSize = 16;
  private readonly maxLoadedChunks = 10000; // Higher limit due to compression
  private renderDistance = 4; // Slightly higher due to better performance
  private lastSaveTime = 0;
  private saveInterval = 30000; // More frequent saves
  private worldLoaded = false;
  private currentWorldId = 'current';
  private dirtyChunks = new Set<string>();
  private memoryMonitor = MemoryMonitor.getInstance();
  
  // Object pools for performance (DVE pattern)
  private blockPool: OptimizedBlockData[] = [];
  private positionPool: Vector3[] = [];
  
  constructor(private dbService: DBService) {
    this.initializeObjectPools();
  }
  
  private initializeObjectPools(): void {
    // Pre-allocate objects to avoid garbage collection
    for (let i = 0; i < 1000; i++) {
      this.blockPool.push({
        blockType: BlockType.AIR,
        paletteId: 0,
        consecutiveWoodCount: 0,
        flags: 0
      });
      
      this.positionPool.push({ x: 0, y: 0, z: 0 });
    }
    
    console.log('🏊 Initialized object pools for optimized performance');
  }
  
  // Convert world coordinates to chunk coordinates (optimized)
  worldToChunk(worldX: number, worldY: number, worldZ: number): {
    chunkX: number; chunkY: number; chunkZ: number;
    localX: number; localY: number; localZ: number;
  } {
    const chunkX = Math.floor(worldX / this.chunkSize);
    const chunkY = Math.floor(worldY / this.chunkSize);
    const chunkZ = Math.floor(worldZ / this.chunkSize);
    
    // Optimized modulo for positive numbers
    const localX = worldX >= 0 ? worldX % this.chunkSize : ((worldX % this.chunkSize) + this.chunkSize) % this.chunkSize;
    const localY = worldY >= 0 ? worldY % this.chunkSize : ((worldY % this.chunkSize) + this.chunkSize) % this.chunkSize;
    const localZ = worldZ >= 0 ? worldZ % this.chunkSize : ((worldZ % this.chunkSize) + this.chunkSize) % this.chunkSize;

    return { chunkX, chunkY, chunkZ, localX, localY, localZ };
  }
  
  private getChunkKey(chunkX: number, chunkY: number, chunkZ: number): string {
    return `${chunkX},${chunkY},${chunkZ}`;
  }
  
  // Get or create chunk with aggressive caching
  async getChunk(chunkX: number, chunkY: number, chunkZ: number): Promise<CompressedChunk> {
    const key = this.getChunkKey(chunkX, chunkY, chunkZ);
    let chunk = this.chunks.get(key);

    if (!chunk) {
      // Try to load from database if world is loaded
      if (this.worldLoaded) {
        try {
          const serializedChunk = await this.dbService.loadCompressedChunk(chunkX, chunkY, chunkZ, this.currentWorldId);
          if (serializedChunk) {
            chunk = CompressedChunk.deserialize(serializedChunk);
            this.chunks.set(key, chunk);
            console.log(`📦 Loaded compressed chunk ${key} (${chunk.blockCount} blocks, ${chunk.getMemoryUsage()} bytes)`);
          }
        } catch (error) {
          console.error(`Failed to load chunk ${key}:`, error);
        }
      }

      // Create new chunk if none exists
      if (!chunk) {
        chunk = new CompressedChunk(chunkX, chunkY, chunkZ);
        this.chunks.set(key, chunk);
      }
      
      await this.enforceChunkLimit();
    }

    chunk.lastAccessed = Date.now();
    return chunk;
  }
  
  // Optimized block setting with minimal allocations
  async setOptimizedBlockAt(worldX: number, worldY: number, worldZ: number, block: OptimizedBlockData): Promise<void> {
    const coords = this.worldToChunk(worldX, worldY, worldZ);
    const chunk = await this.getChunk(coords.chunkX, coords.chunkY, coords.chunkZ);
    
    chunk.setBlock(coords.localX, coords.localY, coords.localZ, block);
    
    if (!chunk.isDirty) {
      chunk.isDirty = true;
      this.dirtyChunks.add(this.getChunkKey(coords.chunkX, coords.chunkY, coords.chunkZ));
    }
    
    await this.checkAutoSave();
  }
  
  // Get block with minimal object creation
  async getOptimizedBlockAt(worldX: number, worldY: number, worldZ: number): Promise<OptimizedBlockData | null> {
    const coords = this.worldToChunk(worldX, worldY, worldZ);
    const key = this.getChunkKey(coords.chunkX, coords.chunkY, coords.chunkZ);
    
    let chunk = this.chunks.get(key);
    
    if (!chunk && this.worldLoaded) {
      try {
        const serializedChunk = await this.dbService.loadCompressedChunk(coords.chunkX, coords.chunkY, coords.chunkZ, this.currentWorldId);
        if (serializedChunk) {
          chunk = CompressedChunk.deserialize(serializedChunk);
          this.chunks.set(key, chunk);
        }
      } catch (error) {
        console.error(`Failed to load chunk for getOptimizedBlockAt(${worldX}, ${worldY}, ${worldZ}):`, error);
      }
    }
    
    if (!chunk) return null;
    return chunk.getBlock(coords.localX, coords.localY, coords.localZ);
  }
  
  // Legacy compatibility method
  async getBlockAt(worldX: number, worldY: number, worldZ: number): Promise<Block | null> {
    const optimizedBlock = await this.getOptimizedBlockAt(worldX, worldY, worldZ);
    if (!optimizedBlock || optimizedBlock.blockType === BlockType.AIR) return null;
    
    return this.convertToLegacyBlock(worldX, worldY, worldZ, optimizedBlock);
  }
  
  // Efficient visible blocks retrieval with spatial partitioning
  async getVisibleBlocks(playerX: number, playerY: number, playerZ: number): Promise<Map<string, Block>> {
    const playerChunk = this.worldToChunk(playerX, playerY, playerZ);
    const visibleBlocks = new Map<string, Block>();
    
    const loadPromises: Promise<CompressedChunk>[] = [];
    
    // Pre-load all chunks in parallel
    for (let chunkX = playerChunk.chunkX - this.renderDistance; 
         chunkX <= playerChunk.chunkX + this.renderDistance; 
         chunkX++) {
      for (let chunkY = playerChunk.chunkY - this.renderDistance; 
           chunkY <= playerChunk.chunkY + this.renderDistance; 
           chunkY++) {
        for (let chunkZ = playerChunk.chunkZ - this.renderDistance; 
             chunkZ <= playerChunk.chunkZ + this.renderDistance; 
             chunkZ++) {
          
          const chunkDistanceSq = 
            Math.pow(chunkX - playerChunk.chunkX, 2) + 
            Math.pow(chunkY - playerChunk.chunkY, 2) + 
            Math.pow(chunkZ - playerChunk.chunkZ, 2);
            
          if (chunkDistanceSq <= Math.pow(this.renderDistance, 2)) {
            loadPromises.push(this.getChunk(chunkX, chunkY, chunkZ));
          }
        }
      }
    }
    
    // Wait for all chunks to load
    const chunks = await Promise.all(loadPromises);
    
    // Extract visible blocks from loaded chunks
    for (const chunk of chunks) {
      if (chunk.isEmpty()) continue;
      
      for (let x = 0; x < 16; x++) {
        for (let y = 0; y < 16; y++) {
          for (let z = 0; z < 16; z++) {
            const optimizedBlock = chunk.getBlock(x, y, z);
            if (!optimizedBlock || optimizedBlock.blockType === BlockType.AIR) continue;
            
            // Only include visible blocks
            if (!(optimizedBlock.flags & BlockFlags.IS_VISIBLE)) continue;
            
            const worldX = chunk.chunkX * 16 + x;
            const worldY = chunk.chunkY * 16 + y;
            const worldZ = chunk.chunkZ * 16 + z;
            
            const legacyBlock = this.convertToLegacyBlock(worldX, worldY, worldZ, optimizedBlock);
            visibleBlocks.set(`${worldX},${worldY},${worldZ}`, legacyBlock);
          }
        }
      }
    }
    
    console.log(`🔍 Retrieved ${visibleBlocks.size} visible blocks from ${chunks.length} chunks`);
    return visibleBlocks;
  }
  
  // Bulk import from optimized terrain generation
  async importOptimizedChunks(chunks: Map<string, CompressedChunk>): Promise<void> {
    console.log(`📥 Importing ${chunks.size} optimized chunks...`);
    
    const startTime = performance.now();
    let totalBlocks = 0;
    
    // Clear existing chunks and import new ones
    await this.clearAllChunks();
    
    for (const [key, chunk] of chunks) {
      this.chunks.set(key, chunk);
      chunk.isDirty = true;
      this.dirtyChunks.add(key);
      totalBlocks += chunk.blockCount;
    }
    
    // Bulk save all chunks
    await this.saveAllChunks();
    
    const duration = performance.now() - startTime;
    console.log(`✅ Import complete: ${totalBlocks} blocks in ${chunks.size} chunks (${duration.toFixed(0)}ms)`);
    
    // Log memory savings
    const memoryStats = this.getOptimizedStats();
    console.log(`💾 Memory usage: ${memoryStats.memoryUsage}, Compression: ${memoryStats.compressionRatio}`);
  }
  
  // Enhanced chunk statistics with compression metrics
  getOptimizedStats(): OptimizedChunkStats {
    let totalBlocks = 0;
    let totalMemoryBytes = 0;
    const legacyMemoryEstimate = 500; // bytes per block in legacy system
    
    for (const chunk of this.chunks.values()) {
      totalBlocks += chunk.blockCount;
      totalMemoryBytes += chunk.getMemoryUsage();
    }
    
    const legacyMemoryBytes = totalBlocks * legacyMemoryEstimate;
    const compressionRatio = legacyMemoryBytes > 0 ? 
      `${(totalMemoryBytes / legacyMemoryBytes * 100).toFixed(1)}% of legacy size` : 
      'N/A';
    
    return {
      loadedChunks: this.chunks.size,
      totalBlocks,
      memoryUsage: `${Math.round(totalMemoryBytes / 1024 / 1024 * 100) / 100} MB`,
      compressionRatio,
      dirtyChunks: this.dirtyChunks.size
    };
  }
  
  // Enhanced auto-save with compression
  private async checkAutoSave(): Promise<void> {
    const now = Date.now();
    if (now - this.lastSaveTime > this.saveInterval && this.dirtyChunks.size > 0) {
      this.lastSaveTime = now;
      
      console.log(`💾 Auto-saving ${this.dirtyChunks.size} dirty compressed chunks...`);
      await this.saveAllChunks();
    }
  }
  
  // Optimized chunk limit enforcement
  private async enforceChunkLimit(): Promise<void> {
    if (this.chunks.size <= this.maxLoadedChunks) return;

    // Prioritize keeping non-empty chunks
    const chunkEntries = Array.from(this.chunks.entries())
      .sort(([, a], [, b]) => {
        // Empty chunks first (for removal)
        if (a.isEmpty() !== b.isEmpty()) {
          return a.isEmpty() ? -1 : 1;
        }
        // Then by last accessed time
        return a.lastAccessed - b.lastAccessed;
      });

    const chunksToRemove = chunkEntries.slice(0, Math.max(0, this.chunks.size - this.maxLoadedChunks));
    
    if (chunksToRemove.length > 0) {
      console.log(`🧹 Unloading ${chunksToRemove.length} chunks to enforce limit...`);
      
      // Save dirty chunks before removing
      const savePromises = chunksToRemove
        .filter(([, chunk]) => chunk.isDirty)
        .map(([, chunk]) => this.saveCompressedChunk(chunk));
      
      if (savePromises.length > 0) {
        await Promise.all(savePromises);
      }
      
      // Remove from memory
      for (const [key] of chunksToRemove) {
        this.chunks.delete(key);
        this.dirtyChunks.delete(key);
      }
    }
  }
  
  // Save compressed chunk to database
  private async saveCompressedChunk(chunk: CompressedChunk): Promise<void> {
    try {
      const serialized = chunk.serialize();
      await this.dbService.saveCompressedChunk(serialized, chunk.chunkX, chunk.chunkY, chunk.chunkZ, this.currentWorldId);
      
      chunk.isDirty = false;
      const chunkKey = this.getChunkKey(chunk.chunkX, chunk.chunkY, chunk.chunkZ);
      this.dirtyChunks.delete(chunkKey);
      
      console.log(`💾 Saved compressed chunk ${chunkKey} (${chunk.blockCount} blocks, ${chunk.getMemoryUsage()} bytes)`);
    } catch (error) {
      console.error(`Failed to save compressed chunk ${chunk.chunkX},${chunk.chunkY},${chunk.chunkZ}:`, error);
      throw error;
    }
  }
  
  // Bulk save all dirty chunks
  async saveAllChunks(): Promise<void> {
    if (!this.worldLoaded || this.dirtyChunks.size === 0) {
      return;
    }
    
    const dirtyChunksList = Array.from(this.dirtyChunks)
      .map(key => this.chunks.get(key))
      .filter((chunk): chunk is CompressedChunk => chunk !== undefined && chunk.isDirty);
    
    if (dirtyChunksList.length === 0) return;
    
    console.log(`💾 Bulk saving ${dirtyChunksList.length} compressed chunks...`);
    
    try {
      const savePromises = dirtyChunksList.map(chunk => this.saveCompressedChunk(chunk));
      await Promise.all(savePromises);
      
      console.log(`✅ Saved ${dirtyChunksList.length} compressed chunks successfully`);
    } catch (error) {
      console.error('Failed to bulk save compressed chunks:', error);
      throw error;
    }
  }
  
  // Convert optimized block to legacy format
  private convertToLegacyBlock(worldX: number, worldY: number, worldZ: number, optimizedBlock: OptimizedBlockData): Block {
    return {
      id: `block_${worldX}_${worldY}_${worldZ}`,
      position: { x: worldX, y: worldY, z: worldZ },
      metadata: {
        blockType: optimizedBlock.blockType,
        probabilityMappings: {
          horizontalNeighbors: this.getDefaultMapping(),
          positiveZ: this.getDefaultMapping(),
          negativeZ: this.getDefaultMapping()
        },
        consecutiveWoodCount: optimizedBlock.consecutiveWoodCount,
        breakable: (optimizedBlock.flags & BlockFlags.IS_BREAKABLE) !== 0,
        requiredTool: this.getRequiredToolFromFlags(optimizedBlock.flags),
        hardness: this.getHardnessFromBlockType(optimizedBlock.blockType),
        transparent: (optimizedBlock.flags & BlockFlags.IS_TRANSPARENT) !== 0
      },
      isVisible: (optimizedBlock.flags & BlockFlags.IS_VISIBLE) !== 0
    };
  }
  
  private getRequiredToolFromFlags(flags: number): any {
    if (flags & BlockFlags.REQUIRES_PICKAXE) return 'pickaxe';
    if (flags & BlockFlags.REQUIRES_SPADE) return 'spade';
    if (flags & BlockFlags.REQUIRES_AXE) return 'axe';
    return 'hand';
  }
  
  private getHardnessFromBlockType(blockType: BlockType): number {
    const hardnessMap = {
      [BlockType.AIR]: 0,
      [BlockType.DIRT]: 2,
      [BlockType.STONE]: 5,
      [BlockType.SAND]: 1,
      [BlockType.WATER]: 0,
      [BlockType.WOOD]: 3,
      [BlockType.LEAVES]: 1
    };
    return hardnessMap[blockType] || 0;
  }
  
  private getDefaultMapping(): any {
    return {
      [BlockType.AIR]: 0,
      [BlockType.DIRT]: 0,
      [BlockType.STONE]: 0,
      [BlockType.SAND]: 0,
      [BlockType.WATER]: 0,
      [BlockType.WOOD]: 0,
      [BlockType.LEAVES]: 0
    };
  }
  
  // Clear all chunks with proper cleanup
  async clearAllChunks(): Promise<void> {
    // Save dirty chunks before clearing
    if (this.dirtyChunks.size > 0) {
      await this.saveAllChunks();
    }
    
    this.chunks.clear();
    this.dirtyChunks.clear();
    
    if (this.worldLoaded) {
      try {
        await this.dbService.clearAllData(this.currentWorldId);
        console.log(`🗑️ Cleared all compressed chunk data for world ${this.currentWorldId}`);
      } catch (error) {
        console.error('Failed to clear database:', error);
      }
    }
  }
  
  // Switch to different world
  async switchToWorld(worldId: string): Promise<void> {
    if (this.worldLoaded) {
      await this.saveAllChunks();
    }
    
    this.chunks.clear();
    this.dirtyChunks.clear();
    this.currentWorldId = worldId;
    this.worldLoaded = true;
    
    console.log(`🌍 Switched to optimized world: ${worldId}`);
  }
  
  // Create new optimized world
  async createNewWorld(worldName?: string, settings?: any): Promise<string> {
    try {
      const worldId = await this.dbService.createWorld({
        name: worldName || `Optimized World ${Date.now()}`,
        settings: { ...settings, optimized: true },
        metadata: {
          createdBy: 'OptimizedChunkManager',
          compressionEnabled: true,
          version: '2.0'
        }
      });
      
      await this.switchToWorld(worldId);
      
      console.log(`🆕 Created optimized world: ${worldName} (${worldId})`);
      return worldId;
    } catch (error) {
      console.error('Failed to create optimized world:', error);
      throw error;
    }
  }
  
  // Get current world ID
  getCurrentWorldId(): string {
    return this.currentWorldId;
  }
  
  // Check if world is loaded
  isWorldLoaded(): boolean {
    return this.worldLoaded;
  }
  
  // Advanced memory monitoring
  getDetailedMemoryStats(): {
    chunks: OptimizedChunkStats;
    heap: ReturnType<typeof MemoryMonitor.prototype.getMemoryEstimate>;
    pools: { blocks: number; positions: number };
  } {
    return {
      chunks: this.getOptimizedStats(),
      heap: this.memoryMonitor.getMemoryEstimate(),
      pools: {
        blocks: this.blockPool.length,
        positions: this.positionPool.length
      }
    };
  }
}