import { LEVELS, ROOMS } from '@neon-divide/content';

const level = LEVELS.level01;

export const LEVEL_01 = {
  ...level,
  rooms: Object.fromEntries(level.rooms.map((roomId) => [roomId, ROOMS[roomId]])),
};

export default LEVEL_01;
