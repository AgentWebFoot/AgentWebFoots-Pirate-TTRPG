import { characterSlotPattern, withLocalCharacterSaves } from "./character-files.js";

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

function AbilityCard({ ability, costs = [], selection }) {
  const h = React.createElement;
  const title = selection ? h("label", { className: "ability-choice" },
    h("input", {
      type: "checkbox",
      checked: selection.checked,
      disabled: selection.disabled,
      onChange: selection.onChange
    }),
    h("span", null, ability.name)) : ability.name;
  const metadata = [ability.class, ability.rank == null ? "" : `Rank ${ability.rank}`].filter(Boolean);
  const shownCosts = costs.filter(([, value]) => value != null && value !== "");
  return h("li", {
    className: "ability-card",
    "data-selected": selection?.checked || undefined
  },
  h(selection ? "h6" : "h5", { className: "ability-title" }, title),
  metadata.length > 0 && h("p", { className: "ability-metadata" }, metadata.join(" · ")),
  shownCosts.length > 0 && h("dl", { className: "ability-costs" },
    shownCosts.map(([label, value]) => h("div", { key: label },
      h("dt", null, label), h("dd", null, value)))),
  ability.description && h("p", { className: "ability-description" }, ability.description));
}

function RecordFacts({ facts }) {
  const h = React.createElement;
  return h("dl", { className: "record-facts" }, facts.map(([label, value]) =>
    h("div", { key: label }, h("dt", null, label), h("dd", null, value))));
}

function RecordOrder({ name, index, count, onMove }) {
  const h = React.createElement;
  return h("div", { className: "record-order" },
    h("button", {
      type: "button",
      "aria-label": `Move ${name} up`,
      disabled: index === 0,
      onClick: () => onMove(-1)
    }, "↑"),
    h("button", {
      type: "button",
      "aria-label": `Move ${name} down`,
      disabled: index === count - 1,
      onClick: () => onMove(1)
    }, "↓"));
}

function CharacterAbilities({
  classCounts,
  sortBy,
  setSortBy,
  sortedActionAbilities,
  passiveAbilities,
  selectionAbilitiesByClass,
  selectionCategoryDefinitionsByClass,
  selectedSelectionCategories,
  knownSelectionAbilities,
  toggleKnownSelectionAbility,
  updateSelectionCategory,
  hideUnselectedSelectionAbilities,
  setHideUnselectedSelectionAbilities
}) {
  const h = React.createElement;
  const ranks = Object.entries(classCounts);
  return h("div", { className: "character-abilities" },
    h("section", null, h("h3", null, "Class Ranks"), ranks.length > 0
      ? h("ul", { className: "character-class-ranks" }, ranks.map(([className, rank]) =>
        h("li", { key: className }, className, " ", h("strong", null, `Rank ${rank}`))))
      : h("p", { className: "ability-empty" }, "No classes selected.")),
    h("section", null,
      h("h3", null, "Class Abilities"),
      h("section", null,
        h("div", { className: "ability-section-header" },
          h("h4", null, "Action Abilities"),
          h("label", { className: "ability-control" }, "Sort actions",
            h("select", { value: sortBy, onChange: event => setSortBy(event.target.value) },
              h("option", { value: "rank" }, "By Rank"),
              h("option", { value: "cost" }, "By Cost")))),
        sortedActionAbilities.length ? h("ul", { className: "ability-grid" },
          sortedActionAbilities.map((ability, index) => h(AbilityCard, {
            key: `${getSelectionAbilityKey(ability)}-${index}`,
            ability,
            costs: [["Action Cost", ability.actionCost], ["Endurance", ability.enduranceCost]]
          }))) : h("p", { className: "ability-empty" }, "No action abilities.")),
      h("section", null,
        h("h4", null, "Free / Passive Abilities"),
        passiveAbilities.length ? h("ul", { className: "ability-grid" },
          passiveAbilities.map((ability, index) => h(AbilityCard, {
            key: `${getSelectionAbilityKey(ability)}-${index}`,
            ability
          }))) : h("p", { className: "ability-empty" }, "No free or passive abilities.")),
      selectionAbilitiesByClass.length > 0 && h("section", null,
        h("div", { className: "ability-section-header" },
          h("h4", null, "Selection Abilities"),
          h("label", { className: "ability-control" }, h("input", {
            type: "checkbox",
            checked: hideUnselectedSelectionAbilities,
            onChange: event => setHideUnselectedSelectionAbilities(event.target.checked)
          }), "Hide unselected")),
        selectionAbilitiesByClass.map(({ className, availableCount, abilities }) => {
          const categories = selectionCategoryDefinitionsByClass[className] || [];
          const filteredAbilities = abilities.filter(ability => {
            if (!ability.selectionCategory || !ability.selectionOption) return true;
            const key = getSelectionCategoryStateKey(className, ability.selectionCategory);
            return selectedSelectionCategories[key] === ability.selectionOption;
          });
          const isKnown = ability => Boolean(knownSelectionAbilities[getSelectionAbilityKey(ability)]);
          const selectedCount = filteredAbilities.filter(isKnown).length;
          const visibleAbilities = hideUnselectedSelectionAbilities ? filteredAbilities.filter(isKnown) : filteredAbilities;
          return h("section", { key: className, className: "ability-selection-group" },
            h("div", { className: "ability-section-header" },
              h("h5", null, className),
              h("span", { className: "ability-metadata" }, `Selections available: ${availableCount - selectedCount}`)),
            categories.length > 0 && h("div", { className: "ability-category-controls" },
              categories.map(category => {
                const key = getSelectionCategoryStateKey(className, category.categoryKey);
                const label = category.label || category.name;
                return h("label", { key, className: "ability-control" }, label,
                  h("select", {
                    value: selectedSelectionCategories[key] ?? "",
                    onChange: event => updateSelectionCategory(className, category.categoryKey, event.target.value)
                  },
                  h("option", { value: "" }, `Select ${label}`),
                  (category.options || []).map(option => h("option", { key: option, value: option }, option))));
              })),
            visibleAbilities.length ? h("ul", { className: "ability-grid" },
              visibleAbilities.map((ability, index) => h(AbilityCard, {
                key: `${getSelectionAbilityKey(ability)}-${index}`,
                ability,
                costs: [["Cost", ability.cost ?? ability.actionCost ?? 0]],
                selection: {
                  checked: isKnown(ability),
                  disabled: !isKnown(ability) && selectedCount >= availableCount,
                  onChange: () => toggleKnownSelectionAbility(ability)
                }
              }))) : h("p", { className: "ability-empty" }, hideUnselectedSelectionAbilities
              ? "No abilities selected." : "No abilities match these selections."));
        }))));
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
  selectionAbilitiesByClass,
  selectionCategoryDefinitionsByClass,
  knownSelectionAbilities,
  selectedSelectionCategories,
  toggleKnownSelectionAbility,
  updateSelectionCategory,
  background,
  setBackground,
  expansions,
  importExpansionFile,
  removeExpansion,
  exportExpansions
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

  function renderCombatRecords() {
    const h = React.createElement;
    const renderProperties = gear => h("p", { className: "record-description" },
      h("strong", null, "Properties: "), gear.properties?.join(", ") || "None");
    const renderWeapons = (group, list, title) => {
      const entries = list.map((weapon, index) => ({ weapon, index }))
        .filter(({ weapon }) => group === "equipped" || weapon.name !== UNARMED_WEAPON_NAME);
      return h("section", null, h("h4", null, title), entries.length
        ? h("ul", { className: "record-grid" }, entries.map(({ weapon, index }) => {
          const attackBonus = getWeaponAttackBonus(weapon);
          const isUnarmed = weapon.name === UNARMED_WEAPON_NAME;
          return h("li", { key: `${weapon.name}-${index}`, className: "record-card" },
            h("div", { className: "record-heading" },
              h("h5", null, weapon.name),
              isUnarmed && h("span", { className: "record-caption" }, "Always equipped")),
            h(RecordFacts, { facts: [
              ["Type", weapon.type.join(", ")],
              ["Attack Stat", weapon.attackStats.join(", ")],
              ["Attack Bonus", attackBonus >= 0 ? `+${attackBonus}` : attackBonus],
              ["Damage", [weapon.damage.dice, weapon.damage.type].filter(Boolean).join(" ")],
              ["Endurance", weapon.enduranceCost]
            ] }),
            renderProperties(weapon),
            h("div", { className: "record-actions" },
              h("button", { type: "button", className: "record-primary", onClick: () => openAttackDialog(weapon, attackBonus) }, "Attack"),
              !isUnarmed && h(React.Fragment, null,
                h("button", { type: "button", onClick: () => swapWeapon(index, group) },
                  group === "equipped" ? "Unequip" : "Equip"),
                h("button", { type: "button", onClick: () => removeWeapon(index, group) }, "Remove")),
              h(RecordOrder, {
                name: weapon.name, index, count: list.length,
                onMove: direction => moveWeapon(index, group, direction)
              })));
        })) : h("p", { className: "record-caption" }, group === "equipped" ? "No weapons equipped." : "No weapons in the backpack."));
    };
    return h(React.Fragment, null,
      h("div", { className: "character-records" },
        h("h3", null, "Combat"),
        h("div", { className: "record-grid record-overview" },
          h("section", { className: "record-card" },
            h("h4", null, "Initiative"),
            h("p", { className: "record-value" }, initiative),
            h("p", { className: "record-caption" }, settings.initiativeOverride == null ? "Brains + Finesse" : "Settings override"),
            h("label", { className: "record-field record-number" }, "Armor Breaker", h("input", {
              type: "number", min: "0", value: settings.armorBreaker ?? 0,
              onChange: event => setSettings(prev => ({
                ...prev, armorBreaker: Math.max(0, Number(event.target.value) || 0)
              }))
            }))),
          h("section", { className: "record-card" },
            h("h4", null, "Armor"),
            h("label", { className: "record-field" }, "Equipped armor", h("select", {
              value: armor, onChange: event => setArmor(event.target.value)
            }, Object.keys(armorStatsMap).map(name => h("option", { key: name, value: name }, name)))),
            h(RecordFacts, { facts: [
              ["Base Evasion", `${armorStats.baseEvasion} + ½ Finesse`],
              ["Toughness Bonus", `+${armorStats.toughness}`],
              ["Dash Penalty", armorStats.dashPenalty ?? 0]
            ] }),
            renderProperties(armorStats)),
          h("section", { className: "record-card" },
            h("h4", null, "Shield"),
            h("label", { className: "record-field" }, "Equipped shield", h("select", {
              value: shield, onChange: event => setShield(event.target.value)
            }, Object.keys(shieldStatsMap).map(name => h("option", { key: name, value: name }, name)))),
            h("label", { className: "record-checkbox" }, h("input", {
              type: "checkbox", checked: useShield, onChange: event => setUseShield(event.target.checked)
            }), "Use Shield"),
            h(RecordFacts, { facts: [
              ["Physical Toughness", shieldStats.toughness > 0 ? `+${shieldStats.toughness}` : 0],
              ["Brace Endurance Cost", shieldStats.braceCost],
              ["Dash Penalty", useShield ? shieldStats.dashPenalty ?? 0 : 0]
            ] }),
            renderProperties(shieldStats))),
        h("section", { className: "record-section" },
          h("div", { className: "record-heading" }, h("h4", null, "Conditions"),
            h("div", { className: "record-actions" },
              h("select", {
                "aria-label": "Condition", value: conditionChoice, onChange: event => setConditionChoice(event.target.value)
              }, h("option", { value: "" }, "Select Condition"),
              conditions.map(condition => h("option", { key: condition.name, value: condition.name }, condition.name))),
              h("button", {
                type: "button", className: "record-primary", disabled: !conditionChoice, onClick: () => addCondition(conditionChoice)
              }, "Add Condition"))),
          activeConditions.length ? h("ul", { className: "record-grid" }, activeConditions.map((condition, index) =>
            h("li", { key: condition.id, className: "record-card" },
              h("h5", null, condition.name),
              condition.description && h("p", { className: "record-description" }, condition.description),
              h("div", { className: "record-actions" },
                condition.hasStack && h("label", { className: "record-field record-number" }, "Stacks", h("input", {
                  type: "number", min: "1", value: condition.stacks ?? 1,
                  onChange: event => updateCondition(condition.id, "stacks", Math.max(1, Number(event.target.value) || 1))
                })),
                condition.hasSource && h("label", { className: "record-field record-source" }, "Source", h("input", {
                  value: condition.source ?? "", onChange: event => updateCondition(condition.id, "source", event.target.value)
                }))),
              h("div", { className: "record-actions" },
                h("button", { type: "button", onClick: () => removeCondition(condition.id) }, "Remove"),
                h(RecordOrder, {
                  name: condition.name, index, count: activeConditions.length,
                  onMove: direction => moveCondition(index, direction)
                }))))) : h("p", { className: "record-caption" }, "No active conditions.")),
        h("section", { className: "record-section" },
          h("div", { className: "record-heading" }, h("h4", null, "Weapons"),
            h("div", { className: "record-actions" },
              h("select", {
                "aria-label": "Weapon", value: weaponChoice, onChange: event => setWeaponChoice(event.target.value)
              }, h("option", { value: "" }, "Select Weapon"),
              weapons.filter(weapon => weapon.name !== UNARMED_WEAPON_NAME).map(weapon =>
                h("option", { key: weapon.name, value: weapon.name }, weapon.name))),
              h("button", {
                type: "button", className: "record-primary", disabled: !weaponChoice, onClick: () => addWeaponToInventory(weaponChoice)
              }, "Add to Backpack"))),
          renderWeapons("equipped", equippedWeapons, "Equipped Weapons"),
          renderWeapons("inventory", inventoryWeapons, "Backpack"))),
      attackDialogElement);
  }

  function renderInventoryRecords() {
    const h = React.createElement;
    return h("div", { className: "character-records" },
      h("div", { className: "record-heading" }, h("h3", null, "Inventory"),
        h("div", { className: "record-actions" },
          h("label", { className: "record-field record-number" }, "Doubloons", h("input", {
            type: "number", min: "0", value: doubloons,
            onChange: event => setDoubloons(Math.max(0, Number(event.target.value) || 0))
          })),
          h("button", { type: "button", className: "record-primary", onClick: addItem }, "Add Item"))),
      items.length ? h("ul", { className: "record-grid" }, items.map((item, index) => {
        const isCombatGear = item.isCombatGear || item.isWeapon;
        const name = String(item.name ?? "").trim() || "unnamed item";
        return h("li", { key: item.id, className: "record-card" },
          isCombatGear ? h(React.Fragment, null,
            h("h4", null, item.name),
            h("p", { className: "record-caption" }, "Managed in Combat"),
            item.notes && h("p", { className: "record-description" }, item.notes))
            : h(React.Fragment, null,
              h("label", { className: "record-field" }, "Name", h("input", {
                value: item.name ?? "", onChange: event => updateItem(item.id, "name", event.target.value)
              })),
              h("label", { className: "record-field" }, "Notes", h("textarea", {
                rows: 2, value: item.notes ?? "", onChange: event => updateItem(item.id, "notes", event.target.value)
              })),
              h("div", { className: "record-actions" },
                h("label", { className: "record-field record-number" }, "Charges", h("input", {
                  type: "number", value: item.charges ?? 0,
                  onChange: event => updateItem(item.id, "charges", Number(event.target.value))
                })),
                h("label", { className: "record-field record-number" }, "Amount", h("input", {
                  type: "number", value: item.amount ?? 1,
                  onChange: event => updateItem(item.id, "amount", Number(event.target.value))
                })))),
          h("div", { className: "record-actions" },
            !isCombatGear && h("button", { type: "button", onClick: () => removeItem(item.id) }, "Remove"),
            h(RecordOrder, { name, index, count: items.length, onMove: direction => moveItem(index, direction) })));
      })) : h("p", { className: "record-caption" }, "No items in your inventory."));
  }

  return React.createElement("div", {
    className: "mainpage"
  }, React.createElement("section", {
    className: "folioHero statsHero"
  }, React.createElement("div", {
    className: "folioHeroHeader"
  }, React.createElement("div", null, React.createElement("div", {
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
  }, React.createElement("div", null, React.createElement("div", {
    className: "folioKicker"
  }, "Ship Operations"), React.createElement("h2", {
    className: "sectionTitle"
  }, "Mechanical Records"))), React.createElement("div", {
    className: "tabBar"
  }, React.createElement("button", {
    "aria-pressed": activeTab === "class",
    onClick: () => setActiveTab("class")
  }, "Class"), React.createElement("button", {
    "aria-pressed": activeTab === "combat",
    onClick: () => setActiveTab("combat")
  }, "Combat"), React.createElement("button", {
    "aria-pressed": activeTab === "inventory",
    onClick: () => setActiveTab("inventory")
  }, "Inventory"), React.createElement("button", {
    "aria-pressed": activeTab === "background",
    onClick: () => setActiveTab("background")
  }, "Background")), React.createElement("div", {
    className: "tabContent"
  }, activeTab === "class" && React.createElement(CharacterAbilities, {
    classCounts,
    sortBy,
    setSortBy,
    sortedActionAbilities,
    passiveAbilities,
    selectionAbilitiesByClass,
    selectionCategoryDefinitionsByClass,
    selectedSelectionCategories,
    knownSelectionAbilities,
    toggleKnownSelectionAbility,
    updateSelectionCategory,
    hideUnselectedSelectionAbilities,
    setHideUnselectedSelectionAbilities
  }), activeTab === "combat" && renderCombatRecords(), activeTab === "inventory" && renderInventoryRecords()),
  activeTab === "background" && React.createElement("div", null, React.createElement("h3", null, "Character Journal"), renderBackgroundJournal())));
}
function SettingsModal({
  isOpen,
  onClose,
  settings,
  setSettings,
  expansions,
  importExpansionFile,
  removeExpansion,
  exportExpansions
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
  }))), React.createElement("h3", null, "Expansions"), React.createElement("div", null), React.createElement("div", {
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
  }, "Export Expansions")), React.createElement("div", {
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
const REQUESTED_SLOT = PAGE_PARAMS.get("slot");
const INITIAL_SAVE_SLOT = characterSlotPattern.test(REQUESTED_SLOT) ? REQUESTED_SLOT : "slot1";
const API_URL = getDefaultApiUrl();
const RESOLVED_ROLE = PAGE_PARAMS.get("role") || "viewer";
const CLOUD_SAVE_ENABLED = PAGE_PARAMS.get("storage") !== "local" &&
  ["traveler", "admin", "writer", "owner"].includes(RESOLVED_ROLE);

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
  function removeExpansion(id) {
    setExpansions(prev => prev.filter(expansion => expansion.id !== id));
  }
  const [saveMessage, setSaveMessage] = React.useState("");
  const [isCloudBusy, setIsCloudBusy] = React.useState(false);
  const [saveTarget, setSaveTarget] = React.useState({ slot: INITIAL_SAVE_SLOT, cloud: CLOUD_SAVE_ENABLED });
  const [cloudConflict, setCloudConflict] = React.useState(false);
  const cloudSync = React.useRef({ etag: null, shared: false, baseline: null, capture: false, pending: false });
  const draft = React.useRef(null);
  draft.current = saveTarget.cloud ? JSON.stringify(buildSaveData()) : null;

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
      version: 1.7
    };
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
    const level = Number(nextData.currentLevel);
    setCurrentLevel(Number.isInteger(level) && level >= 1 && level <= 20 ? level : 1);
    setLevels(nextData.levels ?? Array(20).fill(null));
    setLevel1(nextData.level1 ?? ["", "", ""]);
    setLevelStats(Array.from({ length: 20 }, (_, index) => ({
      ...createEmptyStatLevel(), ...nextData.levelStats?.[index]
    })));
    setLevelSkills(Array.from({ length: 20 }, (_, index) => ({
      ...createEmptySkillLevel(), ...nextData.levelSkills?.[index]
    })));
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
    setItems(data?.items ?? data?.inventoryItems ?? []);
    setBackground(nextData.background ?? {
      ...DEFAULT_BACKGROUND
    });
  }

  async function saveToSlot() {
    const { slot, cloud } = saveTarget;
    const data = { ...buildSaveData(), timestamp: Date.now() };
    if (cloud) {
      const sync = cloudSync.current;
      const beforeSave = draft.current;
      sync.pending = true;
      setIsCloudBusy(true);
      try {
        const {
          response,
          payload
        } = await fetchPirateJson(`/pirate-character-sheet/saves/${slot}`, {
          method: "POST",
          headers: sync.etag ? { "If-Match": sync.etag } : undefined,
          body: JSON.stringify({
            character: data
          })
        });
        if (!response.ok) {
          if (response.status === 412) setCloudConflict(true);
          setSaveMessage(payload.message || `Failed to save ${slot} to the cloud`);
          return false;
        }
        sync.etag = payload.etag ?? null;
        sync.shared = Boolean(payload.shared);
        sync.baseline = beforeSave;
        console.log(`Cloud saved to ${slot}`, data);
        setSaveMessage(`Cloud saved to ${slot}`);
        return true;
      } catch (error) {
        console.error("Cloud save failed", error);
        setSaveMessage("Cloud save failed");
        return false;
      } finally {
        sync.pending = false;
        setIsCloudBusy(false);
      }
    }
    try {
      await withLocalCharacterSaves(() => {
        const key = `characterSheet_${slot}`;
        let keepLocal;
        try {
          keepLocal = JSON.parse(localStorage.getItem(key))?.keepLocal === true;
        } catch {
          // The new save replaces unreadable local data.
        }
        localStorage.setItem(key, JSON.stringify(keepLocal ? { ...data, keepLocal: true } : data));
      });
      setSaveMessage(`Saved to ${slot}`);
      return true;
    } catch {
      setSaveMessage("Local save failed");
      return false;
    }
  }

  function applyCloudSnapshot(payload) {
    Object.assign(cloudSync.current, {
      etag: payload.etag, shared: Boolean(payload.shared), baseline: null, capture: true,
    });
    applySaveData(payload.character);
    setCloudConflict(false);
  }

  async function reloadCloudSave() {
    if (!window.confirm("Load the latest cloud save? This replaces the unsaved edits in this editor.")) return;
    const sync = cloudSync.current;
    sync.pending = true;
    setIsCloudBusy(true);
    try {
      const { response, payload } = await fetchPirateJson(`/pirate-character-sheet/saves/${saveTarget.slot}`);
      if (!response.ok) throw new Error(payload.message || "Could not load the latest cloud save.");
      applyCloudSnapshot(payload);
      setSaveMessage("Loaded the latest cloud save.");
    } catch (error) {
      setSaveMessage(error.message);
    } finally {
      sync.pending = false;
      setIsCloudBusy(false);
    }
  }

  async function loadFromSlot(slot, signal) {
    if (CLOUD_SAVE_ENABLED) {
      cloudSync.current.pending = true;
      setIsCloudBusy(true);
      try {
        const { response, payload } = await fetchPirateJson(`/pirate-character-sheet/saves/${slot}`, { signal });
        if (signal.aborted) return;
        if (response.status === 404) {
          applySaveData(createBlankCharacterData());
          setSaveMessage(`Opened a blank character for ${slot}`);
          return;
        }
        if (!response.ok) {
          setSaveMessage(payload.message || `Failed to load ${slot} from the cloud`);
          return;
        }
        applyCloudSnapshot(payload);
        setSaveMessage(`Cloud loaded from ${slot}`);
      } catch {
        if (!signal.aborted) setSaveMessage("Cloud load failed");
      } finally {
        if (!signal.aborted) {
          cloudSync.current.pending = false;
          setIsCloudBusy(false);
        }
      }
      return;
    }
    try {
      const saved = localStorage.getItem(`characterSheet_${slot}`);
      applySaveData(saved ? JSON.parse(saved) : createBlankCharacterData());
      setSaveMessage(saved ? `Loaded from ${slot}` : `Opened a blank character for ${slot}`);
    } catch {
      setSaveMessage("Failed to load save (invalid data)");
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
    const controller = new AbortController();
    loadFromSlot(INITIAL_SAVE_SLOT, controller.signal);
    return () => controller.abort();
  }, []);
  React.useEffect(() => {
    const sync = cloudSync.current;
    if (!sync.capture) return;
    const frame = requestAnimationFrame(() => {
      sync.baseline = draft.current;
      sync.capture = false;
    });
    return () => cancelAnimationFrame(frame);
  });
  React.useEffect(() => {
    if (!saveTarget.cloud) return;
    const controller = new AbortController();
    const sync = cloudSync.current;
    let checking = false;
    const timer = setInterval(async () => {
      if (checking || sync.pending || sync.capture || document.hidden || !sync.etag) return;
      const revision = sync.etag;
      checking = true;
      try {
        const { response, payload } = await fetchPirateJson(`/pirate-character-sheet/saves/${saveTarget.slot}`, { signal: controller.signal });
        if (!response.ok || controller.signal.aborted || sync.pending || sync.etag !== revision) return;
        if (payload.etag === revision) {
          sync.shared = Boolean(payload.shared);
        } else if (sync.shared || payload.shared) {
          if (sync.baseline === null || sync.baseline !== draft.current) {
            setCloudConflict(true);
          } else {
            applyCloudSnapshot(payload);
            setSaveMessage("Shared character updated.");
          }
        }
      } catch {
        // The next check can recover from a temporary connection failure.
      } finally {
        checking = false;
      }
    }, 3000);
    return () => {
      clearInterval(timer);
      controller.abort();
    };
  }, [saveTarget]);
  React.useEffect(() => {
    function followCloudSave(event) {
      if (event.origin !== window.location.origin || event.source !== window.parent) return;
      if (event.data?.type === "pirate-character-sheet-cloud-save" && characterSlotPattern.test(event.data.slot)) {
        cloudSync.current.etag = event.data.etag ?? null;
        setSaveTarget({ slot: event.data.slot, cloud: true });
        setSaveMessage("Character moved to Cloud Saves.");
      }
    }
    window.addEventListener("message", followCloudSave);
    return () => window.removeEventListener("message", followCloudSave);
  }, []);
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
    selectionAbilitiesByClass: selectionAbilitiesByClass,
    selectionCategoryDefinitionsByClass: selectionCategoryDefinitionsByClass,
    knownSelectionAbilities: knownSelectionAbilities,
    selectedSelectionCategories: selectedSelectionCategories,
    toggleKnownSelectionAbility: toggleKnownSelectionAbility,
    updateSelectionCategory: updateSelectionCategory,
    background: background,
    setBackground: setBackground,
    expansions: expansions,
    importExpansionFile: importExpansionFile,
    removeExpansion: removeExpansion,
    exportExpansions: exportExpansions
  }), React.createElement(SettingsModal, {
    isOpen: isSettingsDialogOpen,
    onClose: () => setIsSettingsDialogOpen(false),
    settings: settings,
    setSettings: setSettings,
    expansions: expansions,
    importExpansionFile: importExpansionFile,
    removeExpansion: removeExpansion,
    exportExpansions: exportExpansions
  }), React.createElement("div", {
    className: "saveBar"
  }, React.createElement("span", null, saveTarget.cloud ? "Cloud Saves" : "Local Saves"), React.createElement("button", {
    onClick: () => saveToSlot(),
    disabled: isCloudBusy || cloudConflict
  }, isCloudBusy ? "Please wait..." : "Save"), saveMessage && React.createElement("div", {
    className: "saveToast"
  }, saveMessage)), cloudConflict && React.createElement("aside", {
    className: "cloudSaveConflict",
    role: "status"
  }, "The cloud sheet changed while you were editing.", React.createElement("button", {
    type: "button",
    disabled: isCloudBusy,
    onClick: reloadCloudSave
  }, "Load Latest")));
}
ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(App, null));
