import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./features/menu/menu.component').then(m => m.MenuComponent)
  },
  {
    path: 'game',
    loadComponent: () => import('./features/game/game.component').then(m => m.GameComponent)
  },
  {
    path: '**',
    redirectTo: ''
  }
];
