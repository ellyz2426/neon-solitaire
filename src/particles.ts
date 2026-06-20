// -- Particle Effects System ------------------------------------------
import {
  Group, BufferGeometry, Float32BufferAttribute,
  PointsMaterial, Points, Color, AdditiveBlending,
  Vector3,
} from '@iwsdk/core';

interface Particle {
  pos: Vector3;
  vel: Vector3;
  life: number;
  maxLife: number;
  size: number;
  color: Color;
}

export class ParticleSystem {
  group: Group;
  private particles: Particle[] = [];
  private geometry: BufferGeometry;
  private material: PointsMaterial;
  private points: Points;
  private maxParticles = 500;

  constructor() {
    this.group = new Group();
    this.geometry = new BufferGeometry();
    const positions = new Float32Array(this.maxParticles * 3);
    const colors = new Float32Array(this.maxParticles * 3);
    const sizes = new Float32Array(this.maxParticles);
    this.geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    this.geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
    this.geometry.setAttribute('size', new Float32BufferAttribute(sizes, 1));

    this.material = new PointsMaterial({
      size: 0.015,
      vertexColors: true,
      blending: AdditiveBlending,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      sizeAttenuation: true,
    });

    this.points = new Points(this.geometry, this.material);
    this.group.add(this.points);
  }

  private addParticle(pos: Vector3, vel: Vector3, life: number, size: number, color: Color): void {
    if (this.particles.length >= this.maxParticles) return;
    this.particles.push({
      pos: pos.clone(), vel: vel.clone(), life, maxLife: life, size, color: color.clone(),
    });
  }

  /** Sparkle burst at a position (for combos, card moves) */
  emitSparkle(origin: Vector3, color: string = '#00ffff', count: number = 8): void {
    const c = new Color(color);
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.5;
      const speed = 0.3 + Math.random() * 0.4;
      const vel = new Vector3(
        Math.cos(angle) * speed,
        0.2 + Math.random() * 0.5,
        Math.sin(angle) * speed,
      );
      this.addParticle(origin, vel, 0.5 + Math.random() * 0.5, 0.01 + Math.random() * 0.01, c);
    }
  }

  /** Combo sparkle - larger, more particles, ascending height */
  emitCombo(origin: Vector3, comboLevel: number): void {
    const colors = ['#00ffff', '#ffff00', '#ff00ff', '#00ff88', '#ff4400', '#4488ff'];
    const color = colors[Math.min(comboLevel - 1, colors.length - 1)];
    const count = 6 + comboLevel * 3;
    this.emitSparkle(origin, color, count);
  }

  /** Foundation complete - column of rising sparkles */
  emitFoundationComplete(origin: Vector3): void {
    for (let i = 0; i < 20; i++) {
      const vel = new Vector3(
        (Math.random() - 0.5) * 0.3,
        0.5 + Math.random() * 1.0,
        (Math.random() - 0.5) * 0.3,
      );
      const c = new Color().setHSL(Math.random(), 1.0, 0.6);
      this.addParticle(origin.clone(), vel, 1.0 + Math.random() * 0.5, 0.015, c);
    }
  }

  /** Win celebration - big fireworks burst */
  emitWinCelebration(center: Vector3): void {
    // Multiple bursts with different colors
    for (let burst = 0; burst < 5; burst++) {
      setTimeout(() => {
        const bCenter = center.clone().add(new Vector3(
          (Math.random() - 0.5) * 0.6,
          Math.random() * 0.3,
          (Math.random() - 0.5) * 0.4,
        ));
        const hue = burst * 0.2;
        for (let i = 0; i < 30; i++) {
          const phi = Math.random() * Math.PI * 2;
          const theta = Math.random() * Math.PI;
          const speed = 0.5 + Math.random() * 0.8;
          const vel = new Vector3(
            Math.sin(theta) * Math.cos(phi) * speed,
            Math.cos(theta) * speed * 0.6 + 0.3,
            Math.sin(theta) * Math.sin(phi) * speed,
          );
          const c = new Color().setHSL(hue + Math.random() * 0.1, 1.0, 0.5 + Math.random() * 0.3);
          this.addParticle(bCenter, vel, 1.2 + Math.random() * 0.8, 0.012 + Math.random() * 0.008, c);
        }
      }, burst * 200);
    }
  }

  /** Card trail - tiny sparkles following a card */
  emitCardTrail(pos: Vector3, color: string = '#00ffff'): void {
    const c = new Color(color);
    for (let i = 0; i < 2; i++) {
      const vel = new Vector3(
        (Math.random() - 0.5) * 0.05,
        0.05 + Math.random() * 0.08,
        (Math.random() - 0.5) * 0.05,
      );
      this.addParticle(pos.clone(), vel, 0.3 + Math.random() * 0.2, 0.005, c);
    }
  }

  /** Achievement unlock - golden burst */
  emitAchievement(origin: Vector3): void {
    for (let i = 0; i < 15; i++) {
      const angle = (i / 15) * Math.PI * 2;
      const speed = 0.4 + Math.random() * 0.3;
      const vel = new Vector3(
        Math.cos(angle) * speed, 0.3 + Math.random() * 0.4, Math.sin(angle) * speed,
      );
      const c = new Color().setHSL(0.12 + Math.random() * 0.05, 1.0, 0.5 + Math.random() * 0.2);
      this.addParticle(origin, vel, 0.8 + Math.random() * 0.4, 0.012, c);
    }
  }

  update(delta: number): void {
    const gravity = -1.2;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= delta;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.vel.y += gravity * delta;
      p.pos.x += p.vel.x * delta;
      p.pos.y += p.vel.y * delta;
      p.pos.z += p.vel.z * delta;
      // Damping
      p.vel.x *= 0.98;
      p.vel.z *= 0.98;
    }

    // Update buffers
    const posAttr = this.geometry.getAttribute('position') as Float32BufferAttribute;
    const colAttr = this.geometry.getAttribute('color') as Float32BufferAttribute;
    const sizeAttr = this.geometry.getAttribute('size') as Float32BufferAttribute;
    const posArr = posAttr.array as Float32Array;
    const colArr = colAttr.array as Float32Array;
    const sizeArr = sizeAttr.array as Float32Array;

    for (let i = 0; i < this.maxParticles; i++) {
      if (i < this.particles.length) {
        const p = this.particles[i];
        const fade = p.life / p.maxLife;
        posArr[i * 3] = p.pos.x;
        posArr[i * 3 + 1] = p.pos.y;
        posArr[i * 3 + 2] = p.pos.z;
        colArr[i * 3] = p.color.r * fade;
        colArr[i * 3 + 1] = p.color.g * fade;
        colArr[i * 3 + 2] = p.color.b * fade;
        sizeArr[i] = p.size * fade;
      } else {
        posArr[i * 3] = 0;
        posArr[i * 3 + 1] = -100;
        posArr[i * 3 + 2] = 0;
        sizeArr[i] = 0;
      }
    }

    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
    sizeAttr.needsUpdate = true;
    this.geometry.drawRange.count = Math.min(this.particles.length, this.maxParticles);
  }
}
