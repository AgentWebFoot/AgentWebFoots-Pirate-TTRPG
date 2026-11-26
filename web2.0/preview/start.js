import { createPreviewServer } from "./server.js";

const server = await createPreviewServer();
server.on("error", error => {
  console.error(`Unable to start the preview: ${error.message}`);
  process.exitCode = 1;
});
server.listen(process.env.PORT ?? 4174, "127.0.0.1", () => {
  console.log(`Pirate TTRPG preview: http://127.0.0.1:${server.address().port}/`);
});
