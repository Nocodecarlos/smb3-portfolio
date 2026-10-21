import Phaser from 'phaser';
import { generateTextures, registerAnims } from '../art/sprites';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create() {
    generateTextures(this);
    registerAnims(this);
    this.scene.start('Title');
  }
}
