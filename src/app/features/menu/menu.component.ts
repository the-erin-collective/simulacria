import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { setGameMode } from '../../store/ui/ui.actions';
import { SettingsModalComponent } from '../settings/settings-modal.component';
import { GameSettings } from '../../shared/models/game.model';
import { DBService } from '../../core/services/db.service';

@Component({
  selector: 'app-menu',
  standalone: true,
  imports: [CommonModule, SettingsModalComponent],
  templateUrl: './menu.component.html',
  styleUrls: ['./menu.component.scss']
})
export class MenuComponent implements OnInit {
  showSettingsModal = false;
  showAboutModal = false;
  showLoadWorldModal = false;
  availableWorlds: any[] = [];
  selectedWorldId: string | null = null;
  loading = false;
  
  constructor(
    private router: Router,
    private store: Store,
    private dbService: DBService
  ) {}
  
  ngOnInit(): void {
    // Component initialization
  }

  startNewWorld(): void {
    this.store.dispatch(setGameMode({ mode: 'playing' }));
    this.router.navigate(['/game']);
  }

  showSettings(): void {
    console.log('Settings button clicked! Opening settings modal');
    this.showSettingsModal = true;
    console.log('showSettingsModal set to:', this.showSettingsModal);
  }

  showAbout(): void {
    console.log('About button clicked! Opening about modal');
    this.showAboutModal = true;
    console.log('showAboutModal set to:', this.showAboutModal);
  }
  
  closeSettings(): void {
    this.showSettingsModal = false;
  }
  
  closeAbout(): void {
    this.showAboutModal = false;
  }
  
  onSettingsSaved(settings: GameSettings): void {
    // Settings are handled by the settings modal component
    console.log('Settings saved:', settings);
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
    this.loading = true;
    try {
      // For now, we'll simulate available worlds
      // In a real implementation, this would query the database
      this.availableWorlds = [
        {
          id: '1',
          name: 'My First World',
          created: Date.now() - 86400000, // 1 day ago
          lastPlayed: Date.now() - 3600000 // 1 hour ago
        }
      ];
      
      console.log('Available worlds loaded:', this.availableWorlds);
    } catch (error) {
      console.error('Failed to load available worlds:', error);
      this.availableWorlds = [];
    } finally {
      this.loading = false;
    }
  }
  
  selectWorld(world: any): void {
    this.selectedWorldId = world.id;
    console.log('Selected world:', world);
  }
  
  async loadSelectedWorld(world: any): Promise<void> {
    if (this.loading) return;
    
    this.loading = true;
    this.selectedWorldId = world.id;
    
    try {
      console.log('Loading world:', world);
      
      // Update last played time
      world.lastPlayed = Date.now();
      
      // Navigate to game
      this.store.dispatch(setGameMode({ mode: 'playing' }));
      await this.router.navigate(['/game']);
      
      // Close modal
      this.showLoadWorldModal = false;
    } catch (error) {
      console.error('Failed to load world:', error);
    } finally {
      this.loading = false;
    }
  }
  
  async deleteWorld(world: any): Promise<void> {
    if (this.loading) return;
    
    const confirmDelete = confirm(`Are you sure you want to delete "${world.name || 'Unnamed World'}"? This action cannot be undone.`);
    if (!confirmDelete) return;
    
    this.loading = true;
    
    try {
      console.log('Deleting world:', world);
      
      // Remove from available worlds list
      this.availableWorlds = this.availableWorlds.filter(w => w.id !== world.id);
      
      // Clear selection if this world was selected
      if (this.selectedWorldId === world.id) {
        this.selectedWorldId = null;
      }
      
      console.log('World deleted successfully');
    } catch (error) {
      console.error('Failed to delete world:', error);
    } finally {
      this.loading = false;
    }
  }
  
  formatDate(timestamp: number): string {
    const date = new Date(timestamp);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  }
}
