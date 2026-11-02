import Phaser from 'phaser';
import { ChibiRig } from '../art/hero';
import { sfx } from './sfx';
import { type Hero, ui } from './state';

// The shape comes from Super Mario Bros. 3: light gravity while rising with jump held, heavy otherwise, a stronger
// takeoff at speed. The amounts are tuned tighter than its numbers, to suit these levels: shorter, quicker jumps
// and a hero who stops when you let go.
const WALK = 78;
const RUN = 125;
const P_RUN = 165;
const ACCEL = 700;
/** Turning against your speed, so changing direction is immediate. */
const SKID = 1500;
/** Letting go on the ground: nearly a dead stop. In the air speed mostly carries. */
const DECEL = 1100;
const AIR_DRAG = 160;
const JUMP = 270;
/** Faster takes off harder: extra px/s at walking, running and full-P speed. */
const JUMP_BONUS = [0, 10, 20, 30];
const GRAVITY_RISE = 500;
const GRAVITY = 1500;
/** Above this upward speed the light gravity stops, even with jump held. */
const RISE_END = 150;
/** Top falling speed. */
const FALL = 320;
/** Top rising speed, for springs and launches. */
const RISE_MAX = 600;
/** Forgiveness (ms): a jump still works just after leaving a ledge, and a press just before landing counts. */
const COYOTE = 80;
const JUMP_BUFFER = 100;
/** The P-meter: seconds to fill while running flat out, and to empty after. */
const P_FILL = 0.55;
const P_DRAIN = 2.3;
/** Flight: hold jump to climb. */
const FLY_MS = 5000;
const FLY_CLIMB = 150;
const FLY_LIFT = 900;
const FLY_SPEED = 140;
/** With the cape, pressing jump again in the air and holding it slows the fall to this. */
const FLOAT_FALL = 80;

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
    // A/D + K (run) and L (jump) are the advertised scheme, with Space and Alt/Option beside them; up never jumps
    // for thumbs on the space bar; arrows/shift still work. (Not Cmd: Cmd+W would close the tab.)
    left: keys(K.A, K.LEFT),
    right: keys(K.D, K.RIGHT),
    down: keys(K.S, K.DOWN),
    jump: keys(K.L, K.SPACE, K.Z),
    // Alt is captured so it can't pop open the browser's menu bar
    run: [...keys(K.K, K.SHIFT, K.X), k.addKey(K.ALT, true)],
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
  /** The current ascent came from a jump, so releasing jump cuts it short. */
  private jumping = false;
  /** Thrown by a spring or launch: it keeps the plain world gravity those heights are worked out with. */
  private launched = false;
  private lastGround = -1e9;
  private jumpWanted = -1e9;
  /** The cape is catching this fall: jump was pressed again in the air and is still held. */
  private floating = false;

  /** Felt courses draw the chosen felt hero as a puppet; this sprite then only carries the physics body. */
  private rig?: ChibiRig;

  /** `height` is the puppet's, feet to hat; the body grows with it, feet staying where they are. */
  constructor(scene: Phaser.Scene, x: number, y: number, controls: Controls, hero?: Hero, height = 19) {
    super(scene, x, y, 'player-0');
    this.controls = controls;
    scene.add.existing(this);
    scene.physics.add.existing(this);
    const w = Math.round((10 * height) / 19);
    const h = Math.round((15 * height) / 19);
    this.body.setSize(w, h).setOffset((16 - w) / 2, 16 - h);
    if (hero) {
      // a little taller than the 15px body, like the Figma sprite
      const rig = new ChibiRig(scene, hero, height);
      rig.root.setDepth(10);
      this.rig = rig;
      this.setVisible(false);
      // follow the body every frame, including scripted moves (pipes) when update() isn't running
      const follow = () => rig.root.setPosition(this.x, this.body.bottom).setAlpha(this.alpha);
      scene.events.on(Phaser.Scenes.Events.POST_UPDATE, follow);
      this.once(Phaser.GameObjects.Events.DESTROY, () => scene.events.off(Phaser.Scenes.Events.POST_UPDATE, follow));
    }
    this.body.setMaxVelocity(P_RUN, RISE_MAX);
    this.setDepth(10);
  }

  /** Draws the hero (and its puppet) at this depth: behind the scenery, or back in front at 10. */
  setLayer(depth: number) {
    this.setDepth(depth);
    this.rig?.root.setDepth(depth);
    return this;
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
    this.setVelocityY(held(this.controls.jump) ? -380 : -240);
  }

  /** Launch off a spring-like surface (note blocks). Holding jump goes higher. */
  spring(low: number, high: number) {
    this.jumping = false;
    this.launched = true;
    this.setVelocityY(held(this.controls.jump) ? -high : -low);
  }

  /** Shot straight up (the super note, the slingshot): faster than the usual speed cap, until it peaks. */
  launch(speed: number) {
    this.jumping = false;
    this.launched = true;
    this.body.maxVelocity.y = Math.max(RISE_MAX, speed);
    this.setVelocityY(-speed);
  }

  get flying() {
    return this.scene.time.now < this.flyUntil;
  }

  update() {
    const c = this.controls;
    const b = this.body;
    const onGround = b.blocked.down || b.touching.down;
    const running = held(c.run);
    const full = this.pMeter >= 0.98;
    const max = !running ? WALK : full ? P_RUN : RUN;
    const dir = (held(c.right) ? 1 : 0) - (held(c.left) ? 1 : 0);
    const now = this.scene.time.now;
    const dt = this.scene.game.loop.delta / 1000;
    const speed = Math.abs(b.velocity.x);

    if (this.hurting && !onGround) {
      // keep knockback momentum
    } else if (dir !== 0) {
      const turning = Math.sign(b.velocity.x) === -dir;
      // past this gait's top speed: ease down on the ground, keep it in the air
      const over = speed > max && !turning;
      b.setAccelerationX(over ? 0 : dir * (turning ? SKID : ACCEL));
      if (over && onGround) b.velocity.x = Math.sign(b.velocity.x) * Math.max(max, speed - DECEL * dt);
      this.setFlipX(dir < 0);
    } else {
      b.setAccelerationX(0);
      const step = (onGround ? DECEL : AIR_DRAG) * dt;
      b.velocity.x = speed <= step ? 0 : b.velocity.x - Math.sign(b.velocity.x) * step;
    }
    if (this.flying && Math.abs(b.velocity.x) > FLY_SPEED) b.velocity.x = Math.sign(b.velocity.x) * FLY_SPEED;

    this.downPressed = onGround && pressed(c.down);

    if (onGround) {
      this.lastGround = now;
      if (b.velocity.y >= 0) this.flyUntil = 0;
      const flatOut = running && dir !== 0 && speed >= RUN - 12;
      this.pMeter = Phaser.Math.Clamp(this.pMeter + (flatOut ? dt / P_FILL : -dt / P_DRAIN), 0, 1);
    }

    const jumpHeld = held(c.jump);
    const jumpTap = pressed(c.jump);
    if (jumpTap) this.jumpWanted = now;
    const canJump = now - this.lastGround < COYOTE && b.velocity.y >= -1;
    if (canJump && now - this.jumpWanted < JUMP_BUFFER) {
      b.setVelocityY(-(JUMP + JUMP_BONUS[Math.min(3, Math.floor(speed / 55))]));
      this.jumping = true;
      this.launched = false;
      this.lastGround = this.jumpWanted = -1e9;
      if (this.powered && full) this.flyUntil = now + FLY_MS;
      sfx.jump();
    } else if (!onGround && jumpTap && this.powered) {
      // a full meter takes off from the air too; otherwise the cape catches you (below)
      if (full && !this.flying) this.flyUntil = now + FLY_MS;
      this.floating = true;
      sfx.jump();
    }
    if (b.velocity.y >= 0) {
      this.jumping = this.launched = false;
      b.maxVelocity.y = RISE_MAX; // a launch is over once it peaks
    }

    const climbing = this.flying && jumpHeld;
    if (this.flying) this.pMeter = 1;
    if (climbing) b.velocity.y = Math.max(-FLY_CLIMB, b.velocity.y - FLY_LIFT * dt);
    const world = this.scene.physics.world.gravity.y;
    const rising = this.jumping && jumpHeld && b.velocity.y < -RISE_END;
    b.setGravityY(climbing ? -world : this.launched ? 0 : (rising ? GRAVITY_RISE : GRAVITY) - world);
    if (onGround || !jumpHeld) this.floating = false;
    const fall = this.floating ? FLOAT_FALL : FALL;
    if (b.velocity.y > fall) b.velocity.y = fall;

    const k = this.powered ? 'playerF' : 'player';
    if (this.rig) {
      // With the feather the hero wears a cape: caped walk on the ground, flying pose in the air.
      this.rig.setPowered(this.powered);
      this.rig.setFacing(this.flipX);
      this.rig.animate(dt, onGround ? Math.min(1, Math.abs(b.velocity.x) / RUN) : 0, !onGround);
    } else if (!onGround) {
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
