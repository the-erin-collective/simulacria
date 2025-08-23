import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { Observable, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { setGameMode } from '../../store/ui/ui.actions';
import * as UIActions from '../../store/ui/ui.actions';
import { SettingsModalComponent } from '../settings/settings-modal.component';
import { LoadingOverlayComponent } from '../ui/loading-overlay.component';
import { GameSettings } from '../../shared/models/game.model';
import { DBService } from '../../core/services/db.service';
import { WorldService, WorldInfo } from '../../core/services/world.service';
import * as UISelectors from '../../store/ui/ui.selectors';

@Component({
  selector: 'app-menu',
  standalone: true,
  imports: [CommonModule, SettingsModalComponent, LoadingOverlayComponent],
  templateUrl: './menu.component.html',
  styleUrls: ['./menu.component.scss']
})
export class MenuComponent implements OnInit, OnDestroy {
  showSettings = false;
  showAboutModal = false;
  showLoadWorldModal = false;
  availableWorlds: WorldInfo[] = [];
  selectedWorldId: string | null = null;
  
  // Loading state observables
  isLoading$: Observable<boolean>;
  loadingMessage$: Observable<string | null>;
  loadingDetails$: Observable<string | null>;
  loadingProgress$: Observable<number>;
  showLoadingProgress$: Observable<boolean>;
  loadingCancellable$: Observable<boolean>;
  
  private destroy$ = new Subject<void>();
  
  constructor(
    private router: Router,
    private store: Store,
    private dbService: DBService,
    private worldService: WorldService
  ) {
    // Initialize loading observables
    this.isLoading$ = this.store.select(UISelectors.selectIsLoading);
    this.loadingMessage$ = this.store.select(UISelectors.selectLoadingMessage);
    this.loadingDetails$ = this.store.select(UISelectors.selectLoadingDetails);
    this.loadingProgress$ = this.store.select(UISelectors.selectLoadingProgress);
    this.showLoadingProgress$ = this.store.select(UISelectors.selectShowLoadingProgress);
    this.loadingCancellable$ = this.store.select(UISelectors.selectLoadingCancellable);
  }
  
  ngOnInit(): void {
    // Component initialization
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  startNewWorld(): void {
    console.log('🔵 startNewWorld() called');
    
    // Clear any previous loading states
    this.store.dispatch(UIActions.stopLoading());
    
    this.worldService.createNewWorld()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (newWorld) => {
          console.log('🔵 New world created successfully:', newWorld);
          
          // Set game mode first, then navigate
          console.log('🔵 Dispatching setGameMode playing');
          this.store.dispatch(setGameMode({ mode: 'playing' }));
          
          // Wait a moment for the store to update, then navigate
          setTimeout(() => {
            console.log('🔵 About to navigate to /game');
            this.router.navigate(['/game']).then((navigationSuccess) => {
              if (navigationSuccess) {
                console.log('🔵 Navigation to game completed successfully');
              } else {
                console.error('🔴 Navigation to game failed - router returned false');
              }
              // Ensure loading state is cleared after navigation attempt
              setTimeout(() => {
                this.store.dispatch(UIActions.stopLoading());
              }, 100);
            }).catch((error) => {
              console.error('🔴 Navigation to game failed with error:', error);
              this.store.dispatch(UIActions.stopLoading());
            });
          }, 50);
        },
        error: (error) => {
          console.error('🔴 Failed to create new world:', error);
          
          // Stop loading and show error message
          this.store.dispatch(UIActions.stopLoading());
          
          // Show user-friendly error message
          const errorMessage = this.getErrorMessage(error);
          alert(`Failed to create new world: ${errorMessage}\n\nPlease try refreshing the page or check if your browser supports local storage.`);
        }
      });
  }
  
  private getErrorMessage(error: any): string {
    if (error?.message?.includes('timeout')) {
      return 'Operation timed out. This may be due to browser storage issues.';
    }
    if (error?.message?.includes('IndexedDB not supported')) {
      return 'Your browser does not support local storage features required for this game.';
    }
    if (error?.message?.includes('Database')) {
      return 'Local storage system is not working properly.';
    }
    return error?.message || 'Unknown error occurred';
  }

  openSettings(): void {
    console.log('Settings button clicked! Opening settings modal');
    this.showSettings = true;
    console.log('showSettings set to:', this.showSettings);
  }

  showAbout(): void {
    console.log('About button clicked! Opening about modal');
    this.showAboutModal = true;
    console.log('showAboutModal set to:', this.showAboutModal);
  }
  
  closeSettings(): void {
    console.log('Menu closeSettings() called');
    this.showSettings = false;
    console.log('showSettings set to:', this.showSettings);
  }
  
  closeAbout(): void {
    this.showAboutModal = false;
  }
  
  onSettingsSaved(settings: GameSettings): void {
    // Settings are handled by the settings modal component
    console.log('Settings saved:', settings);
  }
  
  onReturnToMainMenu(): void {
    // This method is called when user clicks "Return to Menu" from settings in menu
    // Since we're already in the menu, just close the settings modal
    console.log('Return to main menu requested from settings');
    this.closeSettings();
  }
  
  loadWorld(): void {
    console.log('Load World button clicked! Opening load world modal');
    this.showLoadWorldModal = true;
    console.log('showLoadWorldModal set to:', this.showLoadWorldModal);
    this.loadAvailableWorlds();
  }
  
  closeLoadWorld(): void {
    this.showLoadWorldModal = false;
    this.selectedWorldId = null;
  }
  
  async loadAvailableWorlds(): Promise<void> {
    try {
      this.availableWorlds = []; // Clear existing worlds
      
      const worldsSubscription = this.worldService.loadAvailableWorlds()
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (worlds) => {
            this.availableWorlds = worlds;
            console.log('Available worlds loaded:', this.availableWorlds);
            worldsSubscription.unsubscribe(); // Clean up subscription
          },
          error: (error) => {
            console.error('Failed to load available worlds:', error);
            this.availableWorlds = [];
            worldsSubscription.unsubscribe(); // Clean up subscription
            // Don't show error to user, just display "no worlds found"
          }
        });
      
      // Add a local timeout as additional protection
      setTimeout(() => {
        if (this.availableWorlds.length === 0) {
          console.warn('World loading timed out, showing empty state');
          worldsSubscription.unsubscribe();
        }
      }, 6000); // 6 second fallback timeout
      
    } catch (error) {
      console.error('Failed to initialize world loading:', error);
      this.availableWorlds = [];
    }
  }
  
  selectWorld(world: WorldInfo): void {
    this.selectedWorldId = world.id;
    console.log('Selected world:', world);
  }
  
  async loadSelectedWorld(world: WorldInfo): Promise<void> {
    this.selectedWorldId = world.id;
    console.log('🔵 loadSelectedWorld() called for world:', world.name);
    
    this.worldService.loadWorld(world.id, world.name)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (loadedWorld) => {
          console.log('🔵 World loaded successfully:', loadedWorld);
          
          // Update last played time
          world.lastPlayed = Date.now();
          
          // Set game mode first, then navigate
          console.log('🔵 Dispatching setGameMode playing for loaded world');
          this.store.dispatch(setGameMode({ mode: 'playing' }));
          
          // Wait a moment for the store to update, then navigate
          setTimeout(() => {
            console.log('🔵 About to navigate to /game for loaded world');
            this.router.navigate(['/game']).then((navigationSuccess) => {
              if (navigationSuccess) {
                console.log('🔵 Navigation to game completed successfully for loaded world');
                // Close modal
                this.showLoadWorldModal = false;
              } else {
                console.error('🔴 Navigation to game failed - router returned false');
              }
              // Ensure loading state is cleared after navigation attempt
              setTimeout(() => {
                this.store.dispatch(UIActions.stopLoading());
              }, 100);
            }).catch((error) => {
              console.error('🔴 Navigation to game failed with error:', error);
              this.store.dispatch(UIActions.stopLoading());
            });
          }, 50);
        },
        error: (error) => {
          console.error('🔴 Failed to load world:', error);
          this.selectedWorldId = null;
          
          // Stop loading and show error message
          this.store.dispatch(UIActions.stopLoading());
          
          // Show user-friendly error message
          const errorMessage = this.getErrorMessage(error);
          alert(`Failed to load world "${world.name}": ${errorMessage}\n\nPlease try refreshing the page or check if your browser supports local storage.`);
        }
      });
  }
  
  async deleteWorld(world: WorldInfo): Promise<void> {
    const confirmDelete = confirm(`Are you sure you want to delete "${world.name || 'Unnamed World'}"? This action cannot be undone.`);
    if (!confirmDelete) return;
    
    this.worldService.deleteWorld(world.id, world.name)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          console.log('World deleted successfully');
          
          // Remove from available worlds list
          this.availableWorlds = this.availableWorlds.filter(w => w.id !== world.id);
          
          // Clear selection if this world was selected
          if (this.selectedWorldId === world.id) {
            this.selectedWorldId = null;
          }
        },
        error: (error) => {
          console.error('Failed to delete world:', error);
        }
      });
  }
  
  formatDate(timestamp: number): string {
    const date = new Date(timestamp);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  }
}
