import Phaser from 'phaser';
import { setRenderZoom } from './art/felt';
import { onContentChange } from './content/store';
import { isMuted, toggleMute } from './game/sfx';
import { HEIGHT, WIDTH, ui } from './game/state';
import { BootScene } from './scenes/BootScene';
import { CourseScene } from './scenes/CourseScene';
import { OverworldScene } from './scenes/OverworldScene';
import { TitleScene } from './scenes/TitleScene';
import { WorldScene } from './scenes/WorldScene';
import { initDevMode } from './ui/devmode';
import { isMobile, showMobileGate } from './ui/mobile';
import { isTyping } from './ui/typing';
import { showQuickView } from './ui/overlays';

async function start() {
  if (isMobile()) return showMobileGate();

  // Pixel fonts must be ready before the first scene draws text.
  await Promise.race([
    Promise.all([document.fonts.load('8px "Press Start 2P"'), document.fonts.load('30px "Luckiest Guy"'), document.fonts.load('600 8px "Fredoka"')]),
    new Promise((r) => setTimeout(r, 2500)),
  ]);

  // Felt scenes draw at the display's real resolution: enough screen pixels per
  // game pixel for the largest the TV screen gets on this display (see #stage in
  // style.css), between the art's 4x and 8x.
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const tallest = Math.min(window.screen.height - 92, ((window.screen.width - 48) * HEIGHT) / WIDTH);
  setRenderZoom(Phaser.Math.Clamp(Math.ceil((tallest * dpr) / HEIGHT), 4, 8));

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width: WIDTH,
    height: HEIGHT,
    pixelArt: true,
    roundPixels: true,
    backgroundColor: '#000000',
    // ?timer runs the loop on setTimeout, for headless/background testing.
    fps: { forceSetTimeOut: new URLSearchParams(location.search).has('timer'), target: 60 },
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.NO_CENTER },
    physics: { default: 'arcade', arcade: { gravity: { x: 0, y: 1000 }, debug: false } },
    scene: [BootScene, TitleScene, OverworldScene, WorldScene, CourseScene],
  });

  game.sound.mute = isMuted();
  if (import.meta.env.DEV) import('./devtools').then((m) => m.installDevtools(game));

  // Overlays size their pixel font off the real screen width.
  const screen = document.getElementById('screen')!;
  const sync = () => document.documentElement.style.setProperty('--px', `${screen.clientWidth / WIDTH}px`);
  new ResizeObserver(sync).observe(screen);
  sync();

  // Typing in dev-panel fields shouldn't move the player.
  document.addEventListener('focusin', (e) => {
    const t = e.target as HTMLElement;
    if (isTyping(t)) game.input.keyboard!.enabled = false;
  });
  document.addEventListener('focusout', () => (game.input.keyboard!.enabled = true));

  window.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement;
    if (isTyping(t) || ui.blocking) return;
    if (e.key === 'm' || e.key === 'M') game.sound.mute = toggleMute();
  });

  document.getElementById('qv-btn')!.addEventListener('click', () => showQuickView());

  // Live rebuild: edits in dev mode restart whichever scene shows that content.
  let pending = 0;
  onContentChange((scope) => {
    window.clearTimeout(pending);
    pending = window.setTimeout(() => {
      const world = game.scene.getScene('World') as WorldScene;
      if (game.scene.isActive('Course')) {
        const course = game.scene.getScene('Course') as CourseScene;
        if (scope === 'site' || scope === course.slug) course.scene.restart(course.restartData);
      } else if (game.scene.isActive('World')) {
        if (scope === 'site' || scope === world.slug) world.scene.restart({ slug: world.slug, x: world.playerX });
      } else if (game.scene.isActive('Overworld')) game.scene.getScene('Overworld').scene.restart();
      else if (game.scene.isActive('Title') && scope === 'site') game.scene.getScene('Title').scene.restart();
    }, 250);
  });

  initDevMode(game);
}

void start();
