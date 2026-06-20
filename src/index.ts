import {
  World, PanelUI, Follower,
  Mesh, PlaneGeometry, MeshBasicMaterial,
} from '@iwsdk/core';
import { GameSystem } from './game-system';
import { UISystem } from './ui-system';

async function main() {
  const container = document.getElementById('app') as HTMLDivElement;
  if (!container) throw new Error('No #app element');

  const world = await World.create(container, {
    xr: { offer: 'once' },
    browserControls: true,
  } as Parameters<typeof World.create>[1]);

  // World-space panels (menu screens, gameover, pause, toolbar, countdown, tutorial, modestats)
  const worldPanelNames = [
    'title', 'modeselect', 'leaderboard', 'achvlist', 'stats',
    'skins', 'settings', 'help', 'gameover', 'pause', 'countdown', 'toolbar',
    'tutorial', 'modestats',
  ];
  for (const name of worldPanelNames) {
    const mesh = new Mesh(
      new PlaneGeometry(0.001, 0.001),
      new MeshBasicMaterial({ visible: false }),
    );
    mesh.position.set(0, 100, 0);
    world.scene.add(mesh);
    const e = world.createTransformEntity(mesh);
    e.addComponent(PanelUI, { config: `./ui/${name}.json` });
  }

  // Head-following panels (HUD, toast)
  const followerNames = ['hud', 'toast'];
  for (const name of followerNames) {
    const mesh = new Mesh(
      new PlaneGeometry(0.001, 0.001),
      new MeshBasicMaterial({ visible: false }),
    );
    mesh.position.set(0, 100, 0);
    world.scene.add(mesh);
    const e = world.createTransformEntity(mesh);
    e.addComponent(PanelUI, { config: `./ui/${name}.json` });
    e.addComponent(Follower, { target: world.player.head });
    const offset = e.getVectorView(Follower, 'offsetPosition');
    offset[0] = 0; offset[1] = 100; offset[2] = 0; // Start hidden
  }

  // Register game systems
  world.registerSystem(GameSystem);
  world.registerSystem(UISystem);
}

main().catch(console.error);
