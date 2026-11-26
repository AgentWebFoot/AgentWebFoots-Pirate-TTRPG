// Pirate Character Sheet runtime.
// This is the actual app code the browser executes.
// The main sections are:
// 1. Static rules/defaults
// 2. UI components
// 3. API + persistence helpers
// 4. App state and derived calculations

// Core stat/skill map. These drive most derived totals across the sheet.
const stats = {
  Brawn: ["Rigging", "Lifting", "Pinning", "Swimming"],
  Finesse: ["Acrobatics", "Skulduggery", "Sneaking"],
  Grit: ["Nausea", "Resilience", "Tolerance"],
  Awareness: ["Fishing", "Investigation", "Intuition", "Tracking"],
  Brains: ["History", "Learning", "Tinkering"],
  Swagger: ["Infamy", "Influence", "Negotiation"]
};
const SKILL_TO_STAT = {};
Object.entries(stats).forEach(([stat, skills]) => {
  skills.forEach(skill => {
    SKILL_TO_STAT[skill] = stat;
  });
});
const STAT_LIST = Object.keys(stats);
const SKILL_LIST = Object.values(stats).flat();
const createEmptyStatLevel = () => ({
  Brawn: 0,
  Finesse: 0,
  Grit: 0,
  Awareness: 0,
  Brains: 0,
  Swagger: 0
});
const createEmptySkillLevel = () => Object.fromEntries(SKILL_LIST.map(skill => [skill, 0]));
function trimFutureLevelData(levelData, nextLevel, createEmptyLevel) {
  const trimmed = [...levelData];
  for (let i = nextLevel; i < trimmed.length; i++) {
    trimmed[i] = createEmptyLevel();
  }
  return trimmed;
}
function moveArrayItem(list, index, direction) {
  const nextIndex = index + direction;
  if (index < 0 || nextIndex < 0 || index >= list.length || nextIndex >= list.length) {
    return list;
  }
  const next = [...list];
  const [item] = next.splice(index, 1);
  next.splice(nextIndex, 0, item);
  return next;
}
const WEAPON_TYPES = ["Strike", "Blunt", "Sword", "Axe", "Polearm", "Hand Firearm", "Sniper Firearm", "Grenade"];
const UNARMED_WEAPON_NAME = "Unarmed Strike";

// Default background record used for blank characters and missing save fields.
const DEFAULT_BACKGROUND = {
  age: "",
  gender: "",
  race: "",
  country: "",
  religion: "",
  height: "",
  weight: "",
  eyeColor: "",
  hairColor: "",
  features: "",
  formerCrews: "",
  occupation: "",
  reputation: "",
  appearance: "",
  personality: "",
  backstory: "",
  goals: "",
  notes: ""
};
function createDefaultSettings() {
  // Central place for all sheet overrides that can change displayed calculations
  // without changing the underlying class/level allocations.
  return {
    statOverrides: {},
    skillPointsOverride: null,
    darkMode: false,
    evasionOverride: null,
    toughnessOverride: null,
    armorBreaker: 0,
    initiativeOverride: null,
    healthMin: 0,
    healthMax: null,
    enduranceMin: 0,
    enduranceMax: null,
    speedOverride: null,
    dashOverride: null,
    luckMaxOverride: null,
    weaponTypeOverrides: {}
  };
}
function createBlankCharacterData() {
  // Canonical empty save payload used for new slots, resets, and repair paths.
  return {
    name: "",
    crew: "",
    currentLevel: 1,
    knownSelectionAbilities: {},
    selectedSelectionCategories: {},
    levels: Array(20).fill(null),
    level1: ["", "", ""],
    levelStats: Array.from({
      length: 20
    }, createEmptyStatLevel),
    levelSkills: Array.from({
      length: 20
    }, createEmptySkillLevel),
    settings: createDefaultSettings(),
    armor: "No Armor",
    shield: "No Shield",
    activeConditions: [],
    equippedWeapons: [],
    inventoryWeapons: [],
    health: 0,
    endurance: 0,
    luck: 3,
    doubloons: 0,
    items: [],
    expansions: [],
    background: {
      ...DEFAULT_BACKGROUND
    }
  };
}
const CLASS_WEAPON_BONUS = {
  Basher: ["Blunt"],
  Cleaver: ["Axe"],
  Marksman: ["Hand Firearm"],
  "Martial Artist": ["Strike"],
  Sharpshooter: ["Sniper Firearm"],
  Spearman: ["Polearm"],
  Swordsman: ["Sword"]
};
const LEVEL_POINTS = level => level === 1 ? 10 : 1;
const LEVEL_STAT_CAP = level => level === 1 ? 5 : 10;
const LEVEL_SKILL_POINTS = level => level === 1 ? 10 : 2;

// Conditions are stored as structured entries so they can carry optional source
// and stack data instead of being just raw labels.
const createConditionEntry = definition => ({
  id: Date.now() + Math.random(),
  name: definition.name,
  description: definition.description,
  hasStack: !!definition.hasStack,
  hasSource: !!definition.hasSource,
  stacks: definition.hasStack ? 1 : null,
  source: definition.hasSource ? "" : ""
});
function getSelectionAbilityKey(ability) {
  return `${ability.class}::${ability.rank}::${ability.name}`;
}
function getSelectionCategoryStateKey(className, categoryKey) {
  return `${className}::${categoryKey}`;
}
const DEFAULT_ARMORS = [{
  name: "No Armor",
  baseEvasion: 16,
  toughness: 0,
  dashPenalty: 0,
  properties: []
}];
const DEFAULT_SHIELDS = [{
  name: "No Shield",
  toughness: 0,
  braceCost: 0,
  dashPenalty: 0,
  properties: []
}];
const DAMAGE_TYPE_OPTIONS = ["Physical", "Holy", "Unholy", "Bleeding", "Fire", "Poison"];

// MainPage renders the center content area: tabbed rules sections, weapons,
// abilities, inventory, conditions, background, and expansion utilities.
function MainPage({
  finalStats,
  classCounts,
  skillTotals,
  currentLevel,
  levelSkills,
  setLevelSkills,
  availableSkillPoints,
  armor,
  setArmor,
  shield,
  setShield,
  useShield,
  setUseShield,
  armorStats,
  armorStatsMap,
  shieldStatsMap,
  shieldStats,
  settings,
  setSettings,
  conditions,
  activeConditions,
  conditionChoice,
  setConditionChoice,
  addCondition,
  updateCondition,
  removeCondition,
  moveCondition,
  weapons,
  equippedWeapons,
  removeWeapon,
  inventoryWeapons,
  swapWeapon,
  moveWeapon,
  endurance,
  setEndurance,
  minEndurance,
  maxEndurance,
  weaponChoice,
  setWeaponChoice,
  addWeaponToInventory,
  doubloons,
  setDoubloons,
  items,
  addItem,
  updateItem,
  removeItem,
  moveItem,
  weaponTypeBonuses,
  sortBy,
  setSortBy,
  sortedActionAbilities,
  passiveAbilities,
  selectionAbilities,
  selectionAbilitiesByClass,
  selectionCategoryDefinitionsByClass,
  knownSelectionAbilities,
  selectedSelectionCategories,
  toggleKnownSelectionAbility,
  updateSelectionCategory,
  background,
  setBackground,
  activeSlot,
  activeSlotLabel,
  cloudSaveEnabled,
  generatedShareCode,
  shareCodeInput,
  setShareCodeInput,
  generateShareCode,
  importShareCode,
  isShareCodeBusy,
  expansions,
  importExpansionFile,
  removeExpansion,
  exportExpansions,
  downloadGearTemplate,
  downloadClassTemplate
}) {
  const [activeTab, setActiveTab] = React.useState("class");
  const [hideUnselectedSelectionAbilities, setHideUnselectedSelectionAbilities] = React.useState(false);
  const [attackDialog, setAttackDialog] = React.useState(null);
  const [attackShotType, setAttackShotType] = React.useState("body");
  const [overrideAttackEnduranceCost, setOverrideAttackEnduranceCost] = React.useState(false);
  const [customAttackEnduranceCost, setCustomAttackEnduranceCost] = React.useState(0);
  const initiative = settings.initiativeOverride ?? finalStats.Brains + finalStats.Finesse;
  function getWeaponAttackBonus(weapon) {
    const statBonus = Math.max(...weapon.attackStats.map(stat => finalStats[stat]));
    const classBonus = Math.max(0, ...weapon.type.map(type => {
      const classVal = weaponTypeBonuses[type] || 0;
      const overrideVal = settings.weaponTypeOverrides?.[type];
      return overrideVal !== null && overrideVal !== undefined ? overrideVal : classVal;
    }));
    return statBonus + classBonus;
  }
  function openAttackDialog(weapon, attackBonus) {
    const enduranceCost = Number(weapon.enduranceCost) || 0;
    setAttackDialog({
      weapon,
      attackBonus
    });
    setAttackShotType("body");
    setOverrideAttackEnduranceCost(false);
    setCustomAttackEnduranceCost(enduranceCost);
  }
  function closeAttackDialog() {
    setAttackDialog(null);
    setAttackShotType("body");
    setOverrideAttackEnduranceCost(false);
    setCustomAttackEnduranceCost(0);
  }
  function confirmAttack() {
    if (!attackDialog) return;
    const defaultEnduranceCost = Number(attackDialog.weapon.enduranceCost) || 0;
    const enduranceCost = overrideAttackEnduranceCost ? customAttackEnduranceCost : defaultEnduranceCost;
    setEndurance(prev => Math.max(minEndurance, Math.min(prev - enduranceCost, maxEndurance)));
    closeAttackDialog();
  }
  function renderBackgroundJournal() {
    return React.createElement("div", {
      className: "journalGrid"
    }, React.createElement("div", {
      className: "background-section"
    }, React.createElement("h4", null, "Identity"), React.createElement("div", {
      className: "background-field"
    }, React.createElement("label", null, "Age"), React.createElement("input", {
      placeholder: "Age",
      value: background.age,
      onChange: e => setBackground(p => ({
        ...p,
        age: e.target.value
      }))
    })), React.createElement("div", {
      className: "background-field"
    }, React.createElement("label", null, "Gender"), React.createElement("input", {
      placeholder: "Gender",
      value: background.gender,
      onChange: e => setBackground(p => ({
        ...p,
        gender: e.target.value
      }))
    })), React.createElement("div", {
      className: "background-field"
    }, React.createElement("label", null, "Race"), React.createElement("input", {
      placeholder: "Race",
      value: background.race,
      onChange: e => setBackground(p => ({
        ...p,
        race: e.target.value
      }))
    })), React.createElement("div", {
      className: "background-field"
    }, React.createElement("label", null, "Country"), React.createElement("input", {
      placeholder: "Country",
      value: background.country,
      onChange: e => setBackground(p => ({
        ...p,
        country: e.target.value
      }))
    })), React.createElement("div", {
      className: "background-field"
    }, React.createElement("label", null, "Religion"), React.createElement("input", {
      placeholder: "Religion",
      value: background.religion,
      onChange: e => setBackground(p => ({
        ...p,
        religion: e.target.value
      }))
    }))), React.createElement("div", {
      className: "background-section"
    }, React.createElement("h4", null, "Physical"), React.createElement("div", {
      className: "background-field"
    }, React.createElement("label", null, "Height"), React.createElement("input", {
      placeholder: "Height",
      value: background.height,
      onChange: e => setBackground(p => ({
        ...p,
        height: e.target.value
      }))
    })), React.createElement("div", {
      className: "background-field"
    }, React.createElement("label", null, "Weight"), React.createElement("input", {
      placeholder: "Weight",
      value: background.weight,
      onChange: e => setBackground(p => ({
        ...p,
        weight: e.target.value
      }))
    })), React.createElement("div", {
      className: "background-field"
    }, React.createElement("label", null, "Eye Color"), React.createElement("input", {
      placeholder: "Eye Color",
      value: background.eyeColor,
      onChange: e => setBackground(p => ({
        ...p,
        eyeColor: e.target.value
      }))
    })), React.createElement("div", {
      className: "background-field"
    }, React.createElement("label", null, "Hair Color"), React.createElement("input", {
      placeholder: "Hair Color",
      value: background.hairColor,
      onChange: e => setBackground(p => ({
        ...p,
        hairColor: e.target.value
      }))
    })), React.createElement("div", {
      className: "background-field"
    }, React.createElement("label", null, "Distinguishing Features"), React.createElement("textarea", {
      placeholder: "Distinguishing Features",
      value: background.features,
      onChange: e => setBackground(p => ({
        ...p,
        features: e.target.value
      }))
    }))), React.createElement("div", {
      className: "background-section"
    }, React.createElement("h4", null, "Background"), React.createElement("div", {
      className: "background-field"
    }, React.createElement("label", null, "Former Crews"), React.createElement("input", {
      placeholder: "Former Crews",
      value: background.formerCrews,
      onChange: e => setBackground(p => ({
        ...p,
        formerCrews: e.target.value
      }))
    })), React.createElement("div", {
      className: "background-field"
    }, React.createElement("label", null, "Occupation"), React.createElement("input", {
      placeholder: "Occupation",
      value: background.occupation,
      onChange: e => setBackground(p => ({
        ...p,
        occupation: e.target.value
      }))
    })), React.createElement("div", {
      className: "background-field"
    }, React.createElement("label", null, "Reputation"), React.createElement("input", {
      placeholder: "Reputation",
      value: background.reputation,
      onChange: e => setBackground(p => ({
        ...p,
        reputation: e.target.value
      }))
    }))), React.createElement("div", {
      className: "background-section"
    }, React.createElement("h4", null, "Captain's Journal"), React.createElement("div", {
      className: "background-field"
    }, React.createElement("label", null, "Personality"), React.createElement("textarea", {
      placeholder: "Personality",
      value: background.personality,
      onChange: e => setBackground(p => ({
        ...p,
        personality: e.target.value
      }))
    })), React.createElement("div", {
      className: "background-field"
    }, React.createElement("label", null, "Backstory"), React.createElement("textarea", {
      placeholder: "Backstory",
      value: background.backstory,
      onChange: e => setBackground(p => ({
        ...p,
        backstory: e.target.value
      }))
    })), React.createElement("div", {
      className: "background-field"
    }, React.createElement("label", null, "Goals"), React.createElement("textarea", {
      placeholder: "Goals",
      value: background.goals,
      onChange: e => setBackground(p => ({
        ...p,
        goals: e.target.value
      }))
    })), React.createElement("div", {
      className: "background-field"
    }, React.createElement("label", null, "Notes"), React.createElement("textarea", {
      placeholder: "Notes",
      value: background.notes,
      onChange: e => setBackground(p => ({
        ...p,
        notes: e.target.value
      }))
    }))));
  }
  const adjustedAttackBonus = attackDialog ? attackDialog.attackBonus + (attackShotType === "head" ? -5 : 0) : 0;
  const displayedAttackBonus = adjustedAttackBonus >= 0 ? `+${adjustedAttackBonus}` : `${adjustedAttackBonus}`;
  const displayedAttackEnduranceCost = attackDialog ? Number(attackDialog.weapon.enduranceCost) || 0 : 0;
  const activeAttackEnduranceCost = overrideAttackEnduranceCost ? customAttackEnduranceCost : displayedAttackEnduranceCost;
  const displayedAttackDamageDice = attackDialog ? attackDialog.weapon.damage.dice : "";
  const displayedAttackDamageType = attackDialog ? attackDialog.weapon.damage.type : "";
  const displayedAttackDamageMultiplier = attackShotType === "head" ? "x2" : "";
  const displayedAttackProperties = attackDialog ? attackDialog.weapon.properties.join(", ") || "None" : "";
  const attackDialogElement = attackDialog && React.createElement("div", {
    className: "attackModalOverlay",
    onClick: closeAttackDialog
  }, React.createElement("div", {
    className: "attackModal",
    onClick: e => e.stopPropagation()
  }, React.createElement("div", {
    className: "attackModalHeader"
  }, React.createElement("div", null, React.createElement("div", {
    className: "folioKicker"
  }, "Weapon Attack"), React.createElement("h3", {
    className: "sectionTitle",
    style: {
      fontSize: "26px"
    }
  }, attackDialog.weapon.name))), React.createElement("div", {
    className: "attackModalStats"
  }, React.createElement("div", {
    className: "attackModalStatCard"
  }, React.createElement("label", null, "Attack Bonus"), React.createElement("strong", null, displayedAttackBonus)), React.createElement("div", {
    className: "attackModalStatCard"
  }, React.createElement("label", null, "Endurance Cost"), React.createElement("div", {
    className: "attackModalAdjuster"
  }, overrideAttackEnduranceCost && React.createElement("button", {
    type: "button",
    className: "attackModalAdjustButton",
    onClick: () => setCustomAttackEnduranceCost(prev => Math.max(0, prev - 1))
  }, "\u2193"), React.createElement("strong", null, activeAttackEnduranceCost), overrideAttackEnduranceCost && React.createElement("button", {
    type: "button",
    className: "attackModalAdjustButton",
    onClick: () => setCustomAttackEnduranceCost(prev => prev + 1)
  }, "\u2191"))), React.createElement("div", {
    className: "attackModalStatCard"
  }, React.createElement("label", null, "Damage"), React.createElement("div", {
    className: "attackModalDamageValue"
  }, React.createElement("strong", null, displayedAttackDamageDice), displayedAttackDamageMultiplier && React.createElement("span", {
    className: "attackModalDamageMultiplier"
  }, displayedAttackDamageMultiplier)), React.createElement("div", {
    className: "attackModalDamageType"
  }, displayedAttackDamageType))), React.createElement("div", {
    className: "attackModalProperties"
  }, React.createElement("span", {
    className: "attackModalSectionLabel"
  }, "Weapon Properties"), React.createElement("div", {
    className: "attackModalPropertiesValue"
  }, displayedAttackProperties)), React.createElement("label", {
    className: "attackModalChoice attackModalChoice--stacked"
  }, React.createElement("input", {
    type: "checkbox",
    checked: overrideAttackEnduranceCost,
    onChange: e => setOverrideAttackEnduranceCost(e.target.checked)
  }), "Override Endurance Cost"), React.createElement("div", {
    className: "attackModalOptions"
  }, React.createElement("span", {
    className: "attackModalSectionLabel"
  }, "Shot Target"), React.createElement("label", {
    className: "attackModalChoice"
  }, React.createElement("input", {
    type: "radio",
    name: "attack-shot-type",
    checked: attackShotType === "body",
    onChange: () => setAttackShotType("body")
  }), "Body Shot"), React.createElement("label", {
    className: "attackModalChoice"
  }, React.createElement("input", {
    type: "radio",
    name: "attack-shot-type",
    checked: attackShotType === "head",
    onChange: () => setAttackShotType("head")
  }), "Headshot (-5 Attack)")), React.createElement("div", {
    className: "attackModalFooter"
  }, React.createElement("button", {
    type: "button",
    onClick: closeAttackDialog
  }, "Cancel"), React.createElement("button", {
    type: "button",
    onClick: confirmAttack
  }, "Confirm"))));
  return React.createElement("div", {
    className: "mainpage"
  }, React.createElement("section", {
    className: "folioHero statsHero"
  }, React.createElement("div", {
    className: "folioHeroHeader"
  }, React.createElement("div", {
    className: "combatDataCell"
  }, React.createElement("div", {
    className: "combatDataCellLabel"
  }, "Order"), React.createElement("div", {
    className: "folioKicker"
  }, "Crew Record"), React.createElement("h2", {
    className: "sectionTitle"
  }, "Stats and Skills")), React.createElement("div", {
    className: "skillPointBadge"
  }, React.createElement("strong", null, "Available Skill Points"), React.createElement("span", {
    style: {
      color: settings.darkMode ? "#e8edf6" : availableSkillPoints === 0 ? "#8b6e3b" : "#2f2417"
    }
  }, availableSkillPoints))), React.createElement("div", {
    className: "statRow"
  }, Object.entries(stats).map(([stat, skills]) => React.createElement("div", {
    className: "statBlock",
    key: stat
  }, React.createElement("h3", null, stat), React.createElement("input", {
    type: "number",
    value: Number.isFinite(finalStats[stat]) ? finalStats[stat] : 0,
    readOnly: true
  }), React.createElement("ul", null, skills.map(skill => React.createElement("li", {
    key: skill
  }, React.createElement("div", {
    className: "skills"
  }, skill, React.createElement("div", null, React.createElement("input", {
    type: "number",
    value: Number.isFinite(skillTotals[skill]) ? skillTotals[skill] : 0,
    readOnly: true
  })), React.createElement("div", {
    className: "skillAdjuster"
  }, React.createElement("button", {
    onClick: () => removeSkill(currentLevel, skill, levelSkills, setLevelSkills)
  }, "-"), React.createElement("span", null, levelSkills.slice(0, currentLevel).reduce((sum, lvl) => sum + lvl[skill], 0)), React.createElement("button", {
    onClick: () => addSkill(currentLevel, skill, levelSkills, setLevelSkills, availableSkillPoints)
  }, "+")))))))))), React.createElement("section", {
    className: "folioSection sectionSpacer recordsSection"
  }, React.createElement("div", {
    className: "sectionHeader"
  }, React.createElement("div", {
    className: "combatDataCell"
  }, React.createElement("div", {
    className: "combatDataCellLabel"
  }, "Order"), React.createElement("div", {
    className: "folioKicker"
  }, "Ship Operations"), React.createElement("h2", {
    className: "sectionTitle"
  }, "Mechanical Records"))), React.createElement("div", {
    className: "tabBar"
  }, React.createElement("button", {
    onClick: () => setActiveTab("class")
  }, "Class"), React.createElement("button", {
    onClick: () => setActiveTab("combat")
  }, "Combat"), React.createElement("button", {
    onClick: () => setActiveTab("inventory")
  }, "Inventory"), React.createElement("button", {
    onClick: () => setActiveTab("background")
  }, "Background")), React.createElement("div", {
    className: "tabContent"
  }, activeTab === "class" && React.createElement("div", null, React.createElement("h3", null, "Class Ranks"), React.createElement("ul", null, Object.entries(classCounts).map(([cls, count]) => React.createElement("li", {
    key: cls
  }, cls, " - ", count))), React.createElement("div", null, React.createElement("h3", null, "Class Abilities"), React.createElement("div", {
    style: {
      marginBottom: "10px"
    }
  }, "Sort:", " ", React.createElement("select", {
    value: sortBy,
    onChange: e => setSortBy(e.target.value)
  }, React.createElement("option", {
    value: "rank"
  }, "By Rank"), React.createElement("option", {
    value: "cost"
  }, "By Cost"))), React.createElement("h4", null, "Action Abilities"), sortedActionAbilities.map((a, i) => React.createElement("div", {
    key: i,
    style: {
      borderBottom: "1px solid #ccc",
      marginBottom: "6px"
    }
  }, React.createElement("strong", null, a.name), " (Rank ", a.rank, ")", React.createElement("br", null), "Class: ", a.class, React.createElement("br", null), "Action Cost: ", a.actionCost, " | Endurance: ", a.enduranceCost, React.createElement("br", null), a.description)), React.createElement("h4", null, "Free / Passive Abilities"), passiveAbilities.map((a, i) => React.createElement("div", {
    key: i,
    style: {
      borderBottom: "1px solid #ccc",
      marginBottom: "6px"
    }
  }, React.createElement("strong", null, a.name), " (Rank ", a.rank, ")", React.createElement("br", null), "Class: ", a.class, React.createElement("br", null), a.description)), selectionAbilities.length > 0 && React.createElement("div", {
    style: {
      marginTop: "14px"
    }
  }, React.createElement("h4", null, "Selection Abilities"), React.createElement("label", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: "6px",
      marginBottom: "10px"
    }
  }, React.createElement("input", {
    type: "checkbox",
    checked: hideUnselectedSelectionAbilities,
    onChange: e => setHideUnselectedSelectionAbilities(e.target.checked)
  }), "Hide unselected"), selectionAbilitiesByClass.map(({
    className,
    availableCount,
    abilities
  }) => {
    const categoryDefinitions = selectionCategoryDefinitionsByClass[className] || [];
    const filteredAbilities = abilities.filter(ability => {
      const categoryKey = ability.selectionCategory;
      const categoryOption = ability.selectionOption;
      if (!categoryKey || !categoryOption) return true;
      return selectedSelectionCategories[getSelectionCategoryStateKey(className, categoryKey)] === categoryOption;
    });
    const selectedCount = filteredAbilities.filter(ability => knownSelectionAbilities[getSelectionAbilityKey(ability)]).length;
    return React.createElement("div", {
      key: className,
      style: {
        marginBottom: "12px"
      }
    }, React.createElement("div", {
      style: {
        fontWeight: "bold",
        marginBottom: "6px"
      }
    }, className, " Selections Available: ", availableCount - selectedCount), categoryDefinitions.map(category => React.createElement("div", {
      key: getSelectionCategoryStateKey(className, category.categoryKey),
      style: {
        marginBottom: "8px"
      }
    }, React.createElement("label", {
      style: {
        display: "block",
        marginBottom: "4px"
      }
    }, category.label || category.name), React.createElement("select", {
      value: selectedSelectionCategories[getSelectionCategoryStateKey(className, category.categoryKey)] ?? "",
      onChange: e => updateSelectionCategory(className, category.categoryKey, e.target.value)
    }, React.createElement("option", {
      value: ""
    }, "Select ", category.label || category.name), (category.options || []).map(option => React.createElement("option", {
      key: option,
      value: option
    }, option))))), filteredAbilities.filter(ability => !hideUnselectedSelectionAbilities || knownSelectionAbilities[getSelectionAbilityKey(ability)]).map((a, i) => {
      const isKnown = Boolean(knownSelectionAbilities[getSelectionAbilityKey(a)]);
      const isUnavailable = !isKnown && selectedCount >= availableCount;
      return React.createElement("div", {
        key: `${getSelectionAbilityKey(a)}-${i}`,
        style: {
          borderBottom: "1px solid #ccc",
          marginBottom: "6px",
          paddingBottom: "4px",
          opacity: isUnavailable ? 0.45 : 1
        }
      }, React.createElement("label", {
        style: {
          display: "inline-flex",
          alignItems: "center",
          gap: "8px",
          marginBottom: "4px",
          color: isUnavailable ? "#777" : "inherit"
        }
      }, React.createElement("input", {
        type: "checkbox",
        checked: isKnown,
        disabled: isUnavailable,
        onChange: () => toggleKnownSelectionAbility(a)
      }), React.createElement("strong", null, a.name), " (Rank ", a.rank, ")"), React.createElement("br", null), "Class: ", a.class, React.createElement("br", null), "Cost: ", a.cost ?? a.actionCost ?? 0, React.createElement("br", null), a.description);
    }));
  })))), activeTab === "combat" && React.createElement("div", null, React.createElement("h3", null, "Combat"), React.createElement("div", {
    style: {
      marginBottom: "12px"
    }
  }, React.createElement("label", null, "Initiative: "), React.createElement("input", {
    type: "number",
    value: initiative,
    readOnly: true,
    style: {
      width: "60px",
      marginLeft: "8px",
      textAlign: "center"
    }
  }), React.createElement("div", {
    style: {
      marginTop: "6px"
    }
  }, "Brains + Finesse")), React.createElement("div", {
    className: "combatSplit"
  }, React.createElement("div", null, React.createElement("label", null, "Armor: "), React.createElement("select", {
    value: armor,
    onChange: e => setArmor(e.target.value)
  }, Object.keys(armorStatsMap).map(armorName => React.createElement("option", {
    key: armorName,
    value: armorName
  }, armorName))), React.createElement("div", {
    style: {
      marginTop: "8px"
    }
  }, "Base Evasion: ", armorStats.baseEvasion, " + 1/2 Finesse", React.createElement("br", null), "Toughness Bonus: +", armorStats.toughness, React.createElement("br", null), "Dash Penalty: ", armorStats.dashPenalty ?? 0, React.createElement("br", null), "Additional Properties:", armorStats.properties?.length ? " " + armorStats.properties.join(", ") : " None")), React.createElement("div", null, React.createElement("label", null, "Shield: "), React.createElement("select", {
    value: shield,
    onChange: e => setShield(e.target.value)
  }, Object.keys(shieldStatsMap).map(shieldName => React.createElement("option", {
    key: shieldName,
    value: shieldName
  }, shieldName))), React.createElement("div", {
    style: {
      marginTop: "8px"
    }
  }, "Physical Toughness: ", shieldStats.toughness > 0 ? "+" + shieldStats.toughness : "0", React.createElement("br", null), "Brace Endurance Cost: ", shieldStats.braceCost, React.createElement("br", null), "Dash Penalty: ", useShield ? shieldStats.dashPenalty ?? 0 : 0, React.createElement("br", null), "Additional Properties:", shieldStats.properties?.length ? " " + shieldStats.properties.join(", ") : " None"), React.createElement("div", {
    style: {
      marginTop: "8px"
    }
  }, React.createElement("label", null, "Armor Breaker: "), React.createElement("input", {
    type: "number",
    min: "0",
    value: settings.armorBreaker ?? 0,
    onChange: e => setSettings(prev => ({
      ...prev,
      armorBreaker: Math.max(0, Number(e.target.value) || 0)
    })),
    style: {
      width: "70px",
      marginLeft: "8px",
      textAlign: "center"
    }
  })), React.createElement("label", null, React.createElement("input", {
    type: "checkbox",
    checked: useShield,
    onChange: e => setUseShield(e.target.checked)
  }), "Use Shield"))), React.createElement("h3", null, "Conditions"), React.createElement("div", {
    style: {
      marginBottom: "10px",
      display: "flex",
      gap: "8px",
      alignItems: "center",
      flexWrap: "wrap"
    }
  }, React.createElement("select", {
    value: conditionChoice,
    onChange: e => setConditionChoice(e.target.value)
  }, React.createElement("option", {
    value: ""
  }, "Select Condition"), conditions.map(condition => React.createElement("option", {
    key: condition.name,
    value: condition.name
  }, condition.name))), React.createElement("button", {
    onClick: () => addCondition(conditionChoice)
  }, "Add Condition")), React.createElement("div", {
    className: "combatDataTable combatDataTable--conditions"
  }, React.createElement("div", {
    className: "combatDataHeader",
    style: {
      display: "grid",
      gridTemplateColumns: "180px 120px 180px 80px 90px",
      fontWeight: "bold",
      borderBottom: "2px solid #ccc",
      paddingBottom: "4px"
    }
  }, React.createElement("div", null, "Name"), React.createElement("div", null, "Stacks"), React.createElement("div", null, "Source"), React.createElement("div", null, "Remove"), React.createElement("div", null, "Order")), activeConditions.map((condition, index) => React.createElement("div", {
    key: condition.id,
    className: "combatDataRow",
    style: {
      display: "grid",
      gridTemplateColumns: "180px 120px 180px 80px 90px",
      padding: "4px 0",
      borderBottom: "1px solid #ddd",
      alignItems: "center"
    }
  }, React.createElement("div", {
    className: "combatDataCell",
    title: condition.description,
    style: {
      textDecoration: "underline dotted",
      cursor: "help"
    }
  }, React.createElement("div", {
    className: "combatDataCellLabel"
  }, "Name"), condition.name), React.createElement("div", {
    className: "combatDataCell"
  }, React.createElement("div", {
    className: "combatDataCellLabel"
  }, "Stacks"), condition.hasStack ? React.createElement("input", {
    type: "number",
    min: "1",
    value: condition.stacks ?? 1,
    onChange: e => updateCondition(condition.id, "stacks", Math.max(1, Number(e.target.value) || 1)),
    style: {
      width: "60px"
    }
  }) : React.createElement("span", null, "-")), React.createElement("div", {
    className: "combatDataCell combatDataCell--full"
  }, React.createElement("div", {
    className: "combatDataCellLabel"
  }, "Source"), condition.hasSource ? React.createElement("input", {
    value: condition.source ?? "",
    onChange: e => updateCondition(condition.id, "source", e.target.value),
    placeholder: "Source",
    style: {
      width: "150px"
    }
  }) : React.createElement("span", null, "-")), React.createElement("div", {
    className: "combatDataCell"
  }, React.createElement("div", {
    className: "combatDataCellLabel"
  }, "Remove"), React.createElement("button", {
    onClick: () => removeCondition(condition.id)
  }, "Remove")), React.createElement("div", null, React.createElement("button", {
    onClick: () => moveCondition(index, -1)
  }, "\u2191"), React.createElement("button", {
    onClick: () => moveCondition(index, 1)
  }, "\u2193"))))), React.createElement("h3", null, "Weapons"), React.createElement("select", {
    value: weaponChoice,
    onChange: e => setWeaponChoice(e.target.value)
  }, React.createElement("option", {
    value: ""
  }, "Select Weapon"), weapons.filter(w => w.name !== UNARMED_WEAPON_NAME).map(w => React.createElement("option", {
    key: w.name,
    value: w.name
  }, w.name))), React.createElement("button", {
    onClick: () => addWeaponToInventory(weaponChoice)
  }, " Add to Inventory "), React.createElement("h4", null, "Equipped Weapons"), React.createElement("div", {
    className: "combatDataTable combatDataTable--weapons"
  }, React.createElement("div", {
    className: "combatDataHeader",
    style: {
      display: "grid",
      gridTemplateColumns: "120px 120px 120px 120px 90px 150px 120px 1fr 80px 80px 90px",
      fontWeight: "bold",
      borderBottom: "2px solid #ccc",
      paddingBottom: "4px"
    }
  }, React.createElement("div", null, "Name"), React.createElement("div", null, "Type"), React.createElement("div", null, "Attack Stat"), React.createElement("div", null, "Attack Bonus"), React.createElement("div", null, "Attack"), React.createElement("div", null, "Damage"), React.createElement("div", null, "Endurance"), React.createElement("div", null, "Properties"), React.createElement("div", null, "Swap"), React.createElement("div", null, "Remove"), React.createElement("div", null, "Order")), equippedWeapons.map((w, i) => {
    const attackBonus = getWeaponAttackBonus(w);
    return React.createElement("div", {
      key: i,
      className: "combatDataRow",
      style: {
        display: "grid",
        gridTemplateColumns: "120px 120px 120px 120px 90px 150px 120px 1fr 80px 80px 90px",
        padding: "4px 0",
        borderBottom: "1px solid #ddd"
      }
    }, React.createElement("div", null, w.name), React.createElement("div", null, w.type.join(", ")), React.createElement("div", null, w.attackStats.join(", ")), React.createElement("div", null, "+", attackBonus), React.createElement("div", null, React.createElement("button", {
      onClick: () => openAttackDialog(w, attackBonus)
    }, "Attack")), React.createElement("div", null, w.damage.dice, " ", w.damage.type), React.createElement("div", null, w.enduranceCost), React.createElement("div", null, w.properties.join(", ")), w.name === UNARMED_WEAPON_NAME ? React.createElement("div", null, "Always Equipped") : React.createElement("div", null, React.createElement("button", {
      onClick: () => swapWeapon(i, "equipped")
    }, "Unequip")), React.createElement("div", null, w.name === UNARMED_WEAPON_NAME ? null : React.createElement("button", {
      onClick: () => removeWeapon(i, "equipped")
    }, "Remove")), React.createElement("div", null, React.createElement(React.Fragment, null, React.createElement("button", {
      onClick: () => moveWeapon(i, "equipped", -1)
    }, "\u2191"), React.createElement("button", {
      onClick: () => moveWeapon(i, "equipped", 1)
    }, "\u2193"))));
  })), React.createElement("h4", null, "Backpack"), React.createElement("div", {
    className: "combatDataTable combatDataTable--weapons"
  }, React.createElement("div", {
    className: "combatDataHeader",
    style: {
      display: "grid",
      gridTemplateColumns: "120px 120px 120px 120px 90px 150px 120px 1fr 80px 80px 90px",
      fontWeight: "bold",
      borderBottom: "2px solid #ccc",
      paddingBottom: "4px"
    }
  }, React.createElement("div", null, "Name"), React.createElement("div", null, "Type"), React.createElement("div", null, "Attack Stat"), React.createElement("div", null, "Attack Bonus"), React.createElement("div", null, "Attack"), React.createElement("div", null, "Damage"), React.createElement("div", null, "Endurance"), React.createElement("div", null, "Properties"), React.createElement("div", null, "Swap"), React.createElement("div", null, "Remove"), React.createElement("div", null, "Order")), inventoryWeapons.map((w, index) => ({
    w,
    index
  })).filter(({
    w
  }) => w.name !== UNARMED_WEAPON_NAME).map(({
    w,
    index
  }) => {
    const attackBonus = getWeaponAttackBonus(w);
    return React.createElement("div", {
      key: `${w.name}-${index}`,
      className: "combatDataRow",
      style: {
        display: "grid",
        gridTemplateColumns: "120px 120px 120px 120px 90px 150px 120px 1fr 80px 80px 90px",
        borderBottom: "1px solid #ddd"
      }
    }, React.createElement("div", null, w.name), React.createElement("div", null, w.type.join(", ")), React.createElement("div", null, w.attackStats.join(", ")), React.createElement("div", null, "+", attackBonus), React.createElement("div", null, React.createElement("button", {
      onClick: () => openAttackDialog(w, attackBonus)
    }, "Attack")), React.createElement("div", null, w.damage.dice, " ", w.damage.type), React.createElement("div", null, w.enduranceCost), React.createElement("div", null, w.properties.join(", ")), React.createElement("div", null, React.createElement("button", {
      onClick: () => swapWeapon(index, "inventory")
    }, "Equip")), React.createElement("div", null, React.createElement("button", {
      onClick: () => removeWeapon(index, "inventory")
    }, "Remove")), React.createElement("div", null, React.createElement("button", {
      onClick: () => moveWeapon(index, "inventory", -1)
    }, "\u2191"), React.createElement("button", {
      onClick: () => moveWeapon(index, "inventory", 1)
    }, "\u2193")));
  }))), attackDialogElement), activeTab === "inventory" && React.createElement("div", null, React.createElement("h3", null, "Inventory"), React.createElement("div", {
    style: {
      marginBottom: "12px"
    }
  }, React.createElement("label", {
    style: {
      display: "block",
      marginBottom: "4px"
    }
  }, "Doubloons"), React.createElement("input", {
    type: "number",
    min: "0",
    value: doubloons,
    onChange: e => setDoubloons(Math.max(0, Number(e.target.value) || 0))
  })), React.createElement("button", {
    onClick: addItem
  }, "Add Item"), React.createElement("div", {
    style: {
      marginTop: "10px"
    }
  }, React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "200px 140px 100px 100px 80px 90px",
      fontWeight: "bold",
      borderBottom: "2px solid #ccc",
      paddingBottom: "4px"
    }
  }, React.createElement("div", null, "Name"), React.createElement("div", null, "Notes"), React.createElement("div", null, "Charges"), React.createElement("div", null, "Amount"), React.createElement("div", null, "Remove"), React.createElement("div", null, "Order")), items.map((item, index) => React.createElement("div", {
    key: item.id,
    style: {
      display: "grid",
      gridTemplateColumns: "200px 140px 100px 100px 80px 90px",
      padding: "4px 0",
      borderBottom: "1px solid #ddd"
    }
  }, React.createElement("input", {
    value: item.name,
    readOnly: item.isCombatGear || item.isWeapon,
    onChange: e => updateItem(item.id, "name", e.target.value)
  }), React.createElement("input", {
    value: item.notes ?? "",
    readOnly: item.isCombatGear || item.isWeapon,
    onChange: e => updateItem(item.id, "notes", e.target.value)
  }), item.isCombatGear || item.isWeapon ? React.createElement("div", null) : React.createElement("input", {
    type: "number",
    value: item.charges,
    onChange: e => updateItem(item.id, "charges", Number(e.target.value)),
    style: {
      width: "60px"
    }
  }), item.isCombatGear || item.isWeapon ? React.createElement("div", null) : React.createElement("input", {
    type: "number",
    value: item.amount,
    onChange: e => updateItem(item.id, "amount", Number(e.target.value)),
    style: {
      width: "60px"
    }
  }), item.isCombatGear || item.isWeapon ? React.createElement("div", null) : React.createElement("button", {
    onClick: () => removeItem(item.id)
  }, "Remove"), React.createElement("div", null, React.createElement(React.Fragment, null, React.createElement("button", {
    onClick: () => moveItem(index, -1)
  }, "\u2191"), React.createElement("button", {
    onClick: () => moveItem(index, 1)
  }, "\u2193"))))))), activeTab === "background" && React.createElement("div", null, React.createElement("h3", null, "Character Journal"), renderBackgroundJournal())));
}
function SettingsModal({
  isOpen,
  onClose,
  settings,
  setSettings,
  activeSlot,
  activeSlotLabel,
  cloudSaveEnabled,
  generatedShareCode,
  shareCodeInput,
  setShareCodeInput,
  generateShareCode,
  importShareCode,
  isShareCodeBusy,
  expansions,
  importExpansionFile,
  removeExpansion,
  exportExpansions,
  downloadGearTemplate,
  downloadClassTemplate
}) {
  if (!isOpen) return null;
  const settingsOverrideInputStyle = {
    width: "88px",
    justifySelf: "start"
  };
  return React.createElement("div", {
    className: "attackModalOverlay",
    onClick: onClose
  }, React.createElement("div", {
    className: "attackModal",
    style: {
      maxWidth: "980px",
      width: "min(980px, calc(100vw - 32px))",
      maxHeight: "calc(100vh - 32px)",
      overflowY: "auto"
    },
    onClick: e => e.stopPropagation()
  }, React.createElement("div", {
    className: "attackModalHeader"
  }, React.createElement("div", null, React.createElement("div", {
    className: "folioKicker"
  }, "Character Controls"), React.createElement("h3", {
    className: "sectionTitle",
    style: {
      fontSize: "26px"
    }
  }, "Settings"))), React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "200px minmax(0, 1fr)",
      gap: "8px"
    }
  }, React.createElement("div", {
    style: {
      fontWeight: "700",
      marginTop: "10px"
    }
  }, "Dark Mode"), React.createElement("label", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: "8px",
      justifySelf: "start",
      marginTop: "10px"
    }
  }, React.createElement("input", {
    type: "checkbox",
    checked: Boolean(settings.darkMode),
    onChange: e => setSettings(prev => ({
      ...prev,
      darkMode: e.target.checked
    }))
  }), "Enabled"), React.createElement("h3", null, "Stats"), React.createElement("div", null), STAT_LIST.map(stat => React.createElement(React.Fragment, {
    key: stat
  }, React.createElement("div", null, stat), React.createElement("input", {
    type: "number",
    style: settingsOverrideInputStyle,
    value: settings.statOverrides[stat] ?? "",
    placeholder: "Override",
    onChange: e => {
      const v = e.target.value;
      setSettings(prev => ({
        ...prev,
        statOverrides: {
          ...prev.statOverrides,
          [stat]: v === "" ? null : Number(v)
        }
      }));
    }
  }))), React.createElement("h3", null, "General"), React.createElement("div", null), React.createElement("div", null, "Available Skill Points"), React.createElement("input", {
    type: "number",
    style: settingsOverrideInputStyle,
    value: settings.skillPointsOverride ?? "",
    placeholder: "Override",
    onChange: e => setSettings(prev => ({
      ...prev,
      skillPointsOverride: e.target.value === "" ? null : Number(e.target.value)
    }))
  }), React.createElement("div", null, "Evasion"), React.createElement("input", {
    type: "number",
    style: settingsOverrideInputStyle,
    value: settings.evasionOverride ?? "",
    placeholder: "Override",
    onChange: e => setSettings(prev => ({
      ...prev,
      evasionOverride: e.target.value === "" ? null : Number(e.target.value)
    }))
  }), React.createElement("div", null, "Toughness"), React.createElement("input", {
    type: "number",
    style: settingsOverrideInputStyle,
    value: settings.toughnessOverride ?? "",
    placeholder: "Override",
    onChange: e => setSettings(prev => ({
      ...prev,
      toughnessOverride: e.target.value === "" ? null : Number(e.target.value)
    }))
  }), React.createElement("div", null, "Initiative"), React.createElement("input", {
    type: "number",
    style: settingsOverrideInputStyle,
    value: settings.initiativeOverride ?? "",
    placeholder: "Override",
    onChange: e => setSettings(prev => ({
      ...prev,
      initiativeOverride: e.target.value === "" ? null : Number(e.target.value)
    }))
  }), React.createElement("div", null, "Max Health"), React.createElement("input", {
    type: "number",
    style: settingsOverrideInputStyle,
    placeholder: "Override",
    value: settings.healthMax ?? "",
    onChange: e => setSettings(prev => ({
      ...prev,
      healthMax: e.target.value === "" ? null : Number(e.target.value)
    }))
  }), React.createElement("div", null, "Max Endurance"), React.createElement("input", {
    type: "number",
    style: settingsOverrideInputStyle,
    placeholder: "Override",
    value: settings.enduranceMax ?? "",
    onChange: e => setSettings(prev => ({
      ...prev,
      enduranceMax: e.target.value === "" ? null : Number(e.target.value)
    }))
  }), React.createElement("div", null, "Max Luck"), React.createElement("input", {
    type: "number",
    style: settingsOverrideInputStyle,
    placeholder: "3",
    value: settings.luckMaxOverride ?? "",
    onChange: e => setSettings(prev => ({
      ...prev,
      luckMaxOverride: e.target.value === "" ? null : Number(e.target.value)
    }))
  }), React.createElement("h3", null, "Movement"), React.createElement("div", null), React.createElement("div", null, "Speed"), React.createElement("input", {
    type: "number",
    style: settingsOverrideInputStyle,
    placeholder: "3",
    value: settings.speedOverride ?? "",
    onChange: e => setSettings(prev => ({
      ...prev,
      speedOverride: e.target.value === "" ? null : Number(e.target.value)
    }))
  }), React.createElement("div", null, "Dash"), React.createElement("input", {
    type: "number",
    style: settingsOverrideInputStyle,
    placeholder: "Override",
    value: settings.dashOverride ?? "",
    onChange: e => setSettings(prev => ({
      ...prev,
      dashOverride: e.target.value === "" ? null : Number(e.target.value)
    }))
  }), React.createElement("h3", null, "Weapon Type Overrides"), React.createElement("div", null), WEAPON_TYPES.map(type => React.createElement(React.Fragment, {
    key: type
  }, React.createElement("div", null, type), React.createElement("input", {
    type: "number",
    style: settingsOverrideInputStyle,
    value: settings.weaponTypeOverrides[type] ?? "",
    placeholder: "Override",
    onChange: e => {
      const v = e.target.value;
      setSettings(prev => ({
        ...prev,
        weaponTypeOverrides: {
          ...prev.weaponTypeOverrides,
          [type]: v === "" ? null : Number(v)
        }
      }));
    }
  }))), React.createElement("h3", null, "Cloud Sharing"), React.createElement("div", null), React.createElement("div", {
    style: {
      display: "grid",
      gap: "8px",
      gridColumn: "1 / span 2"
    }
  }, cloudSaveEnabled ? React.createElement(React.Fragment, null, React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "220px minmax(220px, 1fr)",
      gap: "8px",
      alignItems: "center"
    }
  }, React.createElement("button", {
    onClick: () => generateShareCode(activeSlot),
    disabled: isShareCodeBusy
  }, isShareCodeBusy ? "Please wait..." : `Generate from ${activeSlotLabel}`), React.createElement("input", {
    value: generatedShareCode,
    readOnly: true,
    placeholder: "Generated share code",
    style: {
      width: "100%"
    }
  })), React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "220px minmax(220px, 1fr)",
      gap: "8px",
      alignItems: "center"
    }
  }, React.createElement("button", {
    onClick: importShareCode,
    disabled: isShareCodeBusy
  }, isShareCodeBusy ? "Please wait..." : "Import Share Code"), React.createElement("input", {
    value: shareCodeInput,
    onChange: e => setShareCodeInput(e.target.value.toUpperCase()),
    placeholder: "Enter share code",
    style: {
      width: "100%"
    }
  }))) : React.createElement("div", {
    style: {
      color: settings.darkMode ? "rgba(232, 237, 246, 0.72)" : "rgba(47, 36, 23, 0.72)"
    }
  }, "Sign in with a traveler, admin, writer, or owner account to use cloud sharing.")), React.createElement("h3", null, "Expansions"), React.createElement("div", null), React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(2, minmax(180px, 1fr))",
      gap: "8px"
    }
  }, React.createElement("button", {
    onClick: importExpansionFile
  }, "Import Expansion"), React.createElement("button", {
    onClick: exportExpansions,
    disabled: expansions.length === 0
  }, "Export Expansions"), React.createElement("button", {
    onClick: downloadGearTemplate
  }, "Download Gear Template"), React.createElement("button", {
    onClick: downloadClassTemplate
  }, "Download Class Template")), React.createElement("div", {
    style: {
      gridColumn: "1 / span 2"
    }
  }, React.createElement("div", {
    style: {
      marginTop: "8px",
      marginBottom: "8px",
      color: settings.darkMode ? "rgba(232, 237, 246, 0.72)" : "rgba(47, 36, 23, 0.72)"
    }
  }, "Expansion JSON can include `classGroups`, `classAbilities`, `weapons`, `armors`, `shields`, and `conditions`."), expansions.length === 0 ? React.createElement("div", null, "No expansion packs loaded.") : expansions.map(expansion => React.createElement("div", {
    key: expansion.id,
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: "12px",
      padding: "8px 0",
      borderBottom: "1px solid rgba(92, 69, 36, 0.16)"
    }
  }, React.createElement("div", null, expansion.name, " (", expansion.classGroups.length, " class groups, ", expansion.classAbilities.length, " abilities, ", expansion.weapons.length, " weapons, ", expansion.armors.length, " armors, ", expansion.shields.length, " shields, ", expansion.conditions.length, " conditions)"), React.createElement("button", {
    onClick: () => removeExpansion(expansion.id)
  }, "Remove"))))), React.createElement("div", {
    className: "attackModalFooter"
  }, React.createElement("button", {
    type: "button",
    onClick: onClose
  }, "Done"))));
}
// TopBar renders the always-visible identity and combat resource summary.
function TopBar({
  name,
  setName,
  crew,
  setCrew,
  currentLevel,
  setCurrentLevel,
  setLevelStats,
  setLevelSkills,
  evasion,
  toughness,
  health,
  setHealth,
  minHealth,
  maxHealth,
  endurance,
  setEndurance,
  minEndurance,
  maxEndurance,
  speed,
  dashSpeed,
  luck,
  maxLuck,
  setLuck,
  settings,
  armorStats,
  shieldStats,
  useShield,
  equippedWeapons,
  activeConditions
}) {
  const smallBox = {
    width: "40px",
    textAlign: "center"
  };
  const availableParryWeapons = equippedWeapons.filter(Boolean);
  const [isDamageDialogOpen, setIsDamageDialogOpen] = React.useState(false);
  const [incomingDamage, setIncomingDamage] = React.useState(0);
  const [damageResponse, setDamageResponse] = React.useState("dodge");
  const [selectedDamageType, setSelectedDamageType] = React.useState("Physical");
  const [damageHeadshot, setDamageHeadshot] = React.useState(false);
  const [damageArmorPiercing, setDamageArmorPiercing] = React.useState(false);
  const [selectedParryWeaponName, setSelectedParryWeaponName] = React.useState("");
  function openDamageDialog() {
    setIsDamageDialogOpen(true);
    setIncomingDamage(0);
    setDamageResponse("dodge");
    setSelectedDamageType("Physical");
    setDamageHeadshot(false);
    setDamageArmorPiercing(false);
    setSelectedParryWeaponName(availableParryWeapons[0]?.name ?? "");
  }
  function closeDamageDialog() {
    setIsDamageDialogOpen(false);
  }
  function getTypedToughness(stats, damageType) {
    if (!stats) return 0;
    const normalizeType = value => String(value || "").trim().toLowerCase();
    const requestedType = normalizeType(damageType);
    const toughnessEntries = Array.isArray(stats.toughnessEntries) ? stats.toughnessEntries : [];
    const exactEntry = toughnessEntries.find(entry => normalizeType(entry?.type) === requestedType);
    if (exactEntry) return Number(exactEntry.amount) || 0;
    const isPhysicalFamily = requestedType === "physical" || requestedType === "bludgeoning" || requestedType === "piercing" || requestedType === "slashing";
    if (isPhysicalFamily) {
      const physicalEntry = toughnessEntries.find(entry => normalizeType(entry?.type) === "physical");
      if (physicalEntry) return Number(physicalEntry.amount) || 0;
      return Number(stats.toughness) || 0;
    }
    return requestedType === "physical" ? Number(stats.toughness) || 0 : 0;
  }
  const bleedStacks = activeConditions.reduce((total, condition) => {
    const conditionName = String(condition?.name || "").trim().toLowerCase();
    if (conditionName !== "bleed" && conditionName !== "bleeding") return total;
    const stacks = condition?.hasStack ? Number(condition?.stacks) || 0 : 1;
    return total + Math.max(0, stacks);
  }, 0);
  const selectedParryWeapon = availableParryWeapons.find(weapon => weapon.name === selectedParryWeaponName) || availableParryWeapons[0] || null;
  const armorToughness = getTypedToughness(armorStats, selectedDamageType);
  const shieldToughness = useShield ? getTypedToughness(shieldStats, selectedDamageType) : 0;
  const armorBreaker = Math.max(0, Number(settings?.armorBreaker) || 0);
  let mitigatedToughness = armorToughness;
  let enduranceCost = 0;
  if (damageResponse === "brace") {
    mitigatedToughness = armorToughness + shieldToughness;
    enduranceCost = useShield ? shieldStats?.braceCost ?? 0 : 0;
  }
  if (damageResponse === "parry") {
    mitigatedToughness = armorToughness;
    enduranceCost = selectedParryWeapon ? Number(selectedParryWeapon.enduranceCost) || 0 : 0;
  }
  mitigatedToughness = Math.max(0, mitigatedToughness - armorBreaker);
  if (damageArmorPiercing) {
    mitigatedToughness /= 2;
  }
  const baseHealthDamage = Math.max(0, incomingDamage - mitigatedToughness);
  let healthDamage = baseHealthDamage;
  if (damageHeadshot) {
    healthDamage *= 2;
  }
  const bleedBonusDamage = bleedStacks;
  healthDamage += bleedBonusDamage;
  const totalDamage = healthDamage + enduranceCost;
  const availableEnduranceBuffer = Math.max(0, endurance - minEndurance);
  const enduranceDamageApplied = Math.min(availableEnduranceBuffer, totalDamage);
  const overflowHealthDamage = Math.max(0, totalDamage - availableEnduranceBuffer);
  function confirmDamage() {
    setHealth(prev => Math.max(minHealth, Math.min(prev - overflowHealthDamage, maxHealth)));
    setEndurance(prev => Math.max(minEndurance, Math.min(prev - enduranceDamageApplied, maxEndurance)));
    closeDamageDialog();
  }
  const damageDialogElement = isDamageDialogOpen && React.createElement("div", {
    className: "damageModalOverlay",
    onClick: closeDamageDialog
  }, React.createElement("div", {
    className: "damageModal",
    onClick: e => e.stopPropagation()
  }, React.createElement("div", {
    className: "damageModalHeader"
  }, React.createElement("div", null, React.createElement("div", {
    className: "folioKicker"
  }, "Combat Defense"), React.createElement("h3", {
    className: "sectionTitle",
    style: {
      fontSize: "26px"
    }
  }, "Take Damage"))), React.createElement("div", {
    className: "damageModalField"
  }, React.createElement("label", null, "Incoming Damage"), React.createElement("input", {
    type: "number",
    min: "0",
    value: incomingDamage,
    onChange: e => setIncomingDamage(Math.max(0, Number(e.target.value) || 0))
  })), React.createElement("div", {
    className: "damageModalField"
  }, React.createElement("label", null, "Damage Type"), React.createElement("select", {
    value: selectedDamageType,
    onChange: e => setSelectedDamageType(e.target.value)
  }, DAMAGE_TYPE_OPTIONS.map(type => React.createElement("option", {
    key: type,
    value: type
  }, type)))), React.createElement("div", {
    className: "damageModalBreakdown"
  }, armorToughness > 0 && React.createElement("span", null, "Armor Toughness: ", armorToughness), damageResponse === "brace" && shieldToughness > 0 && React.createElement("span", null, "Shield Toughness: ", shieldToughness), mitigatedToughness > 0 && React.createElement("span", null, "Applied Toughness: ", mitigatedToughness)), React.createElement("div", {
    style: {
      fontSize: "12px",
      opacity: 0.8
    }
  }, bleedBonusDamage > 0 ? `Bleed adds +${bleedBonusDamage} bleeding damage from active stacks.` : "No bleed bonus damage."), React.createElement("div", {
    className: "damageModalOptionGroup"
  }, React.createElement("button", {
    type: "button",
    className: damageResponse === "dodge" ? "damageModalModeButton damageModalModeButton--active" : "damageModalModeButton",
    onClick: () => setDamageResponse("dodge")
  }, "Dodge"), React.createElement("button", {
    type: "button",
    className: damageResponse === "brace" ? "damageModalModeButton damageModalModeButton--active" : "damageModalModeButton",
    onClick: () => setDamageResponse("brace")
  }, "Brace"), React.createElement("button", {
    type: "button",
    className: damageResponse === "parry" ? "damageModalModeButton damageModalModeButton--active" : "damageModalModeButton",
    onClick: () => setDamageResponse("parry")
  }, "Parry")), damageResponse === "parry" && React.createElement("div", {
    className: "damageModalField"
  }, React.createElement("label", null, "Parry Weapon"), React.createElement("select", {
    value: selectedParryWeapon?.name ?? "",
    onChange: e => setSelectedParryWeaponName(e.target.value)
  }, availableParryWeapons.length === 0 ? React.createElement("option", {
    value: ""
  }, "No Equipped Weapons") : availableParryWeapons.map(weapon => React.createElement("option", {
    key: weapon.name,
    value: weapon.name
  }, weapon.name)))), React.createElement("label", {
    className: "damageModalToggle"
  }, React.createElement("input", {
    type: "checkbox",
    checked: damageHeadshot,
    onChange: e => setDamageHeadshot(e.target.checked)
  }), "Headshot"), React.createElement("label", {
    className: "damageModalToggle"
  }, React.createElement("input", {
    type: "checkbox",
    checked: damageArmorPiercing,
    onChange: e => setDamageArmorPiercing(e.target.checked)
  }), "Armor Piercing"), React.createElement("div", {
    className: "damageModalBreakdown"
  }, enduranceDamageApplied !== 0 && React.createElement("span", null, "Endurance lost: ", enduranceDamageApplied), overflowHealthDamage !== 0 && React.createElement("span", null, "Health lost: ", overflowHealthDamage), bleedBonusDamage !== 0 && React.createElement("span", null, "Bleed damage: ", bleedBonusDamage), damageHeadshot && baseHealthDamage !== 0 && React.createElement("span", null, "Headshot damage: ", baseHealthDamage)), React.createElement("div", {
    className: "damageModalFooter"
  }, React.createElement("div", {
    className: "damageModalTotal"
  }, "Total Damage: ", totalDamage), React.createElement("button", {
    type: "button",
    onClick: closeDamageDialog
  }, "Cancel"), React.createElement("button", {
    type: "button",
    onClick: confirmDamage
  }, "Confirm"))));
  return React.createElement("div", {
    className: "topbar"
  }, React.createElement("div", {
    className: "folioIdentity"
  }, React.createElement("div", {
    className: "folioKicker"
  }), React.createElement("h1", {
    className: "folioTitle"
  }, "Pirate Character Sheet"), React.createElement("div", {
    className: "folioIdentityGrid"
  }, React.createElement("div", {
    className: "folioField"
  }, React.createElement("label", null, "Name"), React.createElement("input", {
    value: name,
    onChange: e => setName(e.target.value)
  })), React.createElement("div", {
    className: "folioField"
  }, React.createElement("label", null, "Crew"), React.createElement("input", {
    value: crew,
    onChange: e => setCrew(e.target.value)
  })))), React.createElement("div", {
    className: "folioMeta"
  }, React.createElement("div", {
    className: "resourceActionGroup"
  }, React.createElement("div", {
    className: "resourceCard compactResourceCard resourceCard--action"
  }, React.createElement("label", null, "Evasion"), React.createElement("input", {
    type: "number",
    style: smallBox,
    value: evasion,
    readOnly: true
  })), React.createElement("div", {
    className: "resourceCard compactResourceCard resourceCard--action"
  }, React.createElement("label", null, "Toughness"), React.createElement("input", {
    type: "number",
    style: smallBox,
    value: toughness,
    readOnly: true
  })), React.createElement("div", {
    className: "resourceCard compactResourceCard resourceCard--action"
  }, React.createElement("label", null, "Health"), React.createElement("div", {
    className: "resourceCardValue"
  }, React.createElement("input", {
    type: "number",
    value: health,
    style: smallBox,
    onChange: e => {
      const v = e.target.value === "" ? null : Number(e.target.value);
      setHealth(Math.max(minHealth, Math.min(v, maxHealth)));
    }
  }), React.createElement("div", {
    className: "resourceCardTotal"
  }, "/ ", maxHealth))), React.createElement("div", {
    className: "resourceCard compactResourceCard resourceCard--action"
  }, React.createElement("label", null, "Endurance"), React.createElement("div", {
    className: "resourceCardValue"
  }, React.createElement("input", {
    type: "number",
    value: endurance,
    style: smallBox,
    onChange: e => {
      const raw = e.target.value;
      if (raw === "") return;
      const v = Number(raw);
      setEndurance(Math.max(minEndurance, Math.min(v, maxEndurance)));
    }
  }), React.createElement("div", {
    className: "resourceCardTotal"
  }, "/ ", maxEndurance))), React.createElement("button", {
    type: "button",
    className: "resourceActionButton resourceActionButton--wide",
    onClick: openDamageDialog
  }, "Take Damage")), React.createElement("div", {
    className: "resourceCard resourceCard--movement"
  }, React.createElement("label", null, "Movement"), React.createElement("div", {
    className: "resourceCardLine"
  }, React.createElement("span", null, "Speed:"), React.createElement("input", {
    className: "movementValueInput",
    type: "number",
    style: smallBox,
    value: speed,
    readOnly: true
  })), React.createElement("div", {
    className: "resourceCardLine"
  }, React.createElement("span", null, "Dash:"), React.createElement("input", {
    className: "movementValueInput",
    type: "number",
    style: smallBox,
    value: dashSpeed,
    readOnly: true
  }))), React.createElement("div", {
    className: "resourceCard compactResourceCard resourceCard--luck"
  }, React.createElement("label", null, "Luck"), React.createElement("div", {
    className: "resourceCardValue"
  }, React.createElement("input", {
    type: "number",
    value: luck,
    style: smallBox,
    min: 0,
    max: maxLuck,
    onChange: e => {
      const raw = e.target.value;
      if (raw === "") return;
      const v = Number(raw);
      setLuck(Math.max(0, Math.min(v, maxLuck)));
    }
  }), React.createElement("div", {
    className: "resourceCardTotal"
  }, "/ ", maxLuck))), React.createElement("div", {
    className: "resourceCard"
  }, React.createElement("label", null, "Level"), React.createElement("select", {
    value: currentLevel,
    onChange: e => {
      const nextLevel = Number(e.target.value);
      if (nextLevel < currentLevel) {
        setLevelStats(prev => trimFutureLevelData(prev, nextLevel, createEmptyStatLevel));
        setLevelSkills(prev => trimFutureLevelData(prev, nextLevel, createEmptySkillLevel));
      }
      setCurrentLevel(nextLevel);
    }
  }, Array.from({
    length: 20
  }, (_, i) => React.createElement("option", {
    key: i + 1,
    value: i + 1
  }, i + 1))))), damageDialogElement);
}
// Base class data and expansion merge helpers feed the class selection sidebar.
const BASE_CLASS_GROUPS = [{
  title: "Fighters",
  classes: ["Basher", "Brute", "Cleaver", "Marksman", "Martial Artist", "Sharpshooter", "Spearman", "Swordsman"]
}, {
  title: "Artisans",
  classes: ["Alchemist", "Blacksmith", "Carpenter", "Chef", "Farmer", "Fisherman", "Grenadier", "Trapper"]
}, {
  title: "Scholars",
  classes: ["Clergyman", "Doctor", "Ecologist", "Musician", "Navigator", "Noble"]
}];
function mergeClassGroups(baseGroups, expansionGroups) {
  const groupMap = new Map(baseGroups.map(group => [group.title, [...group.classes]]));
  expansionGroups.forEach(group => {
    if (!group || !group.title || !Array.isArray(group.classes)) return;
    if (!groupMap.has(group.title)) {
      groupMap.set(group.title, []);
    }
    const existing = groupMap.get(group.title);
    group.classes.forEach(cls => {
      if (typeof cls === "string" && cls && !existing.includes(cls)) {
        existing.push(cls);
      }
    });
  });
  return Array.from(groupMap.entries()).map(([title, classes]) => ({
    title,
    classes
  }));
}
function mergeNamedStats(baseStats, expansionEntries) {
  const merged = {
    ...baseStats
  };
  expansionEntries.forEach(entry => {
    if (!entry || typeof entry.name !== "string" || !entry.name.trim()) return;
    merged[entry.name] = {
      ...entry
    };
    delete merged[entry.name].name;
  });
  return merged;
}
function buildNamedStatsMap(entries, fallbackEntries = []) {
  const source = Array.isArray(entries) && entries.length ? entries : fallbackEntries;
  return source.reduce((accumulator, entry) => {
    if (!entry || typeof entry.name !== "string" || !entry.name.trim()) return accumulator;
    accumulator[entry.name] = {
      ...entry
    };
    delete accumulator[entry.name].name;
    return accumulator;
  }, {});
}
function normalizeBuilderEntryValues(entry) {
  if (!entry || typeof entry !== "object") return {};
  if (entry.values && typeof entry.values === "object" && !Array.isArray(entry.values)) {
    return entry.values;
  }
  return entry;
}
function getPrimaryToughnessValue(values) {
  const toughnessEntries = Array.isArray(values?.toughnessEntries) ? values.toughnessEntries : [];
  const physicalEntry = toughnessEntries.find(entry => String(entry?.type || "").trim().toLowerCase() === "physical");
  const firstEntry = physicalEntry || toughnessEntries[0];
  const resolved = firstEntry?.amount ?? values?.toughness ?? 0;
  return Number(resolved) || 0;
}
function getPrimaryDamageEntry(attack) {
  const damageEntries = Array.isArray(attack?.damageEntries) ? attack.damageEntries : [];
  if (damageEntries.length > 0) {
    return damageEntries[0];
  }
  return {
    amount: attack?.damageDice || attack?.damage?.dice || "",
    damageTypes: Array.isArray(attack?.damageTypes) ? attack.damageTypes : attack?.damageType ? [attack.damageType] : attack?.damage?.type ? [attack.damage.type] : []
  };
}
function formatDamageTypeSummary(damageEntry) {
  const damageTypes = Array.isArray(damageEntry?.damageTypes) ? damageEntry.damageTypes.map(type => String(type || "").trim()).filter(Boolean) : [];
  return damageTypes.join(" / ");
}
function buildExpansionFromHomebrew(raw, fallbackName) {
  const source = raw?.homebrew && typeof raw.homebrew === "object" && !Array.isArray(raw.homebrew) ? raw.homebrew : raw;
  const weaponEntries = Array.isArray(source?.weapon) ? source.weapon : [];
  const armorEntries = Array.isArray(source?.armor) ? source.armor : [];
  const classEntries = Array.isArray(source?.class) ? source.class : [];
  const standaloneAbilityEntries = Array.isArray(source?.ability) ? source.ability : [];
  const classGroupMap = new Map();
  const classAbilities = [];
  const weapons = [];
  const armors = [];
  const shields = [];
  weaponEntries.forEach((entry, weaponIndex) => {
    const values = normalizeBuilderEntryValues(entry);
    const attacks = Array.isArray(values.attacks) ? values.attacks : [];
    const weaponAbilities = Array.isArray(values.abilities) ? values.abilities : [];
    const baseName = String(values.name || "").trim();
    if (!baseName) return;
    if (attacks.length === 0) {
      weapons.push({
        name: baseName,
        type: Array.isArray(values.type) ? values.type : values.type ? [values.type] : [],
        attackStats: [],
        damage: {
          dice: "",
          type: ""
        },
        enduranceCost: 0,
        properties: Array.isArray(values.properties) ? values.properties : [],
        abilities: weaponAbilities
      });
      return;
    }
    attacks.forEach((attack, attackIndex) => {
      const primaryDamage = getPrimaryDamageEntry(attack);
      const attackName = String(attack?.name || "").trim();
      const weaponName = attacks.length === 1 ? baseName : attackName ? `${baseName} - ${attackName}` : `${baseName} - Attack ${attackIndex + 1}`;
      weapons.push({
        name: weaponName,
        type: Array.isArray(values.type) ? values.type : values.type ? [values.type] : [],
        attackStats: Array.isArray(attack?.attackStats) ? attack.attackStats : [],
        damage: {
          dice: String(primaryDamage?.amount || "").trim(),
          type: formatDamageTypeSummary(primaryDamage)
        },
        enduranceCost: Number(attack?.enduranceCost) || 0,
        properties: Array.isArray(attack?.properties) ? attack.properties : [],
        abilities: weaponAbilities,
        attackProfiles: attacks,
        sourceWeaponName: baseName
      });
    });
  });
  armorEntries.forEach(entry => {
    const values = normalizeBuilderEntryValues(entry);
    const target = String(values.equipmentKind || "").trim() === "Shield" ? shields : armors;
    const normalized = {
      name: String(values.name || "").trim(),
      toughness: getPrimaryToughnessValue(values),
      properties: Array.isArray(values.properties) ? values.properties : [],
      toughnessEntries: Array.isArray(values.toughnessEntries) ? values.toughnessEntries : []
    };
    if (!normalized.name) return;
    if (target === armors) {
      normalized.baseEvasion = Number(values.baseEvasion) || 16;
    } else {
      normalized.braceCost = Number(values.braceCost) || 0;
    }
    normalized.dashPenalty = Number(values.dashPenalty) || 0;
    target.push(normalized);
  });
  classEntries.forEach(entry => {
    const values = normalizeBuilderEntryValues(entry);
    const className = String(values.name || "").trim();
    if (!className) return;
    const groupName = String(values.group || "General").trim() || "General";
    if (!classGroupMap.has(groupName)) {
      classGroupMap.set(groupName, []);
    }
    const groupClasses = classGroupMap.get(groupName);
    if (!groupClasses.includes(className)) {
      groupClasses.push(className);
    }
    const abilities = Array.isArray(values.abilities) ? values.abilities : [];
    abilities.forEach(ability => {
      if (!ability || !ability.name) return;
      classAbilities.push({
        ...ability,
        class: className,
        rank: Number(ability.rank) || 1
      });
    });
  });
  standaloneAbilityEntries.forEach(entry => {
    const values = normalizeBuilderEntryValues(entry);
    if (!values?.name) return;
    classAbilities.push({
      ...values,
      class: "General",
      rank: Number(values.rank) || 1
    });
  });
  return {
    id: typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : `${fallbackName}-${Date.now()}`,
    name: typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : fallbackName,
    classGroups: Array.from(classGroupMap.entries()).map(([title, classes]) => ({
      title,
      classes
    })),
    classAbilities,
    weapons,
    armors,
    shields,
    conditions: Array.isArray(raw.conditions) ? raw.conditions : []
  };
}
function normalizeExpansion(raw, fallbackName) {
  if (!raw || typeof raw !== "object") {
    throw new Error("Expansion file must be a JSON object.");
  }
  if (raw.kind === "pirate-homebrew-builder" || raw.homebrew && typeof raw.homebrew === "object" && !Array.isArray(raw.homebrew)) {
    return buildExpansionFromHomebrew(raw, fallbackName);
  }
  const name = typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : fallbackName;
  const classGroups = Array.isArray(raw.classGroups) ? raw.classGroups : [];
  const classAbilities = Array.isArray(raw.classAbilities) ? raw.classAbilities : [];
  const weapons = Array.isArray(raw.weapons) ? raw.weapons : [];
  const armors = Array.isArray(raw.armors) ? raw.armors : [];
  const shields = Array.isArray(raw.shields) ? raw.shields : [];
  const conditions = Array.isArray(raw.conditions) ? raw.conditions : [];
  return {
    id: typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : `${name}-${Date.now()}`,
    name,
    classGroups,
    classAbilities,
    weapons,
    armors,
    shields,
    conditions
  };
}
// LeftPanel handles class choices, level progression, and manual stat/skill spending.
function LeftPanel({
  finalStats,
  levelStats,
  setLevelStats,
  levels,
  setLevels,
  level1,
  setLevel1,
  classGroups,
  classCounts,
  getAvailableStatPoints,
  isOpen,
  toggleOpen
}) {
  function updateLevel(index, value) {
    const copy = [...levels];
    copy[index] = value;
    setLevels(copy);
  }
  function updateLevel1(index, value) {
    const copy = [...level1];
    copy[index] = value;
    setLevel1(copy);
  }
  return React.createElement("div", {
    className: `leftpanel ${isOpen ? "" : "closed"}`
  }, React.createElement("div", null, React.createElement("button", {
    onClick: toggleOpen
  }, isOpen ? "Collapse <<" : ">>")), isOpen && React.createElement(React.Fragment, null, React.createElement("div", {
    className: "ledgerHeader"
  }, React.createElement("h3", null, "Ship's Ledger")), React.createElement("div", null, React.createElement("h3", null, "Level 1"), [0, 1, 2].map(i => React.createElement("select", {
    key: i,
    value: level1[i],
    onChange: e => updateLevel1(i, e.target.value)
  }, React.createElement("option", {
    value: ""
  }, "Select Class"), classGroups.map(group => React.createElement("optgroup", {
    key: group.title,
    label: group.title
  }, group.classes.filter(c => !level1.includes(c) || level1[i] === c).map(c => React.createElement("option", {
    key: c,
    disabled: (classCounts[c] || 0) >= 5 && level1[i] !== c
  }, c)))))), React.createElement("div", {
    className: "statButtons"
  }, STAT_LIST.map(stat => React.createElement("div", {
    key: stat
  }, React.createElement("button", {
    onClick: () => removeStat(1, stat, levelStats, setLevelStats)
  }, "-"), React.createElement("span", null, stat, " (", levelStats[0][stat], ")"), React.createElement("button", {
    onClick: () => addStat(1, stat, levelStats, setLevelStats)
  }, "+")))), React.createElement("div", {
    style: {
      color: getAvailableStatPoints(1, levelStats) === 0 ? "grey" : "white"
    }
  }, "Available Stat Points: ", getAvailableStatPoints(1, levelStats))), Array.from({
    length: 19
  }, (_, i) => {
    const level = i + 2;
    return React.createElement("div", {
      key: level
    }, React.createElement("h3", null, "Level ", level), React.createElement("select", {
      value: levels[level - 1] || "",
      onChange: e => updateLevel(level - 1, e.target.value)
    }, React.createElement("option", {
      value: ""
    }, "Select Class"), classGroups.map(group => React.createElement("optgroup", {
      key: group.title,
      label: group.title
    }, group.classes.map(c => React.createElement("option", {
      key: c,
      disabled: (classCounts[c] || 0) >= 5 && levels[level - 1] !== c
    }, c))))), React.createElement("div", {
      className: "statButtons"
    }, STAT_LIST.map(stat => React.createElement("div", {
      key: stat
    }, React.createElement("button", {
      onClick: () => removeStat(level, stat, levelStats, setLevelStats)
    }, "-"), React.createElement("span", null, stat, " (", levelStats[level - 1][stat], ")"), React.createElement("button", {
      onClick: () => addStat(level, stat, levelStats, setLevelStats)
    }, "+")))), React.createElement("div", {
      style: {
        color: getAvailableStatPoints(level, levelStats) === 0 ? "grey" : "white"
      }
    }, "Available Stat Points: ", getAvailableStatPoints(level, levelStats)));
  })));
}
function addStat(level, stat, levelStats, setLevelStats) {
  // Stat spending is tracked per level, but capped both by the current level's
  // allowance and the global stat cap across the character.
  const levelIndex = level - 1;
  const spent = Object.values(levelStats[levelIndex]).reduce((a, b) => a + b, 0);
  const levelLimit = LEVEL_POINTS(level);
  if (spent >= levelLimit) return;
  const statTotal = levelStats.reduce((sum, lvl) => sum + lvl[stat], 0);
  if (statTotal >= 10) return;
  if (level === 1 && levelStats[levelIndex][stat] >= 5) return;
  const newLevelStats = [...levelStats];
  newLevelStats[levelIndex][stat]++;
  setLevelStats(newLevelStats);
}
function removeStat(level, stat, levelStats, setLevelStats) {
  const levelIndex = level - 1;
  if (levelStats[levelIndex][stat] <= 0) return;
  const newLevelStats = [...levelStats];
  newLevelStats[levelIndex][stat]--;
  setLevelStats(newLevelStats);
}
function addSkill(level, skill, levelSkills, setLevelSkills, availableSkillPoints) {
  // Skills consume the currently available pool and share the same global rank cap.
  const idx = level - 1;
  if (availableSkillPoints <= 0) return;
  const skillTotal = levelSkills.slice(0, level).reduce((sum, lvl) => sum + lvl[skill], 0);
  if (skillTotal >= 10) return;
  const newSkills = [...levelSkills];
  newSkills[idx][skill]++;
  setLevelSkills(newSkills);
}
function removeSkill(level, skill, levelSkills, setLevelSkills) {
  const idx = level - 1;
  if (levelSkills[idx][skill] === 0) return;
  const newSkills = [...levelSkills];
  newSkills[idx][skill]--;
  setLevelSkills(newSkills);
}
function getDefaultApiUrl() {
  // Prefer the explicit wrapper-provided API URL; otherwise fall back to a
  // localhost dev guess or same-origin production host.
  const params = new URLSearchParams(window.location.search);
  const fromQuery = params.get("apiUrl");
  if (fromQuery) return fromQuery;
  const {
    protocol,
    hostname,
    origin
  } = window.location;
  const isLocalHost = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0";
  if (isLocalHost) {
    return `${protocol}//${hostname}:5000`;
  }
  return origin;
}
const PAGE_PARAMS = new URLSearchParams(window.location.search);
const API_URL = getDefaultApiUrl();
const RESOLVED_ROLE = PAGE_PARAMS.get("role") || "viewer";
const CLOUD_SAVE_ENABLED = RESOLVED_ROLE === "traveler" || RESOLVED_ROLE === "admin" || RESOLVED_ROLE === "writer" || RESOLVED_ROLE === "owner";

// Shared fetch helper for all Character Sheet API calls.
async function fetchPirateJson(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    credentials: "include",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  let payload = {};
  try {
    payload = await response.json();
  } catch (_error) {
    payload = {};
  }
  return {
    response,
    payload
  };
}
// App owns the full character-sheet state tree, derived calculations, and the
// local/cloud persistence actions used by the save bar.
function App() {
  const [name, setName] = React.useState("");
  const [crew, setCrew] = React.useState("");
  const [currentLevel, setCurrentLevel] = React.useState(1);
  const [knownSelectionAbilities, setKnownSelectionAbilities] = React.useState({});
  const [selectedSelectionCategories, setSelectedSelectionCategories] = React.useState({});
  const [levels, setLevels] = React.useState(Array(20).fill(null));
  const [level1, setLevel1] = React.useState(["", "", ""]);
  const [levelStats, setLevelStats] = React.useState(Array.from({
    length: 20
  }, createEmptyStatLevel));

  // Derived stat totals are recalculated from the active level rows first,
  // then any settings overrides are applied on top.
  const activeStats = levelStats.slice(0, currentLevel);
  const statTotals = {
    Brawn: 0,
    Finesse: 0,
    Grit: 0,
    Awareness: 0,
    Brains: 0,
    Swagger: 0
  };
  activeStats.forEach(level => {
    STAT_LIST.forEach(stat => {
      statTotals[stat] += level[stat];
    });
  });
  const [levelSkills, setLevelSkills] = React.useState(Array.from({
    length: 20
  }, createEmptySkillLevel));
  const [settings, setSettings] = React.useState(createDefaultSettings);
  const [isLeftOpen, setIsLeftOpen] = React.useState(true);
  const [isSettingsDialogOpen, setIsSettingsDialogOpen] = React.useState(false);
  const finalStats = {
    ...statTotals
  };
  Object.entries(settings.statOverrides || {}).forEach(([stat, val]) => {
    if (val !== null && !Number.isNaN(val)) {
      finalStats[stat] = val;
    }
  });
  function getAvailableStatPoints(level, levelStats) {
    const idx = level - 1;
    const spent = Object.values(levelStats[idx]).reduce((a, b) => a + b, 0);
    const max = LEVEL_POINTS(level);
    return max - spent;
  }
  let totalSkillPoints = 10 + (currentLevel - 1) * 2;

  // Skill totals are built from purchased ranks plus the linked governing stat.
  const spentSkillPoints = levelSkills.slice(0, currentLevel).reduce((sum, level) => {
    return sum + Object.values(level).reduce((a, b) => a + b, 0);
  }, 0);
  const availableSkillPoints = settings.skillPointsOverride ?? totalSkillPoints - spentSkillPoints;
  const activeSkills = levelSkills.slice(0, currentLevel);
  const skillTotals = {};
  Object.values(stats).flat().forEach(skill => {
    skillTotals[skill] = 0;
  });
  activeSkills.forEach(level => {
    Object.keys(level).forEach(skill => {
      skillTotals[skill] += level[skill];
    });
  });
  Object.keys(skillTotals).forEach(skill => {
    const stat = SKILL_TO_STAT[skill];
    skillTotals[skill] += finalStats[stat];
  });
  const baseMaxHealth = 15 + finalStats.Grit;
  const maxHealth = settings.healthMax ?? baseMaxHealth;
  const minHealth = settings.healthMin ?? 0;
  const [health, setHealth] = React.useState(0);
  React.useEffect(() => {
    setHealth(prev => prev === 0 ? maxHealth : Math.min(prev, maxHealth));
  }, [maxHealth]);
  const nonGritStats = [finalStats.Brawn, finalStats.Finesse, finalStats.Awareness, finalStats.Brains, finalStats.Swagger];
  const topTwo = nonGritStats.sort((a, b) => b - a).slice(0, 2);
  const baseEndurance = Math.round((topTwo[0] + topTwo[1] + finalStats.Grit) / 2 * currentLevel);
  const maxEndurance = settings.enduranceMax ?? Math.max(10, baseEndurance);
  const minEndurance = settings.enduranceMin ?? 0;
  const [endurance, setEndurance] = React.useState(0);
  React.useEffect(() => {
    setEndurance(prev => Math.max(minEndurance, Math.min(prev, maxEndurance)));
  }, [maxEndurance, minEndurance]);
  const speed = settings.speedOverride ?? 3;
  const [luck, setLuck] = React.useState(3);
  const baseLuckMax = 3;
  const levelBonus = Math.floor(currentLevel / 5);
  const maxLuck = settings.luckMaxOverride ?? baseLuckMax + levelBonus;
  React.useEffect(() => {
    setLuck(prev => Math.max(0, Math.min(prev, maxLuck)));
  }, [maxLuck]);
  const [expansions, setExpansions] = React.useState([]);
  const [baseWeapons, setBaseWeapons] = React.useState([]);
  const [baseClassAbilities, setBaseClassAbilities] = React.useState([]);
  const [baseArmors, setBaseArmors] = React.useState(DEFAULT_ARMORS);
  const [baseShields, setBaseShields] = React.useState(DEFAULT_SHIELDS);
  const [baseConditions, setBaseConditions] = React.useState([]);
  const [activeConditions, setActiveConditions] = React.useState([]);
  const [conditionChoice, setConditionChoice] = React.useState("");
  const classGroups = React.useMemo(() => mergeClassGroups(BASE_CLASS_GROUPS, expansions.flatMap(expansion => expansion.classGroups || [])), [expansions]);
  const weapons = React.useMemo(() => [...baseWeapons, ...expansions.flatMap(expansion => expansion.weapons || [])], [baseWeapons, expansions]);
  const classAbilities = React.useMemo(() => [...baseClassAbilities, ...expansions.flatMap(expansion => expansion.classAbilities || [])], [baseClassAbilities, expansions]);
  const conditions = React.useMemo(() => [...baseConditions, ...expansions.flatMap(expansion => expansion.conditions || [])], [baseConditions, expansions]);
  const armorStatsMap = React.useMemo(() => mergeNamedStats(buildNamedStatsMap(baseArmors, DEFAULT_ARMORS), expansions.flatMap(expansion => expansion.armors || [])), [baseArmors, expansions]);
  const shieldStatsMap = React.useMemo(() => mergeNamedStats(buildNamedStatsMap(baseShields, DEFAULT_SHIELDS), expansions.flatMap(expansion => expansion.shields || [])), [baseShields, expansions]);
  const selectedClasses = [...level1, ...levels.slice(0, currentLevel)].filter(Boolean);
  const classCounts = {};
  selectedClasses.forEach(cls => {
    classCounts[cls] = (classCounts[cls] || 0) + 1;
  });
  const weaponTypeBonuses = {};
  Object.entries(classCounts).forEach(([cls, rank]) => {
    const types = CLASS_WEAPON_BONUS[cls];
    if (!types) return;
    types.forEach(type => {
      weaponTypeBonuses[type] = Math.max(weaponTypeBonuses[type] || 0, rank);
    });
  });
  const [equippedWeapons, setEquippedWeapons] = React.useState([]);
  const [weaponChoice, setWeaponChoice] = React.useState("");
  const [inventoryWeapons, setInventoryWeapons] = React.useState([]);
  React.useEffect(() => {
    let isCancelled = false;
    async function loadBaseCompendium() {
      try {
        let data = null;
        const apiResult = await fetchPirateJson(`/pirate-system/rules?ts=${Date.now()}`);
        if (apiResult.response.ok && apiResult.payload && typeof apiResult.payload === "object") {
          data = apiResult.payload;
        } else {
          const localResponse = await fetch("rules.json", {
            cache: "no-store"
          });
          if (!localResponse.ok) {
            throw new Error(`Static compendium load failed with ${localResponse.status}`);
          }
          data = await localResponse.json();
        }
        if (isCancelled) return;
        setBaseClassAbilities(Array.isArray(data?.classAbilities) ? data.classAbilities : Array.isArray(data) ? data : []);
        setBaseWeapons(Array.isArray(data?.weapons) ? data.weapons : []);
        setBaseArmors(Array.isArray(data?.armors) && data.armors.length ? data.armors : DEFAULT_ARMORS);
        setBaseShields(Array.isArray(data?.shields) && data.shields.length ? data.shields : DEFAULT_SHIELDS);
        setBaseConditions(Array.isArray(data?.conditions) ? data.conditions : []);
      } catch (_error) {
        if (isCancelled) return;
        setBaseClassAbilities([]);
        setBaseWeapons([]);
        setBaseArmors(DEFAULT_ARMORS);
        setBaseShields(DEFAULT_SHIELDS);
        setBaseConditions([]);
      }
    }
    loadBaseCompendium();
    return () => {
      isCancelled = true;
    };
  }, []);
  React.useEffect(() => {
    const unarmedWeapon = weapons.find(w => w.name === UNARMED_WEAPON_NAME);
    if (!unarmedWeapon) return;
    setEquippedWeapons(prev => {
      if (prev.some(w => w.name === UNARMED_WEAPON_NAME)) {
        return prev;
      }
      return [unarmedWeapon, ...prev];
    });
    setInventoryWeapons(prev => prev.filter(w => w.name !== UNARMED_WEAPON_NAME));
  }, [weapons]);
  function addWeaponToInventory(name) {
    if (name === UNARMED_WEAPON_NAME) return;
    const weapon = weapons.find(w => w.name === name);
    if (!weapon) return;
    setInventoryWeapons([...inventoryWeapons, weapon]);
  }
  function swapWeapon(index, from) {
    if (from === "inventory") {
      const weapon = inventoryWeapons[index];
      if (!weapon || weapon.name === UNARMED_WEAPON_NAME) return;
      setInventoryWeapons(inventoryWeapons.filter((_, i) => i !== index));
      setEquippedWeapons([...equippedWeapons, weapon]);
    } else {
      const weapon = equippedWeapons[index];
      if (!weapon || weapon.name === UNARMED_WEAPON_NAME) return;
      setEquippedWeapons(equippedWeapons.filter((_, i) => i !== index));
      setInventoryWeapons([...inventoryWeapons, weapon]);
    }
  }
  function removeWeapon(index, from) {
    if (from === "equipped") {
      if (equippedWeapons[index]?.name === UNARMED_WEAPON_NAME) return;
      setEquippedWeapons(equippedWeapons.filter((_, i) => i !== index));
    }
    if (from === "inventory") {
      if (inventoryWeapons[index]?.name === UNARMED_WEAPON_NAME) return;
      setInventoryWeapons(inventoryWeapons.filter((_, i) => i !== index));
    }
  }
  function moveWeapon(index, from, direction) {
    if (from === "equipped") {
      setEquippedWeapons(prev => moveArrayItem(prev, index, direction));
    }
    if (from === "inventory") {
      setInventoryWeapons(prev => moveArrayItem(prev, index, direction));
    }
  }
  function addCondition(name) {
    const definition = conditions.find(condition => condition.name === name);
    if (!definition) return;
    setActiveConditions(prev => [...prev, createConditionEntry(definition)]);
    setConditionChoice("");
  }
  function updateCondition(id, field, value) {
    setActiveConditions(prev => prev.map(condition => condition.id === id ? {
      ...condition,
      [field]: value
    } : condition));
  }
  function removeCondition(id) {
    setActiveConditions(prev => prev.filter(condition => condition.id !== id));
  }
  function moveCondition(index, direction) {
    setActiveConditions(prev => moveArrayItem(prev, index, direction));
  }
  const [doubloons, setDoubloons] = React.useState(0);
  const [items, setItems] = React.useState([]);
  function createCombatInventoryItem(name, notes, combatKey) {
    return {
      id: Date.now() + Math.random(),
      name,
      notes,
      charges: 0,
      amount: 1,
      isCombatGear: true,
      combatKey
    };
  }
  function addItem() {
    setItems(prev => [...prev, {
      id: Date.now(),
      name: "",
      notes: "",
      charges: 0,
      amount: 1
    }]);
  }
  function updateItem(id, field, value) {
    setItems(prev => prev.map(item => item.id === id ? {
      ...item,
      [field]: value
    } : item));
  }
  function removeItem(id) {
    setItems(prev => prev.filter(item => item.id !== id));
  }
  function moveItem(index, direction) {
    setItems(prev => {
      const currentItem = prev[index];
      if (!currentItem) return prev;
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= prev.length) return prev;
      return moveArrayItem(prev, index, direction);
    });
  }
  const [armor, setArmor] = React.useState("No Armor");
  const [useShield, setUseShield] = React.useState(true);
  const [shield, setShield] = React.useState("No Shield");
  const armorStats = armorStatsMap[armor] || armorStatsMap["No Armor"];
  const shieldStats = shieldStatsMap[shield] || shieldStatsMap["No Shield"];
  React.useEffect(() => {
    if (!armorStatsMap[armor] && armor !== "No Armor") {
      setArmor("No Armor");
    }
  }, [armor, armorStatsMap]);
  React.useEffect(() => {
    if (!shieldStatsMap[shield] && shield !== "No Shield") {
      setShield("No Shield");
    }
  }, [shield, shieldStatsMap]);
  const armorDashPenalty = armorStats?.dashPenalty ?? 0;
  const shieldDashPenalty = useShield ? shieldStats?.dashPenalty ?? 0 : 0;
  const calculatedDashSpeed = Math.max(0, 3 + finalStats.Finesse + armorDashPenalty + shieldDashPenalty);
  const dashSpeed = settings.dashOverride ?? calculatedDashSpeed;
  const evasion = settings.evasionOverride ?? armorStats.baseEvasion + Math.floor(finalStats.Finesse / 2);
  const armorBreaker = Math.max(0, Number(settings.armorBreaker) || 0);
  const baseToughness = armorStats.toughness + (useShield ? shieldStats.toughness : 0);
  const toughness = settings.toughnessOverride ?? Math.max(0, baseToughness - armorBreaker);
  React.useEffect(() => {
    const trackedCombatItems = [...equippedWeapons.filter(weapon => weapon.name !== UNARMED_WEAPON_NAME).map(weapon => ({
      name: weapon.name,
      notes: "Weapon",
      combatKey: `weapon:${weapon.name}:equipped`
    })), ...inventoryWeapons.filter(weapon => weapon.name !== UNARMED_WEAPON_NAME).map((weapon, index) => ({
      name: weapon.name,
      notes: "Weapon",
      combatKey: `weapon:${weapon.name}:inventory:${index}`
    })), ...(armor !== "No Armor" ? [{
      name: armor,
      notes: "Armor",
      combatKey: `armor:${armor}`
    }] : []), ...(shield !== "No Shield" ? [{
      name: shield,
      notes: "Shield",
      combatKey: `shield:${shield}`
    }] : [])];
    setItems(prev => {
      const trackedMap = new Map(trackedCombatItems.map(combatItem => [combatItem.combatKey, combatItem]));
      const nextItems = [];
      prev.forEach(item => {
        if (item.isCombatGear || item.isWeapon) {
          const combatItem = trackedMap.get(item.combatKey);
          if (!combatItem) return;
          nextItems.push({
            ...item,
            name: combatItem.name,
            notes: combatItem.notes,
            charges: 0,
            amount: 1,
            isCombatGear: true,
            combatKey: combatItem.combatKey
          });
          trackedMap.delete(item.combatKey);
          return;
        }
        nextItems.push(item);
      });
      trackedMap.forEach(combatItem => {
        nextItems.push(createCombatInventoryItem(combatItem.name, combatItem.notes, combatItem.combatKey));
      });
      return nextItems;
    });
  }, [equippedWeapons, inventoryWeapons, armor, shield]);
  const getAbilityType = ability => (ability.type || "").toString().trim().toLowerCase();
  const availableAbilities = classAbilities.filter(ability => {
    const type = getAbilityType(ability);
    if (ability.class === "General") return true;
    const rank = classCounts[ability.class] || 0;
    return ability.rank <= rank;
  });
  const [sortBy, setSortBy] = React.useState("rank");
  const actionAbilities = availableAbilities.filter(a => getAbilityType(a) === "action");
  const passiveAbilities = availableAbilities.filter(a => {
    const type = getAbilityType(a);
    return type !== "action" && type !== "selection" && type !== "selection ability" && type !== "selection-category";
  });
  const selectionCategoryDefinitions = availableAbilities.filter(a => getAbilityType(a) === "selection-category").sort((a, b) => {
    if (a.class !== b.class) {
      return a.class.localeCompare(b.class);
    }
    if (a.rank !== b.rank) {
      return a.rank - b.rank;
    }
    return (a.label || a.name || a.categoryKey || "").localeCompare(b.label || b.name || b.categoryKey || "");
  });
  const selectionAbilities = availableAbilities.filter(a => {
    const type = getAbilityType(a);
    return type === "selection" || type === "selection ability";
  }).sort((a, b) => {
    if (sortBy === "cost") {
      return (a.cost ?? a.actionCost ?? 0) - (b.cost ?? b.actionCost ?? 0);
    }
    if (a.rank !== b.rank) {
      return a.rank - b.rank;
    }
    return a.name.localeCompare(b.name);
  });
  const selectionClasses = [...new Set(selectionAbilities.map(ability => ability.class))];
  const selectionAvailabilityByClass = selectionClasses.reduce((totals, className) => {
    totals[className] = 0;
    return totals;
  }, {});
  availableAbilities.forEach(ability => {
    const bonus = ability.selectionBonus;
    const className = ability.class;
    const type = getAbilityType(ability);
    const numericBonus = typeof bonus === "string" ? Number(bonus) : bonus;
    if (type === "selection" || type === "selection ability") return;
    if (!Object.prototype.hasOwnProperty.call(selectionAvailabilityByClass, className)) return;
    if (bonus === "+") {
      selectionAvailabilityByClass[className] += classCounts[className] || 0;
      return;
    }
    if (Number.isFinite(numericBonus)) {
      selectionAvailabilityByClass[className] += numericBonus;
    }
  });
  const selectionCategoryDefinitionsByClass = selectionCategoryDefinitions.reduce((groups, category) => {
    if (!groups[category.class]) {
      groups[category.class] = [];
    }
    groups[category.class].push(category);
    return groups;
  }, {});
  const selectionAbilitiesByClass = selectionClasses.map(className => ({
    className,
    availableCount: selectionAvailabilityByClass[className] || 0,
    abilities: selectionAbilities.filter(ability => ability.class === className)
  }));
  const sortedActionAbilities = [...actionAbilities].sort((a, b) => {
    if (sortBy === "cost") {
      return a.actionCost - b.actionCost;
    }
    return a.rank - b.rank;
  });
  function toggleKnownSelectionAbility(ability) {
    const key = getSelectionAbilityKey(ability);
    const className = ability.class;
    const selectedCount = selectionAbilities.filter(selectionAbility => selectionAbility.class === className && (!selectionAbility.selectionCategory || !selectionAbility.selectionOption || selectedSelectionCategories[getSelectionCategoryStateKey(className, selectionAbility.selectionCategory)] === selectionAbility.selectionOption) && knownSelectionAbilities[getSelectionAbilityKey(selectionAbility)]).length;
    const availableCount = selectionAvailabilityByClass[className] || 0;
    const isKnown = Boolean(knownSelectionAbilities[key]);
    if (!isKnown && selectedCount >= availableCount) {
      return;
    }
    setKnownSelectionAbilities(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  }
  function updateSelectionCategory(className, categoryKey, value) {
    const stateKey = getSelectionCategoryStateKey(className, categoryKey);
    setSelectedSelectionCategories(prev => ({
      ...prev,
      [stateKey]: value
    }));
    setKnownSelectionAbilities(prev => {
      const next = {
        ...prev
      };
      selectionAbilities.forEach(ability => {
        if (ability.class !== className) return;
        if (ability.selectionCategory !== categoryKey) return;
        const abilityKey = getSelectionAbilityKey(ability);
        if (ability.selectionOption !== value) {
          delete next[abilityKey];
        }
      });
      return next;
    });
  }
  const [background, setBackground] = React.useState(DEFAULT_BACKGROUND);
  React.useEffect(() => {
    const savedExpansions = localStorage.getItem("characterSheet_expansions");
    if (!savedExpansions) return;
    try {
      const parsed = JSON.parse(savedExpansions);
      if (Array.isArray(parsed)) {
        setExpansions(parsed.map((expansion, index) => normalizeExpansion(expansion, expansion?.name || `Expansion ${index + 1}`)));
      }
    } catch (err) {
      console.error("Failed to load expansions", err);
    }
  }, []);
  React.useEffect(() => {
    localStorage.setItem("characterSheet_expansions", JSON.stringify(expansions));
  }, [expansions]);
  function importExpansionFile() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json";
    input.onchange = e => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = event => {
        try {
          const raw = JSON.parse(event.target.result);
          const imported = Array.isArray(raw) ? raw : [raw];
          const normalizedList = imported.map((expansion, index) => normalizeExpansion(expansion, imported.length === 1 ? file.name.replace(/\.json$/i, "") : `${file.name.replace(/\.json$/i, "")} ${index + 1}`));
          setExpansions(prev => {
            const remaining = prev.filter(existing => !normalizedList.some(expansion => expansion.id === existing.id));
            return [...remaining, ...normalizedList];
          });
        } catch (err) {
          console.error(err);
          alert("Invalid expansion file");
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }
  function exportExpansions() {
    const json = JSON.stringify(expansions, null, 2);
    const blob = new Blob([json], {
      type: "application/json"
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "character-expansions.json";
    a.click();
    URL.revokeObjectURL(url);
  }
  function downloadGearTemplate() {
    const template = {
      name: "Gear Expansion",
      weapons: [{
        name: "Boarding Pike",
        type: ["Polearm"],
        attackStats: ["Brawn"],
        damage: {
          dice: "1d8",
          type: "Piercing"
        },
        enduranceCost: 2,
        properties: ["Reach"]
      }],
      armors: [{
        name: "Captain's Coat",
        baseEvasion: 15,
        toughness: 1,
        dashPenalty: 0,
        properties: []
      }],
      shields: [{
        name: "Reinforced Buckler",
        toughness: 2,
        braceCost: 2,
        dashPenalty: 0,
        properties: ["Attachable", "Parry"]
      }]
    };
    const json = JSON.stringify(template, null, 2);
    const blob = new Blob([json], {
      type: "application/json"
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "gear-expansion-template.json";
    a.click();
    URL.revokeObjectURL(url);
  }
  function downloadClassTemplate() {
    const template = {
      name: "Class Expansion",
      classGroups: [{
        title: "Corsairs",
        classes: ["Stormcaller"]
      }],
      classAbilities: [{
        class: "Stormcaller",
        rank: 1,
        name: "Thunder Wake",
        type: "action",
        actionCost: 2,
        description: "Describe the class ability here."
      }, {
        class: "Stormcaller",
        rank: 2,
        name: "Storm Lessons",
        type: "passive",
        selectionBonus: "+",
        description: "This passive grants one additional Stormcaller selection per rank in Stormcaller."
      }, {
        class: "Stormcaller",
        rank: 1,
        name: "Storm Tradition",
        type: "selection-category",
        categoryKey: "tradition",
        label: "Tradition",
        options: ["Tempest", "Mist", "Tide"]
      }, {
        class: "Stormcaller",
        rank: 1,
        name: "Tempest Trick",
        type: "selection",
        selectionCategory: "tradition",
        selectionOption: "Tempest",
        cost: 1,
        description: "Describe the selection ability here."
      }],
      conditions: [{
        name: "Static Mark",
        description: "The target crackles with storm energy and is easier to track.",
        hasStack: false,
        hasSource: true
      }]
    };
    const json = JSON.stringify(template, null, 2);
    const blob = new Blob([json], {
      type: "application/json"
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "class-expansion-template.json";
    a.click();
    URL.revokeObjectURL(url);
  }
  function removeExpansion(id) {
    setExpansions(prev => prev.filter(expansion => expansion.id !== id));
  }
  function exportData() {
    const data = {
      name,
      crew,
      currentLevel,
      levels,
      level1,
      levelStats,
      levelSkills,
      knownSelectionAbilities,
      selectedSelectionCategories,
      settings,
      armor,
      shield,
      activeConditions,
      equippedWeapons,
      inventoryWeapons,
      health,
      endurance,
      luck,
      doubloons,
      inventoryItems: items,
      expansions,
      background,
      version: 1.7
    };
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], {
      type: "application/json"
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    // eslint-disable-next-line no-control-regex -- Strip control characters forbidden in downloaded filenames.
    const sanitizedName = String(name || "").trim().replace(/[<>:"/\\|?*\x00-\x1F]/g, "");
    a.download = `${sanitizedName || "character"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  function importData() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json";
    input.onchange = e => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = event => {
        try {
          const raw = JSON.parse(event.target.result);
          if (file.size > 100000) {
            alert("File too large");
            return;
          }
          if (typeof raw !== "object" || raw === null) {
            alert("Invalid file");
            return;
          }
          if (raw.version !== 1.1 && raw.version !== 1.2 && raw.version !== 1.3 && raw.version !== 1.4 && raw.version !== 1.5 && raw.version !== 1.6 && raw.version !== 1.7) {
            alert("Invalid version");
            return;
          }
          delete raw.__proto__;
          delete raw.constructor;
          delete raw.prototype;
          setName(raw.name ?? "");
          setCrew(raw.crew ?? "");
          setCurrentLevel(raw.currentLevel ?? 1);
          setLevels(raw.levels ?? Array(20).fill(null));
          setLevel1(raw.level1 ?? ["", "", ""]);
          setLevelStats(raw.levelStats ?? levelStats);
          setLevelSkills(raw.levelSkills ?? levelSkills);
          setKnownSelectionAbilities(raw.knownSelectionAbilities ?? {});
          setSelectedSelectionCategories(raw.selectedSelectionCategories ?? {});
          setSettings({
            ...createDefaultSettings(),
            ...(raw.settings || {}),
            statOverrides: {
              ...createDefaultSettings().statOverrides,
              ...(raw.settings?.statOverrides || {})
            },
            weaponTypeOverrides: {
              ...createDefaultSettings().weaponTypeOverrides,
              ...(raw.settings?.weaponTypeOverrides || {})
            }
          });
          setArmor(raw.armor ?? "No Armor");
          setShield(raw.shield ?? "No Shield");
          setActiveConditions(raw.activeConditions ?? []);
          setEquippedWeapons((raw.equippedWeapons ?? []).filter(w => w?.name !== UNARMED_WEAPON_NAME));
          setInventoryWeapons((raw.inventoryWeapons ?? []).filter(w => w?.name !== UNARMED_WEAPON_NAME));
          setHealth(raw.health ?? 0);
          setEndurance(raw.endurance ?? 0);
          setLuck(raw.luck ?? 3);
          setDoubloons(raw.doubloons ?? 0);
          if (Array.isArray(raw.expansions)) {
            setExpansions(raw.expansions.map((expansion, index) => normalizeExpansion(expansion, expansion?.name || `Expansion ${index + 1}`)));
          }
          setItems(raw.inventoryItems ?? []);
          setBackground(raw.background ?? DEFAULT_BACKGROUND);
        } catch (err) {
          console.error(err);
          alert("Invalid file");
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }
  const MIN_SAVE_SLOT_COUNT = 3;
  const [activeSlot, setActiveSlot] = React.useState("slot1");
  const [saveSlots, setSaveSlots] = React.useState(["slot1", "slot2", "slot3"]);
  const [saveMessage, setSaveMessage] = React.useState("");
  const [isCloudBusy, setIsCloudBusy] = React.useState(false);
  const [generatedShareCode, setGeneratedShareCode] = React.useState("");
  const [shareCodeInput, setShareCodeInput] = React.useState("");
  const [isShareCodeBusy, setIsShareCodeBusy] = React.useState(false);
  const activeSlotRef = React.useRef("slot1");
  const latestLoadRequestRef = React.useRef(0);
  const isSlotLoadingRef = React.useRef(false);
  const [slotLabels, setSlotLabels] = React.useState({
    slot1: "Slot 1",
    slot2: "Slot 2",
    slot3: "Slot 3"
  });
  const [filledSlots, setFilledSlots] = React.useState({
    slot1: false,
    slot2: false,
    slot3: false
  });
  function getDefaultSlotLabel(slot) {
    const slotNumber = Number(String(slot).replace("slot", ""));
    if (Number.isInteger(slotNumber) && slotNumber >= 1) {
      return `Slot ${slotNumber}`;
    }
    return slot;
  }
  function getSlotNumber(slot) {
    const slotNumber = Number(String(slot).replace("slot", ""));
    return Number.isInteger(slotNumber) && slotNumber >= 1 ? slotNumber : 0;
  }
  function buildVisibleSlots(occupiedSlots = {}, knownSlots = []) {
    const slotNumbers = new Set();
    for (let i = 1; i <= MIN_SAVE_SLOT_COUNT; i += 1) {
      slotNumbers.add(i);
    }
    knownSlots.forEach(slot => {
      const slotNumber = getSlotNumber(slot);
      if (slotNumber >= 1) {
        slotNumbers.add(slotNumber);
      }
    });
    Object.keys(occupiedSlots).forEach(slot => {
      const slotNumber = getSlotNumber(slot);
      if (slotNumber >= 1) {
        slotNumbers.add(slotNumber);
      }
    });
    const maxSlotNumber = Math.max(...slotNumbers);
    const nextSlots = [];
    for (let i = 1; i <= maxSlotNumber; i += 1) {
      nextSlots.push(`slot${i}`);
    }
    const allFilled = nextSlots.every(slot => Boolean(occupiedSlots[slot]));
    if (allFilled) {
      nextSlots.push(`slot${maxSlotNumber + 1}`);
    }
    return nextSlots;
  }
  function formatSlotLabel(slot, characterName) {
    const trimmedName = String(characterName || "").trim();
    return trimmedName || getDefaultSlotLabel(slot);
  }
  function updateSlotState(slot, characterName, isFilled) {
    setSlotLabels(prev => {
      const nextLabel = formatSlotLabel(slot, characterName);
      const currentLabel = prev[slot];
      const defaultLabel = getDefaultSlotLabel(slot);
      const shouldPreserveExistingLabel = Boolean(isFilled) && !String(characterName || "").trim() && typeof currentLabel === "string" && currentLabel.trim() && currentLabel !== defaultLabel;
      return {
        ...prev,
        [slot]: shouldPreserveExistingLabel ? currentLabel : nextLabel
      };
    });
    setFilledSlots(prev => {
      const nextFilledSlots = {
        ...prev,
        [slot]: Boolean(isFilled)
      };
      setSaveSlots(buildVisibleSlots(nextFilledSlots, saveSlots));
      return nextFilledSlots;
    });
  }
  function getNextAvailableSlot() {
    const emptyVisibleSlot = saveSlots.find(slot => !filledSlots[slot]);
    if (emptyVisibleSlot) {
      return emptyVisibleSlot;
    }
    const nextSlotNumber = saveSlots.length + 1;
    return `slot${nextSlotNumber}`;
  }
  function buildSaveData() {
    return {
      name,
      crew,
      currentLevel,
      levels,
      level1,
      levelStats,
      levelSkills,
      knownSelectionAbilities,
      selectedSelectionCategories,
      settings,
      armor,
      shield,
      activeConditions,
      equippedWeapons,
      inventoryWeapons,
      health,
      endurance,
      luck,
      doubloons,
      items,
      expansions,
      background,
      version: 1.7,
      timestamp: Date.now()
    };
  }

  // Rebuild the visible save-slot list and labels from whichever storage backend
  // is active so the save bar reflects real character names/fill state.
  async function refreshSlotLabels() {
    if (CLOUD_SAVE_ENABLED) {
      try {
        const {
          response,
          payload
        } = await fetchPirateJson(`/pirate-character-sheet/saves`, {
          method: "GET"
        });
        if (!response.ok) {
          setSaveSlots(buildVisibleSlots({}, []));
          setSlotLabels({
            slot1: "Slot 1",
            slot2: "Slot 2",
            slot3: "Slot 3"
          });
          setFilledSlots({
            slot1: false,
            slot2: false,
            slot3: false
          });
          return;
        }
        const nextLabels = {};
        const nextFilledSlots = {};
        const knownSlots = Array.isArray(payload.saves) ? payload.saves.map(save => save.slot) : [];
        for (let i = 1; i <= MIN_SAVE_SLOT_COUNT; i += 1) {
          const slot = `slot${i}`;
          nextLabels[slot] = getDefaultSlotLabel(slot);
          nextFilledSlots[slot] = false;
        }
        ;
        (payload.saves || []).forEach(save => {
          nextLabels[save.slot] = formatSlotLabel(save.slot, save.name);
          nextFilledSlots[save.slot] = true;
        });
        setSaveSlots(buildVisibleSlots(nextFilledSlots, knownSlots));
        setSlotLabels(nextLabels);
        setFilledSlots(nextFilledSlots);
      } catch (_error) {
        setSaveSlots(buildVisibleSlots({}, []));
        setSlotLabels({
          slot1: "Slot 1",
          slot2: "Slot 2",
          slot3: "Slot 3"
        });
        setFilledSlots({
          slot1: false,
          slot2: false,
          slot3: false
        });
      }
      return;
    }
    const nextLabels = {};
    const nextFilledSlots = {};
    const knownSlots = [];
    for (let i = 1; i <= MIN_SAVE_SLOT_COUNT; i += 1) {
      const slot = `slot${i}`;
      nextLabels[slot] = getDefaultSlotLabel(slot);
      nextFilledSlots[slot] = false;
    }
    Object.keys(localStorage).forEach(storageKey => {
      const match = /^characterSheet_(slot[1-9]\d*)$/.exec(storageKey);
      if (match) {
        knownSlots.push(match[1]);
      }
    });
    knownSlots.forEach(slot => {
      const saved = localStorage.getItem(`characterSheet_${slot}`);
      if (!saved) {
        return;
      }
      try {
        const data = JSON.parse(saved);
        nextLabels[slot] = formatSlotLabel(slot, data.name);
        nextFilledSlots[slot] = true;
      } catch (_error) {
        nextLabels[slot] = getDefaultSlotLabel(slot);
        nextFilledSlots[slot] = false;
      }
    });
    setSaveSlots(buildVisibleSlots(nextFilledSlots, knownSlots));
    setSlotLabels(nextLabels);
    setFilledSlots(nextFilledSlots);
  }

  // Take one persisted character payload and split it back into the many pieces
  // of React state used throughout the sheet.
  function applySaveData(data) {
    const nextData = {
      ...createBlankCharacterData(),
      ...(data || {})
    };
    setName(nextData.name ?? "");
    setCrew(nextData.crew ?? "");
    setCurrentLevel(nextData.currentLevel ?? 1);
    setLevels(nextData.levels ?? Array(20).fill(null));
    setLevel1(nextData.level1 ?? ["", "", ""]);
    setLevelStats(nextData.levelStats ?? Array.from({
      length: 20
    }, createEmptyStatLevel));
    setLevelSkills(nextData.levelSkills ?? Array.from({
      length: 20
    }, createEmptySkillLevel));
    setKnownSelectionAbilities(nextData.knownSelectionAbilities ?? {});
    setSelectedSelectionCategories(nextData.selectedSelectionCategories ?? {});
    setSettings({
      ...createDefaultSettings(),
      ...(nextData.settings || {}),
      statOverrides: {
        ...createDefaultSettings().statOverrides,
        ...(nextData.settings?.statOverrides || {})
      },
      weaponTypeOverrides: {
        ...createDefaultSettings().weaponTypeOverrides,
        ...(nextData.settings?.weaponTypeOverrides || {})
      }
    });
    setArmor(nextData.armor ?? "No Armor");
    setShield(nextData.shield ?? "No Shield");
    setActiveConditions(nextData.activeConditions ?? []);
    setEquippedWeapons((nextData.equippedWeapons ?? []).filter(w => w?.name !== UNARMED_WEAPON_NAME));
    setInventoryWeapons((nextData.inventoryWeapons ?? []).filter(w => w?.name !== UNARMED_WEAPON_NAME));
    setHealth(nextData.health ?? 0);
    setEndurance(nextData.endurance ?? 0);
    setLuck(nextData.luck ?? 3);
    setDoubloons(nextData.doubloons ?? 0);
    if (Array.isArray(nextData.expansions)) {
      setExpansions(nextData.expansions.map((expansion, index) => normalizeExpansion(expansion, expansion?.name || `Expansion ${index + 1}`)));
    } else {
      setExpansions([]);
    }
    setItems(nextData.items ?? nextData.inventoryItems ?? []);
    setBackground(nextData.background ?? {
      ...DEFAULT_BACKGROUND
    });
  }

  // Save the currently assembled character either to the cloud API or to
  // localStorage depending on the current role.
  async function saveToSlot(slot = activeSlot) {
    const data = buildSaveData();
    if (CLOUD_SAVE_ENABLED) {
      setIsCloudBusy(true);
      try {
        const {
          response,
          payload
        } = await fetchPirateJson(`/pirate-character-sheet/saves/${slot}`, {
          method: "POST",
          body: JSON.stringify({
            character: data
          })
        });
        if (!response.ok) {
          setSaveMessage(payload.message || `Failed to save ${slot} to the cloud`);
          return false;
        }
        console.log(`Cloud saved to ${slot}`, data);
        updateSlotState(slot, data.name, true);
        setSaveMessage(`Cloud saved to ${slot}`);
        return true;
      } catch (error) {
        console.error("Cloud save failed", error);
        setSaveMessage("Cloud save failed");
        return false;
      } finally {
        setIsCloudBusy(false);
      }
    }
    localStorage.setItem(`characterSheet_${slot}`, JSON.stringify(data));
    console.log(`Saved to ${slot}`, data);
    updateSlotState(slot, data.name, true);
    setSaveMessage(`Saved to ${slot}`);
    return true;
  }

  // Load the selected slot. The requestId guard prevents stale async responses
  // from overwriting the UI if the user switches slots quickly.
  async function loadFromSlot(slot = activeSlot) {
    const requestId = latestLoadRequestRef.current + 1;
    latestLoadRequestRef.current = requestId;
    isSlotLoadingRef.current = true;
    if (CLOUD_SAVE_ENABLED) {
      setIsCloudBusy(true);
      try {
        const {
          response,
          payload
        } = await fetchPirateJson(`/pirate-character-sheet/saves/${slot}`, {
          method: "GET"
        });
        if (requestId !== latestLoadRequestRef.current || slot !== activeSlotRef.current) {
          return;
        }
        if (response.status === 404) {
          console.log(`No cloud save in ${slot}`);
          updateSlotState(slot, "", false);
          applySaveData(createBlankCharacterData());
          setSaveMessage(`Opened a blank character for ${slot}`);
          return;
        }
        if (!response.ok) {
          setSaveMessage(payload.message || `Failed to load ${slot} from the cloud`);
          return;
        }
        console.log(`Cloud loaded from ${slot}`, payload.character);
        updateSlotState(slot, payload.character?.name, true);
        setSaveMessage(`Cloud loaded from ${slot}`);
        applySaveData(payload.character || {});
        return;
      } catch (error) {
        if (requestId !== latestLoadRequestRef.current || slot !== activeSlotRef.current) {
          return;
        }
        console.error("Cloud load failed", error);
        setSaveMessage("Cloud load failed");
        return;
      } finally {
        if (requestId === latestLoadRequestRef.current) {
          isSlotLoadingRef.current = false;
          setIsCloudBusy(false);
        }
      }
    }
    const saved = localStorage.getItem(`characterSheet_${slot}`);
    if (requestId !== latestLoadRequestRef.current || slot !== activeSlotRef.current) {
      isSlotLoadingRef.current = false;
      return;
    }
    if (!saved) {
      console.log(`No save in ${slot}`);
      updateSlotState(slot, "", false);
      applySaveData(createBlankCharacterData());
      setSaveMessage(`Opened a blank character for ${slot}`);
      isSlotLoadingRef.current = false;
      return;
    }
    try {
      const data = JSON.parse(saved);
      if (requestId !== latestLoadRequestRef.current || slot !== activeSlotRef.current) {
        isSlotLoadingRef.current = false;
        return;
      }
      console.log(`Loaded from ${slot}`, data);
      updateSlotState(slot, data.name, true);
      setSaveMessage(`Loaded from ${slot}`);
      applySaveData(data);
    } catch (e) {
      if (requestId !== latestLoadRequestRef.current || slot !== activeSlotRef.current) {
        isSlotLoadingRef.current = false;
        return;
      }
      console.error("Failed to load", e);
      setSaveMessage("Failed to load save (invalid data)");
    } finally {
      if (requestId === latestLoadRequestRef.current) {
        isSlotLoadingRef.current = false;
      }
    }
  }
  async function clearSlot(slot = activeSlot) {
    const confirmDelete = window.confirm(`Are you sure you want to clear ${slot}? This cannot be undone.`);
    if (!confirmDelete) return;
    if (CLOUD_SAVE_ENABLED) {
      setIsCloudBusy(true);
      try {
        const {
          response,
          payload
        } = await fetchPirateJson(`/pirate-character-sheet/saves/${slot}`, {
          method: "DELETE"
        });
        if (!response.ok) {
          setSaveMessage(payload.message || `Failed to clear ${slot} from the cloud`);
          return;
        }
        console.log(`Cleared cloud save ${slot}`);
        updateSlotState(slot, "", false);
        setSaveMessage(`Cleared cloud save ${slot}`);
        return;
      } catch (error) {
        console.error("Cloud clear failed", error);
        setSaveMessage("Cloud clear failed");
        return;
      } finally {
        setIsCloudBusy(false);
      }
    }
    localStorage.removeItem(`characterSheet_${slot}`);
    console.log(`Cleared ${slot}`);
    updateSlotState(slot, "", false);
    setSaveMessage(`Cleared ${slot}`);
  }

  // Share codes are cloud-backed exports/imports of a saved character slot.
  async function generateShareCode(slot = activeSlot) {
    if (!CLOUD_SAVE_ENABLED) {
      setSaveMessage("Cloud saves are required for share codes");
      return;
    }
    setIsShareCodeBusy(true);
    try {
      const {
        response,
        payload
      } = await fetchPirateJson(`/pirate-character-sheet/share-codes/generate`, {
        method: "POST",
        body: JSON.stringify({
          slot
        })
      });
      if (!response.ok) {
        setSaveMessage(payload.message || "Failed to generate a share code");
        return;
      }
      setGeneratedShareCode(payload.code || "");
      setSaveMessage(`Share code generated for ${slot}`);
    } catch (error) {
      console.error("Share code generation failed", error);
      setSaveMessage("Share code generation failed");
    } finally {
      setIsShareCodeBusy(false);
    }
  }
  async function importShareCode() {
    if (!CLOUD_SAVE_ENABLED) {
      setSaveMessage("Cloud saves are required for share codes");
      return;
    }
    const normalizedCode = String(shareCodeInput || "").trim().toUpperCase();
    if (!normalizedCode) {
      setSaveMessage("Enter a share code first");
      return;
    }
    const targetSlot = filledSlots[activeSlot] ? getNextAvailableSlot() : activeSlot;
    setIsShareCodeBusy(true);
    try {
      const {
        response,
        payload
      } = await fetchPirateJson(`/pirate-character-sheet/share-codes/redeem`, {
        method: "POST",
        body: JSON.stringify({
          code: normalizedCode,
          slot: targetSlot
        })
      });
      if (!response.ok) {
        setSaveMessage(payload.message || "Failed to import that share code");
        return;
      }
      updateSlotState(targetSlot, payload.name, true);
      setShareCodeInput("");
      setActiveSlot(targetSlot);
      setSaveMessage(`Imported share code into ${formatSlotLabel(targetSlot, payload.name)}`);
    } catch (error) {
      console.error("Share code import failed", error);
      setSaveMessage("Share code import failed");
    } finally {
      setIsShareCodeBusy(false);
    }
  }
  React.useEffect(() => {
    if (!saveMessage) return;
    const t = setTimeout(() => {
      setSaveMessage("");
    }, 3000);
    return () => clearTimeout(t);
  }, [saveMessage]);
  React.useEffect(() => {
    activeSlotRef.current = activeSlot;
  }, [activeSlot]);
  React.useEffect(() => {
    refreshSlotLabels();
  }, []);
  React.useEffect(() => {
    loadFromSlot(activeSlot);
  }, [activeSlot]);
  React.useEffect(() => {
    document.body.classList.toggle("dark-mode", Boolean(settings.darkMode));
    try {
      window.parent?.postMessage({
        type: "pirate-character-sheet-theme",
        darkMode: Boolean(settings.darkMode)
      }, "*");
    } catch (_error) {
      // Theme synchronization with an embedding window is optional.
    }
    return () => document.body.classList.remove("dark-mode");
  }, [settings.darkMode]);
  return React.createElement("div", {
    className: "app",
    style: {
      "--left-width": isLeftOpen ? "320px" : "60px"
    }
  }, React.createElement("button", {
    type: "button",
    onClick: () => setIsSettingsDialogOpen(true),
    style: {
      position: "fixed",
      top: "16px",
      right: "16px",
      zIndex: 40,
      minWidth: "44px",
      minHeight: "44px",
      padding: "8px 12px",
      borderRadius: "12px",
      border: settings.darkMode ? "1px solid rgba(118, 140, 176, 0.2)" : "1px solid rgba(47, 36, 23, 0.35)",
      background: settings.darkMode ? "rgba(24, 29, 40, 0.96)" : "rgba(242, 231, 208, 0.96)",
      color: settings.darkMode ? "#e8edf6" : "#2f2417",
      boxShadow: settings.darkMode ? "0 8px 20px rgba(3, 6, 12, 0.32)" : "0 8px 20px rgba(47, 36, 23, 0.18)",
      fontSize: "22px",
      lineHeight: 1,
      cursor: "pointer"
    },
    "aria-label": "Open settings"
  }, "\u2699"), React.createElement(TopBar, {
    name: name,
    setName: setName,
    crew: crew,
    setCrew: setCrew,
    currentLevel: currentLevel,
    setCurrentLevel: setCurrentLevel,
    setLevelStats: setLevelStats,
    setLevelSkills: setLevelSkills,
    evasion: evasion,
    endurance: endurance,
    setEndurance: setEndurance,
    minEndurance: minEndurance,
    maxEndurance: maxEndurance,
    toughness: toughness,
    health: health,
    setHealth: setHealth,
    minHealth: minHealth,
    maxHealth: maxHealth,
    speed: speed,
    dashSpeed: dashSpeed,
    luck: luck,
    maxLuck: maxLuck,
    setLuck: setLuck,
    settings: settings,
    armorStats: armorStats,
    shieldStats: shieldStats,
    useShield: useShield,
    equippedWeapons: equippedWeapons,
    activeConditions: activeConditions
  }), React.createElement(LeftPanel, {
    finalStats: finalStats,
    levelStats: levelStats,
    setLevelStats: setLevelStats,
    levels: levels,
    setLevels: setLevels,
    level1: level1,
    setLevel1: setLevel1,
    classGroups: classGroups,
    classCounts: classCounts,
    getAvailableStatPoints: getAvailableStatPoints,
    isOpen: isLeftOpen,
    toggleOpen: () => setIsLeftOpen(prev => !prev)
  }), React.createElement(MainPage, {
    finalStats: finalStats,
    classCounts: classCounts,
    skillTotals: skillTotals,
    currentLevel: currentLevel,
    levelSkills: levelSkills,
    setLevelSkills: setLevelSkills,
    availableSkillPoints: availableSkillPoints,
    armor: armor,
    setArmor: setArmor,
    shield: shield,
    setShield: setShield,
    useShield: useShield,
    setUseShield: setUseShield,
    armorStats: armorStats,
    armorStatsMap: armorStatsMap,
    shieldStatsMap: shieldStatsMap,
    shieldStats: shieldStats,
    settings: settings,
    setSettings: setSettings,
    conditions: conditions,
    activeConditions: activeConditions,
    conditionChoice: conditionChoice,
    setConditionChoice: setConditionChoice,
    addCondition: addCondition,
    updateCondition: updateCondition,
    removeCondition: removeCondition,
    moveCondition: moveCondition,
    weapons: weapons,
    equippedWeapons: equippedWeapons,
    removeWeapon: removeWeapon,
    inventoryWeapons: inventoryWeapons,
    swapWeapon: swapWeapon,
    moveWeapon: moveWeapon,
    endurance: endurance,
    setEndurance: setEndurance,
    minEndurance: minEndurance,
    maxEndurance: maxEndurance,
    weaponChoice: weaponChoice,
    setWeaponChoice: setWeaponChoice,
    addWeaponToInventory: addWeaponToInventory,
    weaponTypeBonuses: weaponTypeBonuses,
    doubloons: doubloons,
    setDoubloons: setDoubloons,
    items: items,
    addItem: addItem,
    updateItem: updateItem,
    removeItem: removeItem,
    moveItem: moveItem,
    sortBy: sortBy,
    setSortBy: setSortBy,
    sortedActionAbilities: sortedActionAbilities,
    passiveAbilities: passiveAbilities,
    selectionAbilities: selectionAbilities,
    selectionAbilitiesByClass: selectionAbilitiesByClass,
    selectionCategoryDefinitionsByClass: selectionCategoryDefinitionsByClass,
    knownSelectionAbilities: knownSelectionAbilities,
    selectedSelectionCategories: selectedSelectionCategories,
    toggleKnownSelectionAbility: toggleKnownSelectionAbility,
    updateSelectionCategory: updateSelectionCategory,
    background: background,
    setBackground: setBackground,
    activeSlot: activeSlot,
    activeSlotLabel: slotLabels[activeSlot] || getDefaultSlotLabel(activeSlot),
    cloudSaveEnabled: CLOUD_SAVE_ENABLED,
    generatedShareCode: generatedShareCode,
    shareCodeInput: shareCodeInput,
    setShareCodeInput: setShareCodeInput,
    generateShareCode: generateShareCode,
    importShareCode: importShareCode,
    isShareCodeBusy: isShareCodeBusy,
    expansions: expansions,
    importExpansionFile: importExpansionFile,
    removeExpansion: removeExpansion,
    exportExpansions: exportExpansions,
    downloadGearTemplate: downloadGearTemplate,
    downloadClassTemplate: downloadClassTemplate
  }), React.createElement(SettingsModal, {
    isOpen: isSettingsDialogOpen,
    onClose: () => setIsSettingsDialogOpen(false),
    settings: settings,
    setSettings: setSettings,
    activeSlot: activeSlot,
    activeSlotLabel: slotLabels[activeSlot] || getDefaultSlotLabel(activeSlot),
    cloudSaveEnabled: CLOUD_SAVE_ENABLED,
    generatedShareCode: generatedShareCode,
    shareCodeInput: shareCodeInput,
    setShareCodeInput: setShareCodeInput,
    generateShareCode: generateShareCode,
    importShareCode: importShareCode,
    isShareCodeBusy: isShareCodeBusy,
    expansions: expansions,
    importExpansionFile: importExpansionFile,
    removeExpansion: removeExpansion,
    exportExpansions: exportExpansions,
    downloadGearTemplate: downloadGearTemplate,
    downloadClassTemplate: downloadClassTemplate
  }), React.createElement("div", {
    className: "saveBar"
  }, React.createElement("span", null, CLOUD_SAVE_ENABLED ? "Cloud Saves" : "Local Saves"), React.createElement("select", {
    value: activeSlot,
    onChange: e => {
      setActiveSlot(e.target.value);
    },
    disabled: isCloudBusy
  }, saveSlots.map(slot => React.createElement("option", {
    key: slot,
    value: slot
  }, slotLabels[slot] || getDefaultSlotLabel(slot)))), React.createElement("button", {
    onClick: () => saveToSlot(),
    disabled: isCloudBusy
  }, isCloudBusy ? "Please wait..." : "Save"), React.createElement("button", {
    onClick: exportData
  }, "Export"), React.createElement("button", {
    onClick: importData
  }, "Import"), React.createElement("button", {
    onClick: () => clearSlot(),
    disabled: isCloudBusy
  }, "Clear Save Slot"), saveMessage && React.createElement("div", {
    className: "saveToast"
  }, saveMessage)));
}
ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(App, null));
