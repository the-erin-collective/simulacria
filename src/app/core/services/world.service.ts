import { Injectable } from '@angular/core';
import { Store } from '@ngrx/store';
import { Observable, of, delay, throwError } from 'rxjs';
import { map, catchError, tap } from 'rxjs/operators';
import { DBService } from './db.service';
import * as WorldActions from '../../store/world/world.actions';
import * as UIActions from '../../store/ui/ui.actions';

export interface WorldInfo {
  id: string;
  name: string;
  created: number;
  lastPlayed: number;
  size?: number;
  settings?: any;
}

@Injectable({
  providedIn: 'root'
})
export class WorldService {
  constructor(
    private store: Store,
    private dbService: DBService
  ) {}

  /**
   * Load available worlds from storage
   */
  loadAvailableWorlds(): Observable<WorldInfo[]> {
    this.store.dispatch(UIActions.startLoading({
      operation: 'loadWorlds',
      message: 'Loading available worlds...',
      showProgress: false
    }));

    // Simulate loading with actual database call
    return of([
      {
        id: '1',
        name: 'My First World',
        created: Date.now() - 86400000, // 1 day ago
        lastPlayed: Date.now() - 3600000 // 1 hour ago
      },
      {
        id: '2',
        name: 'Adventure World',
        created: Date.now() - 172800000, // 2 days ago
        lastPlayed: Date.now() - 7200000 // 2 hours ago
      },
      {
        id: '3',
        name: 'Creative Build',
        created: Date.now() - 259200000, // 3 days ago
        lastPlayed: Date.now() - 86400000 // 1 day ago
      }
    ]).pipe(
      delay(800), // Simulate network delay
      tap(() => this.store.dispatch(UIActions.stopLoading())),
      catchError((error) => {
        this.store.dispatch(UIActions.setLoadingError({ error: 'Failed to load worlds' }));
        return throwError(error);
      })
    );
  }

  /**
   * Load a specific world
   */
  loadWorld(worldId: string, worldName: string): Observable<any> {
    this.store.dispatch(UIActions.startLoading({
      operation: 'loadWorld',
      message: `Loading "${worldName}"...`,
      details: 'Initializing world data...',
      showProgress: true
    }));

    // Simulate multi-step loading process
    return this.simulateWorldLoading(worldId, worldName);
  }

  /**
   * Create a new world
   */
  createNewWorld(worldName?: string, settings?: any): Observable<WorldInfo> {
    const finalWorldName = worldName || `New World ${Date.now()}`;
    
    this.store.dispatch(UIActions.startLoading({
      operation: 'createWorld',
      message: `Creating "${finalWorldName}"...`,
      details: 'Generating terrain...',
      showProgress: true
    }));

    return this.simulateWorldCreation(finalWorldName, settings);
  }

  /**
   * Delete a world
   */
  deleteWorld(worldId: string, worldName: string): Observable<void> {
    this.store.dispatch(UIActions.startLoading({
      operation: 'deleteWorld',
      message: `Deleting "${worldName}"...`,
      details: 'Removing world data...',
      showProgress: false
    }));

    return of(null).pipe(
      delay(1000), // Simulate deletion time
      tap(() => {
        this.store.dispatch(WorldActions.worldDeleted({ worldId }));
        this.store.dispatch(UIActions.stopLoading());
      }),
      map(() => void 0),
      catchError((error) => {
        this.store.dispatch(UIActions.setLoadingError({ error: 'Failed to delete world' }));
        return throwError(error);
      })
    );
  }

  private simulateWorldLoading(worldId: string, worldName: string): Observable<any> {
    let progress = 0;
    const steps = [
      { progress: 20, details: 'Loading world metadata...' },
      { progress: 40, details: 'Loading terrain data...' },
      { progress: 60, details: 'Loading player data...' },
      { progress: 80, details: 'Initializing game world...' },
      { progress: 100, details: 'World loaded successfully!' }
    ];

    return new Observable(observer => {
      let currentStep = 0;
      
      const processStep = () => {
        if (currentStep >= steps.length) {
          // World loading complete
          setTimeout(() => {
            this.store.dispatch(WorldActions.worldLoaded({
              worldData: { id: worldId, name: worldName, blocks: new Map() },
              worldId
            }));
            // Don't stop loading here - let game component handle the transition
            // this.store.dispatch(UIActions.stopLoading());
            observer.next({ worldId, worldName });
            observer.complete();
          }, 300);
          return;
        }

        const step = steps[currentStep];
        this.store.dispatch(UIActions.updateLoadingProgress({
          progress: step.progress,
          details: step.details
        }));

        currentStep++;
        setTimeout(processStep, 600); // 600ms between steps
      };

      processStep();
    });
  }

  private simulateWorldCreation(worldName: string, settings?: any): Observable<WorldInfo> {
    const worldId = `world_${Date.now()}`;
    let progress = 0;
    
    const steps = [
      { progress: 10, details: 'Initializing world parameters...' },
      { progress: 25, details: 'Generating terrain heightmap...' },
      { progress: 45, details: 'Placing biomes and structures...' },
      { progress: 65, details: 'Generating caves and ores...' },
      { progress: 80, details: 'Setting spawn point...' },
      { progress: 95, details: 'Saving world data...' },
      { progress: 100, details: 'World created successfully!' }
    ];

    return new Observable(observer => {
      let currentStep = 0;
      
      const processStep = () => {
        if (currentStep >= steps.length) {
          // World creation complete
          setTimeout(() => {
            const newWorld: WorldInfo = {
              id: worldId,
              name: worldName,
              created: Date.now(),
              lastPlayed: Date.now(),
              settings
            };
            
            this.store.dispatch(WorldActions.newWorldCreated({
              worldId: worldId,
              worldName: worldName
            }));
            // Don't stop loading here - let game component handle the transition
            // this.store.dispatch(UIActions.stopLoading());
            observer.next(newWorld);
            observer.complete();
          }, 300);
          return;
        }

        const step = steps[currentStep];
        this.store.dispatch(UIActions.updateLoadingProgress({
          progress: step.progress,
          details: step.details
        }));

        currentStep++;
        setTimeout(processStep, 700); // 700ms between steps for world creation
      };

      processStep();
    });
  }
}
