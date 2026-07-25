export function createHistory(project) {
  return { past: [], present: structuredClone(project), future: [] };
}

export function commitHistory(history, project) {
  if (JSON.stringify(project) === JSON.stringify(history.present)) return history;
  return {
    past: [...history.past.slice(-49), history.present],
    present: structuredClone(project),
    future: [],
  };
}

export function undoHistory(history) {
  if (history.past.length === 0) return history;
  return {
    past: history.past.slice(0, -1),
    present: history.past.at(-1),
    future: [history.present, ...history.future],
  };
}

export function redoHistory(history) {
  if (history.future.length === 0) return history;
  return {
    past: [...history.past, history.present],
    present: history.future[0],
    future: history.future.slice(1),
  };
}

export function paintTile(project, roomId, layer, x, y, character) {
  if (!['ground', 'decor'].includes(layer) || x < 0 || x >= 20 || y < 0 || y >= 15) return project;
  const next = structuredClone(project);
  const row = [...next.rooms[roomId][layer][y]];
  row[x] = character;
  next.rooms[roomId][layer][y] = row.join('');
  return next;
}

export function resourceValue(project, name) {
  return name === 'project' ? project.manifest : project[name];
}

export function dirtyResourceNames(project, baseline, resourceNames) {
  return resourceNames.filter((name) => JSON.stringify(resourceValue(project, name)) !== JSON.stringify(resourceValue(baseline, name)));
}

export function layoutRooms(rooms, startId) {
  const positions = { [startId]: { x: 0, y: 0 } };
  const delta = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0] };
  const occupied = new Set(['0,0']);
  const queue = [startId];
  while (queue.length) {
    const id = queue.shift();
    const connections = [
      ...Object.entries(rooms[id]?.exits ?? {}).map(([direction, target]) => ({ direction, target })),
      ...(rooms[id]?.spawns ?? []).filter((spawn) => spawn.type === 'door' && spawn.to)
        .map((spawn) => ({ direction: 'door', target: spawn.to })),
    ];
    for (const { direction, target } of connections) {
      if (!rooms[target] || positions[target]) continue;
      const candidates = direction === 'door'
        ? [[1, 0], [0, -1], [0, 1], [-1, 0]]
        : [delta[direction] ?? [1, 0], [1, 0], [0, -1], [0, 1], [-1, 0]];
      const [dx, dy] = candidates.find(([candidateX, candidateY]) => (
        !occupied.has(`${positions[id].x + candidateX},${positions[id].y + candidateY}`)
      )) ?? [1, 0];
      positions[target] = { x: positions[id].x + dx, y: positions[id].y + dy };
      occupied.add(`${positions[target].x},${positions[target].y}`);
      queue.push(target);
    }
  }
  let orphan = 0;
  for (const id of Object.keys(rooms)) {
    if (!positions[id]) positions[id] = { x: orphan++, y: 3 };
  }
  return positions;
}
