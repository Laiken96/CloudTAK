/**
 * Guided tour through the app: step state, skipping and the auto start.
 *
 * The steps themselves are data (see steps.ts). The tour walks them in order;
 * a step whose element is not shown (simple view, collapsed bar, admin only,
 * not rendered yet) is skipped instead of waiting for it. Everything that
 * touches the router or the DOM goes through a TourEnvironment, so the logic
 * here runs in unit tests without a browser.
 */
import { reactive } from 'vue';

export type TourView = 'full' | 'simple';

export interface TourStep {
    /** Unique id */
    id: string;
    /** Short heading - English, German in de.json */
    title: string;
    /** Two or three short sentences - English, German in de.json */
    description: string;
    /** CSS selector of the element to highlight; none: the card stands in the middle */
    target?: string;
    /** Route that shows the element; default `/`, the map without a menu */
    route?: string;
    /** Views the step belongs to; default both */
    views?: TourView[];
}

export interface TourEnvironment {
    /** Full or simple view right now */
    view(): TourView;
    /** Path of the current route */
    currentRoute(): string;
    navigate(route: string): Promise<void>;
    /** The element if it is shown right now */
    findTarget(selector: string): Element | null;
    /** The element once it is shown, null when it does not show up in time */
    waitForTarget(selector: string): Promise<Element | null>;
}

export type TourMode = 'tour' | 'single';

export const MAP_ROUTE = '/';

/** Set once the tour has started on this device - it then never starts by itself again */
export const TOUR_SEEN_KEY = 'cloudtak-tutorial-seen';

type TourStorage = Pick<Storage, 'getItem' | 'setItem'>;

function deviceStorage(): TourStorage | undefined {
    try {
        return globalThis.localStorage ?? undefined;
    } catch {
        return undefined;
    }
}

/**
 * True once the tour ran on this device. Unreadable storage counts as seen:
 * a tour popping up on every start would be worse than none.
 */
export function hasSeenTour(storage: TourStorage | undefined = deviceStorage()): boolean {
    if (!storage) return true;

    try {
        return storage.getItem(TOUR_SEEN_KEY) === 'true';
    } catch {
        return true;
    }
}

export function markTourSeen(storage: TourStorage | undefined = deviceStorage()): void {
    try {
        storage?.setItem(TOUR_SEEN_KEY, 'true');
    } catch {
        // Storage blocked: hasSeenTour() treats that as seen anyway
    }
}

/**
 * Whether the tour should start by itself now: on the map, after the first
 * login on this device, once nothing else (a configuration prompt) is open.
 */
export function shouldAutoStart(opts: {
    paused: boolean;
    routeName: string | null | undefined;
    active: boolean;
    storage?: TourStorage;
}): boolean {
    if (opts.paused || opts.active) return false;
    if (opts.routeName !== 'home') return false;
    return !hasSeenTour(opts.storage ?? deviceStorage());
}

export function stepApplies(step: TourStep, view: TourView): boolean {
    return !step.views || step.views.includes(view);
}

export function applicableSteps(steps: readonly TourStep[], view: TourView): TourStep[] {
    return steps.filter((step) => stepApplies(step, view));
}

export function stepRoute(step: TourStep): string {
    return step.route ?? MAP_ROUTE;
}

export interface TourState {
    active: boolean;
    mode: TourMode;
    steps: TourStep[];
    index: number;
    /** Highlighted element of the current step, null for a card without one */
    target: Element | null;
    /** Single step only: its element is not shown right now */
    missing: boolean;
    /** Ids of steps skipped because their element is not shown */
    skipped: string[];
    /** Moving to another step (navigating, waiting for the element) */
    busy: boolean;
}

export class TourController {
    env: TourEnvironment | undefined;
    state: TourState;

    /** Route to go back to when the tour ends */
    private returnRoute: string | undefined;
    /** Bumped on every move, so an older move still waiting gives up */
    private seq = 0;
    /** A lost element is being looked for */
    private recovering = false;

    constructor(env?: TourEnvironment) {
        this.env = env;
        this.state = reactive<TourState>({
            active: false,
            mode: 'tour',
            steps: [],
            index: -1,
            target: null,
            missing: false,
            skipped: [],
            busy: false,
        }) as TourState;
    }

    setEnvironment(env: TourEnvironment | undefined): void {
        this.env = env;
    }

    get step(): TourStep | undefined {
        return this.state.steps[this.state.index];
    }

    private isSkipped(step: TourStep): boolean {
        return this.state.skipped.includes(step.id);
    }

    private skip(step: TourStep): void {
        if (!this.isSkipped(step)) this.state.skipped.push(step.id);
    }

    /** Steps still in the tour (not skipped) */
    get total(): number {
        return this.state.steps.filter((step) => !this.isSkipped(step)).length;
    }

    /** 1-based number of the current step among the steps still in the tour */
    get position(): number {
        if (this.state.index < 0) return 0;
        return this.state.steps.slice(0, this.state.index + 1).filter((step) => !this.isSkipped(step)).length;
    }

    get isFirst(): boolean {
        return !this.state.steps.slice(0, Math.max(0, this.state.index)).some((step) => !this.isSkipped(step));
    }

    get isLast(): boolean {
        return !this.state.steps.slice(this.state.index + 1).some((step) => !this.isSkipped(step));
    }

    /** Start the whole tour, from the first step that fits the current view */
    async start(steps: readonly TourStep[]): Promise<void> {
        const env = this.requireEnv();

        this.begin('tour', applicableSteps(steps, env.view()), env.currentRoute());
        markTourSeen();

        await this.goTo(0, 1);

        // Elements of the route now shown that are missing will not come:
        // leave them out now, so the step count is right from the start
        if (this.state.active && !this.state.busy) this.precheck();
    }

    /** Highlight a single element with its explanation (Help › Show) */
    async show(step: TourStep): Promise<void> {
        const env = this.requireEnv();

        this.begin('single', [step], env.currentRoute());
        await this.goTo(0, 1);
    }

    async next(): Promise<void> {
        if (!this.state.active || this.state.busy) return;

        if (this.isLast) {
            await this.end();
            return;
        }

        await this.goTo(this.state.index + 1, 1);
    }

    async prev(): Promise<void> {
        if (!this.state.active || this.state.busy || this.isFirst) return;

        const current = this.state.index;
        await this.goTo(current - 1, -1);

        // Every earlier step went missing meanwhile: stay where we were
        if (this.state.active && this.state.index === -1) await this.goTo(current, 1);
    }

    /** End the tour and go back to where it was started (unless `restore` is false) */
    async end(opts: { restore?: boolean } = {}): Promise<void> {
        if (!this.state.active) return;

        this.seq++;
        const back = this.returnRoute;

        this.state.active = false;
        this.state.busy = false;
        this.state.target = null;
        this.state.missing = false;
        this.state.index = -1;
        this.state.steps = [];
        this.state.skipped = [];
        this.returnRoute = undefined;

        if (opts.restore !== false && this.env && back && this.env.currentRoute() !== back) {
            await this.env.navigate(back);
        }
    }

    /**
     * Called when the highlighted element went away (rotation, re-render):
     * find it again, or move on when it is gone for good.
     */
    async recover(): Promise<void> {
        const step = this.step;
        if (!this.state.active || this.state.busy || this.recovering || !step || !step.target || !this.env) return;

        const token = this.seq;
        let found: Element | null;
        this.recovering = true;
        try {
            found = this.env.findTarget(step.target) ?? await this.env.waitForTarget(step.target);
        } finally {
            this.recovering = false;
        }
        if (token !== this.seq || !this.state.active) return;

        if (found) {
            this.state.target = found;
        } else if (this.state.mode === 'single') {
            this.state.target = null;
            this.state.missing = true;
        } else {
            this.skip(step);
            if (this.isLast) {
                await this.end();
            } else {
                await this.goTo(this.state.index + 1, 1);
            }
        }
    }

    private requireEnv(): TourEnvironment {
        if (!this.env) throw new Error('Tutorial is not ready yet');
        return this.env;
    }

    private begin(mode: TourMode, steps: TourStep[], returnRoute: string): void {
        this.seq++;

        // A tour started from a menu ends there again
        this.returnRoute = this.state.active ? this.returnRoute : returnRoute;

        this.state.active = true;
        this.state.mode = mode;
        this.state.steps = steps;
        this.state.index = -1;
        this.state.target = null;
        this.state.missing = false;
        this.state.skipped = [];
        this.state.busy = false;
    }

    private precheck(): void {
        const env = this.env;
        if (!env) return;

        const route = env.currentRoute();
        for (const step of this.state.steps.slice(this.state.index + 1)) {
            if (!step.target || stepRoute(step) !== route) continue;
            if (!env.findTarget(step.target)) this.skip(step);
        }
    }

    /**
     * Show the first step from `start` on, in `direction`, whose element is
     * shown. Ends the tour when going forward runs out of steps.
     */
    private async goTo(start: number, direction: 1 | -1): Promise<void> {
        const env = this.requireEnv();
        const token = ++this.seq;

        this.state.busy = true;

        for (let i = start; i >= 0 && i < this.state.steps.length; i += direction) {
            const step = this.state.steps[i];
            if (this.isSkipped(step)) continue;

            const route = stepRoute(step);
            if (env.currentRoute() !== route) {
                try {
                    await env.navigate(route);
                } catch (err) {
                    console.error('Tutorial: cannot open', route, err);
                }
                if (token !== this.seq) return;
            }

            let target: Element | null = null;
            if (step.target) {
                target = await env.waitForTarget(step.target);
                if (token !== this.seq) return;

                if (!target && this.state.mode === 'tour') {
                    this.skip(step);
                    continue;
                }
            }

            this.state.index = i;
            this.state.target = target;
            this.state.missing = Boolean(step.target && !target);
            this.state.busy = false;
            return;
        }

        this.state.busy = false;

        if (direction === 1) {
            await this.end();
        } else {
            this.state.index = -1;
        }
    }
}

/** The tour of the running app; TutorialTour.vue gives it the router and the DOM */
export const tour = new TourController();
