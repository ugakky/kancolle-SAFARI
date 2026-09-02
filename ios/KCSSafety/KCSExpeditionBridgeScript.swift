import Foundation

enum KCSExpeditionBridgeScript {
    static let source = #"""
(() => {
  'use strict';

  if (window.__KCS_EXPEDITION_BRIDGE__) return;
  window.__KCS_EXPEDITION_BRIDGE__ = true;

  const S = {
    masterShips: new Map(),
    masterSlotItems: new Map(),
    slotItems: new Map(),
    ships: new Map(),
    decks: new Map(),
    missions: new Map()
  };

  function post(message) {
    try {
      window.webkit.messageHandlers.kcsBridge.postMessage(JSON.stringify(message));
    } catch (_) {}
  }

  function parse(text) {
    if (typeof text !== 'string') return null;
    try { return JSON.parse(text.trim().replace(/^svdata=/, '')); }
    catch (_) { return null; }
  }

  function pathOf(url) {
    try { return new URL(url, location.href).pathname; }
    catch (_) { return String(url || '').split('?')[0]; }
  }

  function bodyText(body) {
    if (typeof body === 'string') return body;
    if (body instanceof URLSearchParams) return body.toString();
    return '';
  }

  function params(body) {
    try { return new URLSearchParams(bodyText(body)); }
    catch (_) { return new URLSearchParams(); }
  }

  function ids(list) {
    return Array.isArray(list) ? list.map(Number).filter(x => Number.isFinite(x) && x > 0) : [];
  }

  function ingestStart2(data) {
    for (const x of data?.api_mst_ship || []) {
      if (x?.api_id > 0) {
        S.masterShips.set(Number(x.api_id), {
          id: Number(x.api_id),
          name: String(x.api_name || `艦${x.api_id}`),
          stype: Number(x.api_stype || 0),
          fuelMax: Number.isFinite(Number(x.api_fuel_max)) ? Number(x.api_fuel_max) : null,
          ammoMax: Number.isFinite(Number(x.api_bull_max)) ? Number(x.api_bull_max) : null
        });
      }
    }

    for (const x of data?.api_mst_slotitem || []) {
      if (x?.api_id > 0) {
        S.masterSlotItems.set(Number(x.api_id), {
          id: Number(x.api_id),
          name: String(x.api_name || `装備${x.api_id}`)
        });
      }
    }

    for (const x of data?.api_mst_mission || []) {
      if (x?.api_id > 0) {
        S.missions.set(Number(x.api_id), {
          id: Number(x.api_id),
          name: String(x.api_name || `遠征 #${x.api_id}`),
          durationMinutes: Number.isFinite(Number(x.api_time)) ? Number(x.api_time) : null,
          requiredShips: Number.isFinite(Number(x.api_deck_num)) ? Number(x.api_deck_num) : null
        });
      }
    }
  }

  function ingestShips(list) {
    if (!Array.isArray(list)) return;
    for (const x of list) {
      if (x?.api_id > 0) S.ships.set(Number(x.api_id), { ...S.ships.get(Number(x.api_id)), ...x });
    }
  }

  function ingestDecks(list) {
    if (!Array.isArray(list)) return;
    for (const x of list) {
      if (x?.api_id > 0) S.decks.set(Number(x.api_id), x);
    }
  }

  function ingestSlotItems(list) {
    if (!Array.isArray(list)) return;
    for (const x of list) {
      if (x?.api_id > 0 && x?.api_slotitem_id > 0) {
        S.slotItems.set(Number(x.api_id), Number(x.api_slotitem_id));
      }
    }
  }

  function slotNames(ship) {
    const instanceIds = ids(ship?.api_slot);
    const ex = Number(ship?.api_slot_ex || 0);
    if (ex > 0) instanceIds.push(ex);
    return instanceIds.map(instanceId => {
      const masterId = S.slotItems.get(instanceId);
      return S.masterSlotItems.get(masterId)?.name;
    }).filter(Boolean);
  }

  function shipRow(id) {
    const ship = S.ships.get(Number(id));
    if (!ship) return null;
    const master = S.masterShips.get(Number(ship.api_ship_id));
    return {
      id: Number(id),
      name: master?.name || `艦ID ${id}`,
      lv: Number(ship.api_lv || 0),
      shipType: Number(master?.stype || 0),
      hpNow: Number.isFinite(Number(ship.api_nowhp)) ? Number(ship.api_nowhp) : null,
      hpMax: Number.isFinite(Number(ship.api_maxhp)) ? Number(ship.api_maxhp) : null,
      cond: Number.isFinite(Number(ship.api_cond)) ? Number(ship.api_cond) : null,
      fuel: Number.isFinite(Number(ship.api_fuel)) ? Number(ship.api_fuel) : null,
      fuelMax: master?.fuelMax ?? null,
      ammo: Number.isFinite(Number(ship.api_bull)) ? Number(ship.api_bull) : null,
      ammoMax: master?.ammoMax ?? null,
      slotItemNames: slotNames(ship)
    };
  }

  function fleetRow(deckId) {
    const deck = S.decks.get(Number(deckId));
    const shipIds = ids(deck?.api_ship);
    const mission = Array.isArray(deck?.api_mission) ? deck.api_mission : [];
    const running = Number(mission[0] || 0) > 0;
    const missionId = running && Number(mission[1] || 0) > 0 ? Number(mission[1]) : null;
    const completion = running && Number(mission[2] || 0) > 0 ? Number(mission[2]) : null;
    return {
      id: Number(deckId),
      ships: shipIds.map(shipRow).filter(Boolean),
      missionId,
      missionName: missionId ? (S.missions.get(missionId)?.name || `遠征 #${missionId}`) : null,
      completionTimeMillis: completion
    };
  }

  function emit() {
    const missions = [...S.missions.values()].sort((a, b) => a.id - b.id);
    post({
      type: 'expedition',
      expedition: {
        fleets: [2, 3, 4].map(fleetRow),
        missions,
        updatedAtMillis: Date.now()
      }
    });
  }

  function setStartedMission(body, data) {
    const p = params(body);
    const deckId = Number(p.get('api_deck_id') || 0);
    const missionId = Number(p.get('api_mission_id') || 0);
    if (deckId <= 0 || missionId <= 0) return;
    const deck = S.decks.get(deckId) || { api_id: deckId, api_ship: [] };
    const completion = Number(data?.api_complatetime || data?.api_complete_time || 0);
    S.decks.set(deckId, {
      ...deck,
      api_mission: [1, missionId, completion > 0 ? completion : 0, 0]
    });
  }

  function clearMission(body) {
    const deckId = Number(params(body).get('api_deck_id') || 0);
    if (deckId <= 0) return;
    const deck = S.decks.get(deckId);
    if (deck) S.decks.set(deckId, { ...deck, api_mission: [0, 0, 0, 0] });
  }

  function onApi(url, body, rawText) {
    const j = parse(rawText);
    if (!j || j.api_result !== 1) return;
    const path = pathOf(url);
    const data = j.api_data;

    try {
      if (path.includes('/api_start2/getData')) {
        ingestStart2(data);
      } else if (path.endsWith('/api_port/port')) {
        ingestShips(data?.api_ship || []);
        ingestDecks(data?.api_deck_port || []);
      } else if (path.includes('/api_get_member/ship_deck') || path.includes('/api_get_member/ship2') || path.includes('/api_get_member/ship3')) {
        ingestShips(Array.isArray(data) ? data : data?.api_ship_data || data?.api_ship || []);
        ingestDecks(data?.api_deck_data || data?.api_deck_port || []);
      } else if (path.includes('/api_get_member/deck')) {
        ingestDecks(Array.isArray(data) ? data : data?.api_deck_data || []);
      } else if (path.includes('/api_get_member/slot_item')) {
        ingestSlotItems(Array.isArray(data) ? data : data?.api_slotitem || []);
      } else if (path.endsWith('/api_req_mission/start')) {
        setStartedMission(body, data);
      } else if (path.endsWith('/api_req_mission/result')) {
        clearMission(body);
      }
      emit();
    } catch (_) {}
  }

  function relevant(url) {
    const u = String(url || '');
    return u.includes('/kcsapi/api_start2/getData') ||
      u.includes('/kcsapi/api_port/port') ||
      u.includes('/kcsapi/api_get_member/ship_deck') ||
      u.includes('/kcsapi/api_get_member/ship2') ||
      u.includes('/kcsapi/api_get_member/ship3') ||
      u.includes('/kcsapi/api_get_member/deck') ||
      u.includes('/kcsapi/api_get_member/slot_item') ||
      u.includes('/kcsapi/api_req_mission/start') ||
      u.includes('/kcsapi/api_req_mission/result');
  }

  try {
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function(method, url, ...rest) {
      this.__kcsExpedition = { method, url };
      return originalOpen.call(this, method, url, ...rest);
    };

    XMLHttpRequest.prototype.send = function(body) {
      const meta = this.__kcsExpedition || {};
      if (relevant(meta.url)) {
        this.addEventListener('load', () => {
          try {
            let text = '';
            if (!this.responseType || this.responseType === 'text') text = this.responseText || '';
            else if (this.responseType === 'json') text = 'svdata=' + JSON.stringify(this.response || {});
            onApi(meta.url, body, text);
          } catch (_) {}
        }, { once: true });
      }
      return originalSend.call(this, body);
    };
  } catch (_) {}

  try {
    if (window.fetch) {
      const originalFetch = window.fetch;
      window.fetch = async function(input, init = {}) {
        const response = await originalFetch.apply(this, arguments);
        try {
          const url = typeof input === 'string' ? input : input?.url;
          if (relevant(url)) {
            response.clone().text().then(text => onApi(url, init.body || '', text)).catch(() => {});
          }
        } catch (_) {}
        return response;
      };
    }
  } catch (_) {}
})();
"""#
}
