import {
  useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode,
} from 'react';
import {
  OBJECTIVE_TYPES, RESOURCE_NAMES, validateProject,
  type ContentProject, type ResourceName, type ValidationIssue,
} from '@neon-divide/content';

import { loadProject, saveProject } from './api';
import {
  commitHistory, connectableRooms, createActor, createDialogue, createHistory,
  createItem, createJob, createRoom, dirtyResourceNames, freeDirections,
  idError, layoutRooms, paintTile, redoHistory, resourceValue, undoHistory,
} from './model.js';

type Section = 'world' | 'rooms' | 'actors' | 'items' | 'dialogues' | 'jobs';
type History = ReturnType<typeof createHistory>;
type LooseRecord = Record<string, any>;

const SECTION_RESOURCE: Record<Section, ResourceName> = {
  world: 'levels',
  rooms: 'rooms',
  actors: 'actors',
  items: 'items',
  dialogues: 'dialogues',
  jobs: 'jobs',
};

const NAV: Array<{ id: Section; label: string; icon: string }> = [
  { id: 'world', label: 'World', icon: '⌘' },
  { id: 'rooms', label: 'Rooms', icon: '▦' },
  { id: 'actors', label: 'Actors', icon: '♟' },
  { id: 'items', label: 'Items', icon: '◆' },
  { id: 'dialogues', label: 'Dialogue', icon: '◈' },
  { id: 'jobs', label: 'Jobs', icon: '✓' },
];

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

function Empty({ children }: { children: ReactNode }) {
  return <div className="empty-state"><span>◇</span><p>{children}</p></div>;
}

function JsonEditor({ label, value, onChange }: { label: string; value: unknown; onChange: (value: any) => void }) {
  const [text, setText] = useState(() => JSON.stringify(value, null, 2));
  const [error, setError] = useState('');
  useEffect(() => setText(JSON.stringify(value, null, 2)), [value]);
  return (
    <Field label={label} hint={error || 'Valid JSON applies when focus leaves the field.'}>
      <textarea
        className={error ? 'invalid' : ''}
        value={text}
        rows={9}
        onChange={(event) => setText(event.target.value)}
        onBlur={() => {
          try {
            onChange(JSON.parse(text));
            setError('');
          } catch {
            setError('Invalid JSON — the draft was not applied.');
          }
        }}
      />
    </Field>
  );
}

/**
 * One field of a new-record form. `options` turns it into a picker, which is
 * how every cross-reference (rooms, sheets, icons) is kept to IDs that already
 * exist rather than free text the validator would later reject.
 */
interface NewField {
  key: string;
  label: string;
  /** A function when the legal choices depend on another field's value. */
  options?: string[] | ((values: LooseRecord) => string[]);
  optionLabel?: (value: string) => string;
  hint?: string;
  optional?: boolean;
}

/**
 * Creates a top-level record: a room, actor archetype, item, dialogue graph or
 * job. These used to require hand-editing packages/content/data/*.json and
 * reloading, because the editor could only ever edit records that existed.
 *
 * Everything it produces is valid on arrival - the point is to land in a
 * saveable project, not to leave the author fixing validation errors.
 */
function NewRecordDialog({
  project, kind, title, fields, initial, onCancel, onCreate,
}: {
  project: ContentProject; kind: string; title: string; fields: NewField[];
  initial: LooseRecord; onCancel: () => void;
  onCreate: (values: LooseRecord) => void;
}) {
  const [values, setValues] = useState<LooseRecord>(() => ({ id: '', ...initial }));
  const set = (key: string, value: string) => setValues((current) => ({ ...current, [key]: value }));

  const optionsFor = (field: NewField) => (typeof field.options === 'function' ? field.options(values) : field.options);

  // A field whose choices depend on another field can hold a value that is no
  // longer legal once that other field changes. Fall back to the first legal
  // choice so what gets submitted is always what the form is showing.
  const effective: LooseRecord = { ...values };
  for (const field of fields) {
    const options = optionsFor(field);
    if (options && !(field.optional && !effective[field.key]) && !options.includes(effective[field.key])) {
      effective[field.key] = options[0] ?? '';
    }
  }

  const badId = idError(project, kind, values.id);
  const blank = fields.find((field) => !field.optional && !String(effective[field.key] ?? '').trim());
  const problem = badId ?? (blank ? `${blank.label} is required.` : null);

  const submit = () => { if (!problem) onCreate(effective); };

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div
        className="modal"
        role="dialog"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onCancel();
          if (event.key === 'Enter' && !(event.target as HTMLElement).matches('textarea')) submit();
        }}
      >
        <div className="modal-head"><span className="eyebrow">CREATE</span><h2>{title}</h2></div>
        <Field label="ID" hint={badId ?? 'Referenced by other records — it cannot be renamed here later.'}>
          <input
            autoFocus
            className={values.id && badId ? 'invalid' : ''}
            value={values.id}
            placeholder="new_id"
            onChange={(event) => set('id', event.target.value)}
          />
        </Field>
        {fields.map((field) => {
          const options = optionsFor(field);
          return (
            <Field label={field.label} key={field.key} hint={field.hint}>
              {options
                ? (
                  <select value={effective[field.key] ?? ''} onChange={(event) => set(field.key, event.target.value)}>
                    {field.optional && <option value="">None</option>}
                    {options.map((option) => <option value={option} key={option}>{field.optionLabel?.(option) ?? option}</option>)}
                  </select>
                )
                : <input value={values[field.key] ?? ''} onChange={(event) => set(field.key, event.target.value)} />}
            </Field>
          );
        })}
        <div className="modal-actions">
          <button className="text-button" onClick={onCancel}>Cancel</button>
          <button className="save-button" disabled={Boolean(problem)} title={problem ?? ''} onClick={submit}>Create</button>
        </div>
      </div>
    </div>
  );
}

function SearchList({
  title, items, selected, onSelect, detail, onNew,
}: {
  title: string; items: string[]; selected: string; onSelect: (id: string) => void;
  detail?: (id: string) => string; onNew?: () => void;
}) {
  const [search, setSearch] = useState('');
  const visible = items.filter((id) => `${id} ${detail?.(id) ?? ''}`.toLowerCase().includes(search.toLowerCase()));
  return (
    <aside className="resource-list">
      <div className="resource-list-head">
        <strong>{title}</strong>
        {onNew ? <button className="new-button" onClick={onNew} title={`New ${title.replace(/s$/, '').toLowerCase()}`}>＋ New</button> : <span>{items.length}</span>}
      </div>
      <div className="search"><span>⌕</span><input aria-label={`Search ${title}`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Filter…" /></div>
      <div className="resource-scroll">
        {visible.map((id) => (
          <button key={id} className={selected === id ? 'resource active' : 'resource'} onClick={() => onSelect(id)}>
            <span className="resource-mark" />
            <span><strong>{detail?.(id) || id}</strong><small>{id}</small></span>
          </button>
        ))}
      </div>
    </aside>
  );
}

interface TileMeta {
  columns: number;
  tiles: Array<{ id: number; name: string; solid: boolean; tags: string[] }>;
}

function spriteStyle(tileName: string | undefined, meta: TileMeta | null): CSSProperties {
  const tile = meta?.tiles.find((entry) => entry.name === tileName);
  if (!tile || !meta) return {};
  const col = tile.id % meta.columns;
  const row = Math.floor(tile.id / meta.columns);
  return {
    backgroundImage: 'url(/assets/tiles_neokyoto.png)',
    backgroundSize: `${meta.columns * 32}px auto`,
    backgroundPosition: `${-col * 32}px ${-row * 32}px`,
  };
}

function RoomEditor({
  project, roomId, onRoomId, onChange,
}: {
  project: ContentProject; roomId: string; onRoomId: (id: string) => void;
  onChange: (project: ContentProject) => void;
}) {
  const [layer, setLayer] = useState<'ground' | 'decor'>('decor');
  const [tile, setTile] = useState('D');
  const [meta, setMeta] = useState<TileMeta | null>(null);
  const [spawnIndex, setSpawnIndex] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  useEffect(() => { fetch('/assets/tiles_neokyoto.json').then((response) => response.json()).then(setMeta); }, []);
  useEffect(() => setSpawnIndex(null), [roomId]);

  const room = project.rooms[roomId];
  if (!room) return <Empty>Select a room to begin editing.</Empty>;
  const selectedSpawn = spawnIndex === null ? null : room.spawns?.[spawnIndex] as LooseRecord | undefined;
  const updateRoom = (patch: LooseRecord) => {
    const next = structuredClone(project);
    Object.assign(next.rooms[roomId], patch);
    onChange(next);
  };
  const updateSpawn = (patch: LooseRecord) => {
    if (spawnIndex === null) return;
    const spawns = structuredClone(room.spawns ?? []);
    spawns[spawnIndex] = { ...spawns[spawnIndex], ...patch };
    updateRoom({ spawns });
  };
  const actorOptions = selectedSpawn?.type === 'npc'
    ? Object.keys(project.actors.npcs) : Object.keys(project.actors.enemies);
  return (
    <div className="editor-grid room-editor">
      <SearchList title="Rooms" items={Object.keys(project.rooms)} selected={roomId} onSelect={onRoomId} detail={(id) => project.rooms[id].name} onNew={() => setCreating(true)} />
      {creating && (
        <NewRecordDialog
          project={project}
          kind="room"
          title="New room"
          initial={{ name: '', connectTo: roomId, direction: '' }}
          fields={[
            { key: 'name', label: 'Display name' },
            {
              key: 'connectTo',
              label: 'Connects to',
              options: connectableRooms(project),
              optionLabel: (id) => project.rooms[id].name,
              hint: 'Only rooms with a free side are listed.',
            },
            {
              key: 'direction',
              label: 'Lies to the',
              // Directions already in use would otherwise be overwritten,
              // stranding whatever they led to.
              options: (values) => freeDirections(project, values.connectTo),
              hint: 'Both exits are wired, and the new room gets a doorway on the facing wall. The room you connect from may need one painted to match.',
            },
          ]}
          onCancel={() => setCreating(false)}
          onCreate={(values) => {
            onChange(createRoom(project, values as any));
            onRoomId(values.id);
            setSpawnIndex(null);
            setCreating(false);
          }}
        />
      )}
      <main className="canvas-panel">
        <div className="panel-toolbar">
          <div className="segmented">
            <button className={layer === 'ground' ? 'active' : ''} onClick={() => setLayer('ground')}>Ground</button>
            <button className={layer === 'decor' ? 'active' : ''} onClick={() => setLayer('decor')}>Decor</button>
          </div>
          <span className="toolbar-note">20 × 15 · click to paint · right-click to pick</span>
        </div>
        <div className="room-stage">
          <div className="room-canvas" role="grid" aria-label={`${room.name} ${layer} layer`}>
            {Array.from({ length: 15 }, (_, y) => Array.from({ length: 20 }, (__, x) => {
              const char = room[layer][y][x];
              const name = project.tiles.legend[char];
              const spawn = (room.spawns ?? []).findIndex((entry) => entry.x === x && entry.y === y);
              return (
                <button
                  role="gridcell"
                  aria-label={`${x}, ${y}: ${name ?? 'empty'}`}
                  className={`map-cell ${char === ' ' ? 'empty' : ''}`}
                  key={`${x}-${y}`}
                  style={spriteStyle(name, meta)}
                  onClick={() => onChange(paintTile(project, roomId, layer, x, y, tile))}
                  onContextMenu={(event) => { event.preventDefault(); setTile(char); }}
                >
                  {spawn >= 0 && <span className={`spawn-pin ${room.spawns?.[spawn].type}`} onClick={(event) => { event.stopPropagation(); setSpawnIndex(spawn); }}>{spawn + 1}</span>}
                </button>
              );
            }))}
          </div>
          <div className="coordinate-readout">Origin 0,0 <span>Layer: {layer}</span></div>
        </div>
        <section className="tile-dock">
          <div className="tile-dock-head"><strong>Tile palette</strong><span>{Object.keys(project.tiles.legend).length} tiles</span></div>
          <div className="tile-palette">
            <button className={tile === ' ' ? 'tile-choice active empty-tile' : 'tile-choice empty-tile'} onClick={() => setTile(' ')} title="Eraser">×</button>
            {Object.entries(project.tiles.legend).map(([character, name]) => (
              <button key={character} title={`${character} · ${name}`} onClick={() => setTile(character)} className={tile === character ? 'tile-choice active' : 'tile-choice'} style={spriteStyle(name, meta)}>
                <span>{character}</span>
              </button>
            ))}
          </div>
        </section>
      </main>
      <aside className="inspector">
        <div className="inspector-title"><span>Room inspector</span><small>{roomId}</small></div>
        <Field label="Display name"><input value={room.name} onChange={(event) => updateRoom({ name: event.target.value })} /></Field>
        <div className="field-row">
          <Field label="Start X"><input type="number" min="0" max="19" value={room.spawn?.[0] ?? 10} onChange={(event) => updateRoom({ spawn: [Number(event.target.value), room.spawn?.[1] ?? 7] })} /></Field>
          <Field label="Start Y"><input type="number" min="0" max="14" value={room.spawn?.[1] ?? 7} onChange={(event) => updateRoom({ spawn: [room.spawn?.[0] ?? 10, Number(event.target.value)] })} /></Field>
        </div>
        <div className="inspector-section">
          <div className="section-heading"><strong>Connections</strong><small>Edge exits</small></div>
          {(['north', 'east', 'south', 'west'] as const).map((direction) => (
            <Field key={direction} label={direction}>
              <select value={room.exits?.[direction] ?? ''} onChange={(event) => {
                const exits = { ...(room.exits ?? {}) };
                if (event.target.value) exits[direction] = event.target.value;
                else delete exits[direction];
                updateRoom({ exits });
              }}>
                <option value="">No exit</option>
                {Object.keys(project.rooms).filter((id) => id !== roomId).map((id) => <option value={id} key={id}>{project.rooms[id].name}</option>)}
              </select>
            </Field>
          ))}
        </div>
        <div className="inspector-section">
          <div className="section-heading"><strong>Entities</strong><button className="text-button" onClick={() => {
            const spawns = [...(room.spawns ?? []), { type: 'pickup', item: Object.keys(project.items)[0], x: 10, y: 7 }];
            updateRoom({ spawns }); setSpawnIndex(spawns.length - 1);
          }}>+ Add</button></div>
          <div className="entity-list">
            {(room.spawns ?? []).map((spawn, index) => <button className={spawnIndex === index ? 'entity-row active' : 'entity-row'} key={`${spawn.type}-${index}`} onClick={() => setSpawnIndex(index)}><span>{index + 1}</span><strong>{spawn.id ?? spawn.archetype ?? spawn.item ?? spawn.type}</strong><small>{spawn.x},{spawn.y}</small></button>)}
          </div>
          {selectedSpawn && (
            <div className="entity-form">
              <Field label="Type"><select value={selectedSpawn.type} onChange={(event) => updateSpawn({ type: event.target.value })}>{['enemy', 'npc', 'pickup', 'door', 'terminal'].map((type) => <option key={type}>{type}</option>)}</select></Field>
              <div className="field-row"><Field label="X"><input type="number" min="0" max="19" value={selectedSpawn.x} onChange={(event) => updateSpawn({ x: Number(event.target.value) })} /></Field><Field label="Y"><input type="number" min="0" max="14" value={selectedSpawn.y} onChange={(event) => updateSpawn({ y: Number(event.target.value) })} /></Field></div>
              {(selectedSpawn.type === 'enemy' || selectedSpawn.type === 'npc') && <Field label="Archetype"><select value={selectedSpawn.archetype ?? ''} onChange={(event) => updateSpawn({ archetype: event.target.value })}>{actorOptions.map((id) => <option key={id}>{id}</option>)}</select></Field>}
              {selectedSpawn.type === 'pickup' && <Field label="Item"><select value={selectedSpawn.item ?? ''} onChange={(event) => updateSpawn({ item: event.target.value })}>{Object.keys(project.items).map((id) => <option key={id}>{id}</option>)}</select></Field>}
              <button className="danger text-button" onClick={() => { updateRoom({ spawns: room.spawns?.filter((_, index) => index !== spawnIndex) }); setSpawnIndex(null); }}>Remove entity</button>
              <JsonEditor label="Advanced properties" value={selectedSpawn} onChange={(value) => {
                const spawns = structuredClone(room.spawns ?? []); spawns[spawnIndex!] = value; updateRoom({ spawns });
              }} />
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

function WorldEditor({ project, onOpenRoom }: { project: ContentProject; onOpenRoom: (id: string) => void }) {
  const level = project.levels[project.manifest.levels[0]];
  const positions = layoutRooms(project.rooms, level.start) as Record<string, { x: number; y: number }>;
  const values = Object.values(positions) as Array<{ x: number; y: number }>;
  const minX = Math.min(...values.map((entry) => entry.x));
  const minY = Math.min(...values.map((entry) => entry.y));
  const point = (id: string) => ({ x: (positions[id].x - minX) * 210 + 130, y: (positions[id].y - minY) * 140 + 90 });
  const edges = new Map<string, { from: string; to: string; label: string }>();
  for (const [id, room] of Object.entries(project.rooms)) {
    for (const [direction, target] of Object.entries(room.exits ?? {})) {
      const key = [id, target].sort().join('::');
      if (!edges.has(key)) edges.set(key, { from: id, to: target, label: direction });
    }
    for (const spawn of room.spawns ?? []) {
      if (spawn.type !== 'door' || !spawn.to) continue;
      const key = [id, spawn.to as string].sort().join('::');
      if (!edges.has(key)) edges.set(key, { from: id, to: spawn.to as string, label: 'door' });
    }
  }
  return (
    <div className="world-view">
      <div className="world-summary">
        <div><span>LEVEL</span><strong>{level.name}</strong><small>{level.id}</small></div>
        <div><span>ROOMS</span><strong>{level.rooms.length}</strong><small>all reachable</small></div>
        <div><span>START</span><strong>{project.rooms[level.start].name}</strong><small>{level.start}</small></div>
      </div>
      <div className="graph-card">
        <div className="graph-head"><div><span className="eyebrow">WORLD TOPOLOGY</span><h2>Kagemori Sprawl</h2></div><p>Connections are derived from room exits. Select a node to edit its layout and entities.</p></div>
        <svg className="world-graph" viewBox="0 0 1050 600" preserveAspectRatio="xMidYMid meet">
          <defs><filter id="glow"><feGaussianBlur stdDeviation="3" result="coloredBlur"/><feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
          {[...edges.values()].map(({ from, to, label }) => {
            const a = point(from); const b = point(to);
            return <g key={`${from}-${to}`}><line className={label === 'door' ? 'graph-line door' : 'graph-line'} x1={a.x} y1={a.y} x2={b.x} y2={b.y}/><text className="graph-edge-label" x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 8}>{label}</text></g>;
          })}
          {Object.keys(project.rooms).map((id) => {
            const p = point(id); const room = project.rooms[id]; const start = id === level.start;
            return <g className="graph-node" key={id} transform={`translate(${p.x - 76} ${p.y - 31})`} onClick={() => onOpenRoom(id)}><rect width="152" height="62" rx="4" className={start ? 'start' : ''}/><circle cx="16" cy="16" r="4" className="node-light"/><text x="18" y="36" className="node-name">{room.name}</text><text x="18" y="51" className="node-id">{id} · {room.spawns?.length ?? 0} entities</text></g>;
          })}
        </svg>
        <div className="graph-legend"><span><i className="start-dot"/>Start room</span><span><i/>Connected room</span><span>Click any node to open</span></div>
      </div>
    </div>
  );
}

function RecordForm({
  title, subtitle, record, onChange,
}: { title: string; subtitle: string; record: LooseRecord; onChange: (record: LooseRecord) => void }) {
  const simple = Object.entries(record).filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value));
  const nested = Object.fromEntries(Object.entries(record).filter(([, value]) => !['string', 'number', 'boolean'].includes(typeof value)));
  return (
    <div className="form-workspace">
      <div className="form-hero"><span className="eyebrow">{subtitle}</span><h2>{title}</h2><p>Changes stay in the editor until the project is explicitly saved.</p></div>
      <div className="form-card">
        <div className="form-columns">
          {simple.map(([key, value]) => (
            <Field label={key} key={key}>
              {typeof value === 'boolean'
                ? <input type="checkbox" checked={value} onChange={(event) => onChange({ ...record, [key]: event.target.checked })} />
                : <input type={typeof value === 'number' ? 'number' : 'text'} value={String(value)} onChange={(event) => onChange({ ...record, [key]: typeof value === 'number' ? Number(event.target.value) : event.target.value })} />}
            </Field>
          ))}
        </div>
        {Object.keys(nested).length > 0 && <JsonEditor label="Structured properties" value={nested} onChange={(value) => onChange({ ...record, ...value })} />}
      </div>
    </div>
  );
}

/**
 * Sheets, icons and portraits are generated art keyed by name, so the only
 * safe choices are the ones already in use - a new one needs a change to
 * tools/gen_actors.py (or the icon/portrait generators) and `npm run assets`.
 */
function sheetOptions(project: ContentProject) {
  const actors = [...Object.values(project.actors.enemies), ...Object.values(project.actors.npcs)];
  return [...new Set(actors.map((actor) => actor.sheet as string))].sort();
}

function ActorsEditor({ project, onChange }: { project: ContentProject; onChange: (project: ContentProject) => void }) {
  const [category, setCategory] = useState<'enemies' | 'npcs'>('enemies');
  const ids = Object.keys(project.actors[category]);
  const [selected, setSelected] = useState(ids[0]);
  const [creating, setCreating] = useState(false);
  useEffect(() => { if (!project.actors[category][selected]) setSelected(Object.keys(project.actors[category])[0]); }, [category, project, selected]);
  const update = (record: LooseRecord) => { const next = structuredClone(project); next.actors[category][selected] = record; onChange(next); };
  const kind = category === 'enemies' ? 'enemy' : 'npc';
  return (
    <div className="editor-grid">
      <aside className="resource-list"><div className="resource-list-head"><strong>Actors</strong><div className="mini-tabs"><button className={category === 'enemies' ? 'active' : ''} onClick={() => setCategory('enemies')}>Enemies</button><button className={category === 'npcs' ? 'active' : ''} onClick={() => setCategory('npcs')}>NPCs</button></div><button className="new-button" onClick={() => setCreating(true)} title={`New ${kind} archetype`}>＋</button></div><div className="resource-scroll">{ids.map((id) => <button className={selected === id ? 'resource active' : 'resource'} key={id} onClick={() => setSelected(id)}><span className="resource-mark"/><span><strong>{project.actors[category][id].name as string}</strong><small>{id}</small></span></button>)}</div></aside>
      {creating && (
        <NewRecordDialog
          project={project}
          kind={kind}
          title={category === 'enemies' ? 'New enemy archetype' : 'New NPC archetype'}
          initial={{ name: '', sheet: sheetOptions(project)[0] }}
          fields={[
            { key: 'name', label: 'Display name' },
            {
              key: 'sheet',
              label: 'Sprite sheet',
              options: sheetOptions(project),
              hint: 'Generated art. A new sheet needs a spec in tools/gen_actors.py and `npm run assets`.',
            },
          ]}
          onCancel={() => setCreating(false)}
          onCreate={(values) => {
            onChange(createActor(project, category, values as any));
            setSelected(values.id);
            setCreating(false);
          }}
        />
      )}
      {selected && <RecordForm title={project.actors[category][selected].name as string} subtitle={`${category === 'enemies' ? 'enemy' : 'NPC'} archetype · ${selected}`} record={project.actors[category][selected]} onChange={update} />}
      <aside className="inspector reference-panel"><div className="inspector-title"><span>References</span></div><p>Actor IDs are offered as searchable choices in room spawns and job objectives.</p><div className="stat-line"><span>Enemy archetypes</span><strong>{Object.keys(project.actors.enemies).length}</strong></div><div className="stat-line"><span>NPC archetypes</span><strong>{Object.keys(project.actors.npcs).length}</strong></div></aside>
    </div>
  );
}

function ItemsEditor({ project, onChange }: { project: ContentProject; onChange: (project: ContentProject) => void }) {
  const ids = Object.keys(project.items);
  const [selected, setSelected] = useState(ids[0]);
  const [creating, setCreating] = useState(false);
  const icons = [...new Set(ids.map((id) => project.items[id].icon as string))].sort();
  const update = (record: LooseRecord) => { const next = structuredClone(project); next.items[selected] = record; onChange(next); };
  return <div className="editor-grid"><SearchList title="Items" items={ids} selected={selected} onSelect={setSelected} detail={(id) => project.items[id].name as string} onNew={() => setCreating(true)}/>
    {creating && (
      <NewRecordDialog
        project={project}
        kind="item"
        title="New item"
        initial={{ name: '', icon: icons[0], desc: '' }}
        fields={[
          { key: 'name', label: 'Display name' },
          { key: 'icon', label: 'Icon', options: icons, hint: 'Generated art, drawn by tools/gen_fx.py.' },
          { key: 'desc', label: 'Description' },
        ]}
        onCancel={() => setCreating(false)}
        onCreate={(values) => { onChange(createItem(project, values as any)); setSelected(values.id); setCreating(false); }}
      />
    )}
    <RecordForm title={project.items[selected].name as string} subtitle={`item definition · ${selected}`} record={project.items[selected]} onChange={update}/><aside className="inspector reference-panel"><div className="inspector-title"><span>Item preview</span></div><div className="item-glyph">◆</div><h3>{project.items[selected].name as string}</h3><p>{project.items[selected].desc as string}</p><div className="tag-row"><span>{project.items[selected].icon as string}</span>{Boolean(project.items[selected].consumeOnPickup) && <span>consumable</span>}</div></aside></div>;
}

function DialogueEditor({ project, onChange }: { project: ContentProject; onChange: (project: ContentProject) => void }) {
  const graphIds = Object.keys(project.dialogues);
  const [selected, setSelected] = useState(graphIds[0]);
  const [creating, setCreating] = useState(false);
  const portraits = [...new Set(graphIds.map((id) => (project.dialogues[id] as LooseRecord).portrait).filter(Boolean))].sort() as string[];
  const graph = project.dialogues[selected] as LooseRecord;
  const nodeIds = Object.keys(graph.nodes ?? {});
  const [nodeId, setNodeId] = useState(nodeIds[0]);
  useEffect(() => setNodeId(Object.keys((project.dialogues[selected] as LooseRecord).nodes ?? {})[0]), [selected, project.dialogues]);
  const node = graph.nodes?.[nodeId] as LooseRecord | undefined;
  const updateGraph = (nextGraph: LooseRecord) => { const next = structuredClone(project); next.dialogues[selected] = nextGraph; onChange(next); };
  const updateNode = (patch: LooseRecord) => updateGraph({ ...graph, nodes: { ...graph.nodes, [nodeId]: { ...node, ...patch } } });
  return (
    <div className="editor-grid graph-editor">
      <SearchList title="Dialogue graphs" items={graphIds} selected={selected} onSelect={setSelected} detail={(id) => (project.dialogues[id] as LooseRecord).speaker ?? id} onNew={() => setCreating(true)}/>
      {creating && (
        <NewRecordDialog
          project={project}
          kind="dialogue"
          title="New dialogue graph"
          initial={{ speaker: '', portrait: '' }}
          fields={[
            { key: 'speaker', label: 'Speaker name' },
            { key: 'portrait', label: 'Portrait', options: portraits, optional: true, hint: 'Generated art, drawn by tools/gen_fx.py.' },
          ]}
          onCancel={() => setCreating(false)}
          onCreate={(values) => { onChange(createDialogue(project, values as any)); setSelected(values.id); setCreating(false); }}
        />
      )}
      <main className="dialogue-workspace">
        <div className="graph-head"><div><span className="eyebrow">DIALOGUE GRAPH</span><h2>{selected}</h2></div><span className="speaker-chip">{graph.speaker ?? 'Narrator'}</span></div>
        <div className="node-flow">
          {nodeIds.map((id, index) => {
            const item = graph.nodes[id]; const choices = item.choices ?? [];
            return <button key={id} className={nodeId === id ? 'dialogue-node active' : 'dialogue-node'} onClick={() => setNodeId(id)}><span className="node-index">{String(index + 1).padStart(2, '0')}</span><strong>{id}</strong><p>{Array.isArray(item.text) ? item.text[0] : item.text ?? 'No text'}</p><small>{choices.length} choices · {item.next ? `→ ${item.next}` : choices.length ? 'branch' : 'end'}</small></button>;
          })}
          <button className="add-node" onClick={() => {
            let id = 'new_node'; let suffix = 2; while (graph.nodes[id]) id = `new_node_${suffix++}`;
            updateGraph({ ...graph, nodes: { ...graph.nodes, [id]: { text: 'New dialogue node.', choices: [{ text: 'End conversation.', end: true }] } } }); setNodeId(id);
          }}>＋ Add node</button>
        </div>
      </main>
      <aside className="inspector">
        <div className="inspector-title"><span>Node inspector</span><small>{nodeId}</small></div>
        {node && <>
          <Field label="Text"><textarea rows={5} value={Array.isArray(node.text) ? node.text.join('\n') : node.text ?? ''} onChange={(event) => updateNode({ text: event.target.value.split('\n') })}/></Field>
          <Field label="Next node"><select value={node.next ?? ''} onChange={(event) => updateNode({ next: event.target.value || undefined })}><option value="">Choice / end</option>{nodeIds.filter((id) => id !== nodeId).map((id) => <option key={id}>{id}</option>)}</select></Field>
          <JsonEditor label="Choices" value={node.choices ?? []} onChange={(choices) => updateNode({ choices })}/>
          <JsonEditor label="On enter effects" value={node.onEnter ?? []} onChange={(onEnter) => updateNode({ onEnter })}/>
          <button className="danger text-button" disabled={nodeId === graph.start} onClick={() => { const nodes = { ...graph.nodes }; delete nodes[nodeId]; updateGraph({ ...graph, nodes }); setNodeId(Object.keys(nodes)[0]); }}>Remove node</button>
        </>}
      </aside>
    </div>
  );
}

function JobsEditor({ project, onChange }: { project: ContentProject; onChange: (project: ContentProject) => void }) {
  const jobIds = Object.keys(project.jobs);
  const [selected, setSelected] = useState(jobIds[0]);
  const [creating, setCreating] = useState(false);
  const job = project.jobs[selected] as LooseRecord;
  const [objectiveIndex, setObjectiveIndex] = useState(0);
  const objective = job.objectives?.[objectiveIndex] as LooseRecord | undefined;
  const updateJob = (nextJob: LooseRecord) => { const next = structuredClone(project); next.jobs[selected] = nextJob; onChange(next); };
  const updateObjective = (patch: LooseRecord) => {
    const objectives = structuredClone(job.objectives); objectives[objectiveIndex] = { ...objectives[objectiveIndex], ...patch }; updateJob({ ...job, objectives });
  };
  return (
    <div className="editor-grid graph-editor">
      <SearchList title="Jobs" items={jobIds} selected={selected} onSelect={(id) => { setSelected(id); setObjectiveIndex(0); }} detail={(id) => (project.jobs[id] as LooseRecord).title} onNew={() => setCreating(true)}/>
      {creating && (
        <NewRecordDialog
          project={project}
          kind="job"
          title="New job"
          initial={{ title: '' }}
          fields={[{ key: 'title', label: 'Job title', hint: 'A first objective is seeded — a job with none completes the moment it starts.' }]}
          onCancel={() => setCreating(false)}
          onCreate={(values) => {
            const level = project.levels[project.manifest.levels[0]];
            onChange(createJob(project, { ...values, startRoom: level.start } as any));
            setSelected(values.id);
            setObjectiveIndex(0);
            setCreating(false);
          }}
        />
      )}
      <main className="dialogue-workspace">
        <div className="graph-head"><div><span className="eyebrow">OBJECTIVE GRAPH</span><h2>{job.title}</h2></div><span className="speaker-chip">{job.payment?.nuyen ?? 0} ¥</span></div>
        <div className="objective-flow">
          {(job.objectives ?? []).map((item: LooseRecord, index: number) => <div className="objective-wrap" key={item.id}>{index > 0 && <span className="objective-link">→</span>}<button className={objectiveIndex === index ? 'objective-node active' : 'objective-node'} onClick={() => setObjectiveIndex(index)}><span>{item.optional ? 'BONUS' : `STEP ${index + 1}`}</span><strong>{item.text}</strong><small>{item.type} · {item.id}</small>{(item.requires ?? []).length > 0 && <em>after {item.requires.join(', ')}</em>}</button></div>)}
          <button className="add-node" onClick={() => { const objectives = [...job.objectives, { id: `step${job.objectives.length + 1}`, type: 'reach', room: Object.keys(project.rooms)[0], text: 'New objective' }]; updateJob({ ...job, objectives }); setObjectiveIndex(objectives.length - 1); }}>＋ Add objective</button>
        </div>
      </main>
      <aside className="inspector">
        <div className="inspector-title"><span>Objective inspector</span><small>{objective?.id}</small></div>
        {objective && <>
          <Field label="ID"><input value={objective.id} onChange={(event) => updateObjective({ id: event.target.value })}/></Field>
          <Field label="Player-facing text"><textarea rows={3} value={objective.text ?? ''} onChange={(event) => updateObjective({ text: event.target.value })}/></Field>
          <Field label="Type"><select value={objective.type} onChange={(event) => updateObjective({ type: event.target.value })}>{OBJECTIVE_TYPES.map((type) => <option key={type}>{type}</option>)}</select></Field>
          {objective.type === 'reach' && <Field label="Room"><select value={objective.room ?? ''} onChange={(event) => updateObjective({ room: event.target.value })}>{Object.keys(project.rooms).map((id) => <option key={id}>{id}</option>)}</select></Field>}
          {['collect', 'deliver'].includes(objective.type) && <Field label="Item"><select value={objective.item ?? ''} onChange={(event) => updateObjective({ item: event.target.value })}>{Object.keys(project.items).map((id) => <option key={id}>{id}</option>)}</select></Field>}
          {objective.type === 'kill' && <Field label="Enemy"><select value={objective.archetype ?? ''} onChange={(event) => updateObjective({ archetype: event.target.value })}><option value="">Any enemy</option>{Object.keys(project.actors.enemies).map((id) => <option key={id}>{id}</option>)}</select></Field>}
          <Field label="Requires"><select multiple value={objective.requires ?? []} onChange={(event) => updateObjective({ requires: [...event.target.selectedOptions].map((option) => option.value) })}>{job.objectives.filter((item: LooseRecord) => item.id !== objective.id).map((item: LooseRecord) => <option key={item.id}>{item.id}</option>)}</select></Field>
          <JsonEditor label="Advanced properties" value={objective} onChange={(value) => {
            const objectives = structuredClone(job.objectives); objectives[objectiveIndex] = value; updateJob({ ...job, objectives });
          }}/>
        </>}
      </aside>
    </div>
  );
}

function ValidationDrawer({ issues, open, onToggle, onIssue }: { issues: ValidationIssue[]; open: boolean; onToggle: () => void; onIssue: (issue: ValidationIssue) => void }) {
  const errors = issues.filter((issue) => issue.severity === 'error').length;
  const warnings = issues.length - errors;
  return <section className={open ? 'validation-drawer open' : 'validation-drawer'}><button className="validation-bar" onClick={onToggle}><span className={errors ? 'status error' : 'status ok'}>{errors ? '!' : '✓'}</span><strong>{errors ? `${errors} validation errors` : 'Project valid'}</strong><span>{warnings} warnings</span><i>{open ? '⌄' : '⌃'}</i></button>{open && <div className="issue-list">{issues.length === 0 ? <p className="all-clear">All structural and cross-reference checks pass.</p> : issues.map((issue, index) => <button key={`${issue.path}-${index}`} onClick={() => onIssue(issue)}><span className={`issue-severity ${issue.severity}`}>{issue.severity === 'error' ? '!' : '△'}</span><span><strong>{issue.message}</strong><small>{issue.path} · {issue.code}</small></span></button>)}</div>}</section>;
}

export function App() {
  const [history, setHistory] = useState<History | null>(null);
  const [baseline, setBaseline] = useState<ContentProject | null>(null);
  const [revisions, setRevisions] = useState<any>(null);
  const [section, setSection] = useState<Section>('world');
  const [roomId, setRoomId] = useState('plaza');
  const [validationOpen, setValidationOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(true);
  const project = history?.present as ContentProject | undefined;

  const reload = useCallback(async () => {
    setBusy(true);
    try {
      const data = await loadProject();
      setHistory(createHistory(data.project));
      setBaseline(structuredClone(data.project));
      setRevisions(data.revisions);
      setNotice('Content loaded from disk.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    } finally { setBusy(false); }
  }, []);
  useEffect(() => { reload(); }, [reload]);

  const validation = useMemo(() => project ? validateProject(project) : { valid: false, issues: [] }, [project]);
  const dirty = useMemo(() => project && baseline ? dirtyResourceNames(project, baseline, RESOURCE_NAMES) as ResourceName[] : [], [project, baseline]);
  const commit = (next: ContentProject) => setHistory((current) => current ? commitHistory(current, next) : current);
  const save = useCallback(async () => {
    if (!project || !baseline || !revisions || dirty.length === 0) return;
    if (!validation.valid) { setValidationOpen(true); setNotice('Resolve validation errors before saving.'); return; }
    setBusy(true);
    try {
      const changes = Object.fromEntries(dirty.map((name) => [name, resourceValue(project, name)]));
      const data = await saveProject(changes, revisions);
      setHistory(createHistory(data.project));
      setBaseline(structuredClone(data.project));
      setRevisions(data.revisions);
      setNotice(`Saved ${dirty.length} resource${dirty.length === 1 ? '' : 's'} atomically.`);
    } catch (error: any) {
      if (error.issues) setValidationOpen(true);
      setNotice(error.message);
    } finally { setBusy(false); }
  }, [project, baseline, revisions, dirty, validation.valid]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      if (event.key.toLowerCase() === 's') { event.preventDefault(); save(); }
      if (event.key.toLowerCase() === 'z') { event.preventDefault(); setHistory((current) => current ? undoHistory(current) : current); }
      if (event.key.toLowerCase() === 'y') { event.preventDefault(); setHistory((current) => current ? redoHistory(current) : current); }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [save]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => { if (dirty.length) event.preventDefault(); };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty.length]);

  if (!project || !history) return <div className="loading-screen"><div className="logo-mark">N<span>D</span></div><p>{busy ? 'Loading content workspace…' : notice}</p><button onClick={reload}>Retry</button></div>;
  const openIssue = (issue: ValidationIssue) => {
    const root = issue.path.split('.')[0];
    const target = (Object.entries(SECTION_RESOURCE).find(([, resource]) => resource === root)?.[0] ?? 'world') as Section;
    setSection(target);
    if (root === 'rooms' && project.rooms[issue.path.split('.')[1]]) setRoomId(issue.path.split('.')[1]);
    setValidationOpen(false);
  };
  const playtest = () => {
    if (dirty.length) { setNotice('Save your draft before launching a playtest.'); return; }
    window.open(`http://localhost:5173/?debug&room=${encodeURIComponent(roomId)}&x=10&y=7`, 'neon-divide-playtest');
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand"><div className="logo-mark">N<span>D</span></div><div><strong>CONTENT FORGE</strong><small>NEON DIVIDE / LOCAL WORKSPACE</small></div></div>
        <nav className="main-nav">{NAV.map((item) => <button key={item.id} className={section === item.id ? 'active' : ''} onClick={() => setSection(item.id)}><span>{item.icon}</span>{item.label}</button>)}</nav>
        <div className="top-actions">
          <button title="Undo" disabled={!history.past.length} onClick={() => setHistory(undoHistory(history))}>↶</button>
          <button title="Redo" disabled={!history.future.length} onClick={() => setHistory(redoHistory(history))}>↷</button>
          <button className="play-button" onClick={playtest}>▶ Playtest</button>
          <button className="save-button" disabled={!dirty.length || busy} onClick={save}><span>{busy ? '◌' : '▣'}</span>{dirty.length ? `Save ${dirty.length}` : 'Saved'}</button>
        </div>
      </header>
      <div className="context-bar">
        <div><span className="live-dot"/><strong>{project.manifest.name}</strong><span>/</span><span>{section}</span>{section === 'rooms' && <><span>/</span><span>{roomId}</span></>}</div>
        <div>{dirty.length > 0 ? <span className="dirty-label">● {dirty.length} unsaved</span> : <span className="saved-label">✓ Synced with disk</span>}<button onClick={reload}>Reload</button></div>
      </div>
      <div className="app-content">
        {section === 'world' && <WorldEditor project={project} onOpenRoom={(id) => { setRoomId(id); setSection('rooms'); }}/>}
        {section === 'rooms' && <RoomEditor project={project} roomId={roomId} onRoomId={setRoomId} onChange={commit}/>}
        {section === 'actors' && <ActorsEditor project={project} onChange={commit}/>}
        {section === 'items' && <ItemsEditor project={project} onChange={commit}/>}
        {section === 'dialogues' && <DialogueEditor project={project} onChange={commit}/>}
        {section === 'jobs' && <JobsEditor project={project} onChange={commit}/>}
      </div>
      {notice && <button className="toast" onClick={() => setNotice('')}>{notice}<span>×</span></button>}
      <ValidationDrawer issues={validation.issues} open={validationOpen} onToggle={() => setValidationOpen(!validationOpen)} onIssue={openIssue}/>
    </div>
  );
}
