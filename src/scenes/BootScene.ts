import Phaser from 'phaser';
import { generateCourseTextures, registerCourseAnims } from '../art/course';
import { generateTextures, registerAnims } from '../art/sprites';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create() {
    generateTextures(this);
    registerAnims(this);
    generateCourseTextures(this);
    registerCourseAnims(this);
    this.scene.start('Title');
  }
}
