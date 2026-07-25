import { bus, EV } from '../core/EventBus.js';
import { grantItem } from '../data/items.js';
import { applyEffects, evaluate } from './Conditions.js';
import { OBJECTIVE_TYPES, trackedEvents } from './objectives.js';

/**
 * Runs "jobs" (Shadowrun's word for quests). Jobs are plain JSON; this class
 * subscribes to the event bus and advances whichever objectives a given event
 * satisfies.
 *
 * Progress lives in GameState.flags under two key shapes:
 *   `obj:<jobId>/<objId>`      -> true once the objective is complete
 *   `objn:<jobId>/<objId>`     -> running count for multi-step objectives
 * Storing it there rather than in a private field means saving a game is just
 * serialising GameState, and Conditions can read objective progress for free.
 */
export class JobManager {
  /**
   * @param {import('../core/GameState.js').GameState} state
   * @param {Record<string, object>} defs jobId -> job definition
   */
  constructor(state, defs = {}) {
    this.state = state;
    this.defs = { ...defs };
    this.ctx = { jobs: this, scene: null };
    this._bound = null;
  }

  /** Late-bound so effects like `spawn` can reach the active scene. */
  setScene(scene) {
    this.ctx.scene = scene;
  }

  register(defs) {
    Object.assign(this.defs, defs);
  }

  get(jobId) {
    return this.defs[jobId] ?? null;
  }

  // ------------------------------------------------------------- lifecycle

  /** Subscribe to every event any objective type can consume. */
  attach() {
    if (this._bound) return;
    this._bound = new Map();
    for (const event of trackedEvents()) {
      const fn = (payload) => this.handle(event, payload ?? {});
      this._bound.set(event, fn);
      bus.on(event, fn);
    }
  }

  detach() {
    if (!this._bound) return;
    for (const [event, fn] of this._bound) bus.off(event, fn);
    this._bound = null;
  }

  isActive(jobId) {
    return this.state.jobs.active.includes(jobId);
  }

  isCompleted(jobId) {
    return this.state.jobs.completed.includes(jobId);
  }

  start(jobId) {
    const def = this.get(jobId);
    if (!def) {
      console.warn(`[jobs] unknown job "${jobId}"`);
      return false;
    }
    if (this.isActive(jobId) || this.isCompleted(jobId)) return false;

    this.state.jobs.active.push(jobId);
    applyEffects(def.onStart, this.state, this.ctx);
    bus.emit(EV.JOB_STARTED, { job: jobId, def });
    bus.emit(EV.TOAST, { text: `JOB ACCEPTED: ${def.title}`, tone: 'job' });
    this.state.touch();

    // An objective may already be satisfied at accept time (you were told to
    // fetch a thing you happen to be carrying); settle that immediately.
    this.reevaluate(jobId);
    return true;
  }

  complete(jobId) {
    const def = this.get(jobId);
    if (!def || !this.isActive(jobId)) return false;

    this.state.jobs.active = this.state.jobs.active.filter((j) => j !== jobId);
    this.state.jobs.completed.push(jobId);

    const pay = def.payment ?? {};
    if (pay.nuyen) this.state.addNuyen(pay.nuyen);
    if (pay.karma) this.state.addKarma(pay.karma);
    // Same grant path as a floor pickup, so consumable rewards actually apply.
    if (pay.items) pay.items.forEach((i) => grantItem(this.state, i.id, i.count ?? 1, this.ctx));

    applyEffects(def.onComplete, this.state, this.ctx);
    bus.emit(EV.JOB_COMPLETED, { job: jobId, def, payment: pay });
    bus.emit(EV.TOAST, {
      text: `JOB COMPLETE: ${def.title}` + (pay.nuyen ? `  +${pay.nuyen}¥` : ''),
      tone: 'job',
    });
    this.state.touch();
    return true;
  }

  fail(jobId) {
    const def = this.get(jobId);
    if (!def || !this.isActive(jobId)) return false;
    this.state.jobs.active = this.state.jobs.active.filter((j) => j !== jobId);
    this.state.jobs.failed.push(jobId);
    applyEffects(def.onFail, this.state, this.ctx);
    bus.emit(EV.JOB_FAILED, { job: jobId, def });
    bus.emit(EV.TOAST, { text: `JOB FAILED: ${def.title}`, tone: 'bad' });
    this.state.touch();
    return true;
  }

  // ------------------------------------------------------------ objectives

  key(jobId, objId) {
    return `obj:${jobId}/${objId}`;
  }

  countKey(jobId, objId) {
    return `objn:${jobId}/${objId}`;
  }

  isObjectiveDone(jobId, objId) {
    return Boolean(this.state.getFlag(this.key(jobId, objId)));
  }

  objectiveProgress(jobId, objId) {
    return this.state.getFlag(this.countKey(jobId, objId), 0) || 0;
  }

  /**
   * An objective is available when its prerequisites are met and its optional
   * `when` condition holds. Locked objectives stay hidden from the tracker.
   */
  isObjectiveAvailable(jobId, obj) {
    if (this.isObjectiveDone(jobId, obj.id)) return false;
    const reqs = obj.requires ?? [];
    if (!reqs.every((r) => this.isObjectiveDone(jobId, r))) return false;
    if (obj.when && !evaluate(obj.when, this.state)) return false;
    return true;
  }

  /** Objectives the tracker should show for a job, in author order. */
  activeObjectives(jobId) {
    const def = this.get(jobId);
    if (!def) return [];
    return def.objectives.filter((o) => this.isObjectiveAvailable(jobId, o));
  }

  /** Force an objective done, e.g. from a dialogue effect. "jobId/objId". */
  forceObjective(path) {
    const [jobId, objId] = String(path).split('/');
    const def = this.get(jobId);
    if (!def) return false;
    const obj = def.objectives.find((o) => o.id === objId);
    if (!obj) return false;
    return this.finishObjective(jobId, obj);
  }

  finishObjective(jobId, obj) {
    if (this.isObjectiveDone(jobId, obj.id)) return false;
    this.state.setFlag(this.key(jobId, obj.id), true);
    applyEffects(obj.onComplete, this.state, this.ctx);
    bus.emit(EV.JOB_OBJECTIVE_DONE, { job: jobId, objective: obj.id, def: obj });
    if (obj.text) bus.emit(EV.TOAST, { text: `✓ ${obj.text}`, tone: 'objective' });
    this.checkJobCompletion(jobId);
    return true;
  }

  /**
   * Route one bus event into every active job. Objectives that are not yet
   * available are skipped, which is what enforces ordering.
   */
  handle(event, payload) {
    // Iterate a copy: completing a job can mutate the active list.
    for (const jobId of [...this.state.jobs.active]) {
      const def = this.get(jobId);
      if (!def) continue;

      for (const obj of def.objectives) {
        const handler = OBJECTIVE_TYPES[obj.type];
        if (!handler || !handler.events.includes(event)) continue;
        if (!this.isObjectiveAvailable(jobId, obj)) continue;

        const gained = handler.progress(obj, payload, this.state) || 0;
        if (gained <= 0) continue;

        const need = obj.count ?? 1;
        const have = this.objectiveProgress(jobId, obj.id) + gained;
        if (have >= need) {
          this.state.setFlag(this.countKey(jobId, obj.id), need);
          this.finishObjective(jobId, obj);
        } else {
          this.state.setFlag(this.countKey(jobId, obj.id), have);
          bus.emit(EV.TOAST, {
            text: `${obj.text ?? obj.id}  ${have}/${need}`,
            tone: 'objective',
          });
        }
      }
    }
  }

  /** Re-run passive `condition` objectives without a triggering event. */
  reevaluate(jobId) {
    const def = this.get(jobId);
    if (!def) return;
    for (const obj of def.objectives) {
      if (obj.type !== 'condition') continue;
      if (!this.isObjectiveAvailable(jobId, obj)) continue;
      if (evaluate(obj.when, this.state)) this.finishObjective(jobId, obj);
    }
  }

  /**
   * A job finishes when every non-optional objective is done - unless it is
   * marked `manualComplete`, in which case some dialogue must call complete().
   */
  checkJobCompletion(jobId) {
    const def = this.get(jobId);
    if (!def || def.manualComplete) return false;
    const required = def.objectives.filter((o) => !o.optional);
    const allDone = required.every((o) => this.isObjectiveDone(jobId, o.id));
    if (allDone) return this.complete(jobId);
    return false;
  }

  /** Everything the journal needs to render, in one call. */
  snapshot() {
    const render = (jobId, status) => {
      const def = this.get(jobId);
      if (!def) return null;
      return {
        id: jobId,
        status,
        title: def.title,
        brief: def.brief,
        giver: def.giver,
        payment: def.payment,
        objectives: def.objectives
          .filter((o) => this.isObjectiveDone(jobId, o.id) ||
            this.isObjectiveAvailable(jobId, o))
          .map((o) => ({
            id: o.id,
            text: o.text ?? o.id,
            optional: Boolean(o.optional),
            done: this.isObjectiveDone(jobId, o.id),
            count: o.count ?? 1,
            progress: this.objectiveProgress(jobId, o.id),
          })),
      };
    };
    return {
      active: this.state.jobs.active.map((j) => render(j, 'active')).filter(Boolean),
      completed: this.state.jobs.completed.map((j) => render(j, 'completed')).filter(Boolean),
      failed: this.state.jobs.failed.map((j) => render(j, 'failed')).filter(Boolean),
    };
  }
}
