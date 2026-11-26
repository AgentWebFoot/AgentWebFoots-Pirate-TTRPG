const { useEffect, useMemo, useRef, useState } = React;
const h = React.createElement;

const STAT_NAMES = ["Brawn", "Finesse", "Grit", "Awareness", "Brains", "Swagger"];
const SIDE_STAT_NAMES = ["Health", "Endurance", "Evasion", "Toughness", "Speed"];
const NPC_TYPE_OPTIONS = ["Human", "Undead", "Monster", "Beast"];
const NPC_LIBRARY_FILTER_STATS = [...STAT_NAMES, "Health", "Endurance", "Evasion", "Toughness", "Normal Move", "Dash Move"];
const NPC_LIBRARY_STAT_MAXIMUMS = {
  Health: 200,
  Endurance: 500,
  Evasion: 30
};
const NPC_LIBRARY_ITEM_FILTERS = [
  { key: "armor", label: "Armor" },
  { key: "shield", label: "Shield" },
  { key: "weapon", label: "Weapon" },
  { key: "activeAbility", label: "Active Ability" },
  { key: "passiveAbility", label: "Passive Ability" }
];
const NPC_LIBRARY_SORT_OPTIONS = [
  { value: "name", label: "Name" },
  { value: "difficulty", label: "Difficulty" },
  { value: "type", label: "Type" },
  ...NPC_LIBRARY_FILTER_STATS.map(statName => ({
    value: `stat:${statName}`,
    label: statName
  }))
];
const PAGE_PARAMS = new URLSearchParams(window.location.search);

function getDefaultApiUrl() {
  const { protocol, hostname, origin } = window.location;
  const isLocalHost = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0";
  if (PAGE_PARAMS.get("apiUrl")) return PAGE_PARAMS.get("apiUrl");
  if (isLocalHost) return `${protocol}//${hostname}:5000`;
  return origin;
}

const API_URL = getDefaultApiUrl();
const CUSTOM_OPTION_VALUE = "__custom__";

function makeInitialStats(names) {
  return names.reduce((values, statName) => ({
    ...values,
    [statName]: 0
  }), {});
}

function getPropertyFilterLabel(property) {
  const value = String(property || "");
  if (value.startsWith("Versatile")) return "Versatile";
  if (value.startsWith("Range")) return "Range";
  if (value.startsWith("Explosive")) return "Explosive";
  if (value.startsWith("Radius")) return "Radius";
  if (value.startsWith("Reach")) return "Reach";
  return value;
}

function getParameterizedPropertyLabel(property) {
  return String(property || "").trim().replace(/\s*\([^)]*\)\s*$/, " (X)");
}

function parseCommaSeparatedList(value) {
  return String(value || "").split(",").map(entry => entry.trim()).filter(Boolean);
}

function mergeNpcRecord(baseRecord, overrideRecord) {
  if (!baseRecord) return null;
  if (!overrideRecord) return baseRecord;
  return {
    ...baseRecord,
    ...overrideRecord,
    damage: {
      ...(baseRecord.damage || {}),
      ...(overrideRecord.damage || {})
    }
  };
}

function mergeNamedRecords(...collections) {
  const recordMap = new Map();
  collections.flat().forEach(entry => {
    const name = String(entry?.name || "").trim();
    if (!name) return;
    recordMap.set(name.toLowerCase(), entry);
  });
  return Array.from(recordMap.values());
}

function getWeaponAttackBonusValue(weapon, stats) {
  const customAttackBonus = parseOptionalNumber(weapon?.attackBonus);
  if (customAttackBonus !== null) return customAttackBonus;
  const attackStats = Array.isArray(weapon?.attackStats) ? weapon.attackStats : [];
  if (attackStats.length === 0) return 0;
  return Math.max(...attackStats.map(statName => Number(stats?.[statName]) || 0));
}

function getWeaponAttackBonusLabel(weapon, stats) {
  const value = getWeaponAttackBonusValue(weapon, stats);
  return `${value >= 0 ? "+" : ""}${value}`;
}

function parseOptionalNumber(value) {
  if (value === "" || value === null || value === undefined) return null;
  const nextValue = Number(value);
  return Number.isFinite(nextValue) ? nextValue : null;
}

function createNpcLibraryStatRanges() {
  return NPC_LIBRARY_FILTER_STATS.reduce((ranges, statName) => ({
    ...ranges,
    [statName]: {
      min: "0",
      max: String(getNpcLibraryStatMaximum(statName))
    }
  }), {});
}

function getNpcLibraryStatMaximum(statName) {
  return NPC_LIBRARY_STAT_MAXIMUMS[statName] || 20;
}

function getNpcFilterStatValue(entry, statName) {
  if (STAT_NAMES.includes(statName)) {
    return Number(entry?.stats?.[statName]);
  }
  if (statName === "Normal Move") {
    return Number(entry?.speed?.normalMove);
  }
  if (statName === "Dash Move") {
    return Number(entry?.speed?.dashMove);
  }
  return Number(entry?.sideStats?.[statName]);
}

function clampNpcFilterRangeValue(value, maximum = 20) {
  return Math.max(0, Math.min(maximum, Number(value) || 0));
}

function createNpcLibraryItemFilters() {
  return NPC_LIBRARY_ITEM_FILTERS.reduce((filters, filterConfig) => ({
    ...filters,
    [filterConfig.key]: {
      mode: "or",
      values: []
    }
  }), {});
}

function getNpcLibraryItemFilterValues(entry, filterKey) {
  if (filterKey === "armor") {
    return entry?.selectedArmorName ? [String(entry.selectedArmorName)] : [];
  }
  if (filterKey === "shield") {
    return entry?.selectedShieldName ? [String(entry.selectedShieldName)] : [];
  }
  if (filterKey === "weapon") {
    return Array.isArray(entry?.selectedWeaponNames) ? entry.selectedWeaponNames.map(value => String(value || "")).filter(Boolean) : [];
  }
  if (filterKey === "activeAbility") {
    return Array.isArray(entry?.selectedActionAbilityNames) ? entry.selectedActionAbilityNames.map(value => String(value || "")).filter(Boolean) : [];
  }
  if (filterKey === "passiveAbility") {
    return Array.isArray(entry?.selectedPassiveAbilityNames) ? entry.selectedPassiveAbilityNames.map(value => String(value || "")).filter(Boolean) : [];
  }
  return [];
}

function NpcBuilderApp() {
  const [name, setName] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [npcType, setNpcType] = useState("");
  const [armors, setArmors] = useState([]);
  const [shields, setShields] = useState([]);
  const [weapons, setWeapons] = useState([]);
  const [npcCompendiumArmors, setNpcCompendiumArmors] = useState([]);
  const [npcCompendiumShields, setNpcCompendiumShields] = useState([]);
  const [npcCompendiumWeapons, setNpcCompendiumWeapons] = useState([]);
  const [equipmentProperties, setEquipmentProperties] = useState([]);
  const [actionAbilities, setActionAbilities] = useState([]);
  const [passiveAbilities, setPassiveAbilities] = useState([]);
  const [selectedArmorName, setSelectedArmorName] = useState("");
  const [selectedShieldName, setSelectedShieldName] = useState("");
  const [weaponChoiceName, setWeaponChoiceName] = useState("");
  const [selectedWeaponNames, setSelectedWeaponNames] = useState([]);
  const [selectedActionAbilityName, setSelectedActionAbilityName] = useState("");
  const [selectedActionAbilityNames, setSelectedActionAbilityNames] = useState([]);
  const [selectedPassiveAbilityName, setSelectedPassiveAbilityName] = useState("");
  const [selectedPassiveAbilityNames, setSelectedPassiveAbilityNames] = useState([]);
  const [customArmors, setCustomArmors] = useState([]);
  const [customShields, setCustomShields] = useState([]);
  const [customWeapons, setCustomWeapons] = useState([]);
  const [customActionAbilities, setCustomActionAbilities] = useState([]);
  const [customPassiveAbilities, setCustomPassiveAbilities] = useState([]);
  const [armorOverrides, setArmorOverrides] = useState({});
  const [shieldOverrides, setShieldOverrides] = useState({});
  const [weaponOverrides, setWeaponOverrides] = useState({});
  const [actionAbilityOverrides, setActionAbilityOverrides] = useState({});
  const [passiveAbilityOverrides, setPassiveAbilityOverrides] = useState({});
  const [editingArmorName, setEditingArmorName] = useState("");
  const [editingShieldName, setEditingShieldName] = useState("");
  const [editingWeaponName, setEditingWeaponName] = useState("");
  const [editingActionAbilityName, setEditingActionAbilityName] = useState("");
  const [editingPassiveAbilityName, setEditingPassiveAbilityName] = useState("");
  const [editingSideStatName, setEditingSideStatName] = useState("");
  const [sideStatOverrides, setSideStatOverrides] = useState({
    Health: null,
    Endurance: null,
    Evasion: null,
    Toughness: null,
    normalMove: null,
    dashMove: null
  });
  const [customArmorForm, setCustomArmorForm] = useState({
    name: "",
    baseEvasion: "",
    toughness: "",
    dashPenalty: "",
    properties: "",
    shareToNpcCompendium: false
  });
  const [customShieldForm, setCustomShieldForm] = useState({
    name: "",
    toughness: "",
    braceCost: "",
    dashPenalty: "",
    properties: "",
    shareToNpcCompendium: false
  });
  const [customWeaponForm, setCustomWeaponForm] = useState({
    name: "",
    type: "",
    attackStats: "",
    attackBonus: "",
    damageDice: "",
    damageType: "",
    enduranceCost: "",
    properties: "",
    shareToNpcCompendium: false
  });
  const [customActionAbilityForm, setCustomActionAbilityForm] = useState({
    name: "",
    actionCost: "",
    enduranceCost: "",
    description: "",
    shareToNpcCompendium: false
  });
  const [customPassiveAbilityForm, setCustomPassiveAbilityForm] = useState({
    name: "",
    description: "",
    shareToNpcCompendium: false
  });
  const [armorEditForm, setArmorEditForm] = useState({
    name: "",
    baseEvasion: "",
    toughness: "",
    dashPenalty: "",
    properties: ""
  });
  const [shieldEditForm, setShieldEditForm] = useState({
    name: "",
    toughness: "",
    braceCost: "",
    dashPenalty: "",
    properties: ""
  });
  const [weaponEditForm, setWeaponEditForm] = useState({
    name: "",
    type: "",
    attackStats: "",
    attackBonus: "",
    damageDice: "",
    damageType: "",
    enduranceCost: "",
    properties: ""
  });
  const [actionAbilityEditForm, setActionAbilityEditForm] = useState({
    name: "",
    actionCost: "",
    enduranceCost: "",
    description: ""
  });
  const [passiveAbilityEditForm, setPassiveAbilityEditForm] = useState({
    name: "",
    description: ""
  });
  const [sideStatEditForm, setSideStatEditForm] = useState({
    value: "",
    normalMove: "",
    dashMove: ""
  });
  const [compendiumMessage, setCompendiumMessage] = useState("Loading compendium equipment...");
  const [abilityMessage, setAbilityMessage] = useState("Loading NPC abilities...");
  const [footerMessage, setFooterMessage] = useState("");
  const [equipmentEditEnabled, setEquipmentEditEnabled] = useState(false);
  const [npcLibrary, setNpcLibrary] = useState([]);
  const [npcLibrarySearch, setNpcLibrarySearch] = useState("");
  const [npcLibraryOpen, setNpcLibraryOpen] = useState(false);
  const [npcLibraryFiltersOpen, setNpcLibraryFiltersOpen] = useState(false);
  const [npcLibrarySortField, setNpcLibrarySortField] = useState("name");
  const [npcLibrarySortDirection, setNpcLibrarySortDirection] = useState("asc");
  const [npcLibraryDifficultyMin, setNpcLibraryDifficultyMin] = useState("0");
  const [npcLibraryDifficultyMax, setNpcLibraryDifficultyMax] = useState("20");
  const [npcLibraryStatRanges, setNpcLibraryStatRanges] = useState(() => createNpcLibraryStatRanges());
  const [npcLibraryTypeFilters, setNpcLibraryTypeFilters] = useState([]);
  const [npcLibraryItemFilters, setNpcLibraryItemFilters] = useState(() => createNpcLibraryItemFilters());
  const [npcLibraryMessage, setNpcLibraryMessage] = useState("Loading NPC compendium...");
  const [canSaveToNpcCompendium, setCanSaveToNpcCompendium] = useState(false);
  const [stats, setStats] = useState(() => makeInitialStats(STAT_NAMES));
  const [sideStats, setSideStats] = useState(() => makeInitialStats(SIDE_STAT_NAMES));
  const [speed, setSpeed] = useState({
    normalMove: 0,
    dashMove: 0
  });
  const [actionPoints, setActionPoints] = useState(0);
  const [actionAbilityForm, setActionAbilityForm] = useState({
    name: "",
    actionCost: "",
    enduranceCost: "",
    description: ""
  });
  const [passiveAbilityForm, setPassiveAbilityForm] = useState({
    name: "",
    description: ""
  });
  const importInputRef = useRef(null);

  const applyNpcSnapshot = snapshot => {
    setName(String(snapshot?.name || ""));
    setDifficulty(String(snapshot?.difficulty || ""));
    setNpcType(String(snapshot?.npcType || ""));
    setStats({
      ...makeInitialStats(STAT_NAMES),
      ...(snapshot?.stats && typeof snapshot.stats === "object" ? snapshot.stats : {})
    });
    setSideStats({
      ...makeInitialStats(SIDE_STAT_NAMES),
      ...(snapshot?.sideStats && typeof snapshot.sideStats === "object" ? snapshot.sideStats : {})
    });
    setSpeed({
      normalMove: snapshot?.speed?.normalMove ?? 0,
      dashMove: snapshot?.speed?.dashMove ?? 0
    });
    setActionPoints(snapshot?.actionPoints ?? 0);
    setSelectedArmorName(String(snapshot?.selectedArmorName || ""));
    setSelectedShieldName(String(snapshot?.selectedShieldName || ""));
    setWeaponChoiceName(String(snapshot?.weaponChoiceName || ""));
    setSelectedWeaponNames(Array.isArray(snapshot?.selectedWeaponNames) ? snapshot.selectedWeaponNames : []);
    setSelectedActionAbilityName(String(snapshot?.selectedActionAbilityName || ""));
    setSelectedActionAbilityNames(Array.isArray(snapshot?.selectedActionAbilityNames) ? snapshot.selectedActionAbilityNames : []);
    setSelectedPassiveAbilityName(String(snapshot?.selectedPassiveAbilityName || ""));
    setSelectedPassiveAbilityNames(Array.isArray(snapshot?.selectedPassiveAbilityNames) ? snapshot.selectedPassiveAbilityNames : []);
    setCustomArmors(Array.isArray(snapshot?.customArmors) ? snapshot.customArmors : []);
    setCustomShields(Array.isArray(snapshot?.customShields) ? snapshot.customShields : []);
    setCustomWeapons(Array.isArray(snapshot?.customWeapons) ? snapshot.customWeapons : []);
    setCustomActionAbilities(Array.isArray(snapshot?.customActionAbilities) ? snapshot.customActionAbilities : []);
    setCustomPassiveAbilities(Array.isArray(snapshot?.customPassiveAbilities) ? snapshot.customPassiveAbilities : []);
    setArmorOverrides(snapshot?.armorOverrides && typeof snapshot.armorOverrides === "object" ? snapshot.armorOverrides : {});
    setShieldOverrides(snapshot?.shieldOverrides && typeof snapshot.shieldOverrides === "object" ? snapshot.shieldOverrides : {});
    setWeaponOverrides(snapshot?.weaponOverrides && typeof snapshot.weaponOverrides === "object" ? snapshot.weaponOverrides : {});
    setActionAbilityOverrides(snapshot?.actionAbilityOverrides && typeof snapshot.actionAbilityOverrides === "object" ? snapshot.actionAbilityOverrides : {});
    setPassiveAbilityOverrides(snapshot?.passiveAbilityOverrides && typeof snapshot.passiveAbilityOverrides === "object" ? snapshot.passiveAbilityOverrides : {});
    setSideStatOverrides({
      Health: null,
      Endurance: null,
      Evasion: null,
      Toughness: null,
      normalMove: null,
      dashMove: null,
      ...(snapshot?.sideStatOverrides && typeof snapshot.sideStatOverrides === "object" ? snapshot.sideStatOverrides : {})
    });
    setEditingArmorName("");
    setEditingShieldName("");
    setEditingWeaponName("");
    setEditingActionAbilityName("");
    setEditingPassiveAbilityName("");
    setEditingSideStatName("");
  };

  const loadNpcCompendium = () => {
    setAbilityMessage("Loading NPC abilities...");
    setNpcLibraryMessage("Loading NPC compendium...");
    return fetch(`${API_URL}/pirate-system/npc-compendium/data?ts=${Date.now()}`, {
      credentials: "include"
    }).then(response => response.json()).then(data => {
      const nextActionAbilities = Array.isArray(data?.npcActionAbilities) ? data.npcActionAbilities : [];
      const nextPassiveAbilities = Array.isArray(data?.npcPassiveAbilities) ? data.npcPassiveAbilities : [];
      const nextNpcArmors = Array.isArray(data?.npcArmors) ? data.npcArmors : [];
      const nextNpcShields = Array.isArray(data?.npcShields) ? data.npcShields : [];
      const nextNpcWeapons = Array.isArray(data?.npcWeapons) ? data.npcWeapons : [];
      const nextNpcLibrary = Array.isArray(data?.npcs) ? data.npcs : [];
      setNpcCompendiumArmors(nextNpcArmors);
      setNpcCompendiumShields(nextNpcShields);
      setNpcCompendiumWeapons(nextNpcWeapons);
      setActionAbilities(nextActionAbilities);
      setPassiveAbilities(nextPassiveAbilities);
      setNpcLibrary(nextNpcLibrary);
      setAbilityMessage("");
      setNpcLibraryMessage("");
      return data;
    }).catch(error => {
      setAbilityMessage("Unable to load NPC abilities.");
      setNpcLibraryMessage("Unable to load NPC compendium.");
      throw error;
    });
  };

  useEffect(() => {
    let ignore = false;

    fetch(`${API_URL}/pirate-system/rules?ts=${Date.now()}`, {
      credentials: "include"
    }).then(response => response.json()).then(data => {
      if (ignore) return;

      const nextArmors = Array.isArray(data?.armors) ? data.armors : [];
      const nextShields = Array.isArray(data?.shields) ? data.shields : [];
      const nextWeapons = Array.isArray(data?.weapons) ? data.weapons : [];
      const nextEquipmentProperties = Array.isArray(data?.equipmentProperties) ? data.equipmentProperties : [];

      setArmors(nextArmors);
      setShields(nextShields);
      setWeapons(nextWeapons);
      setEquipmentProperties(nextEquipmentProperties);
      setSelectedArmorName(currentName => currentName || nextArmors[0]?.name || "");
      setSelectedShieldName(currentName => currentName || nextShields.find(shield => shield.name === "No Shield")?.name || nextShields[0]?.name || "");
      setCompendiumMessage("");
    }).catch(() => {
      if (!ignore) setCompendiumMessage("Unable to load compendium equipment.");
    });

    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    loadNpcCompendium().catch(() => {});
  }, []);

  useEffect(() => {
    let ignore = false;

    fetch(`${API_URL}/pirate-system/access?ts=${Date.now()}`, {
      credentials: "include"
    }).then(response => {
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) return null;
        throw new Error("Unable to load Pirate access.");
      }
      return response.json();
    }).then(data => {
      if (ignore || !data?.access) return;
      setCanSaveToNpcCompendium(data.access.role === "writer" || data.access.role === "owner");
    }).catch(() => {
      if (!ignore) setCanSaveToNpcCompendium(false);
    });

    return () => {
      ignore = true;
    };
  }, []);

  const armorOptions = useMemo(() => mergeNamedRecords(armors, npcCompendiumArmors, customArmors), [armors, npcCompendiumArmors, customArmors]);
  const shieldOptions = useMemo(() => mergeNamedRecords(shields, npcCompendiumShields, customShields), [shields, npcCompendiumShields, customShields]);
  const weaponOptions = useMemo(() => mergeNamedRecords(weapons, npcCompendiumWeapons, customWeapons), [weapons, npcCompendiumWeapons, customWeapons]);
  const actionAbilityOptions = useMemo(() => [...actionAbilities, ...customActionAbilities], [actionAbilities, customActionAbilities]);
  const passiveAbilityOptions = useMemo(() => [...passiveAbilities, ...customPassiveAbilities], [passiveAbilities, customPassiveAbilities]);
  const npcLibraryItemFilterOptions = useMemo(() => NPC_LIBRARY_ITEM_FILTERS.reduce((options, filterConfig) => {
    const values = Array.from(new Set(npcLibrary.flatMap(entry => getNpcLibraryItemFilterValues(entry, filterConfig.key)))).sort((left, right) => left.localeCompare(right, undefined, { sensitivity: "base" }));
    return {
      ...options,
      [filterConfig.key]: values
    };
  }, {}), [npcLibrary]);
  const filteredNpcLibrary = useMemo(() => {
    const searchValue = npcLibrarySearch.trim().toLowerCase();
    const difficultyMin = parseOptionalNumber(npcLibraryDifficultyMin);
    const difficultyMax = parseOptionalNumber(npcLibraryDifficultyMax);
    const hasTypeFilters = npcLibraryTypeFilters.length > 0;
    const activeStatRanges = NPC_LIBRARY_FILTER_STATS.map(statName => ({
      statName,
      min: parseOptionalNumber(npcLibraryStatRanges?.[statName]?.min),
      max: parseOptionalNumber(npcLibraryStatRanges?.[statName]?.max)
    })).filter(range => range.min !== null || range.max !== null);

    const nextEntries = npcLibrary.filter(entry => {
      const difficultyValue = Number(entry?.difficulty);
      const matchesSearch = !searchValue || [entry?.name, entry?.difficulty].some(value => String(value || "").toLowerCase().includes(searchValue));
      const matchesType = !hasTypeFilters || npcLibraryTypeFilters.includes(String(entry?.npcType || ""));
      const matchesDifficultyMin = difficultyMin === null || (Number.isFinite(difficultyValue) && difficultyValue >= difficultyMin);
      const matchesDifficultyMax = difficultyMax === null || (Number.isFinite(difficultyValue) && difficultyValue <= difficultyMax);
      const matchesStatRanges = activeStatRanges.every(range => {
        const statValue = getNpcFilterStatValue(entry, range.statName);
        const matchesMin = range.min === null || (Number.isFinite(statValue) && statValue >= range.min);
        const matchesMax = range.max === null || (Number.isFinite(statValue) && statValue <= range.max);
        return matchesMin && matchesMax;
      });
      const matchesItemFilters = NPC_LIBRARY_ITEM_FILTERS.every(filterConfig => {
        const filterState = npcLibraryItemFilters?.[filterConfig.key];
        const selectedValues = Array.isArray(filterState?.values) ? filterState.values : [];
        if (selectedValues.length === 0) return true;
        const entryValues = getNpcLibraryItemFilterValues(entry, filterConfig.key);
        if (filterState?.mode === "and") {
          return selectedValues.every(value => entryValues.includes(value));
        }
        return selectedValues.some(value => entryValues.includes(value));
      });

      return matchesSearch && matchesType && matchesDifficultyMin && matchesDifficultyMax && matchesStatRanges && matchesItemFilters;
    });

    nextEntries.sort((left, right) => {
      const direction = npcLibrarySortDirection === "desc" ? -1 : 1;
      let leftValue = "";
      let rightValue = "";

      if (npcLibrarySortField === "difficulty") {
        leftValue = Number(left?.difficulty) || 0;
        rightValue = Number(right?.difficulty) || 0;
      } else if (npcLibrarySortField === "type") {
        leftValue = String(left?.npcType || "");
        rightValue = String(right?.npcType || "");
      } else if (npcLibrarySortField.startsWith("stat:")) {
        const statName = npcLibrarySortField.slice(5);
        leftValue = getNpcFilterStatValue(left, statName) || 0;
        rightValue = getNpcFilterStatValue(right, statName) || 0;
      } else {
        leftValue = String(left?.name || "");
        rightValue = String(right?.name || "");
      }

      if (typeof leftValue === "number" && typeof rightValue === "number") {
        return (leftValue - rightValue) * direction;
      }

      return String(leftValue).localeCompare(String(rightValue), undefined, { sensitivity: "base" }) * direction;
    });

    return nextEntries;
  }, [npcLibrary, npcLibrarySearch, npcLibraryDifficultyMin, npcLibraryDifficultyMax, npcLibraryStatRanges, npcLibraryTypeFilters, npcLibraryItemFilters, npcLibrarySortField, npcLibrarySortDirection]);
  const selectedArmor = useMemo(() => {
    const armor = armorOptions.find(entry => entry.name === selectedArmorName) || null;
    return mergeNpcRecord(armor, armor ? armorOverrides[armor.name] : null);
  }, [armorOptions, selectedArmorName, armorOverrides]);
  const selectedShield = useMemo(() => {
    const shield = shieldOptions.find(entry => entry.name === selectedShieldName) || null;
    return mergeNpcRecord(shield, shield ? shieldOverrides[shield.name] : null);
  }, [shieldOptions, selectedShieldName, shieldOverrides]);
  const selectedWeapons = useMemo(() => selectedWeaponNames.map(weaponName => {
    const weapon = weaponOptions.find(entry => entry.name === weaponName);
    return weapon ? mergeNpcRecord(weapon, weaponOverrides[weapon.name]) : null;
  }).filter(Boolean), [weaponOptions, selectedWeaponNames, weaponOverrides]);
  const selectedActionAbilities = useMemo(() => selectedActionAbilityNames.map(abilityName => {
    const ability = actionAbilityOptions.find(entry => entry.name === abilityName);
    return ability ? mergeNpcRecord(ability, actionAbilityOverrides[ability.name]) : null;
  }).filter(Boolean), [actionAbilityOptions, selectedActionAbilityNames, actionAbilityOverrides]);
  const selectedPassiveAbilities = useMemo(() => selectedPassiveAbilityNames.map(abilityName => {
    const ability = passiveAbilityOptions.find(entry => entry.name === abilityName);
    return ability ? mergeNpcRecord(ability, passiveAbilityOverrides[ability.name]) : null;
  }).filter(Boolean), [passiveAbilityOptions, selectedPassiveAbilityNames, passiveAbilityOverrides]);
  const equipmentPropertyLookup = useMemo(() => {
    const lookup = new Map();
    equipmentProperties.forEach(property => {
      const propertyName = String(property?.name || "").trim();
      if (!propertyName) return;
      lookup.set(propertyName.toLowerCase(), property);
      lookup.set(getParameterizedPropertyLabel(propertyName).toLowerCase(), property);
    });
    return lookup;
  }, [equipmentProperties]);

  const addSelectedWeapon = weaponName => {
    const nextWeaponName = String(weaponName || "").trim();
    if (!nextWeaponName || nextWeaponName === CUSTOM_OPTION_VALUE) return;
    setSelectedWeaponNames(previousNames => previousNames.includes(nextWeaponName) ? previousNames : [...previousNames, nextWeaponName]);
  };

  const removeSelectedWeapon = weaponName => {
    setSelectedWeaponNames(previousNames => previousNames.filter(currentName => currentName !== weaponName));
  };

  const addSelectedActionAbility = abilityName => {
    const nextAbilityName = String(abilityName || "").trim();
    if (!nextAbilityName || nextAbilityName === CUSTOM_OPTION_VALUE) return;
    setSelectedActionAbilityNames(previousNames => previousNames.includes(nextAbilityName) ? previousNames : [...previousNames, nextAbilityName]);
  };

  const removeSelectedActionAbility = abilityName => {
    setSelectedActionAbilityNames(previousNames => previousNames.filter(currentName => currentName !== abilityName));
  };
  const addSelectedPassiveAbility = abilityName => {
    const nextAbilityName = String(abilityName || "").trim();
    if (!nextAbilityName || nextAbilityName === CUSTOM_OPTION_VALUE) return;
    setSelectedPassiveAbilityNames(previousNames => previousNames.includes(nextAbilityName) ? previousNames : [...previousNames, nextAbilityName]);
  };
  const removeSelectedPassiveAbility = abilityName => {
    setSelectedPassiveAbilityNames(previousNames => previousNames.filter(currentName => currentName !== abilityName));
  };
  const exportNpcSnapshot = () => ({
    version: 1,
    name,
    difficulty,
    npcType,
    stats,
    sideStats,
    speed,
    actionPoints,
    selectedArmorName,
    selectedShieldName,
    weaponChoiceName,
    selectedWeaponNames,
    selectedActionAbilityName,
    selectedActionAbilityNames,
    selectedPassiveAbilityName,
    selectedPassiveAbilityNames,
    customArmors,
    customShields,
    customWeapons,
    customActionAbilities,
    customPassiveAbilities,
    armorOverrides,
    shieldOverrides,
    weaponOverrides,
    actionAbilityOverrides,
    passiveAbilityOverrides,
    sideStatOverrides
  });
  const handleExportNpc = () => {
    try {
      const payload = JSON.stringify(exportNpcSnapshot(), null, 2);
      const blob = new Blob([payload], {
        type: "application/json"
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const safeName = String(name || "npc").trim().replace(/[^a-z0-9-]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "npc";
      link.href = url;
      link.download = `${safeName}-builder.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setFooterMessage("NPC exported.");
    } catch (_error) {
      setFooterMessage("Unable to export this NPC.");
    }
  };
  const handleImportNpc = async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const rawText = await file.text();
      const data = JSON.parse(rawText);
      applyNpcSnapshot(data);
      setFooterMessage("NPC imported.");
    } catch (_error) {
      setFooterMessage("Import failed. Check the file and try again.");
    } finally {
      event.target.value = "";
    }
  };
  const openImportPicker = () => {
    importInputRef.current?.click();
  };
  const toggleEquipmentEditMode = () => {
    setEquipmentEditEnabled(previousValue => {
      const nextValue = !previousValue;
      if (!nextValue) {
        setEditingArmorName("");
        setEditingShieldName("");
        setEditingWeaponName("");
        setEditingActionAbilityName("");
        setEditingPassiveAbilityName("");
        setEditingSideStatName("");
      }
      setFooterMessage(nextValue ? "Edit mode enabled." : "Edit mode disabled.");
      return nextValue;
    });
  };
  const loadNpcFromLibrary = npcSnapshot => {
    applyNpcSnapshot(npcSnapshot);
    setFooterMessage(`${String(npcSnapshot?.name || "NPC")} loaded from the compendium.`);
  };
  const toggleNpcLibraryTypeFilter = typeName => {
    setNpcLibraryTypeFilters(previousTypes => previousTypes.includes(typeName) ? previousTypes.filter(currentType => currentType !== typeName) : [...previousTypes, typeName]);
  };
  const toggleNpcLibraryItemFilterValue = (filterKey, value) => {
    setNpcLibraryItemFilters(previousFilters => {
      const currentFilter = previousFilters?.[filterKey] || {
        mode: "or",
        values: []
      };
      const nextValues = currentFilter.values.includes(value) ? currentFilter.values.filter(currentValue => currentValue !== value) : [...currentFilter.values, value];
      return {
        ...previousFilters,
        [filterKey]: {
          ...currentFilter,
          values: nextValues
        }
      };
    });
  };
  const updateNpcLibraryItemFilterMode = (filterKey, mode) => {
    setNpcLibraryItemFilters(previousFilters => ({
      ...previousFilters,
      [filterKey]: {
        ...(previousFilters?.[filterKey] || { values: [] }),
        mode
      }
    }));
  };
  const updateNpcLibraryStatRange = (statName, bound, value) => {
    const statMaximum = getNpcLibraryStatMaximum(statName);
    const nextValue = clampNpcFilterRangeValue(value, statMaximum);
    setNpcLibraryStatRanges(previousRanges => ({
      ...previousRanges,
      [statName]: (() => {
        const currentRange = previousRanges[statName] || {
          min: "0",
          max: String(statMaximum)
        };
        const currentMin = clampNpcFilterRangeValue(currentRange.min, statMaximum);
        const currentMax = clampNpcFilterRangeValue(currentRange.max || statMaximum, statMaximum);

        if (bound === "min") {
          return {
            min: String(Math.min(nextValue, currentMax)),
            max: String(currentMax)
          };
        }

        return {
          min: String(currentMin),
          max: String(Math.max(nextValue, currentMin))
        };
      })()
    }));
  };
  const updateNpcLibraryDifficultyRange = (bound, value) => {
    const nextValue = clampNpcFilterRangeValue(value);
    const currentMin = clampNpcFilterRangeValue(npcLibraryDifficultyMin);
    const currentMax = clampNpcFilterRangeValue(npcLibraryDifficultyMax || 20);
    if (bound === "min") {
      setNpcLibraryDifficultyMin(String(Math.min(nextValue, currentMax)));
      return;
    }
    setNpcLibraryDifficultyMax(String(Math.max(nextValue, currentMin)));
  };
  const clearNpcLibraryFilters = () => {
    setNpcLibrarySortField("name");
    setNpcLibrarySortDirection("asc");
    setNpcLibraryDifficultyMin("0");
    setNpcLibraryDifficultyMax("20");
    setNpcLibraryStatRanges(createNpcLibraryStatRanges());
    setNpcLibraryTypeFilters([]);
    setNpcLibraryItemFilters(createNpcLibraryItemFilters());
  };
  const saveNpcToLibrary = async () => {
    const snapshot = exportNpcSnapshot();
    if (!String(snapshot.name || "").trim()) {
      setNpcLibraryMessage("Name this NPC before saving it to the compendium.");
      return;
    }

    try {
      setNpcLibraryMessage("Saving NPC to the compendium...");
      const response = await fetch(`${API_URL}/pirate-system/npc-compendium/save-npc`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        credentials: "include",
        body: JSON.stringify({
          npc: snapshot
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.message || "Unable to save NPC.");

      setNpcCompendiumArmors(Array.isArray(data?.npcArmors) ? data.npcArmors : []);
      setNpcCompendiumShields(Array.isArray(data?.npcShields) ? data.npcShields : []);
      setNpcCompendiumWeapons(Array.isArray(data?.npcWeapons) ? data.npcWeapons : []);
      setActionAbilities(Array.isArray(data?.npcActionAbilities) ? data.npcActionAbilities : []);
      setPassiveAbilities(Array.isArray(data?.npcPassiveAbilities) ? data.npcPassiveAbilities : []);
      await loadNpcCompendium();
      setNpcLibraryMessage(data?.message || "NPC saved to the compendium.");
      setFooterMessage(data?.message || "NPC saved to the compendium.");
    } catch (error) {
      setNpcLibraryMessage(error.message || "Unable to save NPC.");
    }
  };

  const saveNpcAbility = async abilityType => {
    const isAction = abilityType === "action";
    const form = isAction ? actionAbilityForm : passiveAbilityForm;
    const ability = {
      name: form.name,
      description: form.description,
      ...(isAction
        ? {
            actionCost: form.actionCost,
            enduranceCost: form.enduranceCost
          }
        : {})
    };

    try {
      setAbilityMessage("Saving NPC ability...");
      const response = await fetch(`${API_URL}/pirate-system/npc-compendium/add-ability`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        credentials: "include",
        body: JSON.stringify({
          abilityType,
          ability
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.message || "Unable to save NPC ability.");

      if (isAction) {
        setActionAbilities(previousAbilities => [...previousAbilities, data.ability]);
        setSelectedActionAbilityName(currentName => currentName || data.ability.name);
        setActionAbilityForm({
          name: "",
          actionCost: "",
          enduranceCost: "",
          description: ""
        });
      } else {
        setPassiveAbilities(previousAbilities => [...previousAbilities, data.ability]);
        setPassiveAbilityForm({
          name: "",
          description: ""
        });
      }
      setAbilityMessage(data?.message || "NPC ability saved.");
    } catch (error) {
      setAbilityMessage(error.message || "Unable to save NPC ability.");
    }
  };

  const renderAbilityList = (abilityList, type) => abilityList.length > 0 ? h("div", {
    className: "npcAbilityList"
  }, abilityList.map(ability => h("div", {
    key: ability.name,
    className: "npcAbilityCard"
  }, h("div", {
    className: "npcAbilityName"
  }, ability.name), type === "action" ? h("div", {
    className: "npcAbilityMeta"
  }, h("span", null, `Action Cost: ${ability.actionCost ?? ""}`), h("span", null, `Endurance Cost: ${ability.enduranceCost ?? ""}`)) : null, h("div", {
    className: "npcAbilityDescription"
  }, ability.description || "No description yet.")))) : h("div", {
    className: "npcMuted"
  }, "No NPC abilities saved yet.");

  const updateActionAbilityForm = (field, value) => {
    setActionAbilityForm(previousForm => ({
      ...previousForm,
      [field]: value
    }));
  };

  const updatePassiveAbilityForm = (field, value) => {
    setPassiveAbilityForm(previousForm => ({
      ...previousForm,
      [field]: value
    }));
  };
  const updateCustomArmorForm = (field, value) => {
    setCustomArmorForm(previousForm => ({
      ...previousForm,
      [field]: value
    }));
  };
  const updateCustomShieldForm = (field, value) => {
    setCustomShieldForm(previousForm => ({
      ...previousForm,
      [field]: value
    }));
  };
  const updateCustomWeaponForm = (field, value) => {
    setCustomWeaponForm(previousForm => ({
      ...previousForm,
      [field]: value
    }));
  };
  const updateCustomActionAbilityForm = (field, value) => {
    setCustomActionAbilityForm(previousForm => ({
      ...previousForm,
      [field]: value
    }));
  };
  const updateCustomPassiveAbilityForm = (field, value) => {
    setCustomPassiveAbilityForm(previousForm => ({
      ...previousForm,
      [field]: value
    }));
  };
  const updateArmorEditForm = (field, value) => {
    setArmorEditForm(previousForm => ({
      ...previousForm,
      [field]: value
    }));
  };
  const updateShieldEditForm = (field, value) => {
    setShieldEditForm(previousForm => ({
      ...previousForm,
      [field]: value
    }));
  };
  const updateWeaponEditForm = (field, value) => {
    setWeaponEditForm(previousForm => ({
      ...previousForm,
      [field]: value
    }));
  };
  const updateActionAbilityEditForm = (field, value) => {
    setActionAbilityEditForm(previousForm => ({
      ...previousForm,
      [field]: value
    }));
  };
  const updatePassiveAbilityEditForm = (field, value) => {
    setPassiveAbilityEditForm(previousForm => ({
      ...previousForm,
      [field]: value
    }));
  };
  const updateSideStatEditForm = (field, value) => {
    setSideStatEditForm(previousForm => ({
      ...previousForm,
      [field]: value
    }));
  };
  const addCustomArmor = () => {
    const name = String(customArmorForm.name || "").trim();
    if (!name) return;
    const nextArmor = {
      name,
      baseEvasion: Number(customArmorForm.baseEvasion) || 0,
      toughness: Number(customArmorForm.toughness) || 0,
      dashPenalty: Number(customArmorForm.dashPenalty) || 0,
      properties: parseCommaSeparatedList(customArmorForm.properties),
      shareToNpcCompendium: Boolean(customArmorForm.shareToNpcCompendium)
    };
    setCustomArmors(previousArmors => [...previousArmors.filter(armor => armor.name !== name), nextArmor]);
    setSelectedArmorName(name);
    setCustomArmorForm({
      name: "",
      baseEvasion: "",
      toughness: "",
      dashPenalty: "",
      properties: "",
      shareToNpcCompendium: false
    });
  };
  const addCustomShield = () => {
    const name = String(customShieldForm.name || "").trim();
    if (!name) return;
    const nextShield = {
      name,
      toughness: Number(customShieldForm.toughness) || 0,
      braceCost: Number(customShieldForm.braceCost) || 0,
      dashPenalty: Number(customShieldForm.dashPenalty) || 0,
      properties: parseCommaSeparatedList(customShieldForm.properties),
      shareToNpcCompendium: Boolean(customShieldForm.shareToNpcCompendium)
    };
    setCustomShields(previousShields => [...previousShields.filter(shield => shield.name !== name), nextShield]);
    setSelectedShieldName(name);
    setCustomShieldForm({
      name: "",
      toughness: "",
      braceCost: "",
      dashPenalty: "",
      properties: "",
      shareToNpcCompendium: false
    });
  };
  const addCustomWeapon = () => {
    const name = String(customWeaponForm.name || "").trim();
    if (!name) return;
    const nextWeapon = {
      name,
      type: parseCommaSeparatedList(customWeaponForm.type),
      attackStats: parseCommaSeparatedList(customWeaponForm.attackStats),
      attackBonus: parseOptionalNumber(customWeaponForm.attackBonus),
      damage: {
        dice: String(customWeaponForm.damageDice || "").trim(),
        type: String(customWeaponForm.damageType || "").trim()
      },
      enduranceCost: Number(customWeaponForm.enduranceCost) || 0,
      properties: parseCommaSeparatedList(customWeaponForm.properties),
      shareToNpcCompendium: Boolean(customWeaponForm.shareToNpcCompendium)
    };
    setCustomWeapons(previousWeapons => [...previousWeapons.filter(weapon => weapon.name !== name), nextWeapon]);
    setSelectedWeaponNames(previousNames => previousNames.includes(name) ? previousNames : [...previousNames, name]);
    setWeaponChoiceName("");
    setCustomWeaponForm({
      name: "",
      type: "",
      attackStats: "",
      attackBonus: "",
      damageDice: "",
      damageType: "",
      enduranceCost: "",
      properties: "",
      shareToNpcCompendium: false
    });
  };
  const addCustomActionAbility = () => {
    const name = String(customActionAbilityForm.name || "").trim();
    if (!name) return;
    const nextAbility = {
      name,
      actionCost: Number(customActionAbilityForm.actionCost) || 0,
      enduranceCost: Number(customActionAbilityForm.enduranceCost) || 0,
      description: String(customActionAbilityForm.description || "").trim(),
      shareToNpcCompendium: Boolean(customActionAbilityForm.shareToNpcCompendium)
    };
    setCustomActionAbilities(previousAbilities => [...previousAbilities.filter(ability => ability.name !== name), nextAbility]);
    setSelectedActionAbilityNames(previousNames => previousNames.includes(name) ? previousNames : [...previousNames, name]);
    setSelectedActionAbilityName("");
    setCustomActionAbilityForm({
      name: "",
      actionCost: "",
      enduranceCost: "",
      description: "",
      shareToNpcCompendium: false
    });
  };
  const addCustomPassiveAbility = () => {
    const name = String(customPassiveAbilityForm.name || "").trim();
    if (!name) return;
    const nextAbility = {
      name,
      description: String(customPassiveAbilityForm.description || "").trim(),
      shareToNpcCompendium: Boolean(customPassiveAbilityForm.shareToNpcCompendium)
    };
    setCustomPassiveAbilities(previousAbilities => [...previousAbilities.filter(ability => ability.name !== name), nextAbility]);
    setSelectedPassiveAbilityNames(previousNames => previousNames.includes(name) ? previousNames : [...previousNames, name]);
    setSelectedPassiveAbilityName("");
    setCustomPassiveAbilityForm({
      name: "",
      description: "",
      shareToNpcCompendium: false
    });
  };
  const openArmorEditor = () => {
    if (!selectedArmor || !selectedArmorName || selectedArmorName === CUSTOM_OPTION_VALUE) return;
    setEditingArmorName(selectedArmorName);
    setArmorEditForm({
      name: selectedArmor.name || "",
      baseEvasion: String(selectedArmor.baseEvasion ?? ""),
      toughness: String(selectedArmor.toughness ?? ""),
      dashPenalty: String(selectedArmor.dashPenalty ?? ""),
      properties: Array.isArray(selectedArmor.properties) ? selectedArmor.properties.join(", ") : ""
    });
  };
  const openShieldEditor = () => {
    if (!selectedShield || !selectedShieldName || selectedShieldName === CUSTOM_OPTION_VALUE) return;
    setEditingShieldName(selectedShieldName);
    setShieldEditForm({
      name: selectedShield.name || "",
      toughness: String(selectedShield.toughness ?? ""),
      braceCost: String(selectedShield.braceCost ?? ""),
      dashPenalty: String(selectedShield.dashPenalty ?? ""),
      properties: Array.isArray(selectedShield.properties) ? selectedShield.properties.join(", ") : ""
    });
  };
  const openWeaponEditor = weapon => {
    if (!weapon?.name) return;
    setEditingWeaponName(weapon.name);
    setWeaponEditForm({
      name: weapon.name || "",
      type: Array.isArray(weapon.type) ? weapon.type.join(", ") : "",
      attackStats: Array.isArray(weapon.attackStats) ? weapon.attackStats.join(", ") : "",
      attackBonus: weapon.attackBonus === null || weapon.attackBonus === undefined ? "" : String(weapon.attackBonus),
      damageDice: weapon.damage?.dice || "",
      damageType: weapon.damage?.type || "",
      enduranceCost: String(weapon.enduranceCost ?? ""),
      properties: Array.isArray(weapon.properties) ? weapon.properties.join(", ") : ""
    });
  };
  const openActionAbilityEditor = ability => {
    if (!ability?.name) return;
    setEditingActionAbilityName(ability.name);
    setActionAbilityEditForm({
      name: ability.name || "",
      actionCost: String(ability.actionCost ?? ""),
      enduranceCost: String(ability.enduranceCost ?? ""),
      description: ability.description || ""
    });
  };
  const openPassiveAbilityEditor = ability => {
    if (!ability?.name) return;
    setEditingPassiveAbilityName(ability.name);
    setPassiveAbilityEditForm({
      name: ability.name || "",
      description: ability.description || ""
    });
  };
  const openSideStatEditor = statName => {
    setEditingSideStatName(statName);
    setSideStatEditForm(statName === "Speed" ? {
      value: "",
      normalMove: String(speed.normalMove ?? ""),
      dashMove: String(speed.dashMove ?? "")
    } : {
      value: String(sideStats[statName] ?? ""),
      normalMove: "",
      dashMove: ""
    });
  };
  const saveArmorEdit = () => {
    if (!editingArmorName) return;
    setArmorOverrides(previousOverrides => ({
      ...previousOverrides,
      [editingArmorName]: {
        name: String(armorEditForm.name || "").trim() || editingArmorName,
        baseEvasion: Number(armorEditForm.baseEvasion) || 0,
        toughness: Number(armorEditForm.toughness) || 0,
        dashPenalty: Number(armorEditForm.dashPenalty) || 0,
        properties: parseCommaSeparatedList(armorEditForm.properties)
      }
    }));
    setEditingArmorName("");
  };
  const saveShieldEdit = () => {
    if (!editingShieldName) return;
    setShieldOverrides(previousOverrides => ({
      ...previousOverrides,
      [editingShieldName]: {
        name: String(shieldEditForm.name || "").trim() || editingShieldName,
        toughness: Number(shieldEditForm.toughness) || 0,
        braceCost: Number(shieldEditForm.braceCost) || 0,
        dashPenalty: Number(shieldEditForm.dashPenalty) || 0,
        properties: parseCommaSeparatedList(shieldEditForm.properties)
      }
    }));
    setEditingShieldName("");
  };
  const saveWeaponEdit = () => {
    if (!editingWeaponName) return;
    setWeaponOverrides(previousOverrides => ({
      ...previousOverrides,
      [editingWeaponName]: {
        name: String(weaponEditForm.name || "").trim() || editingWeaponName,
        type: parseCommaSeparatedList(weaponEditForm.type),
        attackStats: parseCommaSeparatedList(weaponEditForm.attackStats),
        attackBonus: parseOptionalNumber(weaponEditForm.attackBonus),
        damage: {
          dice: String(weaponEditForm.damageDice || "").trim(),
          type: String(weaponEditForm.damageType || "").trim()
        },
        enduranceCost: Number(weaponEditForm.enduranceCost) || 0,
        properties: parseCommaSeparatedList(weaponEditForm.properties)
      }
    }));
    setEditingWeaponName("");
  };
  const saveActionAbilityEdit = () => {
    if (!editingActionAbilityName) return;
    setActionAbilityOverrides(previousOverrides => ({
      ...previousOverrides,
      [editingActionAbilityName]: {
        name: String(actionAbilityEditForm.name || "").trim() || editingActionAbilityName,
        actionCost: Number(actionAbilityEditForm.actionCost) || 0,
        enduranceCost: Number(actionAbilityEditForm.enduranceCost) || 0,
        description: String(actionAbilityEditForm.description || "").trim()
      }
    }));
    setEditingActionAbilityName("");
  };
  const savePassiveAbilityEdit = () => {
    if (!editingPassiveAbilityName) return;
    setPassiveAbilityOverrides(previousOverrides => ({
      ...previousOverrides,
      [editingPassiveAbilityName]: {
        name: String(passiveAbilityEditForm.name || "").trim() || editingPassiveAbilityName,
        description: String(passiveAbilityEditForm.description || "").trim()
      }
    }));
    setEditingPassiveAbilityName("");
  };
  const saveSideStatEdit = () => {
    if (!editingSideStatName) return;
    if (editingSideStatName === "Speed") {
      const nextNormalMove = Number(sideStatEditForm.normalMove) || 0;
      const nextDashMove = Number(sideStatEditForm.dashMove) || 0;
      setSpeed({
        normalMove: nextNormalMove,
        dashMove: nextDashMove
      });
      setSideStatOverrides(previousOverrides => ({
        ...previousOverrides,
        normalMove: nextNormalMove,
        dashMove: nextDashMove
      }));
    } else {
      const nextValue = Number(sideStatEditForm.value) || 0;
      setSideStats(previousStats => ({
        ...previousStats,
        [editingSideStatName]: nextValue
      }));
      setSideStatOverrides(previousOverrides => ({
        ...previousOverrides,
        [editingSideStatName]: nextValue
      }));
    }
    setEditingSideStatName("");
  };
  const restoreSideStatDefault = () => {
    if (!editingSideStatName) return;
    if (editingSideStatName === "Speed") {
      setSideStatOverrides(previousOverrides => ({
        ...previousOverrides,
        normalMove: null,
        dashMove: null
      }));
    } else {
      setSideStatOverrides(previousOverrides => ({
        ...previousOverrides,
        [editingSideStatName]: null
      }));
    }
    setEditingSideStatName("");
  };
  const positionEquipmentPropertyTooltip = event => {
    const propertyTag = event.currentTarget;
    const tooltip = propertyTag.querySelector(".compendiumPropertyTooltip");
    if (!tooltip) return;
    tooltip.classList.remove("isAbove");
    tooltip.style.display = "block";
    tooltip.style.visibility = "hidden";
    const tagRect = propertyTag.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const tooltipGap = 8;
    const viewportPadding = 8;
    const belowTop = tagRect.bottom + tooltipGap;
    const aboveTop = tagRect.top - tooltipGap - tooltipRect.height;
    const shouldOpenAbove = belowTop + tooltipRect.height > window.innerHeight - viewportPadding && aboveTop >= viewportPadding;
    const top = shouldOpenAbove ? aboveTop : Math.min(belowTop, Math.max(viewportPadding, window.innerHeight - tooltipRect.height - viewportPadding));
    const left = Math.min(Math.max(tagRect.left + tagRect.width / 2, tooltipRect.width / 2 + viewportPadding), window.innerWidth - tooltipRect.width / 2 - viewportPadding);
    tooltip.classList.toggle("isAbove", shouldOpenAbove);
    tooltip.style.setProperty("--tooltip-left", `${left}px`);
    tooltip.style.setProperty("--tooltip-top", `${top}px`);
    tooltip.style.display = "";
    tooltip.style.visibility = "";
  };
  const renderEquipmentPropertyValue = propertyText => {
    const exactMatch = equipmentPropertyLookup.get(String(propertyText || "").trim().toLowerCase());
    const parameterizedMatch = equipmentPropertyLookup.get(getParameterizedPropertyLabel(propertyText).toLowerCase());
    const filterMatch = equipmentPropertyLookup.get(getPropertyFilterLabel(propertyText).toLowerCase());
    const propertyDefinition = exactMatch || parameterizedMatch || filterMatch || null;
    return h("span", {
      key: String(propertyText || ""),
      className: propertyDefinition ? "compendiumPropertyTag hasTooltip" : "compendiumPropertyTag",
      onMouseEnter: propertyDefinition ? positionEquipmentPropertyTooltip : undefined,
      onFocus: propertyDefinition ? positionEquipmentPropertyTooltip : undefined,
      title: propertyDefinition?.description || undefined,
      tabIndex: propertyDefinition ? 0 : undefined
    }, propertyText, propertyDefinition ? h("span", {
      className: "compendiumPropertyTooltip"
    }, h("strong", null, propertyDefinition.name), propertyDefinition.description ? h("span", null, propertyDefinition.description) : null) : null);
  };
  const renderEquipmentPropertyList = properties => {
    const propertyList = Array.isArray(properties) ? properties.filter(Boolean) : [];
    if (propertyList.length === 0) return "None";
    return h("div", {
      className: "compendiumPropertyList"
    }, propertyList.map(renderEquipmentPropertyValue));
  };
  const customArmorFormElement = equipmentEditEnabled && selectedArmorName === CUSTOM_OPTION_VALUE ? h("div", {
    className: "npcEquipmentForm"
  }, h("label", {
    className: "npcLabel"
  }, "Name", h("input", {
    className: "npcInput",
    value: customArmorForm.name,
    onChange: event => updateCustomArmorForm("name", event.target.value)
  })), h("label", {
    className: "npcLabel"
  }, "Base Evasion", h("input", {
    className: "npcInput",
    type: "number",
    value: customArmorForm.baseEvasion,
    onChange: event => updateCustomArmorForm("baseEvasion", event.target.value)
  })), h("label", {
    className: "npcLabel"
  }, "Toughness", h("input", {
    className: "npcInput",
    type: "number",
    value: customArmorForm.toughness,
    onChange: event => updateCustomArmorForm("toughness", event.target.value)
  })), h("label", {
    className: "npcLabel"
  }, "Dash Penalty", h("input", {
    className: "npcInput",
    type: "number",
    value: customArmorForm.dashPenalty,
    onChange: event => updateCustomArmorForm("dashPenalty", event.target.value)
  })), h("label", {
    className: "npcLabel"
  }, "Properties", h("input", {
    className: "npcInput",
    value: customArmorForm.properties,
    onChange: event => updateCustomArmorForm("properties", event.target.value),
    placeholder: "Comma separated"
  })), canSaveToNpcCompendium ? h("label", {
    className: "npcCheckboxLabel npcWideField"
  }, h("input", {
    type: "checkbox",
    checked: Boolean(customArmorForm.shareToNpcCompendium),
    onChange: event => updateCustomArmorForm("shareToNpcCompendium", event.target.checked)
  }), "Add this armor to the NPC Compendium on Cloud Save") : null, h("button", {
    type: "button",
    className: "npcSaveButton",
    onClick: addCustomArmor
  }, "Add Custom Armor")) : null;
  const armorEditFormElement = equipmentEditEnabled && editingArmorName === selectedArmorName && selectedArmor ? h("div", {
    className: "npcEquipmentForm"
  }, h("label", {
    className: "npcLabel"
  }, "Name", h("input", {
    className: "npcInput",
    value: armorEditForm.name,
    onChange: event => updateArmorEditForm("name", event.target.value)
  })), h("label", {
    className: "npcLabel"
  }, "Base Evasion", h("input", {
    className: "npcInput",
    type: "number",
    value: armorEditForm.baseEvasion,
    onChange: event => updateArmorEditForm("baseEvasion", event.target.value)
  })), h("label", {
    className: "npcLabel"
  }, "Toughness", h("input", {
    className: "npcInput",
    type: "number",
    value: armorEditForm.toughness,
    onChange: event => updateArmorEditForm("toughness", event.target.value)
  })), h("label", {
    className: "npcLabel"
  }, "Dash Penalty", h("input", {
    className: "npcInput",
    type: "number",
    value: armorEditForm.dashPenalty,
    onChange: event => updateArmorEditForm("dashPenalty", event.target.value)
  })), h("label", {
    className: "npcLabel"
  }, "Properties", h("input", {
    className: "npcInput",
    value: armorEditForm.properties,
    onChange: event => updateArmorEditForm("properties", event.target.value),
    placeholder: "Comma separated"
  })), h("div", {
    className: "npcInlineActions"
  }, h("button", {
    type: "button",
    className: "npcSaveButton",
    onClick: saveArmorEdit
  }, "Save"), h("button", {
    type: "button",
    className: "npcSecondaryButton",
    onClick: () => setEditingArmorName("")
  }, "Cancel"))) : null;
  const customShieldFormElement = equipmentEditEnabled && selectedShieldName === CUSTOM_OPTION_VALUE ? h("div", {
    className: "npcEquipmentForm"
  }, h("label", {
    className: "npcLabel"
  }, "Name", h("input", {
    className: "npcInput",
    value: customShieldForm.name,
    onChange: event => updateCustomShieldForm("name", event.target.value)
  })), h("label", {
    className: "npcLabel"
  }, "Toughness", h("input", {
    className: "npcInput",
    type: "number",
    value: customShieldForm.toughness,
    onChange: event => updateCustomShieldForm("toughness", event.target.value)
  })), h("label", {
    className: "npcLabel"
  }, "Brace Cost", h("input", {
    className: "npcInput",
    type: "number",
    value: customShieldForm.braceCost,
    onChange: event => updateCustomShieldForm("braceCost", event.target.value)
  })), h("label", {
    className: "npcLabel"
  }, "Dash Penalty", h("input", {
    className: "npcInput",
    type: "number",
    value: customShieldForm.dashPenalty,
    onChange: event => updateCustomShieldForm("dashPenalty", event.target.value)
  })), h("label", {
    className: "npcLabel"
  }, "Properties", h("input", {
    className: "npcInput",
    value: customShieldForm.properties,
    onChange: event => updateCustomShieldForm("properties", event.target.value),
    placeholder: "Comma separated"
  })), canSaveToNpcCompendium ? h("label", {
    className: "npcCheckboxLabel npcWideField"
  }, h("input", {
    type: "checkbox",
    checked: Boolean(customShieldForm.shareToNpcCompendium),
    onChange: event => updateCustomShieldForm("shareToNpcCompendium", event.target.checked)
  }), "Add this shield to the NPC Compendium on Cloud Save") : null, h("button", {
    type: "button",
    className: "npcSaveButton",
    onClick: addCustomShield
  }, "Add Custom Shield")) : null;
  const shieldEditFormElement = equipmentEditEnabled && editingShieldName === selectedShieldName && selectedShield ? h("div", {
    className: "npcEquipmentForm"
  }, h("label", {
    className: "npcLabel"
  }, "Name", h("input", {
    className: "npcInput",
    value: shieldEditForm.name,
    onChange: event => updateShieldEditForm("name", event.target.value)
  })), h("label", {
    className: "npcLabel"
  }, "Toughness", h("input", {
    className: "npcInput",
    type: "number",
    value: shieldEditForm.toughness,
    onChange: event => updateShieldEditForm("toughness", event.target.value)
  })), h("label", {
    className: "npcLabel"
  }, "Brace Cost", h("input", {
    className: "npcInput",
    type: "number",
    value: shieldEditForm.braceCost,
    onChange: event => updateShieldEditForm("braceCost", event.target.value)
  })), h("label", {
    className: "npcLabel"
  }, "Dash Penalty", h("input", {
    className: "npcInput",
    type: "number",
    value: shieldEditForm.dashPenalty,
    onChange: event => updateShieldEditForm("dashPenalty", event.target.value)
  })), h("label", {
    className: "npcLabel"
  }, "Properties", h("input", {
    className: "npcInput",
    value: shieldEditForm.properties,
    onChange: event => updateShieldEditForm("properties", event.target.value),
    placeholder: "Comma separated"
  })), h("div", {
    className: "npcInlineActions"
  }, h("button", {
    type: "button",
    className: "npcSaveButton",
    onClick: saveShieldEdit
  }, "Save"), h("button", {
    type: "button",
    className: "npcSecondaryButton",
    onClick: () => setEditingShieldName("")
  }, "Cancel"))) : null;
  const customWeaponFormElement = equipmentEditEnabled && weaponChoiceName === CUSTOM_OPTION_VALUE ? h("div", {
    className: "npcEquipmentForm"
  }, h("label", {
    className: "npcLabel"
  }, "Name", h("input", {
    className: "npcInput",
    value: customWeaponForm.name,
    onChange: event => updateCustomWeaponForm("name", event.target.value)
  })), h("label", {
    className: "npcLabel"
  }, "Type", h("input", {
    className: "npcInput",
    value: customWeaponForm.type,
    onChange: event => updateCustomWeaponForm("type", event.target.value),
    placeholder: "Comma separated"
  })), h("label", {
    className: "npcLabel"
  }, "Attack Stats", h("input", {
    className: "npcInput",
    value: customWeaponForm.attackStats,
    onChange: event => updateCustomWeaponForm("attackStats", event.target.value),
    placeholder: "Brawn, Finesse"
  })), h("label", {
    className: "npcLabel"
  }, "Custom Attack Bonus", h("input", {
    className: "npcInput npcLeftAlignedNumberInput",
    type: "number",
    value: customWeaponForm.attackBonus,
    onChange: event => updateCustomWeaponForm("attackBonus", event.target.value)
  })), h("label", {
    className: "npcLabel"
  }, "Damage Dice", h("input", {
    className: "npcInput",
    value: customWeaponForm.damageDice,
    onChange: event => updateCustomWeaponForm("damageDice", event.target.value),
    placeholder: "1d6"
  })), h("label", {
    className: "npcLabel"
  }, "Damage Type", h("input", {
    className: "npcInput",
    value: customWeaponForm.damageType,
    onChange: event => updateCustomWeaponForm("damageType", event.target.value)
  })), h("label", {
    className: "npcLabel"
  }, "Endurance Cost", h("input", {
    className: "npcInput npcLeftAlignedNumberInput",
    type: "number",
    value: customWeaponForm.enduranceCost,
    onChange: event => updateCustomWeaponForm("enduranceCost", event.target.value)
  })), h("label", {
    className: "npcLabel"
  }, "Properties", h("input", {
    className: "npcInput",
    value: customWeaponForm.properties,
    onChange: event => updateCustomWeaponForm("properties", event.target.value),
    placeholder: "Comma separated"
  })), canSaveToNpcCompendium ? h("label", {
    className: "npcCheckboxLabel npcWideField"
  }, h("input", {
    type: "checkbox",
    checked: Boolean(customWeaponForm.shareToNpcCompendium),
    onChange: event => updateCustomWeaponForm("shareToNpcCompendium", event.target.checked)
  }), "Add this weapon to the NPC Compendium on Cloud Save") : null, h("button", {
    type: "button",
    className: "npcSaveButton",
    onClick: addCustomWeapon
  }, "Add Custom Weapon")) : null;
  const customActionAbilityFormElement = equipmentEditEnabled && selectedActionAbilityName === CUSTOM_OPTION_VALUE ? h("div", {
    className: "npcEquipmentForm"
  }, h("label", {
    className: "npcLabel"
  }, "Name", h("input", {
    className: "npcInput",
    value: customActionAbilityForm.name,
    onChange: event => updateCustomActionAbilityForm("name", event.target.value)
  })), h("label", {
    className: "npcLabel"
  }, "Action Cost", h("input", {
    className: "npcInput npcLeftAlignedNumberInput",
    type: "number",
    value: customActionAbilityForm.actionCost,
    onChange: event => updateCustomActionAbilityForm("actionCost", event.target.value)
  })), h("label", {
    className: "npcLabel"
  }, "Endurance Cost", h("input", {
    className: "npcInput npcLeftAlignedNumberInput",
    type: "number",
    value: customActionAbilityForm.enduranceCost,
    onChange: event => updateCustomActionAbilityForm("enduranceCost", event.target.value)
  })), h("label", {
    className: "npcLabel npcWideField"
  }, "Description", h("textarea", {
    className: "npcTextarea",
    value: customActionAbilityForm.description,
    onChange: event => updateCustomActionAbilityForm("description", event.target.value)
  })), canSaveToNpcCompendium ? h("label", {
    className: "npcCheckboxLabel npcWideField"
  }, h("input", {
    type: "checkbox",
    checked: Boolean(customActionAbilityForm.shareToNpcCompendium),
    onChange: event => updateCustomActionAbilityForm("shareToNpcCompendium", event.target.checked)
  }), "Add this active ability to the NPC Compendium on Cloud Save") : null, h("button", {
    type: "button",
    className: "npcSaveButton",
    onClick: addCustomActionAbility
  }, "Add Custom Ability")) : null;
  const actionAbilityEditFormElement = equipmentEditEnabled && editingActionAbilityName ? h("div", {
    className: "npcEquipmentForm"
  }, h("label", {
    className: "npcLabel"
  }, "Name", h("input", {
    className: "npcInput",
    value: actionAbilityEditForm.name,
    onChange: event => updateActionAbilityEditForm("name", event.target.value)
  })), h("label", {
    className: "npcLabel"
  }, "Action Cost", h("input", {
    className: "npcInput npcLeftAlignedNumberInput",
    type: "number",
    value: actionAbilityEditForm.actionCost,
    onChange: event => updateActionAbilityEditForm("actionCost", event.target.value)
  })), h("label", {
    className: "npcLabel"
  }, "Endurance Cost", h("input", {
    className: "npcInput npcLeftAlignedNumberInput",
    type: "number",
    value: actionAbilityEditForm.enduranceCost,
    onChange: event => updateActionAbilityEditForm("enduranceCost", event.target.value)
  })), h("label", {
    className: "npcLabel npcWideField"
  }, "Description", h("textarea", {
    className: "npcTextarea",
    value: actionAbilityEditForm.description,
    onChange: event => updateActionAbilityEditForm("description", event.target.value)
  })), h("div", {
    className: "npcInlineActions"
  }, h("button", {
    type: "button",
    className: "npcSaveButton",
    onClick: saveActionAbilityEdit
  }, "Save"), h("button", {
    type: "button",
    className: "npcSecondaryButton",
    onClick: () => setEditingActionAbilityName("")
  }, "Cancel"))) : null;
  const customPassiveAbilityFormElement = equipmentEditEnabled && selectedPassiveAbilityName === CUSTOM_OPTION_VALUE ? h("div", {
    className: "npcEquipmentForm"
  }, h("label", {
    className: "npcLabel"
  }, "Name", h("input", {
    className: "npcInput",
    value: customPassiveAbilityForm.name,
    onChange: event => updateCustomPassiveAbilityForm("name", event.target.value)
  })), h("label", {
    className: "npcLabel npcWideField"
  }, "Description", h("textarea", {
    className: "npcTextarea",
    value: customPassiveAbilityForm.description,
    onChange: event => updateCustomPassiveAbilityForm("description", event.target.value)
  })), canSaveToNpcCompendium ? h("label", {
    className: "npcCheckboxLabel npcWideField"
  }, h("input", {
    type: "checkbox",
    checked: Boolean(customPassiveAbilityForm.shareToNpcCompendium),
    onChange: event => updateCustomPassiveAbilityForm("shareToNpcCompendium", event.target.checked)
  }), "Add this passive ability to the NPC Compendium on Cloud Save") : null, h("button", {
    type: "button",
    className: "npcSaveButton",
    onClick: addCustomPassiveAbility
  }, "Add Custom Ability")) : null;
  const passiveAbilityEditFormElement = equipmentEditEnabled && editingPassiveAbilityName ? h("div", {
    className: "npcEquipmentForm"
  }, h("label", {
    className: "npcLabel"
  }, "Name", h("input", {
    className: "npcInput",
    value: passiveAbilityEditForm.name,
    onChange: event => updatePassiveAbilityEditForm("name", event.target.value)
  })), h("label", {
    className: "npcLabel npcWideField"
  }, "Description", h("textarea", {
    className: "npcTextarea",
    value: passiveAbilityEditForm.description,
    onChange: event => updatePassiveAbilityEditForm("description", event.target.value)
  })), h("div", {
    className: "npcInlineActions"
  }, h("button", {
    type: "button",
    className: "npcSaveButton",
    onClick: savePassiveAbilityEdit
  }, "Save"), h("button", {
    type: "button",
    className: "npcSecondaryButton",
    onClick: () => setEditingPassiveAbilityName("")
  }, "Cancel"))) : null;

  const weaponTableColumns = [
    ["Type", weapon => (weapon.type || []).join(", ") || "None"],
    ["Attack Bonus", weapon => getWeaponAttackBonusLabel(weapon, stats)],
    ["Damage", weapon => `${weapon.damage?.dice || ""} ${weapon.damage?.type || ""}`.trim() || "None"],
    ["Evasion Cost", weapon => weapon.enduranceCost ?? ""],
    ["Properties", weapon => renderEquipmentPropertyList(weapon.properties)]
  ];
  const selectedWeaponsTable = selectedWeapons.length > 0 ? h("div", {
    className: "npcWeaponTableWrap"
  }, h("table", {
    className: "npcWeaponInfoTable"
  }, [
    h("thead", {
      key: "head"
    }, h("tr", null, [
      h("th", {
        key: "weapon"
      }, "Weapon"),
      ...weaponTableColumns.map(([label]) => h("th", {
        key: label
      }, label)),
      ...(equipmentEditEnabled ? [h("th", {
        key: "edit"
      }, "Edit"), h("th", {
        key: "remove"
      }, "Remove")] : [])
    ])),
    h("tbody", {
      key: "body"
    }, selectedWeapons.map(weapon => h("tr", {
      key: weapon.name
    }, [
      h("th", {
        key: `${weapon.name}-name`
      }, h("span", {
        className: "npcWeaponHeader"
      }, h("span", null, weapon.name))),
      ...weaponTableColumns.map(([label, getValue]) => h("td", {
        key: `${weapon.name}-${label}`
      }, getValue(weapon))),
      ...(equipmentEditEnabled ? [h("td", {
        key: `${weapon.name}-edit`
      }, h("button", {
        type: "button",
        className: "npcEditButton",
        onClick: () => openWeaponEditor(weapon),
        title: `Edit ${weapon.name}`
      }, "\u270E")), h("td", {
        key: `${weapon.name}-remove`
      }, h("button", {
        type: "button",
        className: "npcRemoveButton",
        onClick: () => removeSelectedWeapon(weapon.name),
        title: `Remove ${weapon.name}`
      }, "X"))] : [])
    ])))
  ])) : h("div", {
    className: "npcMuted"
  }, equipmentEditEnabled ? weapons.length > 0 ? "Select a weapon to add it." : "No weapons loaded." : null);
  const selectedWeaponEditor = editingWeaponName ? h("div", {
    className: "npcEquipmentForm"
  }, h("label", {
    className: "npcLabel"
  }, "Name", h("input", {
    className: "npcInput",
    value: weaponEditForm.name,
    onChange: event => updateWeaponEditForm("name", event.target.value)
  })), h("label", {
    className: "npcLabel"
  }, "Type", h("input", {
    className: "npcInput",
    value: weaponEditForm.type,
    onChange: event => updateWeaponEditForm("type", event.target.value)
  })), h("label", {
    className: "npcLabel"
  }, "Attack Stats", h("input", {
    className: "npcInput",
    value: weaponEditForm.attackStats,
    onChange: event => updateWeaponEditForm("attackStats", event.target.value)
  })), h("label", {
    className: "npcLabel"
  }, "Custom Attack Bonus", h("input", {
    className: "npcInput npcLeftAlignedNumberInput",
    type: "number",
    value: weaponEditForm.attackBonus,
    onChange: event => updateWeaponEditForm("attackBonus", event.target.value)
  })), h("label", {
    className: "npcLabel"
  }, "Damage Dice", h("input", {
    className: "npcInput",
    value: weaponEditForm.damageDice,
    onChange: event => updateWeaponEditForm("damageDice", event.target.value)
  })), h("label", {
    className: "npcLabel"
  }, "Damage Type", h("input", {
    className: "npcInput",
    value: weaponEditForm.damageType,
    onChange: event => updateWeaponEditForm("damageType", event.target.value)
  })), h("label", {
    className: "npcLabel"
  }, "Endurance Cost", h("input", {
    className: "npcInput npcLeftAlignedNumberInput",
    type: "number",
    value: weaponEditForm.enduranceCost,
    onChange: event => updateWeaponEditForm("enduranceCost", event.target.value)
  })), h("label", {
    className: "npcLabel"
  }, "Properties", h("input", {
    className: "npcInput",
    value: weaponEditForm.properties,
    onChange: event => updateWeaponEditForm("properties", event.target.value)
  })), h("div", {
    className: "npcInlineActions"
  }, h("button", {
    type: "button",
    className: "npcSaveButton",
    onClick: saveWeaponEdit
  }, "Save"), h("button", {
    type: "button",
    className: "npcSecondaryButton",
    onClick: () => setEditingWeaponName("")
  }, "Cancel"))) : null;
  const selectedActionAbilitiesTable = selectedActionAbilities.length > 0 ? h("div", {
    className: "npcWeaponTableWrap"
  }, h("table", {
    className: "npcWeaponInfoTable npcActionAbilityInfoTable"
  }, [
    h("thead", {
      key: "head"
    }, h("tr", null, [
      h("th", {
        key: "ability"
      }, "Ability"),
      h("th", {
        key: "action-cost"
      }, "Action Cost"),
      h("th", {
        key: "endurance-cost"
      }, "Endurance Cost"),
      h("th", {
        key: "description"
      }, "Description"),
      ...(equipmentEditEnabled ? [h("th", {
        key: "edit"
      }, "Edit"), h("th", {
        key: "remove"
      }, "Remove")] : [])
    ])),
    h("tbody", {
      key: "body"
    }, selectedActionAbilities.map(ability => h("tr", {
      key: ability.name
    }, [
      h("th", {
        key: `${ability.name}-name`
      }, ability.name),
      h("td", {
        key: `${ability.name}-action`
      }, ability.actionCost ?? ""),
      h("td", {
        key: `${ability.name}-endurance`
      }, ability.enduranceCost ?? ""),
      h("td", {
        key: `${ability.name}-description`
      }, ability.description || ""),
      ...(equipmentEditEnabled ? [h("td", {
        key: `${ability.name}-edit`
      }, h("button", {
        type: "button",
        className: "npcEditButton",
        onClick: () => openActionAbilityEditor(ability),
        title: `Edit ${ability.name}`
      }, "\u270E")), h("td", {
        key: `${ability.name}-remove`
      }, h("button", {
        type: "button",
        className: "npcRemoveButton",
        onClick: () => removeSelectedActionAbility(ability.name),
        title: `Remove ${ability.name}`
      }, "X"))] : [])
    ])))
  ])) : h("div", {
    className: "npcMuted"
  }, actionAbilityOptions.length > 0 ? "Select an ability to add it." : "No NPC action abilities loaded.");
  const selectedPassiveAbilitiesTable = selectedPassiveAbilities.length > 0 ? h("div", {
    className: "npcWeaponTableWrap"
  }, h("table", {
    className: "npcWeaponInfoTable npcPassiveAbilityInfoTable"
  }, [
    h("thead", {
      key: "head"
    }, h("tr", null, [
      h("th", {
        key: "ability"
      }, "Ability"),
      h("th", {
        key: "description"
      }, "Description"),
      ...(equipmentEditEnabled ? [h("th", {
        key: "edit"
      }, "Edit"), h("th", {
        key: "remove"
      }, "Remove")] : [])
    ])),
    h("tbody", {
      key: "body"
    }, selectedPassiveAbilities.map(ability => h("tr", {
      key: ability.name
    }, [
      h("th", {
        key: `${ability.name}-name`
      }, ability.name),
      h("td", {
        key: `${ability.name}-description`
      }, ability.description || ""),
      ...(equipmentEditEnabled ? [h("td", {
        key: `${ability.name}-edit`
      }, h("button", {
        type: "button",
        className: "npcEditButton",
        onClick: () => openPassiveAbilityEditor(ability),
        title: `Edit ${ability.name}`
      }, "\u270E")), h("td", {
        key: `${ability.name}-remove`
      }, h("button", {
        type: "button",
        className: "npcRemoveButton",
        onClick: () => removeSelectedPassiveAbility(ability.name),
        title: `Remove ${ability.name}`
      }, "X"))] : [])
    ])))
  ])) : h("div", {
    className: "npcMuted"
  }, passiveAbilityOptions.length > 0 ? "Select an ability to add it." : "No NPC passive abilities loaded.");
  const npcLibraryFilterPanelChildren = [
    h("div", {
      key: "filter-header",
      className: "npcSectionHeader"
    }, h("h3", {
      className: "npcEquipmentTitle"
    }, "NPC Filters"), h("button", {
      type: "button",
      className: "npcSecondaryButton",
      onClick: () => setNpcLibraryFiltersOpen(false)
    }, "Close")),
    h("div", {
      key: "top-filters",
      className: "npcLibraryFilterGrid"
    }, h("label", {
      className: "npcLabel"
    }, "Sort By", h("select", {
      className: "npcSelect",
      value: npcLibrarySortField,
      onChange: event => setNpcLibrarySortField(event.target.value)
    }, NPC_LIBRARY_SORT_OPTIONS.map(option => h("option", {
      key: option.value,
      value: option.value
    }, option.label)))), h("label", {
      className: "npcLabel"
    }, "Direction", h("select", {
      className: "npcSelect",
      value: npcLibrarySortDirection,
      onChange: event => setNpcLibrarySortDirection(event.target.value)
    }, h("option", {
      value: "asc"
    }, "Ascending"), h("option", {
      value: "desc"
    }, "Descending")))),
    h("div", {
      key: "types",
      className: "npcLibraryTypeGroup"
    }, h("div", {
      className: "npcLibraryTypeHeading"
    }, "Types"), h("div", {
      className: "npcLibraryTypeOptions"
    }, NPC_TYPE_OPTIONS.map(typeName => h("button", {
      key: typeName,
      type: "button",
      className: `npcLibraryTypeChip${npcLibraryTypeFilters.includes(typeName) ? " isSelected" : ""}`,
      onClick: () => toggleNpcLibraryTypeFilter(typeName)
    }, typeName)))),
    (() => {
      const difficultyMinValue = Math.max(0, Math.min(20, Number(npcLibraryDifficultyMin) || 0));
      const difficultyMaxValue = Math.max(0, Math.min(20, Number(npcLibraryDifficultyMax) || 20));
      return h("div", {
        key: "difficulty-range",
        className: "npcLibraryStatRanges"
      }, [
        h("div", {
          key: "difficulty-heading",
          className: "npcLibraryTypeHeading"
        }, "Difficulty Range"),
        h("div", {
          key: "difficulty-card",
          className: "npcLibraryStatRangeCard"
        }, h("div", {
          className: "npcLibraryStatRangeValue"
        }, `${difficultyMinValue} - ${difficultyMaxValue}`), h("div", {
          className: "npcRangeSliderRow"
        }, h("input", {
          className: "npcRangeNumberInput",
          type: "number",
          min: "0",
          max: "20",
          step: "1",
          value: String(difficultyMinValue),
          onChange: event => updateNpcLibraryDifficultyRange("min", event.target.value)
        }), h("div", {
          className: "npcDualSliderTrack"
        }, h("div", {
          className: "npcSliderTrack"
        }), h("div", {
          className: "npcSliderRangeFill",
          style: {
            left: `${difficultyMinValue / 20 * 100}%`,
            width: `${Math.max(0, difficultyMaxValue - difficultyMinValue) / 20 * 100}%`
          }
        }), h("input", {
          className: "npcSliderInput npcSliderInputMin",
          type: "range",
          min: "0",
          max: "20",
          step: "1",
          value: String(difficultyMinValue),
          onChange: event => updateNpcLibraryDifficultyRange("min", event.target.value)
        }), h("input", {
          className: "npcSliderInput npcSliderInputMax",
          type: "range",
          min: "0",
          max: "20",
          step: "1",
          value: String(difficultyMaxValue),
          onChange: event => updateNpcLibraryDifficultyRange("max", event.target.value)
        })), h("input", {
          className: "npcRangeNumberInput",
          type: "number",
          min: "0",
          max: "20",
          step: "1",
          value: String(difficultyMaxValue),
          onChange: event => updateNpcLibraryDifficultyRange("max", event.target.value)
        })))
      ]);
    })(),
    h("div", {
      key: "stat-ranges",
      className: "npcLibraryStatRanges"
    }, [
      h("div", {
        key: "stat-ranges-heading",
        className: "npcLibraryTypeHeading"
      }, "Stat Ranges"),
      ...NPC_LIBRARY_FILTER_STATS.map(statName => {
      const statMaximum = getNpcLibraryStatMaximum(statName);
      const minValue = clampNpcFilterRangeValue(npcLibraryStatRanges?.[statName]?.min ?? "0", statMaximum);
      const maxValue = clampNpcFilterRangeValue(npcLibraryStatRanges?.[statName]?.max ?? String(statMaximum), statMaximum);
      return h("div", {
        key: statName,
        className: "npcLibraryStatRanges"
      }, [
        h("div", {
          key: `${statName}-heading`,
          className: "npcLibraryTypeHeading"
        }, statName),
        h("div", {
          key: `${statName}-card`,
          className: "npcLibraryStatRangeCard"
        }, h("div", {
          className: "npcLibraryStatRangeValue"
        }, `${minValue} - ${maxValue}`), h("div", {
          className: "npcRangeSliderRow"
        }, h("input", {
          className: "npcRangeNumberInput",
          type: "number",
          min: "0",
          max: String(statMaximum),
          step: "1",
          value: String(minValue),
          onChange: event => updateNpcLibraryStatRange(statName, "min", event.target.value)
        }), h("div", {
          className: "npcDualSliderTrack"
        }, h("div", {
          className: "npcSliderTrack"
        }), h("div", {
          className: "npcSliderRangeFill",
          style: {
            left: `${minValue / statMaximum * 100}%`,
            width: `${Math.max(0, maxValue - minValue) / statMaximum * 100}%`
          }
        }), h("input", {
          className: "npcSliderInput npcSliderInputMin",
          type: "range",
          min: "0",
          max: String(statMaximum),
          step: "1",
          value: String(minValue),
          onChange: event => updateNpcLibraryStatRange(statName, "min", event.target.value)
        }), h("input", {
          className: "npcSliderInput npcSliderInputMax",
          type: "range",
          min: "0",
          max: String(statMaximum),
          step: "1",
          value: String(maxValue),
          onChange: event => updateNpcLibraryStatRange(statName, "max", event.target.value)
        })), h("input", {
          className: "npcRangeNumberInput",
          type: "number",
          min: "0",
          max: String(statMaximum),
          step: "1",
          value: String(maxValue),
          onChange: event => updateNpcLibraryStatRange(statName, "max", event.target.value)
        })))
      ]);
    })
    ]),
    h("div", {
      key: "item-filters",
      className: "npcLibraryItemFilterSections"
    }, NPC_LIBRARY_ITEM_FILTERS.map(filterConfig => {
      const filterState = npcLibraryItemFilters?.[filterConfig.key] || {
        mode: "or",
        values: []
      };
      const filterOptions = npcLibraryItemFilterOptions?.[filterConfig.key] || [];
      return h("div", {
        key: filterConfig.key,
        className: "npcLibraryItemFilterSection"
      }, h("div", {
        className: "npcLibraryItemFilterHeader"
      }, h("div", {
        className: "npcLibraryTypeHeading"
      }, filterConfig.label), h("select", {
        className: "npcItemFilterModeSelect",
        value: filterState.mode,
        onChange: event => updateNpcLibraryItemFilterMode(filterConfig.key, event.target.value)
      }, h("option", {
        value: "or"
      }, "OR"), h("option", {
        value: "and"
      }, "AND"))), filterOptions.length > 0 ? h("div", {
        className: "npcLibraryTypeOptions"
      }, filterOptions.map(optionValue => h("button", {
        key: optionValue,
        type: "button",
        className: `npcLibraryTypeChip${filterState.values.includes(optionValue) ? " isSelected" : ""}`,
        onClick: () => toggleNpcLibraryItemFilterValue(filterConfig.key, optionValue)
      }, optionValue))) : h("div", {
        className: "npcMuted"
      }, `No ${filterConfig.label.toLowerCase()} entries saved yet.`));
    })),
    h("div", {
      key: "actions",
      className: "npcLibraryFilterActions"
    }, h("button", {
      type: "button",
      className: "npcSecondaryButton",
      onClick: clearNpcLibraryFilters
    }, "Clear Filters"))
  ];
  const npcLibraryFilterPanel = npcLibraryFiltersOpen ? h("div", {
    className: "npcLibraryFilterOverlay",
    onClick: () => setNpcLibraryFiltersOpen(false)
  }, h("div", {
    className: "npcLibraryFilterPanel",
    onClick: event => event.stopPropagation()
  }, npcLibraryFilterPanelChildren)) : null;
  const npcLibraryPanel = h("aside", {
    className: `npcLibraryDock${npcLibraryOpen ? " isOpen" : ""}`
  }, h("button", {
    type: "button",
    className: "npcLibraryToggle",
    onClick: () => setNpcLibraryOpen(isOpen => !isOpen),
    "aria-expanded": npcLibraryOpen
  }, npcLibraryOpen ? "Close NPCs" : "Open NPCs"), h("div", {
    className: "npcLibraryPanel"
  }, h("div", {
    className: "npcSectionHeader"
  }, h("h2", {
    className: "npcSectionTitle"
  }, "NPC Compendium"), h("div", {
    className: "npcInlineActions"
  }, h("button", {
    type: "button",
    className: "npcSecondaryButton",
    onClick: () => setNpcLibraryOpen(false),
    title: "Collapse NPC Compendium"
  }, "Minimize"))), h(React.Fragment, null, h("div", {
    className: "npcMuted"
  }, "Anyone can load these NPCs. Only writers can save to the compendium."), h("label", {
    className: "npcLabel"
  }, "Search", h("input", {
    className: "npcInput",
    value: npcLibrarySearch,
    onChange: event => setNpcLibrarySearch(event.target.value),
    placeholder: "Search by name or difficulty"
  })), h("div", {
    className: "npcLibraryFilterBar"
  }, h("button", {
    type: "button",
    className: `npcSecondaryButton${npcLibraryFiltersOpen ? " isActive" : ""}`,
    onClick: () => setNpcLibraryFiltersOpen(isOpen => !isOpen)
  }, npcLibraryFiltersOpen ? "Hide Filters" : "Filtered"), h("button", {
    type: "button",
    className: "npcSecondaryButton",
    onClick: () => {
      loadNpcCompendium().then(() => {
        setFooterMessage("NPC compendium refreshed.");
      }).catch(() => {});
    },
    title: "Refresh NPC Compendium"
  }, "Refresh"), h("div", {
    className: "npcLibraryFilterCount"
  }, `${filteredNpcLibrary.length} NPC${filteredNpcLibrary.length === 1 ? "" : "s"}`)), !canSaveToNpcCompendium ? h("div", {
    className: "npcMuted"
  }, "Writer access is required to save to the shared NPC compendium.") : null, npcLibraryMessage ? h("div", {
    className: "npcLibraryMessage"
  }, npcLibraryMessage) : null, filteredNpcLibrary.length > 0 ? h("div", {
    className: "npcLibraryList"
  }, filteredNpcLibrary.map(npcEntry => h("button", {
    key: `${npcEntry.name}-${npcEntry.npcType}-${npcEntry.difficulty}`,
    type: "button",
    className: "npcLibraryItem",
    onClick: () => loadNpcFromLibrary(npcEntry)
  }, h("span", {
    className: "npcLibraryItemName"
  }, npcEntry.name || "Unnamed NPC"), h("span", {
    className: "npcLibraryItemMeta"
  }, [npcEntry.npcType ? `Type: ${npcEntry.npcType}` : "", npcEntry.difficulty ? `Difficulty: ${npcEntry.difficulty}` : ""].filter(Boolean).join(" | ") || "No details saved")))) : h("div", {
    className: "npcMuted"
  }, npcLibrary.length > 0 ? "No NPCs match that search." : "No NPCs have been saved to the compendium yet."))), npcLibraryFilterPanel);
  const sideRail = h("aside", {
    className: "npcSideRail"
  }, SIDE_STAT_NAMES.map(statName => h("label", {
    key: statName,
    className: "npcSideBox"
  }, h("div", {
    className: "npcInstanceHeader"
  }, h("span", {
    className: "npcStatName"
  }, statName), equipmentEditEnabled ? h("button", {
    type: "button",
    className: "npcEditButton",
    onClick: () => openSideStatEditor(statName),
    title: `Edit ${statName}`
  }, "\u270E") : null), statName === "Speed" ? h("span", {
    className: "npcSpeedGrid"
  }, h("span", {
    className: "npcSpeedLabel"
  }, "Normal Move:", h("input", {
    type: "number",
    className: "npcSmallStatInput",
    value: speed.normalMove,
    readOnly: true,
    "aria-readonly": "true"
  })), h("span", {
    className: "npcSpeedLabel"
  }, "Dash Move:", h("input", {
    type: "number",
    className: "npcSmallStatInput",
    value: speed.dashMove,
    readOnly: true,
    "aria-readonly": "true"
  })), editingSideStatName === "Speed" ? h("div", {
    className: "npcEquipmentForm"
  }, [
    h("label", {
      key: "speed-normal",
      className: "npcLabel"
    }, "Normal Move", h("div", {
      className: "npcSpeedSliderField"
    }, h("div", {
      className: "npcLibraryStatRangeValue"
    }, sideStatEditForm.normalMove || "0"), h("input", {
      className: "npcSingleSliderInput",
      type: "range",
      min: "0",
      max: "20",
      step: "1",
      value: sideStatEditForm.normalMove,
      onChange: event => updateSideStatEditForm("normalMove", event.target.value)
    }))),
    h("label", {
      key: "speed-dash",
      className: "npcLabel"
    }, "Dash Move", h("div", {
      className: "npcSpeedSliderField"
    }, h("div", {
      className: "npcLibraryStatRangeValue"
    }, sideStatEditForm.dashMove || "0"), h("input", {
      className: "npcSingleSliderInput",
      type: "range",
      min: "0",
      max: "20",
      step: "1",
      value: sideStatEditForm.dashMove,
      onChange: event => updateSideStatEditForm("dashMove", event.target.value)
    }))),
    h("div", {
      key: "speed-actions",
      className: "npcStackedActions"
    }, h("div", {
      className: "npcInlineActions"
    }, h("button", {
      type: "button",
      className: "npcSaveButton",
      onClick: saveSideStatEdit
    }, "Save"), h("button", {
      type: "button",
      className: "npcSecondaryButton",
      onClick: restoreSideStatDefault
    }, "Restore Default")), h("button", {
      type: "button",
      className: "npcSecondaryButton npcFullWidthButton",
      onClick: () => setEditingSideStatName("")
    }, "Cancel"))
  ]) : null) : h(React.Fragment, null, h("input", {
    type: "number",
    className: "npcStatInput",
    value: sideStats[statName],
    readOnly: true,
    "aria-readonly": "true"
  }), editingSideStatName === statName ? h("div", {
    className: "npcEquipmentForm"
  }, h("label", {
    className: "npcLabel"
  }, statName, h("input", {
    className: "npcInput npcCompactInput",
    type: "number",
    value: sideStatEditForm.value,
    onChange: event => updateSideStatEditForm("value", event.target.value)
  })), h("div", {
    className: "npcStackedActions"
  }, h("div", {
    className: "npcInlineActions"
  }, h("button", {
    type: "button",
    className: "npcSaveButton",
    onClick: saveSideStatEdit
  }, "Save"), h("button", {
    type: "button",
    className: "npcSecondaryButton",
    onClick: restoreSideStatDefault
  }, "Restore Default")), h("button", {
    type: "button",
    className: "npcSecondaryButton npcFullWidthButton",
    onClick: () => setEditingSideStatName("")
  }, "Cancel"))) : null))));

  useEffect(() => {
    const finesse = Number(stats.Finesse) || 0;
    const armorBaseEvasion = Number(selectedArmor?.baseEvasion) || 0;
    const armorToughness = Number(selectedArmor?.toughness) || 0;
    const armorDashPenalty = Number(selectedArmor?.dashPenalty) || 0;
    const shieldToughness = Number(selectedShield?.toughness) || 0;
    const shieldDashPenalty = Number(selectedShield?.dashPenalty) || 0;
    const nextEvasion = armorBaseEvasion + Math.floor(finesse / 2);
    const nextToughness = armorToughness + shieldToughness;
    const nextDashMove = Math.max(0, 3 + finesse + armorDashPenalty + shieldDashPenalty);

    setSideStats(previousStats => ({
      ...previousStats,
      Evasion: sideStatOverrides.Evasion ?? nextEvasion,
      Toughness: sideStatOverrides.Toughness ?? nextToughness
    }));
    setSpeed({
      normalMove: sideStatOverrides.normalMove ?? 3,
      dashMove: sideStatOverrides.dashMove ?? nextDashMove
    });
  }, [selectedArmor, selectedShield, sideStatOverrides.Evasion, sideStatOverrides.Toughness, sideStatOverrides.normalMove, sideStatOverrides.dashMove, stats.Finesse]);

  useEffect(() => {
    const grit = Number(stats.Grit) || 0;
    const difficultyLevel = Math.max(1, Number(difficulty) || 1);
    const highestOtherStats = STAT_NAMES.filter(statName => statName !== "Grit").map(statName => Number(stats[statName]) || 0).sort((a, b) => b - a).slice(0, 2);
    const endurance = Math.floor((Math.floor(grit / 2) + highestOtherStats.reduce((total, value) => total + value, 0)) * difficultyLevel);
    setSideStats(previousStats => ({
      ...previousStats,
      Health: sideStatOverrides.Health ?? 15 + grit,
      Endurance: sideStatOverrides.Endurance ?? endurance
    }));
  }, [difficulty, sideStatOverrides.Endurance, sideStatOverrides.Health, stats]);

  const renderIdentityField = (label, value, setter, inputType = "text", inputClassName = "") => h("div", {
    className: "npcPanel"
  }, h("label", {
    className: "npcLabel"
  }, label, h("input", {
    type: inputType,
    className: inputClassName ? `npcInput ${inputClassName}` : "npcInput",
    value,
    onChange: event => setter(event.target.value),
    disabled: !equipmentEditEnabled
  })));
  const renderIdentitySelectField = (label, value, setter, options, placeholder, selectClassName = "") => h("div", {
    className: "npcPanel"
  }, h("label", {
    className: "npcLabel"
  }, label, h("select", {
    className: selectClassName ? `npcSelect ${selectClassName}` : "npcSelect",
    value,
    onChange: event => setter(event.target.value),
    disabled: !equipmentEditEnabled
  }, h("option", {
    value: ""
  }, placeholder), options.map(optionValue => h("option", {
    key: optionValue,
    value: optionValue
  }, optionValue)))));
  const renderReadOnlyEquipmentValue = (value, emptyLabel = "None selected") => h("div", {
    className: "npcReadOnlyValue"
  }, value || emptyLabel);

  return h("main", {
    className: "npcPage"
  }, npcLibraryPanel, h("div", {
    className: "npcShell"
  }, [
    h("h1", {
      key: "title",
      className: "npcTitle"
    }, "NPC Builder"),
    h("section", {
      key: "identity",
      className: "npcIdentityGrid"
    }, renderIdentityField("Name", name, setName, "text", "npcIdentityDarkInput"), renderIdentityField("Difficulty", difficulty, setDifficulty, "number", "npcIdentityDarkInput"), renderIdentitySelectField("Type", npcType, setNpcType, NPC_TYPE_OPTIONS, "Select Type", "npcIdentityDarkInput")),
    h("div", {
      key: "layout",
      className: "npcBuilderLayout"
    }, [
      h("div", {
        key: "main-column",
        className: "npcMainColumn"
      }, [
        h("section", {
          key: "stats",
          className: "npcStatGrid"
        }, STAT_NAMES.map(statName => h("label", {
          key: statName,
          className: "npcStatBox"
        }, h("span", {
          className: "npcStatName"
        }, statName), h("input", {
          type: "number",
          className: "npcStatInput",
          value: stats[statName],
          disabled: !equipmentEditEnabled,
          onChange: event => setStats(previousStats => ({
            ...previousStats,
            [statName]: event.target.value
          }))
        })))),
        h("section", {
          key: "equipment",
          className: "npcPanel"
        }, h("div", {
          className: "npcSectionHeader"
        }, h("h2", {
          className: "npcSectionTitle"
        }, "Equipment/Abilities"), h("label", {
          className: "npcActionPointLabel"
        }, "Action Point", h("input", {
          type: "number",
          className: "npcActionPointInput",
          value: actionPoints,
          onChange: event => setActionPoints(event.target.value),
          disabled: !equipmentEditEnabled
        }))), compendiumMessage ? h("div", {
          className: "npcMuted"
        }, compendiumMessage) : null, h("div", {
          className: "npcEquipmentGrid"
        }, [
          h("div", {
            key: "armor-card",
            className: "npcEquipmentCard"
          }, [
            h("div", {
              key: "armor-header",
              className: "npcInstanceHeader"
            }, h("h3", {
              className: "npcEquipmentTitle"
            }, "Armor"), equipmentEditEnabled ? h("button", {
              type: "button",
              className: "npcEditButton",
              onClick: openArmorEditor,
              title: "Edit selected armor"
            }, "\u270E") : null),
            equipmentEditEnabled ? h("label", {
              key: "armor-select",
              className: "npcLabel"
            }, h("select", {
              className: "npcSelect",
              value: selectedArmorName,
              onChange: event => setSelectedArmorName(event.target.value),
              disabled: !equipmentEditEnabled
            }, armorOptions.map(armor => h("option", {
              key: armor.name,
              value: armor.name
            }, armor.name)), equipmentEditEnabled ? h("option", {
              value: CUSTOM_OPTION_VALUE
            }, "Custom") : null)) : null,
            customArmorFormElement,
            armorEditFormElement,
            !equipmentEditEnabled ? h("div", {
              key: "armor-empty-readonly",
              className: "npcMuted"
            }, !selectedArmor?.name || selectedArmor?.name === "No Armor" || selectedArmorName === "No Armor" ? "No Armor" : null) : !selectedArmor && selectedArmorName !== CUSTOM_OPTION_VALUE ? h("div", {
              key: "armor-empty",
              className: "npcMuted"
            }, "No armor loaded.") : null
          ]),
          h("div", {
            key: "shield-card",
            className: "npcEquipmentCard"
          }, [
            h("div", {
              key: "shield-header",
              className: "npcInstanceHeader"
            }, h("h3", {
              className: "npcEquipmentTitle"
            }, "Shield"), equipmentEditEnabled ? h("button", {
              type: "button",
              className: "npcEditButton",
              onClick: openShieldEditor,
              title: "Edit selected shield"
            }, "\u270E") : null),
            equipmentEditEnabled ? h("label", {
              key: "shield-select",
              className: "npcLabel"
            }, h("select", {
              className: "npcSelect",
              value: selectedShieldName,
              onChange: event => setSelectedShieldName(event.target.value),
              disabled: !equipmentEditEnabled
            }, shieldOptions.map(shield => h("option", {
              key: shield.name,
              value: shield.name
            }, shield.name)), equipmentEditEnabled ? h("option", {
              value: CUSTOM_OPTION_VALUE
            }, "Custom") : null)) : null,
            customShieldFormElement,
            shieldEditFormElement,
            !equipmentEditEnabled ? h("div", {
              key: "shield-empty-readonly",
              className: "npcMuted"
            }, !selectedShield?.name || selectedShield?.name === "No Shield" || selectedShieldName === "No Shield" ? "No Shield" : null) : !selectedShield && selectedShieldName !== CUSTOM_OPTION_VALUE ? h("div", {
              key: "shield-empty",
              className: "npcMuted"
            }, "No shield loaded.") : null
          ]),
          h("div", {
            key: "weapon-card",
            className: "npcEquipmentCard"
          }, h("h3", {
            className: "npcEquipmentTitle"
          }, "Weapon/Attack"), equipmentEditEnabled ? h("label", {
            className: "npcLabel"
          }, h("select", {
            className: "npcSelect",
            value: weaponChoiceName,
            disabled: !equipmentEditEnabled,
            onChange: event => {
              if (!equipmentEditEnabled) return;
              setWeaponChoiceName(event.target.value);
              addSelectedWeapon(event.target.value);
            }
          }, h("option", {
            value: ""
          }, "Select a Weapon"), weapons.map(weapon => h("option", {
            key: weapon.name,
            value: weapon.name
          }, weapon.name)), customWeapons.map(weapon => h("option", {
            key: weapon.name,
            value: weapon.name
          }, weapon.name)), equipmentEditEnabled ? h("option", {
            value: CUSTOM_OPTION_VALUE
          }, "Custom") : null)) : null, !equipmentEditEnabled && selectedWeapons.length === 0 ? h("div", {
            className: "npcMuted"
          }, "No Weapon") : null, customWeaponFormElement, selectedWeaponsTable, equipmentEditEnabled ? selectedWeaponEditor : null),
          h("div", {
            key: "action-card",
            className: "npcEquipmentCard"
          }, h("h3", {
            className: "npcEquipmentTitle"
          }, "Active Ability"), equipmentEditEnabled ? h("label", {
            className: "npcLabel"
          }, h("select", {
            className: "npcSelect",
            value: selectedActionAbilityName,
            disabled: !equipmentEditEnabled,
            onChange: event => {
              if (!equipmentEditEnabled) return;
              setSelectedActionAbilityName(event.target.value);
              addSelectedActionAbility(event.target.value);
            }
          }, h("option", {
            value: ""
          }, "Select Ability"), actionAbilityOptions.map(ability => h("option", {
            key: ability.name,
            value: ability.name
          }, ability.name)), equipmentEditEnabled ? h("option", {
            value: CUSTOM_OPTION_VALUE
          }, "Custom") : null)) : null, customActionAbilityFormElement, equipmentEditEnabled && selectedActionAbilityName === CUSTOM_OPTION_VALUE ? h("div", {
            className: "npcMuted"
          }, "Create a custom active ability for this NPC.") : selectedActionAbilitiesTable, equipmentEditEnabled ? actionAbilityEditFormElement : null),
          h("div", {
            key: "passive-card",
            className: "npcEquipmentCard"
          }, h("h3", {
            className: "npcEquipmentTitle"
          }, "Passive Ability"), equipmentEditEnabled ? h("label", {
            className: "npcLabel"
          }, h("select", {
            className: "npcSelect",
            value: selectedPassiveAbilityName,
            disabled: !equipmentEditEnabled,
            onChange: event => {
              if (!equipmentEditEnabled) return;
              setSelectedPassiveAbilityName(event.target.value);
              addSelectedPassiveAbility(event.target.value);
            }
          }, h("option", {
            value: ""
          }, "Select Ability"), passiveAbilityOptions.map(ability => h("option", {
            key: ability.name,
            value: ability.name
          }, ability.name)), equipmentEditEnabled ? h("option", {
            value: CUSTOM_OPTION_VALUE
          }, "Custom") : null)) : null, customPassiveAbilityFormElement, equipmentEditEnabled && selectedPassiveAbilityName === CUSTOM_OPTION_VALUE ? h("div", {
            className: "npcMuted"
          }, "Create a custom passive ability for this NPC.") : selectedPassiveAbilitiesTable, equipmentEditEnabled ? passiveAbilityEditFormElement : null)
        ])),
      ]),
      sideRail
    ]),
    h("div", {
      key: "footer",
      className: "npcFooterDock"
    }, h("input", {
      ref: importInputRef,
      type: "file",
      accept: "application/json",
      className: "npcHiddenInput",
      onChange: handleImportNpc
    }), abilityMessage ? h("div", {
      className: "npcMuted",
      role: "status"
    }, abilityMessage) : null, footerMessage ? h("div", {
      className: "npcFooterMessage"
    }, footerMessage) : null, h("div", {
      className: "npcFooterActions"
    }, h("button", {
      type: "button",
      className: "npcFooterButton",
      onClick: handleExportNpc
    }, "Export"), h("button", {
      type: "button",
      className: "npcFooterButton",
      onClick: openImportPicker
    }, "Import"), h("button", {
      type: "button",
      className: `npcFooterButton${equipmentEditEnabled ? " npcFooterButton--active" : ""}`,
      onClick: toggleEquipmentEditMode
    }, "Toggle Edit"), canSaveToNpcCompendium ? h("button", {
      type: "button",
      className: "npcFooterButton",
      onClick: saveNpcToLibrary,
      title: "Save this NPC to the shared NPC compendium."
    }, "Cloud Save") : null))
  ]));
}

ReactDOM.createRoot(document.getElementById("root")).render(h(NpcBuilderApp));
