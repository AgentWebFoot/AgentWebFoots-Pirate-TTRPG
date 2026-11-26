# AgentWebFoot's Pirate TTRPG

A TTRPG is a Tabletop Roleplaying game where a group of friends gather round to play a board game where each gets to embody a character they themselves have created utilizing the game's rules. The most common of these being Dungeons and Dragons. The system is designed as a low magic fantasy system with a focus on fast and tactical combat system set in a fictional late 17th century-style world. A low magic setting means there is little to no innate "magical powers" found within the world. Unlike games such as Dungeons and Dragons or Pathfinder, characters will not be able to create illusions or summon fire. This does not mean there is no magic within the world, but it is found beyond the control of the players. All TTRPGs are designed to include the players who each play a character at the table, and a Game Master (or Sea Master in this system), who builds and controls the world, story, and NPCs the characters will meet along their journey. 

The initial start of this project on GitHub was to design a character sheet for use within the Pirate System. A character sheet stores the information and statistics of the character for use in the ttrpg. In addition to functioning as a character sheet, the character sheet will also have a character builder element which will allow you to create and plan your character as you level up and grow in power. The original system for this character sheet was built into Roll20, an online TTS or Tabletop Simulator, which allows for the playing of TTRPGs online.

This original Roll20 Character sheet has been retired and archived. It has now been replaced with a Web based Character sheet designed using React. This character sheet can be accessed at the following Address: https://travelers-tavern.com/projects/piratecharactersheet 

## Web 2.0 local preview

From the repository root, run these commands with Node.js 22 or later.

```powershell
cd web2.0
npm ci
npm run dev
```

Open [the local preview](http://127.0.0.1:4174/) and leave the terminal running. Refresh the page after editing browser files or Compendium data.

- Open the [Pirate TTRPG hub](http://127.0.0.1:4174/projects/Pirate) for the Character Sheet, NPC Builder, and Homebrew Builder copied from Travelers Tavern. Their editable HTML, JavaScript, art, and rules data are in `web2.0/pirate/`. The hub links to the Web 2.0 Compendium.
- Enter a username and pick a site role, then click **Apply** to try it or **Save** to keep it. Use **Load** and **Delete** to manage saved mock accounts.
- New User and Traveler accounts start with Viewer access. Apply a Manager or Owner, select a saved User or Traveler, and change its **Compendium role** to test a different permission. Writer, Admin, Manager, and Owner accounts can open **Show Writer Tools**.
- To assign access for the copied tools, open **Pirate Settings** on the hub as a mock Owner. A mock Traveler can test cloud saves and character share codes. A Pirate Writer or Owner can save NPCs to the shared NPC library. The copied tools' cloud saves, share codes, and NPC library edits are stored in `web2.0/.preview/pirate.json` on this computer.
- The preview reads classes, weapons, and conditions from `webCharacterSheet/` until `web2.0/compendium.json` exists. The first Writer Tools save creates that file, which then becomes the source for the preview. Edit it directly to preview further content changes.
- Mock accounts and uploaded images live in the ignored `web2.0/.preview/` directory. Favorites are stored in the browser per mock username. The server runs on this computer only and uses simulated accounts.
