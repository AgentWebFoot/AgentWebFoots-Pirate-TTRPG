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

- Open the [Pirate TTRPG hub](http://127.0.0.1:4174/projects/Pirate) for the Character Sheet, NPC Builder, and Expansions tools copied from Travelers Tavern. Their editable HTML, JavaScript, art, and rules data are in `web2.0/pirate/`. The hub links to the Web 2.0 Compendium.
- Open **Character** on the hub to manage saved sheets. Use **New Character** to open a blank sheet, **Import** to add a character JSON file, or use a card to edit, export, or delete a saved character. Local saves are available in the browser for every role. Accounts with cloud access also see their own cloud saves and can refresh them. New characters and imports use cloud storage when available.
- With cloud access, click **Share** on a cloud character card to get a link or code. Open the link or use **Insert Share Code** to join the shared sheet. Linked cards show a chain icon, and each participant's saves update the shared sheet. The original owner can choose **Unshare** to end syncing and leave everyone with their own cloud copy. Codes generated before linked sharing still import independent snapshots.
- Browser saves move into the active account's Cloud Saves when cloud access is available. The preview removes each local save after its cloud copy is confirmed. Use **Move to Local** on a card to keep it in this browser, or **Move to Cloud** to upload it again.
- The Expansions builder also moves local expansions into the active account's Cloud Saves. If a different cloud expansion already has the same name, the local version is added with a **(Local)** suffix.
- Enter a username and pick a site role, then click **Apply** to try it or **Save** to keep it. Use **Load** and **Delete** to manage saved mock accounts.
- New User and Traveler accounts start with Viewer access. Apply a Manager or Owner, select a saved User or Traveler, and change its **Compendium role** to test a different permission. Writer, Admin, Manager, and Owner accounts can open **Show Writer Tools**.
- To assign access for the copied tools, open **Pirate Settings** on the hub as a mock Owner. A mock Traveler can test cloud saves and character share codes. A Pirate Writer or Owner can save NPCs to the shared NPC library. The copied tools' cloud saves, share codes, and NPC library edits are stored in `web2.0/.preview/pirate.json` on this computer.
- The preview reads classes, weapons, and conditions from `webCharacterSheet/` until `web2.0/compendium.json` exists. The first Writer Tools save creates that file, which then becomes the source for the preview. Edit it directly to preview further content changes.
- Mock accounts and uploaded images live in the ignored `web2.0/.preview/` directory. Favorites are stored in the browser per mock username. The server runs on this computer only and uses simulated accounts.
