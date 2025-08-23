import { Injectable } from '@angular/core';
import { TerrainGenerationService } from './terrain-generation.service';
import { OptimizedTerrainGenerationService, GenerationProgress } from './optimized-terrain-generation.service';
import { ChunkManagerService } from './chunk-manager.service';
import { OptimizedChunkManagerService } from './optimized-chunk-manager.service';
import { Vector3, Block, BlockType } from '../../shared/models/block.model';
import { CompressedChunk, MemoryMonitor, OptimizedBlockData, BlockFlags } from '../../shared/models/optimized-block.model';
import { DBService } from './db.service';

export interface PerformanceMetrics {
  generationTime: number;
  memoryUsage: string;
  blocksGenerated: number;
  chunksCreated: number;
  compressionRatio?: string;
  mode: 'legacy' | 'optimized';
}

export interface MigrationProgress {
  stage: 'analyzing' | 'converting' | 'saving' | 'complete';
  current: number;
  total: number;
  message: string;
}

@Injectable({
  providedIn: 'root'
})
export class TerrainPerformanceService {
  private memoryMonitor = MemoryMonitor.getInstance();
  private useOptimizedMode = true; // Default to optimized mode
  private migrationInProgress = false;
  
  constructor(
    private legacyTerrainService: TerrainGenerationService,
    private optimizedTerrainService: OptimizedTerrainGenerationService,
    private legacyChunkManager: ChunkManagerService,
    private optimizedChunkManager: OptimizedChunkManagerService,
    private dbService: DBService
  ) {
    this.detectOptimalMode();
  }
  
  private detectOptimalMode(): void {
    // Auto-detect whether to use optimized mode based on browser capabilities
    const supportsTypedArrays = typeof Uint8Array !== 'undefined';
    const hasEnoughMemory = 'memory' in performance;
    
    this.useOptimizedMode = supportsTypedArrays;
    
    console.log(`🔧 Performance mode: ${this.useOptimizedMode ? 'OPTIMIZED' : 'LEGACY'}`);
    console.log(`📊 Typed arrays supported: ${supportsTypedArrays}`);
    console.log(`💾 Memory monitoring available: ${hasEnoughMemory}`);
  }
  
  // Main world generation method with automatic mode selection
  async generateWorld(
    startPosition: Vector3, 
    radius: number = 32,
    onProgress?: (progress: GenerationProgress) => void
  ): Promise<{ blocks: Map<string, Block>; metrics: PerformanceMetrics }> {
    
    const startTime = performance.now();
    console.log(`🚀 Starting ${this.useOptimizedMode ? 'OPTIMIZED' : 'LEGACY'} world generation...`);
    console.log(`📍 Position: (${startPosition.x}, ${startPosition.y}, ${startPosition.z}), Radius: ${radius}`);
    
    let blocks: Map<string, Block>;
    let chunks: Map<string, CompressedChunk> | undefined;
    let compressionRatio: string | undefined;
    
    if (this.useOptimizedMode) {
      // Use optimized generation
      chunks = await this.optimizedTerrainService.generateWorldStreaming(
        startPosition, 
        radius, 
        onProgress
      );
      
      // Import into optimized chunk manager
      await this.optimizedChunkManager.importOptimizedChunks(chunks);
      
      // Convert to legacy format for compatibility (only visible blocks)
      blocks = this.optimizedTerrainService.convertToLegacyBlocks(chunks);
      
      // Get compression stats
      const stats = this.optimizedChunkManager.getOptimizedStats();
      compressionRatio = stats.compressionRatio;
      
    } else {
      // Use legacy generation
      blocks = this.legacyTerrainService.generateWorld(startPosition, radius);
      
      // Import into legacy chunk manager
      await this.legacyChunkManager.importFromFlatWorld(blocks);
    }
    
    const endTime = performance.now();
    const generationTime = endTime - startTime;
    
    const metrics: PerformanceMetrics = {
      generationTime,
      memoryUsage: this.getMemoryUsage(),
      blocksGenerated: blocks.size,
      chunksCreated: this.useOptimizedMode ? chunks!.size : this.getApproximateChunkCount(blocks),
      compressionRatio,
      mode: this.useOptimizedMode ? 'optimized' : 'legacy'
    };
    
    console.log('🎯 World Generation Complete!');
    console.log(`⏱️  Time: ${generationTime.toFixed(0)}ms`);
    console.log(`🧱 Blocks: ${blocks.size}`);
    console.log(`📦 Chunks: ${metrics.chunksCreated}`);
    console.log(`💾 Memory: ${metrics.memoryUsage}`);
    if (compressionRatio) {
      console.log(`🗜️  Compression: ${compressionRatio}`);
    }
    
    return { blocks, metrics };
  }
  
  // Get visible blocks around player (unified interface)
  async getVisibleBlocks(playerX: number, playerY: number, playerZ: number): Promise<Map<string, Block>> {
    if (this.useOptimizedMode) {
      return await this.optimizedChunkManager.getVisibleBlocks(playerX, playerY, playerZ);
    } else {
      return await this.legacyChunkManager.getVisibleBlocks(playerX, playerY, playerZ);
    }
  }
  
  // Set block (unified interface)
  async setBlockAt(worldX: number, worldY: number, worldZ: number, blockType: BlockType): Promise<void> {
    if (this.useOptimizedMode) {
      // Convert to optimized format
      const optimizedBlock: OptimizedBlockData = {
        blockType,
        paletteId: 0, // Default palette
        consecutiveWoodCount: 0,
        flags: blockType !== BlockType.AIR ? BlockFlags.IS_VISIBLE : 0
      };
      await this.optimizedChunkManager.setOptimizedBlockAt(worldX, worldY, worldZ, optimizedBlock);
    } else {
      // Create legacy block
      const block: Block = {
        id: `block_${worldX}_${worldY}_${worldZ}`,
        position: { x: worldX, y: worldY, z: worldZ },
        metadata: {
          blockType,
          probabilityMappings: {
            horizontalNeighbors: {} as any,
            positiveZ: {} as any,
            negativeZ: {} as any
          },
          breakable: true,
          hardness: 1,
          transparent: false
        },
        isVisible: blockType !== BlockType.AIR
      };
      await this.legacyChunkManager.setBlockAt(worldX, worldY, worldZ, block);
    }
  }
  
  // Get block (unified interface)
  async getBlockAt(worldX: number, worldY: number, worldZ: number): Promise<Block | null> {
    if (this.useOptimizedMode) {
      return await this.optimizedChunkManager.getBlockAt(worldX, worldY, worldZ);
    } else {
      return await this.legacyChunkManager.getBlockAt(worldX, worldY, worldZ);
    }
  }
  
  // Remove block (unified interface)
  async removeBlockAt(worldX: number, worldY: number, worldZ: number): Promise<boolean> {
    if (this.useOptimizedMode) {
      const coords = this.optimizedChunkManager.worldToChunk(worldX, worldY, worldZ);
      const chunk = await this.optimizedChunkManager.getChunk(coords.chunkX, coords.chunkY, coords.chunkZ);
      return chunk.removeBlock(coords.localX, coords.localY, coords.localZ);
    } else {
      return await this.legacyChunkManager.removeBlockAt(worldX, worldY, worldZ);
    }
  }
  
  // Save world (unified interface)
  async saveWorld(): Promise<void> {
    if (this.useOptimizedMode) {
      await this.optimizedChunkManager.saveAllChunks();
    } else {
      await this.legacyChunkManager.saveAllChunks();
    }
  }
  
  // Load world (unified interface)
  async loadWorld(worldId?: string): Promise<boolean> {
    if (this.useOptimizedMode) {
      // Try to load optimized world first
      try {
        const world = worldId ? await this.dbService.loadWorld(worldId) : null;
        if (world?.metadata?.optimized) {
          await this.optimizedChunkManager.switchToWorld(worldId!);
          return true;
        }
      } catch (error) {
        console.log('No optimized world found, checking for legacy world...');
      }
      
      // Fall back to legacy world migration
      const legacyLoaded = await this.legacyChunkManager.loadWorld(worldId);
      if (legacyLoaded) {
        console.log('📈 Legacy world detected - migration recommended');
      }
      return legacyLoaded;
    } else {
      return await this.legacyChunkManager.loadWorld(worldId);
    }
  }
  
  // Create new world (unified interface)
  async createNewWorld(worldName?: string, settings?: any): Promise<string> {
    if (this.useOptimizedMode) {
      return await this.optimizedChunkManager.createNewWorld(worldName, settings);
    } else {
      return await this.legacyChunkManager.createNewWorld(worldName, settings);
    }
  }
  
  // Switch between optimized and legacy modes
  async switchMode(useOptimized: boolean): Promise<void> {
    if (this.migrationInProgress) {
      throw new Error('Cannot switch modes during migration');
    }
    
    if (this.useOptimizedMode === useOptimized) {
      return; // No change needed
    }
    
    // Save current world before switching
    if (this.useOptimizedMode) {
      await this.optimizedChunkManager.saveAllChunks();
    } else {
      await this.legacyChunkManager.saveAllChunks();
    }
    
    this.useOptimizedMode = useOptimized;
    console.log(`🔄 Switched to ${this.useOptimizedMode ? 'OPTIMIZED' : 'LEGACY'} mode`);
  }
  
  // Migrate legacy world to optimized format
  async migrateLegacyWorld(
    onProgress?: (progress: MigrationProgress) => void
  ): Promise<{ success: boolean; metrics: PerformanceMetrics }> {
    
    if (this.migrationInProgress) {
      throw new Error('Migration already in progress');
    }
    
    this.migrationInProgress = true;
    const startTime = performance.now();
    
    try {
      console.log('🔄 Starting legacy world migration...');
      
      onProgress?.({ 
        stage: 'analyzing', 
        current: 0, 
        total: 100, 
        message: 'Analyzing legacy world data...' 
      });
      
      // Export legacy world to flat format
      const legacyBlocks = this.legacyChunkManager.exportToFlatWorld();
      const totalBlocks = legacyBlocks.size;
      
      if (totalBlocks === 0) {
        throw new Error('No blocks found in legacy world');
      }
      
      onProgress?.({ 
        stage: 'converting', 
        current: 0, 
        total: totalBlocks, 
        message: `Converting ${totalBlocks} blocks to optimized format...` 
      });
      
      // Convert blocks to optimized chunks
      const optimizedChunks = new Map<string, CompressedChunk>();
      let processedBlocks = 0;
      
      for (const [worldKey, legacyBlock] of legacyBlocks) {
        const [x, y, z] = worldKey.split(',').map(Number);
        
        // Create optimized block
        const optimizedBlock: OptimizedBlockData = {
          blockType: legacyBlock.metadata.blockType,
          paletteId: 0, // Default palette for migrated blocks
          consecutiveWoodCount: legacyBlock.metadata.consecutiveWoodCount || 0,
          flags: this.createFlags(legacyBlock)
        };
        
        // Get or create chunk
        const chunkCoords = this.optimizedChunkManager.worldToChunk(x, y, z);
        const chunkKey = `${chunkCoords.chunkX},${chunkCoords.chunkY},${chunkCoords.chunkZ}`;
        
        let chunk = optimizedChunks.get(chunkKey);
        if (!chunk) {
          chunk = new CompressedChunk(chunkCoords.chunkX, chunkCoords.chunkY, chunkCoords.chunkZ);
          optimizedChunks.set(chunkKey, chunk);
        }
        
        // Set block in chunk
        chunk.setBlock(chunkCoords.localX, chunkCoords.localY, chunkCoords.localZ, optimizedBlock);
        
        processedBlocks++;
        
        if (processedBlocks % 1000 === 0) {
          onProgress?.({ 
            stage: 'converting', 
            current: processedBlocks, 
            total: totalBlocks, 
            message: `Converted ${processedBlocks}/${totalBlocks} blocks...` 
          });
          
          // Yield to browser
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }
      
      onProgress?.({ 
        stage: 'saving', 
        current: 0, 
        total: optimizedChunks.size, 
        message: `Saving ${optimizedChunks.size} optimized chunks...` 
      });
      
      // Save optimized chunks
      await this.optimizedChunkManager.importOptimizedChunks(optimizedChunks);
      
      // Switch to optimized mode
      await this.switchMode(true);
      
      const endTime = performance.now();
      const migrationTime = endTime - startTime;
      
      const stats = this.optimizedChunkManager.getOptimizedStats();
      
      const metrics: PerformanceMetrics = {
        generationTime: migrationTime,
        memoryUsage: stats.memoryUsage,
        blocksGenerated: totalBlocks,
        chunksCreated: optimizedChunks.size,
        compressionRatio: stats.compressionRatio,
        mode: 'optimized'
      };
      
      onProgress?.({ 
        stage: 'complete', 
        current: totalBlocks, 
        total: totalBlocks, 
        message: `Migration complete! Saved ${totalBlocks} blocks in ${optimizedChunks.size} chunks` 
      });
      
      console.log('✅ Migration completed successfully!');
      console.log(`⏱️  Migration time: ${migrationTime.toFixed(0)}ms`);
      console.log(`🧱 Blocks migrated: ${totalBlocks}`);
      console.log(`📦 Chunks created: ${optimizedChunks.size}`);
      console.log(`🗜️  Compression ratio: ${stats.compressionRatio}`);
      
      return { success: true, metrics };
      
    } catch (error) {
      console.error('❌ Migration failed:', error);
      onProgress?.({ 
        stage: 'complete', 
        current: 0, 
        total: 0, 
        message: `Migration failed: ${error}` 
      });
      return { 
        success: false, 
        metrics: { 
          generationTime: 0, 
          memoryUsage: '0 MB', 
          blocksGenerated: 0, 
          chunksCreated: 0, 
          mode: 'legacy' 
        } 
      };
    } finally {
      this.migrationInProgress = false;
    }
  }
  
  private createFlags(legacyBlock: Block): number {
    let flags = 0;
    
    if (legacyBlock.isVisible) flags |= BlockFlags.IS_VISIBLE;
    if (legacyBlock.metadata.breakable) flags |= BlockFlags.IS_BREAKABLE;
    if (legacyBlock.metadata.transparent) flags |= BlockFlags.IS_TRANSPARENT;
    
    switch (legacyBlock.metadata.requiredTool) {
      case 'pickaxe': flags |= BlockFlags.REQUIRES_PICKAXE; break;
      case 'spade': flags |= BlockFlags.REQUIRES_SPADE; break;
      case 'axe': flags |= BlockFlags.REQUIRES_AXE; break;
    }
    
    return flags;
  }
  
  // Get comprehensive performance statistics
  getPerformanceStats(): {
    mode: 'legacy' | 'optimized';
    chunks: any;
    memory: ReturnType<typeof MemoryMonitor.prototype.getMemoryEstimate>;
    storage?: any;
  } {
    if (this.useOptimizedMode) {
      return {
        mode: 'optimized',
        chunks: this.optimizedChunkManager.getOptimizedStats(),
        memory: this.memoryMonitor.getMemoryEstimate(),
        storage: undefined // Could add storage stats if needed
      };
    } else {
      return {
        mode: 'legacy',
        chunks: this.legacyChunkManager.getChunkStats(),
        memory: this.memoryMonitor.getMemoryEstimate()
      };
    }
  }
  
  // Check if migration is recommended
  async shouldMigrate(): Promise<{ recommended: boolean; reason: string; savings?: string }> {
    if (this.useOptimizedMode) {
      return { recommended: false, reason: 'Already using optimized mode' };
    }
    
    const legacyStats = this.legacyChunkManager.getChunkStats();
    if (legacyStats.totalBlocks < 1000) {
      return { recommended: false, reason: 'World too small to benefit from migration' };
    }
    
    // Estimate savings
    const currentMemoryMB = parseFloat(legacyStats.memoryUsage.replace(' MB', ''));
    const estimatedOptimizedMB = currentMemoryMB * 0.05; // ~95% compression
    const savingsMB = currentMemoryMB - estimatedOptimizedMB;
    
    if (savingsMB < 10) {
      return { recommended: false, reason: 'Memory savings would be minimal (<10MB)' };
    }
    
    return {
      recommended: true,
      reason: `Significant memory and performance improvements available`,
      savings: `~${savingsMB.toFixed(1)}MB memory savings`
    };
  }
  
  private getMemoryUsage(): string {
    const memStats = this.memoryMonitor.getMemoryEstimate();
    return memStats.heap !== 'Unknown' ? memStats.heap : 'Unknown';
  }
  
  private getApproximateChunkCount(blocks: Map<string, Block>): number {
    const chunkSize = 16;
    const uniqueChunks = new Set<string>();
    
    for (const [key] of blocks) {
      const [x, y, z] = key.split(',').map(Number);
      const chunkKey = `${Math.floor(x / chunkSize)},${Math.floor(y / chunkSize)},${Math.floor(z / chunkSize)}`;
      uniqueChunks.add(chunkKey);
    }
    
    return uniqueChunks.size;
  }
  
  // Get current mode
  isOptimizedMode(): boolean {
    return this.useOptimizedMode;
  }
  
  // Check if migration is in progress
  isMigrationInProgress(): boolean {
    return this.migrationInProgress;
  }
}