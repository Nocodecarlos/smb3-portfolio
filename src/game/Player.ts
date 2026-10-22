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
  /** Feather power: lets a full P-meter take off, and jump taps slow a fall. */
  powered = false;
  /** 0..1, fills while running flat out on the ground. */
  pMeter = 0;
  private flyUntil = 0;
  private floatUntil = 0;
  /** The current ascent came from a jump, so releasing jump cuts it short. */
  private jumping = false;

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
    this.jumping = false;
    this.setVelocityY(held(this.controls.jump) ? -320 : -200);
  }

  /** Launch off a spring-like surface (note blocks). Holding jump goes higher. */
  spring(low: number, high: number) {
    this.jumping = false;
    this.setVelocityY(held(this.controls.jump) ? -high : -low);
  }

  get flying() {
    return this.scene.time.now < this.flyUntil;
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

    const now = this.scene.time.now;
    const dt = this.scene.game.loop.delta / 1000;
    if (onGround) {
      const flatOut = running && dir !== 0 && Math.abs(b.velocity.x) >= RUN - 12;
      this.pMeter = Phaser.Math.Clamp(this.pMeter + (flatOut ? dt / 0.8 : -dt / 0.6), 0, 1);
    } else if (!this.flying) {
      this.pMeter = Math.max(0, this.pMeter - dt / 2);
    }

    const jumpTap = pressed(c.jump);
    if (onGround && jumpTap) {
      b.setVelocityY(-(Math.abs(b.velocity.x) > WALK + 10 ? RUN_JUMP : JUMP));
      this.jumping = true;
      if (this.powered && this.pMeter >= 0.98) this.flyUntil = now + 4000;
      sfx.jump();
    } else if (!onGround && jumpTap && this.powered) {
      // Flutter: in flight each tap climbs, otherwise it slows the fall.
      if (this.flying) {
        b.setVelocityY(Math.min(b.velocity.y, -200));
        this.jumping = false;
      } else this.floatUntil = now + 260;
      sfx.jump();
    }
    if (b.velocity.y >= 0) this.jumping = false;
    if (this.jumping && !held(c.jump) && b.velocity.y < -JUMP_CUT) b.velocity.y = -JUMP_CUT;
    if (now < this.floatUntil && b.velocity.y > 50) b.velocity.y = 50;
    if (this.flying) this.pMeter = 1;

    const k = this.powered ? 'playerF' : 'player';
    if (!onGround) {
      this.anims.stop();
      this.setTexture(`${k}-3`);
    } else if (Math.abs(b.velocity.x) > 5) {
      this.anims.play(this.powered ? 'walkF' : 'walk', true);
      this.anims.timeScale = Math.abs(b.velocity.x) > WALK + 10 ? 1.8 : 1;
    } else {
      this.anims.stop();
      this.setTexture(`${k}-0`);
    }
  }
}
