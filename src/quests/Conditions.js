import { bus, EV } from '../core/EventBus.js';

/**
 * One predicate/effect language shared by dialogue gating, objective
 * prerequisites and conditional spawns. Keeping a single evaluator means a new
 * condition type is instantly available to all three.
 *
 * Predicates (a bare object is an implicit AND of its keys):
 *   { flag: 'met_kaz' }                  flag is truthy
 *   { flag: 'burned', equals: false }    flag equals a specific value
 *   { item: 'keycard_red', count: 2 }    inventory holds at least count
 *   { skill: 'hacking', gte: 3 }         skill rating at least gte
 *   { attr: 'logic', gte: 4 }            attribute rating at least gte
 *   { nuyen: 1000 }                      wallet at least this much
 *   { karma: 2 }
 *   { job: 'job_wetwire', is: 'active' } job state: active|completed|failed|unstarted
 *   { objective: 'job_wetwire/get_case' } objective is done
 *   { all: [...] } { any: [...] } { not: {...} }
 *
 * Effects are a list of verb objects; unknown verbs are ignored so content can
 * be authored slightly ahead of the engine without crashing.
 */

export function evaluate(cond, state, ctx = {}) {
  if (cond === undefined || cond === null) return true;
  if (typeof cond === 'boolean') return cond;
  if (Array.isArray(cond)) return cond.every((c) => evaluate(c, state, ctx));

  if (cond.all) return cond.all.every((c) => evaluate(c, state, ctx));
  if (cond.any) return cond.any.some((c) => evaluate(c, state, ctx));
  if (cond.not) return !evaluate(cond.not, state, ctx);

  const checks = [];

  if (cond.flag !== undefined) {
    const actual = state.getFlag(cond.flag);
    checks.push('equals' in cond ? actual === cond.equals : Boolean(actual));
  }
  if (cond.item !== undefined) {
    checks.push(state.hasItem(cond.item, cond.count ?? 1));
  }
  if (cond.noItem !== undefined) {
    checks.push(!state.hasItem(cond.noItem, 1));
  }
  if (cond.skill !== undefined) {
    checks.push(state.skill(cond.skill) >= (cond.gte ?? 1));
  }
  if (cond.attr !== undefined) {
    checks.push(state.attr(cond.attr) >= (cond.gte ?? 1));
  }
  if (cond.nuyen !== undefined) {
    checks.push(state.nuyen >= cond.nuyen);
  }
  if (cond.karma !== undefined) {
    checks.push(state.karma >= cond.karma);
  }
  if (cond.hp !== undefined) {
    checks.push(state.hp >= cond.hp);
  }
  if (cond.job !== undefined) {
    checks.push(jobStateOf(state, cond.job) === (cond.is ?? 'active'));
  }
  if (cond.objective !== undefined) {
    const done = Boolean(state.getFlag(`obj:${cond.objective}`));
    checks.push('equals' in cond ? done === cond.equals : done);
  }
  if (cond.room !== undefined) {
    checks.push(state.currentRoom === cond.room);
  }

  // An object with no recognised keys is vacuously true rather than an error;
  // that keeps `{}` usable as "no requirement".
  return checks.length === 0 ? true : checks.every(Boolean);
}

function jobStateOf(state, jobId) {
  if (state.jobs.completed.includes(jobId)) return 'completed';
  if (state.jobs.failed.includes(jobId)) return 'failed';
  if (state.jobs.active.includes(jobId)) return 'active';
  return 'unstarted';
}

/**
 * Renders a condition as the greyed-out requirement text shown next to a
 * locked dialogue option, Deus Ex style.
 */
export function describe(cond) {
  if (!cond) return '';
  if (cond.all) return cond.all.map(describe).filter(Boolean).join(', ');
  if (cond.any) return cond.any.map(describe).filter(Boolean).join(' or ');
  if (cond.not) return `not ${describe(cond.not)}`;

  const parts = [];
  if (cond.skill) parts.push(`${cap(cond.skill)} ${cond.gte ?? 1}`);
  if (cond.attr) parts.push(`${cap(cond.attr)} ${cond.gte ?? 1}`);
  if (cond.item) parts.push(prettyItem(cond.item));
  if (cond.nuyen) parts.push(`${cond.nuyen}¥`);
  if (cond.karma) parts.push(`${cond.karma} karma`);
  return parts.join(', ');
}

function cap(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function prettyItem(id) {
  return id.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}

/**
 * Applies a list of effects. `ctx` carries optional systems (jobs, scene) so
 * effects can reach beyond pure state when they need to.
 */
export function applyEffects(effects, state, ctx = {}) {
  if (!effects) return;
  const list = Array.isArray(effects) ? effects : [effects];

  for (const fx of list) {
    if (!fx || typeof fx !== 'object') continue;

    if ('setFlag' in fx) state.setFlag(fx.setFlag, 'value' in fx ? fx.value : true);
    if ('clearFlag' in fx) state.setFlag(fx.clearFlag, false);
    if ('giveItem' in fx) state.addItem(fx.giveItem, fx.count ?? 1);
    if ('takeItem' in fx) state.removeItem(fx.takeItem, fx.count ?? 1);
    if ('nuyen' in fx) state.addNuyen(fx.nuyen);
    if ('karma' in fx) state.addKarma(fx.karma);
    if ('heal' in fx) state.heal(fx.heal);
    if ('damage' in fx) state.damage(fx.damage);
    if ('ammo' in fx) state.addAmmo(fx.ammo);

    if ('startJob' in fx) ctx.jobs?.start(fx.startJob);
    if ('completeJob' in fx) ctx.jobs?.complete(fx.completeJob);
    if ('failJob' in fx) ctx.jobs?.fail(fx.failJob);
    if ('completeObjective' in fx) ctx.jobs?.forceObjective(fx.completeObjective);

    if ('unlock' in fx) {
      state.setFlag(`unlocked:${fx.unlock}`, true);
      bus.emit(EV.DOOR_OPENED, { id: fx.unlock });
    }
    if ('spawn' in fx) ctx.scene?.spawnEntity?.(fx.spawn);
    if ('toast' in fx) bus.emit(EV.TOAST, { text: fx.toast });
    if ('warp' in fx) ctx.scene?.warpTo?.(fx.warp);
  }
}
