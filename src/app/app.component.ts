import { Component, OnInit, signal, ChangeDetectorRef } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CommonModule, Location } from '@angular/common';
import { DatabaseSplashComponent } from './shared/components/database-splash/database-splash.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, CommonModule, DatabaseSplashComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit {
  title = 'minecraft-game';
  
  // Use signals for better compatibility with zoneless change detection
  isDatabaseReady = signal(false);
  initializationFailed = signal(false);
  
  constructor(private location: Location, private cdr: ChangeDetectorRef) {}
  
  ngOnInit() {
    console.log('🚀 AppComponent initialized - Starting Minecraft Clone with database initialization...');
  }
  
  onDatabaseInitialized(success: boolean) {
    console.log(`📞 AppComponent received database initialization result: ${success}`);
    
    if (success) {
      console.log('✅ Database initialized successfully - showing main app');
      this.isDatabaseReady.set(true);
      this.initializationFailed.set(false);
    } else {
      console.error('❌ Database initialization failed');
      this.isDatabaseReady.set(false);
      this.initializationFailed.set(true);
    }
    
    // Force change detection in zoneless mode
    this.cdr.detectChanges();
  }
  
  reloadPage() {
    console.log('🔄 Reloading page...');
    this.location.go('/');
    window.location.reload();
  }
}
