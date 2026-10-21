import Phaser from 'phaser';
import { sfx } from './sfx';
import { ui } from './state';

const WALK = 85;
const RUN = 140;
const ACCEL = 520;
const DECEL = 640;
const JUMP = 330;
const RUN_JUMP = 365;
const JUMP_CUT = 120;

export interface Controls {
  left: Phaser.Input.Keyboard.Key[];
  right: Phaser.Input.Keyboard.Key[];
  down: Phaser.Input.Keyboard.Key[];
  jump: Phaser.Input.Keyboard.Key[];
  run: Phaser.Input.Keyboard.Key[];
}

export function createControls(scene: Phaser.Scene): Controls {
  const k = scene.input.keyboard!;
  const K = Phaser.Input.Keyboard.KeyCodes;
  const keys = (...codes: number[]) => codes.map((c) => k.addKey(c, false));
  return {
    left: keys(K.LEFT, K.A),
    right: keys(K.RIGHT, K.D),
    down: keys(K.DOWN, K.S),
    jump: keys(K.SPACE, K.Z, K.UP, K.W),
    run: keys(K.SHIFT, K.X),
  };
}

export const held = (keys: Phaser.Input.Keyboard.Key[]) => !ui.blocking && keys.some((k) => k.isDown);
export const pressed = (keys: Phaser.Input.Keyboard.Key[]) =>
  !ui.blocking && keys.some((k) => Phaser.Input.Keyboard.JustDown(k));

export class Player extends Phaser.Physics.Arcade.Sprite {
  declare body: Phaser.Physics.Arcade.Body;
  private controls: Controls;
  private hurtUntil = 0;
  /** Set when the player presses down while standing; read by the scene for pipes. */
  downPressed = false;

  constructor(scene: Phaser.Scene, x: number, y: number, controls: Controls) {
    super(scene, x, y, 'player-0');
    this.controls = controls;
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.body.setSize(10, 15).setOffset(3, 1);
    this.body.setMaxVelocity(RUN, 600);
    this.setDepth(10);
  }

  get hurting() {
    return this.scene.time.now < this.hurtUntil;
  }

  hurt(fromX: number) {
    if (this.hurting) return;
    sfx.hurt();
    this.hurtUntil = this.scene.time.now + 1200;
    this.setVelocity(this.x < fromX ? -160 : 160, -200);
    this.scene.tweens.add({ targets: this, alpha: 0.3, yoyo: true, repeat: 7, duration: 75, onComplete: () => this.setAlpha(1) });
  }

  bounce() {
    this.setVelocityY(held(this.controls.jump) ? -320 : -200);
  }

  update() {
    const c = this.controls;
    const b = this.body;
    const onGround = b.blocked.down || b.touching.down;
    const running = held(c.run);
    const max = running ? RUN : WALK;
    const dir = (held(c.right) ? 1 : 0) - (held(c.left) ? 1 : 0);

    if (this.hurting && !onGround) {
      // keep knockback momentum
    } else if (dir !== 0) {
      const turning = Math.sign(b.velocity.x) === -dir;
      b.setAccelerationX(dir * (turning ? ACCEL * 2 : ACCEL));
      if (Math.abs(b.velocity.x) > max) b.velocity.x = Math.sign(b.velocity.x) * max;
      this.setFlipX(dir < 0);
    } else {
      b.setAccelerationX(0);
      const v = b.velocity.x;
      const step = (DECEL * this.scene.game.loop.delta) / 1000;
      b.velocity.x = Math.abs(v) <= step ? 0 : v - Math.sign(v) * step;
    }

    this.downPressed = onGround && pressed(c.down);

    if (onGround && pressed(c.jump)) {
      b.setVelocityY(-(Math.abs(b.velocity.x) > WALK + 10 ? RUN_JUMP : JUMP));
      sfx.jump();
    }
    if (!held(c.jump) && b.velocity.y < -JUMP_CUT) b.velocity.y = -JUMP_CUT;

    if (!onGround) {
      this.anims.stop();
      this.setTexture('player-3');
    } else if (Math.abs(b.velocity.x) > 5) {
      this.anims.play('walk', true);
      this.anims.timeScale = Math.abs(b.velocity.x) > WALK + 10 ? 1.8 : 1;
    } else {
      this.anims.stop();
      this.setTexture('player-0');
    }
  }
}
