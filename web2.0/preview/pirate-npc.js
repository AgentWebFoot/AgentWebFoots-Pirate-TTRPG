function sanitizePirateNpcSavedAbility(rawAbility, abilityType) {
  if (!rawAbility || typeof rawAbility !== 'object' || Array.isArray(rawAbility)) return null;

  const name = String(rawAbility.name || '').trim();
  if (!name) return null;

  return {
    name,
    ...(abilityType === 'action'
      ? {
          actionCost: Number(rawAbility.actionCost) || 0,
          enduranceCost: Number(rawAbility.enduranceCost) || 0,
        }
      : {}),
    description: String(rawAbility.description || '').trim(),
  };
}

function sanitizePirateNpcSavedArmor(rawArmor) {
  if (!rawArmor || typeof rawArmor !== 'object' || Array.isArray(rawArmor)) return null;

  const name = String(rawArmor.name || '').trim();
  if (!name) return null;

  return {
    name,
    baseEvasion: Number(rawArmor.baseEvasion) || 0,
    toughness: Number(rawArmor.toughness) || 0,
    dashPenalty: Number(rawArmor.dashPenalty) || 0,
    properties: Array.isArray(rawArmor.properties) ? rawArmor.properties.map(value => String(value || '').trim()).filter(Boolean) : [],
  };
}

function sanitizePirateNpcSavedShield(rawShield) {
  if (!rawShield || typeof rawShield !== 'object' || Array.isArray(rawShield)) return null;

  const name = String(rawShield.name || '').trim();
  if (!name) return null;

  return {
    name,
    toughness: Number(rawShield.toughness) || 0,
    braceCost: Number(rawShield.braceCost) || 0,
    dashPenalty: Number(rawShield.dashPenalty) || 0,
    properties: Array.isArray(rawShield.properties) ? rawShield.properties.map(value => String(value || '').trim()).filter(Boolean) : [],
  };
}

function sanitizePirateNpcSavedWeapon(rawWeapon) {
  if (!rawWeapon || typeof rawWeapon !== 'object' || Array.isArray(rawWeapon)) return null;

  const name = String(rawWeapon.name || '').trim();
  if (!name) return null;

  const attackBonus = rawWeapon.attackBonus === '' || rawWeapon.attackBonus === null || rawWeapon.attackBonus === undefined
    ? null
    : Number(rawWeapon.attackBonus);

  return {
    name,
    type: Array.isArray(rawWeapon.type) ? rawWeapon.type.map(value => String(value || '').trim()).filter(Boolean) : [],
    attackStats: Array.isArray(rawWeapon.attackStats) ? rawWeapon.attackStats.map(value => String(value || '').trim()).filter(Boolean) : [],
    ...(Number.isFinite(attackBonus) ? { attackBonus } : {}),
    damage: {
      dice: String(rawWeapon?.damage?.dice || '').trim(),
      type: String(rawWeapon?.damage?.type || '').trim(),
    },
    enduranceCost: Number(rawWeapon.enduranceCost) || 0,
    properties: Array.isArray(rawWeapon.properties) ? rawWeapon.properties.map(value => String(value || '').trim()).filter(Boolean) : [],
  };
}

function sanitizePirateNpcSnapshot(rawNpc) {
  if (!rawNpc || typeof rawNpc !== 'object' || Array.isArray(rawNpc)) {
    return null;
  }

  const snapshot = JSON.parse(JSON.stringify(rawNpc));
  snapshot.name = String(snapshot.name || '').trim();
  snapshot.difficulty = String(snapshot.difficulty || '').trim();
  snapshot.npcType = String(snapshot.npcType || '').trim();

  if (!snapshot.name) {
    return null;
  }

  return snapshot;
}

export function addNpcAbility(library, payload) {
  const abilityType = payload?.abilityType;
  const collection = { action: 'npcActionAbilities', passive: 'npcPassiveAbilities' };
  if (!Object.hasOwn(collection, abilityType)) throw new TypeError('Choose NPC action or passive ability.');
  const ability = sanitizePirateNpcSavedAbility(payload?.ability, abilityType);
  if (!ability || JSON.stringify(ability).length > 15_000) throw new TypeError('Provide a named NPC ability up to 15,000 characters.');
  const entries = library[collection[abilityType]];
  if (entries.some(entry => entry.name.trim().toLowerCase() === ability.name.toLowerCase())) return null;
  entries.push(ability);
  return { message: 'NPC ability saved.', abilityType, ability };
}

export function saveNpc(library, payload) {
  const npc = sanitizePirateNpcSnapshot(payload?.npc);
  if (!npc || JSON.stringify(npc).length > 200_000) throw new TypeError('Provide a named NPC up to 200,000 characters.');
  function upsert(entries, entry) {
    const index = entries.findIndex(item => item.name.trim().toLowerCase() === entry.name.toLowerCase());
    if (index === -1) entries.push(entry);
    else entries[index] = entry;
  }
  const sharedCollections = [
    ['customArmors', 'npcArmors', sanitizePirateNpcSavedArmor],
    ['customShields', 'npcShields', sanitizePirateNpcSavedShield],
    ['customWeapons', 'npcWeapons', sanitizePirateNpcSavedWeapon],
    ['customActionAbilities', 'npcActionAbilities', value => sanitizePirateNpcSavedAbility(value, 'action')],
    ['customPassiveAbilities', 'npcPassiveAbilities', value => sanitizePirateNpcSavedAbility(value, 'passive')],
  ];
  for (const [source, target, sanitize] of sharedCollections) {
    if (!Array.isArray(npc[source])) continue;
    for (const raw of npc[source]) {
      if (!raw?.shareToNpcCompendium) continue;
      const entry = sanitize(raw);
      if (entry) upsert(library[target], entry);
    }
  }
  upsert(library.npcs, npc);
  library.npcs.sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }));
  const { npcArmors, npcShields, npcWeapons, npcActionAbilities, npcPassiveAbilities } = library;
  return { message: 'NPC saved to the compendium.', npc, npcArmors, npcShields, npcWeapons, npcActionAbilities, npcPassiveAbilities };
}
