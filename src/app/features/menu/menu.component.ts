import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { setGameMode } from '../../store/ui/ui.actions';

@Component({
  selector: 'app-menu',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './menu.component.html',
  styleUrls: ['./menu.component.scss']
})
export class MenuComponent {
  
  constructor(
    private router: Router,
    private store: Store
  ) {}

  startNewWorld(): void {
    this.store.dispatch(setGameMode({ mode: 'playing' }));
    this.router.navigate(['/game']);
  }

  showSettings(): void {
    // TODO: Implement settings
    console.log('Settings clicked');
  }

  showAbout(): void {
    // TODO: Implement about
    console.log('About clicked');
  }
}
