import alley from './alley.js';
import backlot from './backlot.js';
import lobby from './lobby.js';
import market from './market.js';
import plaza from './plaza.js';
import rooftop from './rooftop.js';
import server from './server.js';
import strip from './strip.js';

/**
 * Level 01 - the Kagemori Sprawl.
 *
 *                    [rooftop]
 *                        |  (door from market)
 *   [alley] --- [backlot] --- (sec door) --- [lobby] --- [server]
 *      |
 *   [plaza] --- [market]
 *      |
 *   [strip]
 *
 * Adding a screen: create the room file, import it here, and add an `exits`
 * entry on the neighbour that should lead to it. Nothing else to wire.
 */
const rooms = { plaza, alley, market, strip, backlot, lobby, server, rooftop };

export const LEVEL_01 = {
  id: 'level01',
  name: 'Kagemori Sprawl',
  start: 'plaza',
  rooms,
};

export default LEVEL_01;
