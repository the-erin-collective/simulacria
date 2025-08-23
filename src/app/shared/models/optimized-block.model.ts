import { BlockType, ToolType, ProbabilityMapping, BlockMetadata } from './block.model';

// DVE-inspired optimized block storage using typed arrays
export interface OptimizedBlockData {
  blockType: BlockType;
  paletteId: number; // Reference to probability mapping palette
  consecutiveWoodCount: number;
  flags: number; // Packed boolean flags (isVisible, breakable, transparent, etc.)
}

// Compressed chunk storage - 4 bytes per block instead of 400-500
export class CompressedChunk {
  private static readonly CHUNK_SIZE = 16;
  private static readonly TOTAL_BLOCKS = 16 * 16 * 16; // 4096 blocks
  
  // Typed arrays for efficient memory usage (DVE pattern)
  public blockTypes: Uint8Array; // 1 byte per block (0-7 for BlockType enum)
  public paletteIds: Uint16Array; // 2 bytes per block for palette reference
  public consecutiveCounts: Uint8Array; // 1 byte for consecutive wood count
  public flags: Uint8Array; // 1 byte for packed flags
  
  public chunkX: number;
  public chunkY: number;
  public chunkZ: number;
  public lastAccessed: number = Date.now();
  public isDirty: boolean = false;
  public blockCount: number = 0; // Track number of non-air blocks
  
  constructor(chunkX: number, chunkY: number, chunkZ: number) {
    this.chunkX = chunkX;
    this.chunkY = chunkY;
    this.chunkZ = chunkZ;
    
    // Initialize typed arrays - only 16KB total per chunk vs ~2MB before
    this.blockTypes = new Uint8Array(CompressedChunk.TOTAL_BLOCKS);
    this.paletteIds = new Uint16Array(CompressedChunk.TOTAL_BLOCKS);
    this.consecutiveCounts = new Uint8Array(CompressedChunk.TOTAL_BLOCKS);
    this.flags = new Uint8Array(CompressedChunk.TOTAL_BLOCKS);
    
    // Fill with air by default
    this.blockTypes.fill(this.blockTypeToIndex(BlockType.AIR));
  }
  
  private blockTypeToIndex(blockType: BlockType): number {
    const mapping = {
      [BlockType.AIR]: 0,
      [BlockType.DIRT]: 1,
      [BlockType.STONE]: 2,
      [BlockType.SAND]: 3,
      [BlockType.WATER]: 4,
      [BlockType.WOOD]: 5,
      [BlockType.LEAVES]: 6
    };
    return mapping[blockType] || 0;
  }
  
  private indexToBlockType(index: number): BlockType {
    const mapping = [
      BlockType.AIR,
      BlockType.DIRT,
      BlockType.STONE,
      BlockType.SAND,
      BlockType.WATER,
      BlockType.WOOD,
      BlockType.LEAVES
    ];
    return mapping[index] || BlockType.AIR;
  }
  
  private getIndex(localX: number, localY: number, localZ: number): number {
    return localX + (localY * CompressedChunk.CHUNK_SIZE) + (localZ * CompressedChunk.CHUNK_SIZE * CompressedChunk.CHUNK_SIZE);
  }
  
  public setBlock(localX: number, localY: number, localZ: number, optimizedBlock: OptimizedBlockData): void {
    const index = this.getIndex(localX, localY, localZ);
    const previousType = this.indexToBlockType(this.blockTypes[index]);
    
    this.blockTypes[index] = this.blockTypeToIndex(optimizedBlock.blockType);
    this.paletteIds[index] = optimizedBlock.paletteId;
    this.consecutiveCounts[index] = Math.min(255, optimizedBlock.consecutiveWoodCount);
    this.flags[index] = optimizedBlock.flags;
    
    // Update block count for memory tracking
    if (previousType === BlockType.AIR && optimizedBlock.blockType !== BlockType.AIR) {
      this.blockCount++;
    } else if (previousType !== BlockType.AIR && optimizedBlock.blockType === BlockType.AIR) {
      this.blockCount--;
    }
    
    this.isDirty = true;
    this.lastAccessed = Date.now();
  }
  
  public getBlock(localX: number, localY: number, localZ: number): OptimizedBlockData | null {
    const index = this.getIndex(localX, localY, localZ);
    if (index < 0 || index >= CompressedChunk.TOTAL_BLOCKS) return null;
    
    return {
      blockType: this.indexToBlockType(this.blockTypes[index]),
      paletteId: this.paletteIds[index],
      consecutiveWoodCount: this.consecutiveCounts[index],
      flags: this.flags[index]
    };
  }
  
  public removeBlock(localX: number, localY: number, localZ: number): boolean {
    const index = this.getIndex(localX, localY, localZ);
    const previousType = this.indexToBlockType(this.blockTypes[index]);
    
    if (previousType === BlockType.AIR) return false;
    
    this.blockTypes[index] = this.blockTypeToIndex(BlockType.AIR);
    this.paletteIds[index] = 0;
    this.consecutiveCounts[index] = 0;
    this.flags[index] = 0;
    
    this.blockCount--;
    this.isDirty = true;
    this.lastAccessed = Date.now();
    
    return true;
  }
  
  public isEmpty(): boolean {
    return this.blockCount === 0;
  }
  
  public getMemoryUsage(): number {
    // 5 bytes per block (1 + 2 + 1 + 1) = 20,480 bytes per chunk vs ~2MB before
    return CompressedChunk.TOTAL_BLOCKS * 5;
  }
  
  // Serialize for storage (further compression possible)
  public serialize(): ArrayBuffer {
    const buffer = new ArrayBuffer(
      this.blockTypes.length + 
      this.paletteIds.byteLength + 
      this.consecutiveCounts.length + 
      this.flags.length + 
      32 // metadata
    );
    
    let offset = 0;
    const view = new DataView(buffer);
    
    // Write metadata
    view.setInt32(offset, this.chunkX); offset += 4;
    view.setInt32(offset, this.chunkY); offset += 4;
    view.setInt32(offset, this.chunkZ); offset += 4;
    view.setFloat64(offset, this.lastAccessed); offset += 8;
    view.setUint32(offset, this.blockCount); offset += 4;
    view.setUint8(offset, this.isDirty ? 1 : 0); offset += 1;
    offset += 3; // padding
    
    // Write typed arrays
    new Uint8Array(buffer, offset, this.blockTypes.length).set(this.blockTypes);
    offset += this.blockTypes.length;
    
    new Uint8Array(buffer, offset, this.paletteIds.byteLength).set(new Uint8Array(this.paletteIds.buffer));
    offset += this.paletteIds.byteLength;
    
    new Uint8Array(buffer, offset, this.consecutiveCounts.length).set(this.consecutiveCounts);
    offset += this.consecutiveCounts.length;
    
    new Uint8Array(buffer, offset, this.flags.length).set(this.flags);
    
    return buffer;
  }
  
  // Deserialize from storage
  public static deserialize(buffer: ArrayBuffer): CompressedChunk {
    const view = new DataView(buffer);
    let offset = 0;
    
    // Read metadata
    const chunkX = view.getInt32(offset); offset += 4;
    const chunkY = view.getInt32(offset); offset += 4;
    const chunkZ = view.getInt32(offset); offset += 4;
    const lastAccessed = view.getFloat64(offset); offset += 8;
    const blockCount = view.getUint32(offset); offset += 4;
    const isDirty = view.getUint8(offset) === 1; offset += 1;
    offset += 3; // padding
    
    // Create chunk and read arrays
    const chunk = new CompressedChunk(chunkX, chunkY, chunkZ);
    chunk.lastAccessed = lastAccessed;
    chunk.blockCount = blockCount;
    chunk.isDirty = isDirty;
    
    chunk.blockTypes.set(new Uint8Array(buffer, offset, CompressedChunk.TOTAL_BLOCKS));
    offset += CompressedChunk.TOTAL_BLOCKS;
    
    const paletteBytes = new Uint8Array(buffer, offset, CompressedChunk.TOTAL_BLOCKS * 2);
    chunk.paletteIds.set(new Uint16Array(paletteBytes.buffer));
    offset += CompressedChunk.TOTAL_BLOCKS * 2;
    
    chunk.consecutiveCounts.set(new Uint8Array(buffer, offset, CompressedChunk.TOTAL_BLOCKS));
    offset += CompressedChunk.TOTAL_BLOCKS;
    
    chunk.flags.set(new Uint8Array(buffer, offset, CompressedChunk.TOTAL_BLOCKS));
    
    return chunk;
  }
}

// Block flags for efficient storage
export enum BlockFlags {
  IS_VISIBLE = 1 << 0,
  IS_BREAKABLE = 1 << 1,
  IS_TRANSPARENT = 1 << 2,
  REQUIRES_PICKAXE = 1 << 3,
  REQUIRES_SPADE = 1 << 4,
  REQUIRES_AXE = 1 << 5,
  // 2 bits remaining for future use
}

// Palette system for probability mappings (DVE pattern)
export class ProbabilityMappingPalette {
  private mappings: Map<number, Partial<BlockMetadata['probabilityMappings']>> = new Map();
  private nextId: number = 1; // 0 reserved for default/empty
  
  public addMapping(mapping: Partial<BlockMetadata['probabilityMappings']>): number {
    // Check if mapping already exists (deduplication)
    for (const [id, existingMapping] of this.mappings) {
      if (this.mappingsEqual(mapping, existingMapping)) {
        return id;
      }
    }
    
    // Add new mapping
    const id = this.nextId++;
    this.mappings.set(id, mapping);
    return id;
  }
  
  public getMapping(id: number): Partial<BlockMetadata['probabilityMappings']> | undefined {
    return this.mappings.get(id);
  }
  
  public clear(): void {
    this.mappings.clear();
    this.nextId = 1;
  }
  
  public getSize(): number {
    return this.mappings.size;
  }
  
  public getMemoryUsage(): number {
    // Rough estimate: each mapping ~200 bytes
    return this.mappings.size * 200;
  }
  
  private mappingsEqual(
    a: Partial<BlockMetadata['probabilityMappings']>, 
    b: Partial<BlockMetadata['probabilityMappings']>
  ): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
  }
}

// Performance monitoring utility
export class MemoryMonitor {
  private static instance: MemoryMonitor;
  private startTime: number = 0;
  private generationProgress: { current: number; total: number } = { current: 0, total: 0 };
  
  public static getInstance(): MemoryMonitor {
    if (!MemoryMonitor.instance) {
      MemoryMonitor.instance = new MemoryMonitor();
    }
    return MemoryMonitor.instance;
  }
  
  public startGeneration(totalBlocks: number): void {
    this.startTime = performance.now();
    this.generationProgress = { current: 0, total: totalBlocks };
    console.log(`🔄 Starting terrain generation: ${totalBlocks} blocks`);
  }
  
  public updateProgress(current: number): void {
    this.generationProgress.current = current;
    
    if (current % 1000 === 0) {
      const elapsed = performance.now() - this.startTime;
      const rate = current / (elapsed / 1000);
      const eta = (this.generationProgress.total - current) / rate;
      const progress = (current / this.generationProgress.total) * 100;
      
      console.log(`⚡ Generation progress: ${progress.toFixed(1)}% (${current}/${this.generationProgress.total}) - ${rate.toFixed(0)} blocks/sec - ETA: ${eta.toFixed(1)}s`);
    }
  }
  
  public finishGeneration(): void {
    const elapsed = performance.now() - this.startTime;
    const rate = this.generationProgress.total / (elapsed / 1000);
    console.log(`✅ Generation complete: ${this.generationProgress.total} blocks in ${elapsed.toFixed(0)}ms (${rate.toFixed(0)} blocks/sec)`);
  }
  
  public getMemoryEstimate(): { heap: string; chunks: string; total: string } {
    if ('memory' in performance) {
      const memory = (performance as any).memory;
      return {
        heap: `${Math.round(memory.usedJSHeapSize / 1024 / 1024 * 100) / 100} MB`,
        chunks: 'N/A',
        total: `${Math.round(memory.totalJSHeapSize / 1024 / 1024 * 100) / 100} MB`
      };
    }
    
    return {
      heap: 'Unknown',
      chunks: 'Unknown', 
      total: 'Unknown'
    };
  }
}