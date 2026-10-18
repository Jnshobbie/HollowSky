import { Vector3 } from 'three';

const DIRECTIONS: ReadonlyArray<Vector3> = [
    new Vector3(0, -1, 0),
    new Vector3(0, 1, 0),
    new Vector3(1, 0, 0),
    new Vector3(-1, 0, 0),
    new Vector3(0, 0, 1),
    new Vector3(0, 0, -1),
];

export class GravityManager {
    readonly direction = new Vector3(0, -1, 0);
    onWarning: ((secondsLeft: number) => void) | null = null;
    onShift: ((dir: Vector3) => void) | null = null;

    readonly next = new Vector3(0, 1, 0);
    canShift: () => boolean = () => true;

    private timer: number;
    private lastWarned = -1;

    private readonly minSec: number;
    private readonly maxSec: number;
    private readonly warnSec: number;

    constructor(minSec = 60, maxSec = 180, warnSec = 3) {
        this.minSec = minSec;
        this.maxSec = maxSec;
        this.warnSec = warnSec;
        this.pickNext();
        this.timer = this.roll();
    }

    private roll(): number {
        return this.minSec + Math.random() * (this.maxSec - this.minSec);
    }

    update(dt: number): void {
        this.timer -= dt;
        if (this.timer > 0 && this.timer <= this.warnSec) {
            const s = Math.ceil(this.timer);
            if (s !== this.lastWarned) {
                this.lastWarned = s;
                this.onWarning?.(s);
            }
        }
        if (this.timer <= 0) {
            if (this.canShift()) {
                this.shift();
            } else {
                this.timer = 0; // wait for the fight to end
                if (this.lastWarned !== 0) {
                    this.lastWarned = 0;
                    this.onWarning?.(0);
                }
            }
        }
    }

    private pickNext(): void {
        const options = DIRECTIONS.filter((d) => !d.equals(this.direction));
        this.next.copy(options[Math.floor(Math.random() * options.length)]);
    }
    shift(): void {
        this.direction.copy(this.next);
        this.pickNext();
        this.timer = this.roll();
        this.lastWarned = -1;
        this.onShift?.(this.direction);
    }
}