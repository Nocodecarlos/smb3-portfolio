import Phaser from 'phaser';
import { ChibiRig } from '../art/hero';
import { sfx } from './sfx';
import { type Hero, ui } from './state';

// The shape comes from Super Mario Bros. 3: light gravity while rising with jump held, heavy otherwise, a stronger
// takeoff at speed. The amounts are tuned tighter than its numbers, to suit these levels: shorter, quicker jumps
// and a hero who stops when you let go.
const WALK = 78;
/** Easy mode's stroll, a quarter slower than a walk; and how fast a jump carries it forward, so every gap can still be cleared. */
const EASY_WALK = WALK * 0.75;
const EASY_LEAP = 105;
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
/**
 * Sliding on snow (World 1-5): a slope this steep (rise over run) slides you down by itself; on a gentler one,
 * holding down does. Sliding speeds up downhill, keeps going on the flat until friction stops it, and knocks
 * over anything in the way.
 */
const SLIDE_STEEP = 0.55;
const SLIDE_GENTLE = 0.15;
const SLIDE_ACCEL = 520;
const SLIDE_MAX = 230;
const SLIDE_FRICTION = 240;

export interface Controls {
  left: Phaser.Input.Keyboard.Key[];
  right: Phaser.Input.Keyboard.Key[];
  down: Phaser.Input.Keyboard.Key[];
  /** Up (W, the up arrow, the D-pad): only for going up a pipe. It never jumps. */
  up: Phaser.Input.Keyboard.Key[];
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
    up: keys(K.W, K.UP),
    // W and the up arrow jump too, with Space: what most people reach for first
    jump: keys(K.SPACE, K.W, K.UP, K.L, K.Z),
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
  /** Ducking: down held on the ground. You stop walking (speed carries you a little) and can still jump. */
  crouching = false;
  /** Set by the scene where down means something else (a billboard, a pipe, a door): no ducking there. */
  noCrouch = false;
  /** Easy mode: the way the hero walks by themselves (0: they stand). Holding left or right takes over. */
  autoDir = 0;
  /** Feather power: lets a full P-meter take off, and jump taps slow a fall. */
  powered = false;
  /** 0..1, fills while running flat out on the ground. */
  pMeter = 0;
  /** The ground's slope under the hero (rise over run, + going down to the right), set by the course each frame. */
  slope = 0;
  /** Sliding down the snow: set on steep slopes, or holding down on a gentle one. */
  sliding = false;
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
  /** The polish test: the course hears about landings, takeoffs and skids (for dust), with how hard, 0..1. */
  onFx?: (kind: 'land' | 'jump' | 'skid', power: number) => void;
  private lively = false;
  private wasGround = true;
  private prevVy = 0;
  private lastSkid = 0;

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

  /** Turn away to read a billboard behind the course, or back to the game. Resolves when the turn is done. */
  faceBoard(away: boolean) {
    return this.rig?.turn(away) ?? Promise.resolve();
  }

  /** The polish test: the puppet moves like a soft toy (see ChibiRig.lively). */
  setLively(on: boolean) {
    this.lively = on;
    this.rig?.setLively(on);
    return this;
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
    const steer = (held(c.right) ? 1 : 0) - (held(c.left) ? 1 : 0);
    // walking by themselves (Easy mode), the hero strolls at the ordinary walking pace: a run only comes from the run key
    const auto = steer === 0 && this.autoDir !== 0;
    const running = held(c.run);
    const full = this.pMeter >= 0.98 && !auto;
    // a strolling hero's jump still carries forward (EASY_LEAP), so every gap can be cleared; the stroll resumes on landing
    const max = !running ? (auto ? (onGround ? EASY_WALK : EASY_LEAP) : WALK) : full ? P_RUN : RUN;
    this.crouching = onGround && held(c.down) && !this.noCrouch && !this.sliding && !this.hurting;
    const dir = this.crouching ? 0 : steer || this.autoDir;
    const now = this.scene.time.now;
    const dt = this.scene.game.loop.delta / 1000;
    const speed = Math.abs(b.velocity.x);
    const tilt = Math.abs(this.slope);
    if (onGround && !this.hurting && (tilt >= SLIDE_STEEP || (held(c.down) && tilt > SLIDE_GENTLE))) this.sliding = true;
    // the slide ends when you get hurt, or once the flat has slowed you nearly to a stop
    if (this.sliding && (this.hurting || (onGround && tilt < 0.05 && speed < 30))) this.sliding = false;
    b.maxVelocity.x = this.sliding ? SLIDE_MAX : P_RUN;

    if (this.sliding) {
      if (onGround && tilt > 0.05) {
        // downhill pulls you along; steering doesn't
        const down = Math.sign(this.slope);
        b.setAccelerationX(down * SLIDE_ACCEL);
        this.setFlipX(down < 0);
      } else {
        b.setAccelerationX(0);
        const step = (onGround ? SLIDE_FRICTION : AIR_DRAG) * dt;
        b.velocity.x = speed <= step ? 0 : b.velocity.x - Math.sign(b.velocity.x) * step;
      }
    } else if (this.hurting && !onGround) {
      // keep knockback momentum
    } else if (dir !== 0) {
      const turning = Math.sign(b.velocity.x) === -dir;
      if (turning && onGround && speed > 70 && now - this.lastSkid > 90) {
        this.lastSkid = now;
        this.onFx?.('skid', speed / P_RUN);
      }
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
      this.sliding = false;
      this.launched = false;
      this.onFx?.('jump', 0.4);
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

    if (onGround && !this.wasGround && this.prevVy > 120) this.onFx?.('land', Math.min(1, this.prevVy / FALL));
    this.wasGround = onGround;
    this.prevVy = b.velocity.y;

    const k = this.powered ? 'playerF' : 'player';
    if (this.rig) {
      // With the feather the hero wears a cape: caped walk on the ground, flying pose in the air.
      this.rig.setPowered(this.powered);
      this.rig.setFacing(this.flipX);
      // sliding: legs still, the body leaning with the snow
      const lean = this.sliding && onGround ? Phaser.Math.RadToDeg(Math.atan(this.slope)) : 0;
      this.rig.setTilt(lean, dt);
      // a lively puppet strides faster still at full P speed
      const pace = Math.abs(b.velocity.x) / RUN;
      this.rig.animate(dt, onGround && !this.sliding ? (this.lively ? pace : Math.min(1, pace)) : 0, !onGround, b.velocity.y, this.crouching);
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
