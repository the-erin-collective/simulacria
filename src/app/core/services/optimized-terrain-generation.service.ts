import { Injectable } from '@angular/core';
import { 
  Block, 
  BlockType, 
  BlockMetadata, 
  Vector3, 
  ProbabilityMapping,
  BLOCK_PROPERTIES 
} from '../../shared/models/block.model';
import { DEFAULT_PROBABILITY_MAPPINGS } from '../../shared/models/probability-mappings';
import { 
  CompressedChunk, 
  OptimizedBlockData, 
  ProbabilityMappingPalette,
  MemoryMonitor,
  BlockFlags 
} from '../../shared/models/optimized-block.model';

export interface GenerationProgress {
  current: number;
  total: number;
  stage: 'initializing' | 'generating' | 'compressing' | 'complete';
  message: string;
}

@Injectable({
  providedIn: 'root'
})
export class OptimizedTerrainGenerationService {
  private memoryMonitor = MemoryMonitor.getInstance();
  private probabilityPalette = new ProbabilityMappingPalette();
  private generationAborted = false;
  
  // Pre-computed palette IDs for default mappings (avoid runtime lookups)
  private readonly defaultPaletteIds = new Map<BlockType, number>();
  
  constructor() {
    this.initializePalette();
  }
  
  private initializePalette(): void {
    // Pre-populate palette with default probability mappings
    for (const [blockType, mappings] of Object.entries(DEFAULT_PROBABILITY_MAPPINGS)) {
      const paletteId = this.probabilityPalette.addMapping(mappings);
      this.defaultPaletteIds.set(blockType as BlockType, paletteId);
    }
    
    console.log(`🎨 Initialized probability palette with ${this.probabilityPalette.getSize()} mappings`);
  }
  
  // Streaming world generation with progress callbacks and memory throttling
  async generateWorldStreaming(
    startPosition: Vector3, 
    radius: number = 32,
    onProgress?: (progress: GenerationProgress) => void
  ): Promise<Map<string, CompressedChunk>> {
    const chunks = new Map<string, CompressedChunk>();
    this.generationAborted = false;
    
    // Calculate estimated block count for progress tracking
    const estimatedBlocks = Math.ceil(4/3 * Math.PI * Math.pow(radius, 3));
    this.memoryMonitor.startGeneration(estimatedBlocks);
    
    // Generation queue with priority (closer blocks first)
    const generationQueue: Array<{ position: Vector3; priority: number; parentBlock?: OptimizedBlockData }> = [];
    const processedBlocks = new Set<string>();
    
    // Add seed block
    const seedBlock = this.createOptimizedBlock(startPosition, BlockType.DIRT);
    const seedChunk = this.getOrCreateChunk(chunks, startPosition);
    const seedCoords = this.worldToLocal(startPosition);
    seedChunk.setBlock(seedCoords.localX, seedCoords.localY, seedCoords.localZ, seedBlock);
    
    generationQueue.push({ position: startPosition, priority: 0 });
    processedBlocks.add(this.getBlockKey(startPosition));
    
    let processedCount = 0;
    const batchSize = 100; // Process blocks in batches to prevent UI blocking
    
    onProgress?.({ 
      current: 0, 
      total: estimatedBlocks, 
      stage: 'generating', 
      message: 'Starting terrain generation...' 
    });
    
    while (generationQueue.length > 0 && !this.generationAborted) {
      // Process batch of blocks
      const batch = generationQueue.splice(0, Math.min(batchSize, generationQueue.length));
      
      for (const { position, parentBlock } of batch) {
        const currentChunk = this.getOrCreateChunk(chunks, position);
        const currentCoords = this.worldToLocal(position);
        const currentBlock = currentChunk.getBlock(currentCoords.localX, currentCoords.localY, currentCoords.localZ) || 
                           (parentBlock ? this.mutateBlock(parentBlock) : seedBlock);
        
        // Generate neighboring blocks within radius
        const neighbors = this.getNeighborPositions(position);
        for (const neighborPos of neighbors) {
          const neighborKey = this.getBlockKey(neighborPos);
          
          if (processedBlocks.has(neighborKey)) continue;
          
          const distance = this.calculateDistance(neighborPos, startPosition);
          if (distance > radius) continue;
          
          const newBlockType = this.selectBlockType(currentBlock, neighborPos, position);
          const newBlock = this.createOptimizedBlock(neighborPos, newBlockType, currentBlock);
          
          const neighborChunk = this.getOrCreateChunk(chunks, neighborPos);
          const neighborCoords = this.worldToLocal(neighborPos);
          neighborChunk.setBlock(neighborCoords.localX, neighborCoords.localY, neighborCoords.localZ, newBlock);
          
          processedBlocks.add(neighborKey);
          processedCount++;
          
          // Add to queue if not air (continue generation)
          if (newBlockType !== BlockType.AIR) {
            const priority = distance; // Closer blocks have lower priority values
            generationQueue.push({ position: neighborPos, priority, parentBlock: newBlock });
          }
        }
      }
      
      // Sort queue by priority to generate closer blocks first
      generationQueue.sort((a, b) => a.priority - b.priority);
      
      // Update progress and yield to browser
      this.memoryMonitor.updateProgress(processedCount);
      onProgress?.({ 
        current: processedCount, 
        total: estimatedBlocks, 
        stage: 'generating',
        message: `Generated ${processedCount} blocks in ${chunks.size} chunks` 
      });
      
      // Yield to browser every batch to prevent freezing
      await this.yieldToBrowser();
      
      // Memory throttling - pause if memory usage is too high
      if (await this.shouldThrottleGeneration(chunks)) {
        console.log('⚠️ Memory throttling activated - pausing generation');
        await this.waitForMemoryRelease();
      }
    }
    
    this.memoryMonitor.finishGeneration();
    
    onProgress?.({ 
      current: processedCount, 
      total: processedCount, 
      stage: 'complete',
      message: `Generation complete: ${processedCount} blocks in ${chunks.size} chunks` 
    });
    
    console.log(`🏗️ Generated world: ${processedCount} blocks in ${chunks.size} chunks`);
    console.log(`💾 Memory usage: Chunks=${this.getChunksMemoryUsage(chunks)}, Palette=${this.probabilityPalette.getMemoryUsage()}B`);
    
    return chunks;
  }
  
  // Create optimized block with minimal memory footprint
  private createOptimizedBlock(
    position: Vector3, 
    blockType: BlockType, 
    parentBlock?: OptimizedBlockData
  ): OptimizedBlockData {
    // Get or create palette ID for probability mapping
    let paletteId = this.defaultPaletteIds.get(blockType) || 0;
    let consecutiveWoodCount = 0;
    
    if (parentBlock && blockType === BlockType.WOOD && 
        this.blockTypeFromPaletteId(parentBlock.paletteId) === BlockType.WOOD) {
      consecutiveWoodCount = Math.min(255, parentBlock.consecutiveWoodCount + 1);
      
      // Create mutated mapping for tree generation
      const baseMappings = this.probabilityPalette.getMapping(parentBlock.paletteId);
      if (baseMappings) {
        const mutatedMappings = this.applyTreeGenerationLogic(baseMappings, consecutiveWoodCount);
        paletteId = this.probabilityPalette.addMapping(mutatedMappings);
      }
    } else if (parentBlock) {
      // Apply standard mutations
      const baseMappings = this.probabilityPalette.getMapping(parentBlock.paletteId);
      if (baseMappings) {
        const mutatedMappings = this.applyMutations(baseMappings);
        paletteId = this.probabilityPalette.addMapping(mutatedMappings);
      }
    }
    
    // Pack block properties into flags
    const props = BLOCK_PROPERTIES[blockType];
    let flags = 0;
    
    if (blockType !== BlockType.AIR) flags |= BlockFlags.IS_VISIBLE;
    if (props.breakable) flags |= BlockFlags.IS_BREAKABLE;
    if (props.transparent) flags |= BlockFlags.IS_TRANSPARENT;
    
    switch (props.requiredTool) {
      case 'pickaxe': flags |= BlockFlags.REQUIRES_PICKAXE; break;
      case 'spade': flags |= BlockFlags.REQUIRES_SPADE; break;
      case 'axe': flags |= BlockFlags.REQUIRES_AXE; break;
    }
    
    return {
      blockType,
      paletteId,
      consecutiveWoodCount,
      flags
    };
  }
  
  // Efficient block mutation using object pooling
  private mutateBlock(parentBlock: OptimizedBlockData): OptimizedBlockData {
    const baseMappings = this.probabilityPalette.getMapping(parentBlock.paletteId);
    if (!baseMappings) return parentBlock;
    
    const mutatedMappings = this.applyMutations(baseMappings);
    const newPaletteId = this.probabilityPalette.addMapping(mutatedMappings);
    
    return {
      ...parentBlock,
      paletteId: newPaletteId,
      consecutiveWoodCount: 0 // Reset for non-wood blocks
    };
  }
  
  // Fast mutations without deep cloning
  private applyMutations(
    baseProbabilities: Partial<BlockMetadata['probabilityMappings']>
  ): Partial<BlockMetadata['probabilityMappings']> {
    const mutated = this.shallowCloneProbabilities(baseProbabilities);
    const mutationRate = 0.01;
    
    // Apply mutations to each direction
    for (const direction of ['horizontalNeighbors', 'positiveZ', 'negativeZ'] as const) {
      const mapping = mutated[direction];
      if (!mapping) continue;
      
      // Create working copy for this direction
      const workingMapping = { ...mapping };
      
      // Apply probability transfers
      const blockTypes = Object.values(BlockType);
      for (let i = 0; i < blockTypes.length - 1; i++) {
        const fromType = blockTypes[i];
        const toType = blockTypes[(i + 1) % blockTypes.length];
        
        const transferAmount = workingMapping[fromType] * mutationRate;
        workingMapping[fromType] = Math.max(0, workingMapping[fromType] - transferAmount);
        workingMapping[toType] += transferAmount;
      }
      
      this.normalizeProbabilities(workingMapping);
      mutated[direction] = workingMapping;
    }
    
    return mutated;
  }
  
  private applyTreeGenerationLogic(
    probabilities: Partial<BlockMetadata['probabilityMappings']>,
    consecutiveCount: number
  ): Partial<BlockMetadata['probabilityMappings']> {
    const mutated = this.shallowCloneProbabilities(probabilities);
    
    if (mutated.positiveZ) {
      const workingMapping = { ...mutated.positiveZ };
      
      // Tree generation formula
      const reductionFactor = 1 / consecutiveCount;
      const baseWoodChance = workingMapping[BlockType.WOOD];
      const reducedWoodChance = baseWoodChance * reductionFactor;
      const increasedAirChance = baseWoodChance - reducedWoodChance;
      
      workingMapping[BlockType.WOOD] = reducedWoodChance;
      workingMapping[BlockType.AIR] += increasedAirChance;
      
      // Additional reduction
      const additionalReduction = Math.min(consecutiveCount * 5, 50);
      const additionalTransfer = (workingMapping[BlockType.WOOD] * additionalReduction) / 100;
      
      workingMapping[BlockType.WOOD] -= additionalTransfer;
      workingMapping[BlockType.AIR] += additionalTransfer;
      
      this.normalizeProbabilities(workingMapping);
      mutated.positiveZ = workingMapping;
    }
    
    return mutated;
  }
  
  private selectBlockType(parentBlock: OptimizedBlockData, newPosition: Vector3, parentPosition: Vector3): BlockType {
    const mappings = this.probabilityPalette.getMapping(parentBlock.paletteId);
    if (!mappings) return BlockType.AIR;
    
    const direction = this.getDirection(parentPosition, newPosition);
    let probabilityMapping: ProbabilityMapping;
    
    switch (direction) {
      case 'up':
        probabilityMapping = mappings.positiveZ || this.getDefaultMapping();
        break;
      case 'down':
        probabilityMapping = mappings.negativeZ || this.getDefaultMapping();
        break;
      default:
        probabilityMapping = mappings.horizontalNeighbors || this.getDefaultMapping();
    }
    
    return this.selectRandomBlockType(probabilityMapping);
  }
  
  private selectRandomBlockType(probabilityMapping: ProbabilityMapping): BlockType {
    const random = Math.random() * 100;
    let cumulative = 0;
    
    for (const [blockType, probability] of Object.entries(probabilityMapping)) {
      cumulative += probability;
      if (random <= cumulative) {
        return blockType as BlockType;
      }
    }
    
    return BlockType.AIR;
  }
  
  private getOrCreateChunk(chunks: Map<string, CompressedChunk>, worldPosition: Vector3): CompressedChunk {
    const { chunkX, chunkY, chunkZ } = this.worldToChunk(worldPosition);
    const key = `${chunkX},${chunkY},${chunkZ}`;
    
    let chunk = chunks.get(key);
    if (!chunk) {
      chunk = new CompressedChunk(chunkX, chunkY, chunkZ);
      chunks.set(key, chunk);
    }
    
    return chunk;
  }
  
  private worldToChunk(worldPosition: Vector3): { chunkX: number; chunkY: number; chunkZ: number } {
    const chunkSize = 16;
    return {
      chunkX: Math.floor(worldPosition.x / chunkSize),
      chunkY: Math.floor(worldPosition.y / chunkSize),
      chunkZ: Math.floor(worldPosition.z / chunkSize)
    };
  }
  
  private worldToLocal(worldPosition: Vector3): { localX: number; localY: number; localZ: number } {
    const chunkSize = 16;
    return {
      localX: ((worldPosition.x % chunkSize) + chunkSize) % chunkSize,
      localY: ((worldPosition.y % chunkSize) + chunkSize) % chunkSize,
      localZ: ((worldPosition.z % chunkSize) + chunkSize) % chunkSize
    };
  }
  
  // Convert back to legacy Block objects for compatibility
  public convertToLegacyBlocks(chunks: Map<string, CompressedChunk>): Map<string, Block> {
    const legacyBlocks = new Map<string, Block>();
    
    for (const [chunkKey, chunk] of chunks) {
      for (let x = 0; x < 16; x++) {
        for (let y = 0; y < 16; y++) {
          for (let z = 0; z < 16; z++) {
            const optimizedBlock = chunk.getBlock(x, y, z);
            if (!optimizedBlock || optimizedBlock.blockType === BlockType.AIR) continue;
            
            const worldX = chunk.chunkX * 16 + x;
            const worldY = chunk.chunkY * 16 + y;
            const worldZ = chunk.chunkZ * 16 + z;
            
            const mappings = this.probabilityPalette.getMapping(optimizedBlock.paletteId);
            const metadata = this.createBlockMetadata(optimizedBlock, mappings);
            
            const legacyBlock: Block = {
              id: this.generateBlockId(),
              position: { x: worldX, y: worldY, z: worldZ },
              metadata,
              isVisible: (optimizedBlock.flags & BlockFlags.IS_VISIBLE) !== 0
            };
            
            legacyBlocks.set(`${worldX},${worldY},${worldZ}`, legacyBlock);
          }
        }
      }
    }
    
    return legacyBlocks;
  }
  
  private createBlockMetadata(optimizedBlock: OptimizedBlockData, mappings?: Partial<BlockMetadata['probabilityMappings']>): BlockMetadata {
    const baseProperties = BLOCK_PROPERTIES[optimizedBlock.blockType];
    
    return {
      blockType: optimizedBlock.blockType,
      probabilityMappings: {
        horizontalNeighbors: mappings?.horizontalNeighbors || this.getDefaultMapping(),
        positiveZ: mappings?.positiveZ || this.getDefaultMapping(),
        negativeZ: mappings?.negativeZ || this.getDefaultMapping()
      },
      consecutiveWoodCount: optimizedBlock.consecutiveWoodCount,
      breakable: (optimizedBlock.flags & BlockFlags.IS_BREAKABLE) !== 0,
      requiredTool: this.getRequiredToolFromFlags(optimizedBlock.flags),
      hardness: baseProperties.hardness || 0,
      transparent: (optimizedBlock.flags & BlockFlags.IS_TRANSPARENT) !== 0
    };
  }
  
  // Utility methods
  private getDirection(from: Vector3, to: Vector3): 'up' | 'down' | 'horizontal' {
    if (to.z > from.z) return 'up';
    if (to.z < from.z) return 'down';
    return 'horizontal';
  }
  
  private getNeighborPositions(position: Vector3): Vector3[] {
    return [
      { x: position.x + 1, y: position.y, z: position.z },
      { x: position.x - 1, y: position.y, z: position.z },
      { x: position.x, y: position.y + 1, z: position.z },
      { x: position.x, y: position.y - 1, z: position.z },
      { x: position.x, y: position.y, z: position.z + 1 },
      { x: position.x, y: position.y, z: position.z - 1 }
    ];
  }
  
  private calculateDistance(pos1: Vector3, pos2: Vector3): number {
    return Math.sqrt(
      Math.pow(pos1.x - pos2.x, 2) +
      Math.pow(pos1.y - pos2.y, 2) +
      Math.pow(pos1.z - pos2.z, 2)
    );
  }
  
  private getBlockKey(position: Vector3): string {
    return `${position.x},${position.y},${position.z}`;
  }
  
  private generateBlockId(): string {
    return 'block_' + Math.random().toString(36).substr(2, 9);
  }
  
  private getDefaultMapping(): ProbabilityMapping {
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
  
  private normalizeProbabilities(mapping: ProbabilityMapping): void {
    const total = Object.values(mapping).reduce((sum, val) => sum + val, 0);
    if (total > 0) {
      for (const key in mapping) {
        mapping[key as BlockType] = (mapping[key as BlockType] / total) * 100;
      }
    }
  }
  
  private shallowCloneProbabilities(probabilities: Partial<BlockMetadata['probabilityMappings']>): Partial<BlockMetadata['probabilityMappings']> {
    return {
      horizontalNeighbors: probabilities.horizontalNeighbors ? { ...probabilities.horizontalNeighbors } : undefined,
      positiveZ: probabilities.positiveZ ? { ...probabilities.positiveZ } : undefined,
      negativeZ: probabilities.negativeZ ? { ...probabilities.negativeZ } : undefined
    };
  }
  
  private blockTypeFromPaletteId(paletteId: number): BlockType {
    const mappings = this.probabilityPalette.getMapping(paletteId);
    // This is a simplified lookup - in practice you'd need a more sophisticated mapping
    return BlockType.AIR; // Fallback
  }
  
  private getRequiredToolFromFlags(flags: number): any {
    if (flags & BlockFlags.REQUIRES_PICKAXE) return 'pickaxe';
    if (flags & BlockFlags.REQUIRES_SPADE) return 'spade';
    if (flags & BlockFlags.REQUIRES_AXE) return 'axe';
    return undefined;
  }
  
  private getChunksMemoryUsage(chunks: Map<string, CompressedChunk>): string {
    let totalBytes = 0;
    for (const chunk of chunks.values()) {
      totalBytes += chunk.getMemoryUsage();
    }
    return `${Math.round(totalBytes / 1024 / 1024 * 100) / 100} MB`;
  }
  
  private async yieldToBrowser(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 0));
  }
  
  private async shouldThrottleGeneration(chunks: Map<string, CompressedChunk>): Promise<boolean> {
    // Check memory usage and throttle if necessary
    if ('memory' in performance) {
      const memory = (performance as any).memory;
      const heapUsed = memory.usedJSHeapSize;
      const heapLimit = memory.jsHeapSizeLimit;
      
      return (heapUsed / heapLimit) > 0.8; // Throttle if using >80% of heap
    }
    
    return false;
  }
  
  private async waitForMemoryRelease(): Promise<void> {
    // Force garbage collection if available and wait
    if ('gc' in window) {
      (window as any).gc();
    }
    
    return new Promise(resolve => setTimeout(resolve, 100));
  }
  
  public abortGeneration(): void {
    this.generationAborted = true;
  }
  
  public getMemoryStats(): { 
    palette: number; 
    monitor: ReturnType<typeof MemoryMonitor.prototype.getMemoryEstimate>
  } {
    return {
      palette: this.probabilityPalette.getMemoryUsage(),
      monitor: this.memoryMonitor.getMemoryEstimate()
    };
  }
}